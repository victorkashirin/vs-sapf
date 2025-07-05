import * as vscode from 'vscode';
import { indentSize } from '../config/constants';

/**
 * Formats SAPF code by trimming extra spaces and properly indenting brackets.
 * SAPF is a stack-based language where most code should be at the base level,
 * with only content inside brackets being indented.
 * @param code The code to format
 * @returns Formatted code string
 */
export function formatSapfCode(code: string): string {
  const lines = code.split('\n');
  const formatted: string[] = [];
  let indentLevel = 0;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines
    if (trimmedLine === '') {
      formatted.push('');
      continue;
    }

    // Normalize spaces - replace multiple spaces with single spaces
    const cleanedLine = trimmedLine.replace(/\s+/g, ' ');

    // Special handling for comments - indent them to current level
    if (cleanedLine.startsWith(';;')) {
      const indent = ' '.repeat(indentLevel * indentSize);
      formatted.push(indent + cleanedLine);
      continue;
    }

    // Count brackets to determine indentation
    let lineIndent = indentLevel;
    let openingBrackets = 0;
    let closingBrackets = 0;

    // Check if line starts with closing bracket
    const startsWithClosing = /^[)\]}]/.test(cleanedLine);
    if (startsWithClosing) {
      lineIndent = Math.max(0, indentLevel - 1);
    }

    // Count all brackets in the line
    for (const char of cleanedLine) {
      if (char === '(' || char === '[' || char === '{') {
        openingBrackets++;
      } else if (char === ')' || char === ']' || char === '}') {
        closingBrackets++;
      }
    }

    // Apply indentation and add line
    const indent = ' '.repeat(lineIndent * indentSize);
    formatted.push(indent + cleanedLine);

    // Update indent level for next line
    // In SAPF, we only indent content inside brackets
    const netBrackets = openingBrackets - closingBrackets;
    indentLevel = Math.max(0, indentLevel + netBrackets);
  }

  return formatted.join('\n');
}

/**
 * Lints and formats the current SAPF document.
 * @param editor The active text editor
 */
export function lintSapfDocument(editor: vscode.TextEditor): void {
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
 * Validates SAPF code for common syntax issues.
 * @param code The code to validate
 * @returns Array of validation errors
 */
export function validateSapfCode(code: string): string[] {
  const errors: string[] = [];
  const lines = code.split('\n');
  const bracketStack: Array<{ char: string; line: number }> = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      const char = line[charIndex];

      if (char === '(' || char === '[' || char === '{') {
        bracketStack.push({ char, line: lineIndex + 1 });
      } else if (char === ')' || char === ']' || char === '}') {
        const lastOpen = bracketStack.pop();

        if (!lastOpen) {
          errors.push(`Unmatched closing bracket '${char}' at line ${lineIndex + 1}`);
        } else {
          const expectedClosing = getMatchingBracket(lastOpen.char);
          if (char !== expectedClosing) {
            errors.push(
              `Mismatched bracket: expected '${expectedClosing}' but found '${char}' at line ${lineIndex + 1}`,
            );
          }
        }
      }
    }
  }

  // Check for unclosed brackets
  for (const unclosed of bracketStack) {
    errors.push(`Unclosed bracket '${unclosed.char}' at line ${unclosed.line}`);
  }

  return errors;
}

/**
 * Gets the matching closing bracket for an opening bracket.
 * @param openBracket The opening bracket character
 * @returns The matching closing bracket character
 */
function getMatchingBracket(openBracket: string): string {
  switch (openBracket) {
    case '(':
      return ')';
    case '[':
      return ']';
    case '{':
      return '}';
    default:
      return openBracket;
  }
}
