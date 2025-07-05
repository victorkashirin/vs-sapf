import * as vscode from 'vscode';
import type { BlockInfo, BracketType } from '../language/types';
import { brackets, defaultBracketType } from '../config/constants';
import { getLine } from './utils';

/**
 * Returns the smallest enclosing bracket block or a single line if none.
 * @param editor The active text editor
 * @returns Block information containing text and range
 */
export function getBlockOrLine(editor: vscode.TextEditor): BlockInfo {
  const selText = editor.document.getText(editor.selection);
  if (selText) {
    return { text: selText, range: editor.selection };
  }

  const text = editor.document.getText();
  const cursor = editor.document.offsetAt(editor.selection.active);
  let bracketKind = vscode.workspace
    .getConfiguration('sapf')
    .get('codeBlockBrackets', defaultBracketType) as BracketType;

  // Validate bracket configuration
  if (brackets[bracketKind] === undefined) {
    vscode.window.showWarningMessage(`Invalid bracket type: ${bracketKind}, using '${defaultBracketType}'`);
    bracketKind = defaultBracketType;
  }

  const stack: number[] = [];
  let start = -1;
  let end = -1;

  const [openBracket, closeBracket] = brackets[bracketKind];

  for (let i = 0; i < text.length; i++) {
    const currentChar = text[i];
    if (currentChar === openBracket) {
      stack.push(i);
    } else if (currentChar === closeBracket && stack.length) {
      const openIndex = stack.pop();
      if (openIndex == null) {
        continue;
      }
      if (openIndex < cursor && i > cursor && (start === -1 || openIndex < start)) {
        start = openIndex;
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

/**
 * Finds the innermost block containing the cursor position.
 * @param editor The active text editor
 * @param bracketType The type of brackets to search for
 * @returns Block information or null if no block found
 */
export function findInnerBlock(editor: vscode.TextEditor, bracketType: BracketType): BlockInfo | null {
  const text = editor.document.getText();
  const cursor = editor.document.offsetAt(editor.selection.active);

  if (brackets[bracketType] === undefined) {
    return null;
  }

  const [openBracket, closeBracket] = brackets[bracketType];
  const stack: { index: number; depth: number }[] = [];
  let bestMatch: { start: number; end: number; depth: number } | null = null;

  for (let i = 0; i < text.length; i++) {
    const currentChar = text[i];

    if (currentChar === openBracket) {
      stack.push({ index: i, depth: stack.length });
    } else if (currentChar === closeBracket && stack.length > 0) {
      const openInfo = stack.pop();
      if (openInfo && openInfo.index < cursor && i > cursor) {
        if (!bestMatch || openInfo.depth > bestMatch.depth) {
          bestMatch = { start: openInfo.index, end: i, depth: openInfo.depth };
        }
      }
    }
  }

  if (bestMatch) {
    const range = new vscode.Range(
      editor.document.positionAt(bestMatch.start),
      editor.document.positionAt(bestMatch.end),
    );
    const blockText = text.slice(bestMatch.start + 1, bestMatch.end);
    return { text: blockText, range };
  }

  return null;
}
