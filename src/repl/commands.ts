import * as vscode from 'vscode';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import { ReplManager } from './manager';
import type { BlockInfo } from '../language/types';
import { flash } from '../text/utils';

/**
 * Factory for creating REPL evaluation commands.
 */
export class ReplCommandFactory {
  constructor(private readonly repl: ReplManager) {}

  /**
   * Creates an evaluation command that uses the provided resolver to get code blocks.
   * @param resolver Function that extracts code blocks from the editor
   * @returns Command function
   */
  createEvalCommand(resolver: (editor: vscode.TextEditor) => BlockInfo): () => void {
    return (): void => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const block = resolver(editor);
      flash(editor, block.range);
      this.repl.send(block.text);
    };
  }

  /**
   * Creates a simple REPL command that sends a fixed string.
   * @param command The command string to send
   * @returns Command function
   */
  createSimpleCommand(command: string): () => void {
    return (): void => {
      this.repl.send(command);
    };
  }

  /**
   * Creates all standard SAPF REPL commands.
   * @returns Object containing all command functions
   */
  createStandardCommands(): Record<string, () => void> {
    return {
      stop: this.createSimpleCommand('stop'),
      clear: this.createSimpleCommand('clear'),
      cleard: this.createSimpleCommand('cleard'),
      quit: this.createSimpleCommand('quit'),
    };
  }
}
