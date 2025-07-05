import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Manages the SAPF REPL terminal lifecycle and provides code evaluation interface.
 * Singleton in charge of creating and managing the SAPF REPL terminal.
 */
export class ReplManager {
  private terminal?: vscode.Terminal;

  /**
   * Ensures the REPL terminal exists and returns it.
   * @returns The active REPL terminal
   * @throws Error if terminal creation fails
   */
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

  /**
   * Sends code to the REPL, creating it if necessary.
   * @param code The code to send to the REPL
   */
  send(code: string): void {
    try {
      this.ensure().sendText(code, true);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to send code to SAPF: ${error}`);
    }
  }

  /**
   * Disposes the REPL terminal if it is ours.
   */
  dispose(): void {
    this.terminal?.dispose();
    this.terminal = undefined;
  }

  /**
   * Clears internal handle when the user closes the terminal manually.
   * @param closed The terminal that was closed
   */
  handleClose(closed: vscode.Terminal): void {
    if (closed === this.terminal) {
      this.terminal = undefined;
    }
  }
}
