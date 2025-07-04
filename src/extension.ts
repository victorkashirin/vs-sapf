import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import keywordsData from "./language.json";
import { generateLanguageDefinitions } from "./language-generator";

/**
 * Keyword metadata parsed from the JSON definition file.
 */
interface KeywordInfo {
	keyword: string;
	signature: string | null;
	description: string;
	category: string;
	special: string | null;
}

/**
 * (Selection text, Range) tuple returned by helper extractors.
 */
interface BlockInfo {
	text: string;
	range: vscode.Range;
}

const brackets: Record<string, [string, string]> = {
	'round': ['(', ')'],
	'square': ['[', ']'],
	'curly': ['{', '}'],
};

/**
 * Singleton in charge of creating and managing the SAPF REPL terminal.
 */
class ReplManager {
	private terminal?: vscode.Terminal;

	/** Ensure the REPL terminal exists and return it. */
	ensure(): vscode.Terminal {
		if (!this.terminal) {
			const cfg = vscode.workspace.getConfiguration("sapf");
			const binaryPath = cfg.get<string>("binaryPath", "sapf");
			const preludePath = cfg.get<string>("preludePath", "");

			// Validate prelude path if provided
			if (preludePath && !fs.existsSync(preludePath)) {
				vscode.window.showWarningMessage(`Prelude file not found: ${preludePath}`);
			}

			try {
				this.terminal = vscode.window.createTerminal("sapf");
				const command = `${binaryPath}${preludePath && fs.existsSync(preludePath) ? ` -p ${preludePath}` : ""}`;
				this.terminal.sendText(command);
				this.terminal.show(true);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to start SAPF terminal: ${error}`);
				throw error;
			}
		}
		return this.terminal;
	}

	/** Send code to the REPL, creating it if necessary. */
	send(code: string): void {
		try {
			this.ensure().sendText(code, true);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to send code to SAPF: ${error}`);
		}
	}

	/** Dispose the REPL terminal if it is ours. */
	dispose(): void {
		this.terminal?.dispose();
		this.terminal = undefined;
	}

	/** Clear internal handle when the user closes the terminal manually. */
	handleClose(closed: vscode.Terminal): void {
		if (closed === this.terminal) {
			this.terminal = undefined;
		}
	}
}

/**
 * Parse the JSON language specification and return a Map keyed by **lower‑case** keyword.
 */
function loadKeywords(languageData?: Record<string, { items: Record<string, string> }>, extensionPath?: string): Map<string, KeywordInfo> {
	let data = languageData;
	
	if (!data && extensionPath) {
		const localLanguagePath = path.join(extensionPath, "language-local.json");
		if (fs.existsSync(localLanguagePath)) {
			try {
				const localData = JSON.parse(fs.readFileSync(localLanguagePath, 'utf8'));
				data = localData;
				console.log("Using local language definitions from language-local.json");
			} catch (error) {
				console.warn("Failed to parse language-local.json, falling back to default:", error);
				data = keywordsData as Record<string, { items: Record<string, string> }>;
			}
		} else {
			data = keywordsData as Record<string, { items: Record<string, string> }>;
		}
	} else if (!data) {
		data = keywordsData as Record<string, { items: Record<string, string> }>;
	}
	
	const map = new Map<string, KeywordInfo>();
	const pattern =
		/^(?:@(?<special>[a-z]+)\s*)?(?<signature>\([^)]*?-->\s*[^)]*?\))?\s*(?<description>.*)$/;

	Object.entries(data!).forEach(([category, { items }]) => {
		Object.entries(items).forEach(([keyword, rawDescription]) => {
			const match = rawDescription.match(pattern);

			const special = match?.groups?.special ?? null;
			const signature = match?.groups?.signature ?? null;
			const description = (match?.groups?.description ?? rawDescription).trim();

			map.set(keyword.toLowerCase(), {
				keyword,
				signature,
				description,
				category,
				special,
			});
		});
	});

	console.debug(`Loaded ${map.size} SAPF keywords`);
	return map;
}

/**
 * Return the user selection or the current line when there is no selection.
 */
function getLine(editor: vscode.TextEditor): BlockInfo {
	const selText = editor.document.getText(editor.selection);
	if (selText) {
		return { text: selText, range: editor.selection };
	}

	const line = editor.document.lineAt(editor.selection.active.line);
	return { text: line.text.trim(), range: line.range };
}

/**
 * Return the smallest enclosing parenthesis block or a single line if none.
 */
function getBlockOrLine(editor: vscode.TextEditor): BlockInfo {
	const selText = editor.document.getText(editor.selection);
	if (selText) {
		return { text: selText, range: editor.selection };
	}

	const text = editor.document.getText();
	const cursor = editor.document.offsetAt(editor.selection.active);
	let bracketKind = vscode.workspace.getConfiguration('sapf').get("codeBlockBrackets", "round");

	// Validate bracket configuration
	if (!brackets[bracketKind]) {
		vscode.window.showWarningMessage(`Invalid bracket type: ${bracketKind}, using 'round'`);
		bracketKind = "round";
	}

	const stack: number[] = [];
	let start = -1;
	let end = -1;

	const [openBracket, closeBracket] = brackets[bracketKind];

	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (ch === openBracket) {
			stack.push(i);
		} else if (ch === closeBracket && stack.length) {
			const s = stack.pop()!;
			if (s < cursor && i > cursor && (start === -1 || s < start)) {
				start = s;
				end = i;
			}
		}
	}

	if (start !== -1 && end !== -1) {
		const range = new vscode.Range(
			editor.document.positionAt(start),
			editor.document.positionAt(end)
		);
		const block = text.slice(start + 1, end);
		return { text: block, range };
	}

	return getLine(editor);
}

/** Briefly highlights a range to signal evaluation. */
function flash(editor: vscode.TextEditor, range: vscode.Range): void {
	const decoration = vscode.window.createTextEditorDecorationType({
		backgroundColor: new vscode.ThemeColor("editor.wordHighlightBackground"),
		isWholeLine: true,
		rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
	});

	editor.setDecorations(decoration, [range]);
	setTimeout(() => decoration.dispose(), 200);
}


/**
 * Register completion & hover providers for SAPF.
 */
function registerLanguageFeatures(
	keywords: Map<string, KeywordInfo>
): vscode.Disposable[] {
	// Completion
	const WORD_REGEX = /[\w$?!]+$/;
	const completionProvider = vscode.languages.registerCompletionItemProvider(
		"sapf",
		{
			provideCompletionItems(doc, position) {
				const prefix = doc.lineAt(position).text.slice(0, position.character);
				const match = prefix.match(WORD_REGEX);
				const current = match?.[0] ?? "";
				if (!current) {
					return undefined;
				}
				const currentLower = current.toLowerCase();

				const start = position.translate(0, -current.length);
				const range = new vscode.Range(start, position);

				return [...keywords.values()]
					.filter(({ keyword }) =>
						keyword.toLowerCase().startsWith(currentLower)
					)
					.map(({ keyword, signature, description, category, special }) => {
						const item = new vscode.CompletionItem(
							keyword,
							vscode.CompletionItemKind.Function
						);

						item.range = range;
						item.detail = signature ?? description.split("\n")[0];

						const md = new vscode.MarkdownString(undefined, true);
						md.appendMarkdown(`**Category**: ${category}\n\n`);
						md.appendCodeblock(
							`${keyword} ${special ? `${special} ` : ""}${signature ?? "(no signature)"
							}`,
							"sapf"
						);
						md.appendMarkdown(`\n\n${description}`);

						item.documentation = md;
						return item;
					});
			},
		},
		..."abcdefghijklmnopqrstuvwxyz0123456789$?!".split("")
	);

	// Hover
	const hoverProvider = vscode.languages.registerHoverProvider("sapf", {
		provideHover(doc, position) {
			const range = doc.getWordRangeAtPosition(position);
			if (!range) {
				return undefined;
			}

			const wordLower = doc.getText(range).toLowerCase();
			const info = keywords.get(wordLower);
			if (!info) {
				return undefined;
			}

			const md = new vscode.MarkdownString(undefined, true);
			md.appendMarkdown(`**Category**: ${info.category}\n\n`);
			md.appendCodeblock(
				`${info.keyword} ${info.special ? `${info.special} ` : ""}${info.signature ?? "(no signature)"
				}`,
				"sapf"
			);
			md.appendMarkdown(`\n\n${info.description}`);

			return new vscode.Hover(md);
		},
	});

	return [completionProvider, hoverProvider];
}

export function activate(context: vscode.ExtensionContext): void {
	let keywords = loadKeywords(undefined, context.extensionPath);
	const repl = new ReplManager();

	let languageProviders = registerLanguageFeatures(keywords);
	context.subscriptions.push(...languageProviders);

	// Helper to create evaluation commands.
	const makeEval = (resolver: (e: vscode.TextEditor) => BlockInfo) => () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const block = resolver(editor);
		flash(editor, block.range);
		repl.send(block.text);
	};

	// Remove local language definitions command
	const removeLocalLanguageCommand = vscode.commands.registerCommand(
		"sapf.removeLocalLanguage",
		async () => {
			const localLanguagePath = path.join(context.extensionPath, "language-local.json");
			
			if (!fs.existsSync(localLanguagePath)) {
				vscode.window.showInformationMessage("No local language definition found to remove.");
				return;
			}
			
			try {
				fs.unlinkSync(localLanguagePath);
				
				// Dispose old providers
				languageProviders.forEach(provider => provider.dispose());
				
				// Reload with default language definitions
				keywords = loadKeywords(undefined, context.extensionPath);
				languageProviders = registerLanguageFeatures(keywords);
				context.subscriptions.push(...languageProviders);
				
				vscode.window.showInformationMessage("Local language definition removed. Using default language definitions.");
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to remove local language definition: ${error}`);
			}
		}
	);

	// Regenerate language definitions command
	const regenerateLanguageCommand = vscode.commands.registerCommand(
		"sapf.regenerateLanguage",
		async () => {
			try {
				const cfg = vscode.workspace.getConfiguration("sapf");
				const sapfPath = cfg.get<string>("binaryPath", "sapf");
				const preludePath = cfg.get<string>("preludePath", "");
				
				// Check if prelude path is configured
				if (!preludePath) {
					const result = await vscode.window.showWarningMessage(
						"To generate complete language definitions, please configure the prelude file path in settings.",
						"Open Settings",
						"Continue Without Prelude"
					);
					
					if (result === "Open Settings") {
						vscode.commands.executeCommand('workbench.action.openSettings', 'sapf.preludePath');
						return;
					}
					// If "Continue Without Prelude" is selected, proceed without prelude
				}
				
				await vscode.window.withProgress(
					{
						location: vscode.ProgressLocation.Notification,
						title: "Regenerating SAPF language definitions...",
						cancellable: false,
					},
					async (progress) => {
						progress.report({ increment: 0, message: "Generating helpall output..." });
						
						const newLanguageData = await generateLanguageDefinitions(sapfPath, preludePath);
						
						progress.report({ increment: 50, message: "Parsing language definitions..." });
						
						// Save to language-local.json
						const languageFilePath = path.join(context.extensionPath, "language-local.json");
						fs.writeFileSync(languageFilePath, JSON.stringify(newLanguageData, null, 2));
						
						progress.report({ increment: 75, message: "Reloading language features..." });
						
						// Dispose old providers
						languageProviders.forEach(provider => provider.dispose());
						
						// Load new keywords and register new providers
						keywords = loadKeywords(newLanguageData);
						languageProviders = registerLanguageFeatures(keywords);
						context.subscriptions.push(...languageProviders);
						
						progress.report({ increment: 100, message: "Complete!" });
						
						// Count functions
						let totalFunctions = 0;
						for (const category in newLanguageData) {
							totalFunctions += Object.keys(newLanguageData[category].items).length;
						}
						
						vscode.window.showInformationMessage(
							`Successfully regenerated SAPF language definitions! Loaded ${totalFunctions} functions.`
						);
					}
				);
			} catch (error) {
				vscode.window.showErrorMessage(
					`Failed to regenerate language definitions: ${error}`
				);
			}
		}
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("sapf.evalLine", makeEval(getLine)),
		vscode.commands.registerCommand("sapf.evalBlock", makeEval(getBlockOrLine)),
		vscode.commands.registerCommand("sapf.stop", () => repl.send("stop")),
		vscode.commands.registerCommand("sapf.clear", () => repl.send("clear")),
		vscode.commands.registerCommand("sapf.cleard", () => repl.send("cleard")),
		vscode.commands.registerCommand("sapf.quit", () => repl.send("quit")),
		regenerateLanguageCommand,
		removeLocalLanguageCommand,
		vscode.window.onDidCloseTerminal((closed) => repl.handleClose(closed))
	);

	// Auto-start the REPL if configured.
	if (vscode.workspace.getConfiguration("sapf").get<boolean>("autostart", false)) {
		repl.ensure();
	}
}

export function deactivate(): void {
	// Extension cleanup if needed
}
