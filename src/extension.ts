import * as vscode from "vscode";
import keywordsData from "./language.json";

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

			this.terminal = vscode.window.createTerminal("sapf");
			this.terminal.sendText(
				`${binaryPath}${preludePath ? ` -p ${preludePath}` : ""}`
			);
			this.terminal.show(true);
		}
		return this.terminal;
	}

	/** Send code to the REPL, creating it if necessary. */
	send(code: string): void {
		this.ensure().sendText(code, true);
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
function loadKeywords(): Map<string, KeywordInfo> {
	const map = new Map<string, KeywordInfo>();
	const pattern =
		/^(?:@(?<special>[a-z]+)\s*)?(?<signature>\([^)]*?-->\s*[^)]*?\))?\s*(?<description>.*)$/;

	Object.entries(
		keywordsData as Record<string, { items: Record<string, string> }>
	).forEach(([category, { items }]) => {
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
	const bracketKind = vscode.workspace.getConfiguration('sapf').get("codeBlockBrackets", "round");

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
	context: vscode.ExtensionContext,
	keywords: Map<string, KeywordInfo>
): void {
	// Completion
	const WORD_REGEX = /[\w$?!]+$/;
	context.subscriptions.push(
		vscode.languages.registerCompletionItemProvider(
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
		)
	);

	// Hover
	context.subscriptions.push(
		vscode.languages.registerHoverProvider("sapf", {
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
		})
	);
}

export function activate(context: vscode.ExtensionContext): void {
	const keywords = loadKeywords();
	const repl = new ReplManager();

	registerLanguageFeatures(context, keywords);

	// Helper to create evaluation commands.
	const makeEval = (resolver: (e: vscode.TextEditor) => BlockInfo) => () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) return;

		const block = resolver(editor);
		flash(editor, block.range);
		repl.send(block.text);
	};

	context.subscriptions.push(
		vscode.commands.registerCommand("sapf.evalLine", makeEval(getLine)),
		vscode.commands.registerCommand("sapf.evalBlock", makeEval(getBlockOrLine)),
		vscode.commands.registerCommand("sapf.stop", () => repl.send("stop")),
		vscode.commands.registerCommand("sapf.clear", () => repl.send("clear")),
		vscode.commands.registerCommand("sapf.cleard", () => repl.send("cleard")),
		vscode.commands.registerCommand("sapf.quit", () => repl.send("quit")),
		vscode.window.onDidCloseTerminal((closed) => repl.handleClose(closed))
	);

	// Auto-start the REPL if configured.
	if (vscode.workspace.getConfiguration("sapf").get<boolean>("autostart", false)) {
		repl.ensure();
	}
}

export function deactivate(): void { }
