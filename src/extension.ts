import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import keywordsData from './language.json';
import { generateLanguageDefinitions } from './language-generator';

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
  round: ['(', ')'],
  square: ['[', ']'],
  curly: ['{', '}'],
};

/**
 * Singleton in charge of creating and managing the SAPF REPL terminal.
 */
class ReplManager {
  private terminal?: vscode.Terminal;

  /** Ensure the REPL terminal exists and return it. */
  ensure(): vscode.Terminal {
    if (!this.terminal) {
      const cfg = vscode.workspace.getConfiguration('sapf');
      const binaryPath = cfg.get<string>('binaryPath', 'sapf');
      const preludePath = cfg.get<string>('preludePath', '');

      // Validate prelude path if provided
      if (preludePath && !fs.existsSync(preludePath)) {
        vscode.window.showWarningMessage(`Prelude file not found: ${preludePath}`);
      }

      try {
        this.terminal = vscode.window.createTerminal('sapf');
        const command = `${binaryPath}${preludePath && fs.existsSync(preludePath) ? ` -p ${preludePath}` : ''}`;
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
function loadKeywords(
  languageData?: Record<string, { items: Record<string, string> }>,
  extensionPath?: string,
): Map<string, KeywordInfo> {
  let data = languageData;

  if (data == null && extensionPath != null && extensionPath.trim() !== '') {
    const localLanguagePath = path.join(extensionPath, 'language-local.json');
    if (fs.existsSync(localLanguagePath)) {
      try {
        const localData = JSON.parse(fs.readFileSync(localLanguagePath, 'utf8'));
        data = localData;
        // Using local function definitions from language-local.json
      } catch {
        // Failed to parse language-local.json, falling back to default
        data = keywordsData as Record<string, { items: Record<string, string> }>;
      }
    } else {
      data = keywordsData as Record<string, { items: Record<string, string> }>;
    }
  } else {
    data ??= keywordsData as Record<string, { items: Record<string, string> }>;
  }

  const map = new Map<string, KeywordInfo>();
  const pattern = /^(?:@(?<special>[a-z]+)\s*)?(?<signature>\([^)]*?-->\s*[^)]*?\))?\s*(?<description>.*)$/;

  if (data != null) {
    Object.entries(data).forEach(([category, { items }]) => {
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
  }

  // Loaded SAPF keywords
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

  const { text, range } = editor.document.lineAt(editor.selection.active.line);
  return { text: text.trim(), range };
}

/**
 * Return the current paragraph (text between empty lines) or selection.
 */
function getParagraph(editor: vscode.TextEditor): BlockInfo {
  const selText = editor.document.getText(editor.selection);
  if (selText) {
    return { text: selText, range: editor.selection };
  }

  const { document } = editor;
  const cursorLine = editor.selection.active.line;
  const totalLines = document.lineCount;

  // Find the first empty line above the cursor
  let startLine = cursorLine;
  for (let i = cursorLine; i >= 0; i--) {
    const line = document.lineAt(i);
    if (line.text.trim() === '') {
      startLine = i + 1;
      break;
    }
    if (i === 0) {
      startLine = 0;
    }
  }

  // Find the first empty line below the cursor
  let endLine = cursorLine;
  for (let i = cursorLine; i < totalLines; i++) {
    const line = document.lineAt(i);
    if (line.text.trim() === '') {
      endLine = i - 1;
      break;
    }
    if (i === totalLines - 1) {
      endLine = totalLines - 1;
    }
  }

  // Ensure we have valid line bounds
  startLine = Math.max(0, startLine);
  endLine = Math.min(totalLines - 1, endLine);

  if (startLine > endLine) {
    // Fallback to current line if no valid paragraph found
    return getLine(editor);
  }

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length);
  const range = new vscode.Range(startPos, endPos);
  const text = document.getText(range).trim();

  return { text, range };
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
  let bracketKind = vscode.workspace.getConfiguration('sapf').get('codeBlockBrackets', 'round');

  // Validate bracket configuration
  if (brackets[bracketKind] === null) {
    vscode.window.showWarningMessage(`Invalid bracket type: ${bracketKind}, using 'round'`);
    bracketKind = 'round';
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
      const s = stack.pop();
      if (s == null) {
        continue;
      }
      if (s < cursor && i > cursor && (start === -1 || s < start)) {
        start = s;
        end = i;
      }
    }
  }

  if (start !== -1 && end !== -1) {
    const range = new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(end));
    const block = text.slice(start + 1, end);
    return { text: block, range };
  }

  return getLine(editor);
}

/** Briefly highlights a range to signal evaluation. */
function flash(editor: vscode.TextEditor, range: vscode.Range): void {
  const decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  editor.setDecorations(decoration, [range]);
  const flashDuration = 200;
  setTimeout(() => decoration.dispose(), flashDuration);
}

/**
 * Format SAPF code by trimming extra spaces and properly indenting brackets.
 * SAPF is a stack-based language where most code should be at the base level,
 * with only content inside brackets being indented.
 */
function formatSapfCode(code: string): string {
  const lines = code.split('\n');
  const formatted: string[] = [];
  let indentLevel = 0;
  const indentSize = 2;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (trimmedLine === '') {
      formatted.push('');
      continue;
    }

    // Normalize spaces - replace multiple spaces with single spaces
    const normalizedLine = trimmedLine.replace(/\s+/g, ' ');

    // Special handling for comments - indent them to current level
    if (normalizedLine.startsWith(';;')) {
      const indent = ' '.repeat(indentLevel * indentSize);
      formatted.push(indent + normalizedLine);
      continue;
    }

    // Count brackets to determine indentation
    let lineIndent = indentLevel;
    let openingBrackets = 0;
    let closingBrackets = 0;

    // Check if line starts with closing bracket
    const startsWithClosing = /^[)\]}]/.test(normalizedLine);
    if (startsWithClosing) {
      lineIndent = Math.max(0, indentLevel - 1);
    }

    // Count all brackets in the line
    for (const char of normalizedLine) {
      if (char === '(' || char === '[' || char === '{') {
        openingBrackets++;
      } else if (char === ')' || char === ']' || char === '}') {
        closingBrackets++;
      }
    }

    // Apply indentation and add line
    const indent = ' '.repeat(lineIndent * indentSize);
    formatted.push(indent + normalizedLine);

    // Update indent level for next line
    // In SAPF, we only indent content inside brackets
    const netBrackets = openingBrackets - closingBrackets;
    indentLevel = Math.max(0, indentLevel + netBrackets);
  }

  return formatted.join('\n');
}

/**
 * Lint and format the current SAPF document.
 */
function lintSapfDocument(editor: vscode.TextEditor): void {
  const { document } = editor;
  const text = document.getText();
  const formatted = formatSapfCode(text);

  if (text !== formatted) {
    const fullRange = new vscode.Range(document.positionAt(0), document.positionAt(text.length));

    editor
      .edit((editBuilder) => {
        editBuilder.replace(fullRange, formatted);
      })
      .then((success) => {
        if (success) {
          vscode.window.showInformationMessage('SAPF code formatted successfully');
        } else {
          vscode.window.showErrorMessage('Failed to format SAPF code');
        }
      });
  } else {
    vscode.window.showInformationMessage('SAPF code is already properly formatted');
  }
}

/**
 * Register completion & hover providers for SAPF.
 */
function registerLanguageFeatures(keywords: Map<string, KeywordInfo>): vscode.Disposable[] {
  // Completion
  const wordRegex = /[\w$?!]+$/;
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    'sapf',
    {
      provideCompletionItems(doc, position) {
        const config = vscode.workspace.getConfiguration('sapf');
        const completionInfo = config.get<string>('completionInfo', 'full');


        const prefix = doc.lineAt(position).text.slice(0, position.character);
        const match = prefix.match(wordRegex);
        const current = match?.[0] ?? '';
        const currentLower = current.toLowerCase();

        const start = position.translate(0, -current.length);
        const range = new vscode.Range(start, position);

        return [...keywords.values()]
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
    ...'abcdefghijklmnopqrstuvwxyz0123456789$?!'.split(''),
  );

  // Hover
  const hoverProvider = vscode.languages.registerHoverProvider('sapf', {
    provideHover(doc, position) {
      const config = vscode.workspace.getConfiguration('sapf');
      const hoverInfo = config.get<string>('hoverInfo', 'full');

      if (hoverInfo === 'off') {
        return undefined;
      }

      const range = doc.getWordRangeAtPosition(position);
      if (!range) {
        return undefined;
      }

      const wordLower = doc.getText(range).toLowerCase();
      const info = keywords.get(wordLower);
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

  return [completionProvider, hoverProvider];
}

export function activate(context: vscode.ExtensionContext): void {
  let keywords = loadKeywords(undefined, context.extensionPath);
  const repl = new ReplManager();

  let languageProviders = registerLanguageFeatures(keywords);
  context.subscriptions.push(...languageProviders);

  // Helper to create evaluation commands.
  const makeEval =
    (resolver: (e: vscode.TextEditor) => BlockInfo): (() => void) =>
    (): void => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const block = resolver(editor);
      flash(editor, block.range);
      repl.send(block.text);
    };

  // Remove local function definitions command
  const removeLocalLanguageCommand = vscode.commands.registerCommand('sapf.removeFunctionDefinitions', async () => {
    const localLanguagePath = path.join(context.extensionPath, 'language-local.json');

    if (!fs.existsSync(localLanguagePath)) {
      vscode.window.showInformationMessage('No local function definition found to remove.');
      return;
    }

    try {
      fs.unlinkSync(localLanguagePath);

      // Dispose old providers
      languageProviders.forEach((provider) => provider.dispose());

      // Reload with default function definitions
      keywords = loadKeywords(undefined, context.extensionPath);
      languageProviders = registerLanguageFeatures(keywords);
      context.subscriptions.push(...languageProviders);

      vscode.window.showInformationMessage('Local function definition removed. Using default function definitions.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to remove local function definition: ${error}`);
    }
  });

  // Regenerate function definitions command
  const regenerateLanguageCommand = vscode.commands.registerCommand('sapf.regenerateFunctionDefinitions', async () => {
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
          const languageFilePath = path.join(context.extensionPath, 'language-local.json');
          const indentSize = 2;
          fs.writeFileSync(languageFilePath, JSON.stringify(newLanguageData, null, indentSize));

          progress.report({ increment: 75, message: 'Reloading language features...' });

          // Dispose old providers
          languageProviders.forEach((provider) => provider.dispose());

          // Load new keywords and register new providers
          keywords = loadKeywords(newLanguageData);
          languageProviders = registerLanguageFeatures(keywords);
          context.subscriptions.push(...languageProviders);

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

  context.subscriptions.push(
    vscode.commands.registerCommand('sapf.evalLine', makeEval(getLine)),
    vscode.commands.registerCommand('sapf.evalBlock', makeEval(getBlockOrLine)),
    vscode.commands.registerCommand('sapf.evalParagraph', makeEval(getParagraph)),
    vscode.commands.registerCommand('sapf.stop', () => repl.send('stop')),
    vscode.commands.registerCommand('sapf.clear', () => repl.send('clear')),
    vscode.commands.registerCommand('sapf.cleard', () => repl.send('cleard')),
    vscode.commands.registerCommand('sapf.quit', () => repl.send('quit')),
    vscode.commands.registerCommand('sapf.format', () => {
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
    }),
    regenerateLanguageCommand,
    removeLocalLanguageCommand,
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
