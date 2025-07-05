import * as vscode from 'vscode';
import type { KeywordInfo, CompletionInfoLevel, HoverInfoLevel } from './types';
import { wordRegex, completionTriggerCharacters } from '../config/constants';

/**
 * Factory class for creating language service providers.
 */
export class LanguageProviderFactory {
  constructor(private readonly keywords: Map<string, KeywordInfo>) {}

  /**
   * Creates and registers completion and hover providers for SAPF.
   * @returns Array of disposable providers
   */
  createProviders(): vscode.Disposable[] {
    const completionProvider = this.createCompletionProvider();
    const hoverProvider = this.createHoverProvider();

    return [completionProvider, hoverProvider];
  }

  /**
   * Creates a completion provider for SAPF.
   * @returns Completion provider disposable
   */
  private createCompletionProvider(): vscode.Disposable {
    return vscode.languages.registerCompletionItemProvider(
      'sapf',
      {
        provideCompletionItems: (doc, position) => {
          const config = vscode.workspace.getConfiguration('sapf');
          const completionInfo = config.get<CompletionInfoLevel>('completionInfo', 'full');

          const prefix = doc.lineAt(position).text.slice(0, position.character);
          const match = prefix.match(wordRegex);
          const current = match?.[0] ?? '';
          const currentLower = current.toLowerCase();

          const start = position.translate(0, -current.length);
          const range = new vscode.Range(start, position);

          return [...this.keywords.values()]
            .filter(({ keyword }) => current.length === 0 || keyword.toLowerCase().startsWith(currentLower))
            .map(({ keyword, signature, description, category, special }) => {
              const item = new vscode.CompletionItem(keyword, vscode.CompletionItemKind.Function);

              item.range = range;

              if (completionInfo === 'off') {
                // Just provide the function name without any details
              } else if (completionInfo === 'minimum') {
                item.detail = signature ?? '(no signature)';
              } else {
                // 'full'
                item.detail = signature ?? description.split('\n')[0] ?? '';

                const md = new vscode.MarkdownString(undefined, true);
                md.appendMarkdown(`**Category**: ${category}\n\n`);
                md.appendCodeblock(
                  `${keyword} ${special !== null ? `${special} ` : ''}${signature ?? '(no signature)'}`,
                  'sapf',
                );
                md.appendMarkdown(`\n\n${description}`);

                item.documentation = md;
              }

              return item;
            });
        },
      },
      ...completionTriggerCharacters,
    );
  }

  /**
   * Creates a hover provider for SAPF.
   * @returns Hover provider disposable
   */
  private createHoverProvider(): vscode.Disposable {
    return vscode.languages.registerHoverProvider('sapf', {
      provideHover: (doc, position) => {
        const config = vscode.workspace.getConfiguration('sapf');
        const hoverInfo = config.get<HoverInfoLevel>('hoverInfo', 'full');

        if (hoverInfo === 'off') {
          return undefined;
        }

        const range = doc.getWordRangeAtPosition(position);
        if (!range) {
          return undefined;
        }

        const wordLower = doc.getText(range).toLowerCase();
        const info = this.keywords.get(wordLower);
        if (info == null) {
          return undefined;
        }

        const md = new vscode.MarkdownString(undefined, true);

        if (hoverInfo === 'minimum') {
          md.appendCodeblock(`${info.keyword} ${info.signature ?? '(no signature)'}`, 'sapf');
        } else {
          // 'full'
          md.appendMarkdown(`**Category**: ${info.category}\n\n`);
          md.appendCodeblock(
            `${info.keyword} ${info.special !== null ? `${info.special} ` : ''}${info.signature ?? '(no signature)'}`,
            'sapf',
          );
          md.appendMarkdown(`\n\n${info.description}`);
        }

        return new vscode.Hover(md);
      },
    });
  }
}
