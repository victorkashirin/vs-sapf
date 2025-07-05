import * as vscode from 'vscode';
import { LanguageCommands } from './language/commands';
import { ReplManager } from './repl/manager';
import { ReplCommandFactory } from './repl/commands';
import { loadKeywords } from './language/parser';
import { LanguageProviderFactory } from './language/providers';
import { getLine, getParagraph } from './text/utils';
import { getBlockOrLine } from './text/block-finder';

export function activate(context: vscode.ExtensionContext): void {
  const keywords = loadKeywords(undefined, context.extensionPath);
  const repl = new ReplManager();
  const commandFactory = new ReplCommandFactory(repl);

  const languageProviders = new LanguageProviderFactory(keywords).createProviders();
  context.subscriptions.push(...languageProviders);

  // Initialize language commands
  const languageCommands = new LanguageCommands(context, keywords, languageProviders);

  const standardCommands = commandFactory.createStandardCommands();

  context.subscriptions.push(
    vscode.commands.registerCommand('sapf.evalLine', commandFactory.createEvalCommand(getLine)),
    vscode.commands.registerCommand('sapf.evalBlock', commandFactory.createEvalCommand(getBlockOrLine)),
    vscode.commands.registerCommand('sapf.evalParagraph', commandFactory.createEvalCommand(getParagraph)),
    vscode.commands.registerCommand('sapf.stop', standardCommands.stop),
    vscode.commands.registerCommand('sapf.clear', standardCommands.clear),
    vscode.commands.registerCommand('sapf.cleard', standardCommands.cleard),
    vscode.commands.registerCommand('sapf.quit', standardCommands.quit),
    languageCommands.createFormatCommand(),
    languageCommands.createRegenerateDefinitionsCommand(),
    languageCommands.createRemoveLocalDefinitionsCommand(),
    vscode.window.onDidCloseTerminal((closed) => repl.handleClose(closed)),
  );

  // Auto-start the REPL if configured.
  if (vscode.workspace.getConfiguration('sapf').get<boolean>('autostart', false)) {
    repl.ensure();
  }
}

export function deactivate(): void {
  // Extension cleanup if needed
}
