import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { generateLanguageDefinitions } from './generator';
import { loadKeywords } from './parser';
import { LanguageProviderFactory } from './providers';
import type { LanguageData, KeywordInfo } from './types';
import { lintSapfDocument } from '../text/formatter';

export class LanguageCommands {
  private languageProviders: vscode.Disposable[] = [];
  private keywords: Map<string, KeywordInfo>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    initialKeywords: Map<string, KeywordInfo>,
    initialProviders: vscode.Disposable[],
  ) {
    this.keywords = initialKeywords;
    this.languageProviders = initialProviders;
  }

  createRemoveLocalDefinitionsCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('sapf.removeFunctionDefinitions', async () => {
      const localLanguagePath = path.join(this.context.extensionPath, 'language-local.json');

      if (!fs.existsSync(localLanguagePath)) {
        vscode.window.showInformationMessage('No local function definition found to remove.');
        return;
      }

      try {
        fs.unlinkSync(localLanguagePath);

        // Dispose old providers
        this.languageProviders.forEach((provider) => provider.dispose());

        // Reload with default function definitions
        this.keywords = loadKeywords(undefined, this.context.extensionPath);
        this.languageProviders = new LanguageProviderFactory(this.keywords).createProviders();
        this.context.subscriptions.push(...this.languageProviders);

        vscode.window.showInformationMessage('Local function definition removed. Using default function definitions.');
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to remove local function definition: ${error}`);
      }
    });
  }

  createRegenerateDefinitionsCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('sapf.regenerateFunctionDefinitions', async () => {
      try {
        const cfg = vscode.workspace.getConfiguration('sapf');
        const sapfPath = cfg.get<string>('binaryPath', 'sapf');
        const preludePath = cfg.get<string>('preludePath', '');

        // Check if prelude path is configured
        if (!preludePath) {
          const result = await vscode.window.showWarningMessage(
            'To generate complete function definitions, please configure the prelude file path in settings.',
            'Open Settings',
            'Continue Without Prelude',
          );

          if (result === 'Open Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'sapf.preludePath');
            return;
          }
          // If "Continue Without Prelude" is selected, proceed without prelude
        }

        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'Regenerating SAPF function definitions...',
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 0, message: 'Generating helpall output...' });

            const newLanguageData = await generateLanguageDefinitions(sapfPath, preludePath);

            progress.report({ increment: 50, message: 'Parsing function definitions...' });

            // Save to language-local.json
            const languageFilePath = path.join(this.context.extensionPath, 'language-local.json');
            const indentSize = 2;
            fs.writeFileSync(languageFilePath, JSON.stringify(newLanguageData, null, indentSize));

            progress.report({ increment: 75, message: 'Reloading language features...' });

            // Dispose old providers
            this.languageProviders.forEach((provider) => provider.dispose());

            // Load new keywords and register new providers
            this.keywords = loadKeywords(newLanguageData as LanguageData);
            this.languageProviders = new LanguageProviderFactory(this.keywords).createProviders();
            this.context.subscriptions.push(...this.languageProviders);

            progress.report({ increment: 100, message: 'Complete!' });

            // Count functions
            let totalFunctions = 0;
            for (const category in newLanguageData) {
              if (Object.prototype.hasOwnProperty.call(newLanguageData, category)) {
                totalFunctions += Object.keys(newLanguageData[category].items).length;
              }
            }

            vscode.window.showInformationMessage(
              `Successfully regenerated SAPF function definitions! Loaded ${totalFunctions} functions.`,
            );
          },
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to regenerate function definitions: ${error}`);
      }
    });
  }

  updateProviders(newProviders: vscode.Disposable[]): void {
    this.languageProviders = newProviders;
  }

  getKeywords(): Map<string, KeywordInfo> {
    return this.keywords;
  }

  createFormatCommand(): vscode.Disposable {
    return vscode.commands.registerCommand('sapf.format', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage('No active editor');
        return;
      }
      if (editor.document.languageId !== 'sapf') {
        vscode.window.showErrorMessage('This command only works with SAPF files');
        return;
      }
      lintSapfDocument(editor);
    });
  }
}
