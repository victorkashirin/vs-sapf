import * as vscode from 'vscode';
import type { BlockInfo } from '../config/types';
import { flashDuration } from '../config/constants';

/**
 * Returns the user selection or the current line when there is no selection.
 * @param editor The active text editor
 * @returns Block information containing text and range
 */
export function getLine(editor: vscode.TextEditor): BlockInfo {
  const selText = editor.document.getText(editor.selection);
  if (selText) {
    return { text: selText, range: editor.selection };
  }

  const { text, range } = editor.document.lineAt(editor.selection.active.line);
  return { text: text.trim(), range };
}

/**
 * Returns the current paragraph (text between empty lines) or selection.
 * @param editor The active text editor
 * @returns Block information containing text and range
 */
export function getParagraph(editor: vscode.TextEditor): BlockInfo {
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
 * Briefly highlights a range to signal evaluation.
 * @param editor The active text editor
 * @param range The range to highlight
 */
export function flash(editor: vscode.TextEditor, range: vscode.Range): void {
  const decoration = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
    isWholeLine: true,
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
  });

  editor.setDecorations(decoration, [range]);
  setTimeout(() => decoration.dispose(), flashDuration);
}
