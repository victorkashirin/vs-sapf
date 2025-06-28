import * as vscode from 'vscode';
import * as keywordsData from './language.json';

let sapfTerminal: vscode.Terminal | undefined;

interface KeywordInfo {
	signature: string | null;
	description: string;
	category: string;
	keyword: string; // Store the keyword itself for easier access
	special: string | null; // For annotations like @zzz, @kkk etc.
}

const sapfKeywords: Map<string, KeywordInfo> = new Map();

function ensureTerminal() {
	if (!sapfTerminal) {
		const binaryPath = vscode.workspace.getConfiguration().get<string>('vsapf.binaryPath') || '';
		const binaryArgs = vscode.workspace.getConfiguration().get<string[]>('vsapf.binaryArgs') || [];
		sapfTerminal = vscode.window.createTerminal({ name: 'sapf' });
		sapfTerminal.sendText(binaryPath)
		sapfTerminal.show(true);
	}
}


function parseAndPopulateKeywords(categories: any) {
	try {
		for (const categoryName in categories) {
			if (Object.prototype.hasOwnProperty.call(categories, categoryName)) {
				const category = categories[categoryName];
				const items = category.items;

				for (const keyword in items) {
					if (Object.prototype.hasOwnProperty.call(items, keyword)) {
						let description = items[keyword];
						let signature: string | null = null;
						let special: string | null = null;

						// Regex to find:
						// 1. Optional special annotation like @zzz, @kkk (group 1)
						// 2. The signature like (a b --> c) (group 2)
						// 3. The remaining description (group 3)
						const regex = /^(?:(@[a-z]+)\s*)?(\([^)]*?\s*-->\s*[^)]*?\))?\s*(.*)$/;
						const match = description.match(regex);

						if (match) {
							special = match[1] || null;
							signature = match[2] || null;
							description = match[3] || description; // Use remaining part or original if no match
						}

						sapfKeywords.set(keyword, {
							keyword: keyword,
							signature: signature,
							description: description.trim(), // Trim leading/trailing whitespace
							category: categoryName,
							special: special
						});
					}
				}
			}
		}
		console.log(`Loaded ${sapfKeywords.size} SAPF keywords.`);
	} catch (e) {
		console.error("Failed to parse SAPF keywords JSON:", e);
	}
}

function getBlockOrLine(editor: vscode.TextEditor): string {
	const text = editor.document.getText();
	const cursorOffset = editor.document.offsetAt(editor.selection.active);

	// Find block enclosed in ( ... ) that contains the cursor
	let start = -1, end = -1, balance = 0;
	for (let i = cursorOffset - 1; i >= 0; i--) {
		const c = text[i];
		if (c === ')') balance++;
		else if (c === '(') {
			if (balance === 0) {
				start = i;
				break;
			}
			balance--;
		}
	}

	balance = 0;
	for (let i = cursorOffset; i < text.length; i++) {
		const c = text[i];
		if (c === '(') balance++;
		else if (c === ')') {
			if (balance === 0) {
				end = i;
				break;
			}
			balance--;
		}
	}

	if (start !== -1 && end !== -1) {
		const block = text.slice(start + 1, end);
		const lines = block.split(/\r?\n/).map(line => line.trim());
		return lines.join('\n');
	}

	// Fallback to current line
	return editor.document.lineAt(editor.selection.active.line).text.trim();
}

export function activate(context: vscode.ExtensionContext) {

	parseAndPopulateKeywords(keywordsData)

	context.subscriptions.push(vscode.languages.registerCompletionItemProvider("sapf", completionItemProvider));
	context.subscriptions.push(vscode.languages.registerHoverProvider("sapf", hoverProvider));
	context.subscriptions.push(vscode.commands.registerCommand('vsapf.evalLine', evaluateLine));
	context.subscriptions.push(vscode.commands.registerCommand('vsapf.stop', stopSapf))

	vscode.window.onDidCloseTerminal((closedTerminal) => {
		if (closedTerminal === sapfTerminal) {
			sapfTerminal = undefined;
		}
	});
}

const completionItemProvider: vscode.CompletionItemProvider = {
	provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
		const linePrefix = document.lineAt(position).text.substring(0, position.character);
		// Simple word regex to find the current word being typed
		const wordMatch = linePrefix.match(/[\w\-\?]+$/);
		const currentWord = wordMatch ? wordMatch[0] : '';

		if (!currentWord) {
			return undefined;
		}

		const completionItems: vscode.CompletionItem[] = [];
		for (const [keywordName, keywordInfo] of sapfKeywords.entries()) {
			if (keywordName.startsWith(currentWord)) {
				const item = new vscode.CompletionItem(keywordName, vscode.CompletionItemKind.Function);

				// Use signature for detail or first line of description
				item.detail = keywordInfo.signature || keywordInfo.description.split('\n')[0];

				// Create Markdown documentation
				const docs = new vscode.MarkdownString();
				docs.appendMarkdown(`**Category**: ${keywordInfo.category}\n\n`);
				docs.appendCodeblock(`${keywordName} ${keywordInfo.special ? keywordInfo.special + ' ' : ''}${keywordInfo.signature || '(no signature)'}`, "sapf");
				docs.appendMarkdown(`\n\n${keywordInfo.description}`);

				item.documentation = docs;
				completionItems.push(item);
			}
		}
		return completionItems;
	}
};

const hoverProvider: vscode.HoverProvider = {
	provideHover(document: vscode.TextDocument, position: vscode.Position) {
		const range = document.getWordRangeAtPosition(position);
		if (!range) {
			return undefined;
		}
		const word = document.getText(range);
		const keywordInfo = sapfKeywords.get(word);

		if (keywordInfo) {
			const docs = new vscode.MarkdownString();
			docs.appendMarkdown(`**Category**: ${keywordInfo.category}\n\n`);
			docs.appendCodeblock(`${keywordInfo.keyword} ${keywordInfo.special ? keywordInfo.special + ' ' : ''}${keywordInfo.signature || '(no signature)'}`, "sapf");
			docs.appendMarkdown(`\n\n${keywordInfo.description}`);
			return new vscode.Hover(docs);
		}
		return undefined;
	}
}

function evaluateLine() {
	const editor = vscode.window.activeTextEditor;
	if (!editor) {
		return;
	}
	const line = getBlockOrLine(editor);
	ensureTerminal();
	if (sapfTerminal) {
		sapfTerminal.sendText(line, true);
	}
}

function stopSapf() {
	if (sapfTerminal) {
		sapfTerminal.sendText("stop", true);
	}
}

export async function deactivate() {
	if (sapfTerminal) {
		sapfTerminal.dispose();
		sapfTerminal = undefined;
	}
}
