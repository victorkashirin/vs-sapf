import * as vscode from 'vscode';

let esolangTerminal: vscode.Terminal | undefined;

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('vsapf.evalLine', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			return;
		}

		const document = editor.document;
		const line = document.lineAt(editor.selection.active.line).text;

		const binaryPath = vscode.workspace.getConfiguration().get<string>('vsapf.binaryPath') || '';
		const binaryArgs = vscode.workspace.getConfiguration().get<string[]>('vsapf.binaryArgs') || [];

		// Create terminal if not exists
		if (!esolangTerminal) {
			esolangTerminal = vscode.window.createTerminal({
				name: 'SAPF REPL',
				shellPath: binaryPath,
				shellArgs: binaryArgs
			});
			esolangTerminal.show(true);
		}

		// Send current line to terminal
		esolangTerminal.sendText(line, true);
	});

	context.subscriptions.push(disposable);

	context.subscriptions.push(vscode.window.onDidCloseTerminal(terminal => {
		if (terminal === esolangTerminal) {
			esolangTerminal = undefined;
		}
	}));
}

export function deactivate() {
	if (esolangTerminal) {
		esolangTerminal.dispose();
	}
}
