import { log } from 'console';
import * as vscode from 'vscode';

let sapfTerminal: vscode.Terminal | undefined;

const keywordDecorationType = vscode.window.createTextEditorDecorationType({
	fontWeight: 'bold',
});

function highlightKeywords(editor: vscode.TextEditor, keywords: string[]) {
	const regex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
	const text = editor.document.getText();
	const decorations: vscode.DecorationOptions[] = [];

	for (const match of text.matchAll(regex)) {
		const start = editor.document.positionAt(match.index!);
		const end = editor.document.positionAt(match.index! + match[0].length);
		decorations.push({ range: new vscode.Range(start, end) });
	}

	editor.setDecorations(keywordDecorationType, decorations);
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
	// const keywords = ["quit", "sinosc", "stop", "helpall"];

	// vscode.window.onDidChangeActiveTextEditor(editor => {
	// 	if (editor) {
	// 		highlightKeywords(editor, keywords);
	// 	}
	// });

	// if (vscode.window.activeTextEditor) {
	// 	highlightKeywords(vscode.window.activeTextEditor, keywords);
	// }

	// vscode.workspace.onDidChangeTextDocument(event => {
	// 	const editor = vscode.window.activeTextEditor;
	// 	if (editor && event.document === editor.document) {
	// 		highlightKeywords(editor, keywords);
	// 	}
	// });


	const disposable = vscode.commands.registerCommand('vsapf.evalLine', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const line = getBlockOrLine(editor);

		const binaryPath = vscode.workspace.getConfiguration().get<string>('vsapf.binaryPath') || '';
		const binaryArgs = vscode.workspace.getConfiguration().get<string[]>('vsapf.binaryArgs') || [];

		// Create terminal if not exists
		if (!sapfTerminal) {
			sapfTerminal = vscode.window.createTerminal({
				name: 'SAPF REPL',
				shellPath: binaryPath,
				shellArgs: binaryArgs
			});
			sapfTerminal.show(true);
		}

		// Send current line to terminal
		sapfTerminal.sendText(line, true);
	});

	context.subscriptions.push(disposable);

	context.subscriptions.push(vscode.window.onDidCloseTerminal(async terminal => {
		if (terminal === sapfTerminal) {
			const pid = await sapfTerminal.processId;
			if (pid) {
				console.log(`Terminal process ID: ${pid}. Attempting to terminate.`);
				try {
					process.kill(pid, 'SIGKILL');
					console.log(`Sent SIGKILL to PID ${pid}`);
				} catch (e: any) {
					if (e.code === 'ESRCH') {
						console.log(`Process ${pid} not found (already exited).`);
					} else {
						console.warn(`Error sending signal to PID ${pid}:`, e);
					}
				}
			}
			sapfTerminal = undefined;
		}
	}));
}

export async function deactivate() {
	if (sapfTerminal) {
		sapfTerminal.dispose();
		sapfTerminal = undefined;
	}
}
