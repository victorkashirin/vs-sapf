/**
 * Constants and configuration values for the SAPF extension.
 */

/** Duration for visual feedback when code is evaluated */
export const flashDuration = 200;

/** Number of spaces for indentation */
export const indentSize = 2;

/** Regular expression for matching word characters in SAPF */
export const wordRegex = /[\w$?!]+$/;

/** Pattern for parsing language definition descriptions */
export const languagePattern =
  /^(?:@(?<special>[a-z]+)\s*)?(?<signature>\([^)]*?-->\s*[^)]*?\))?\s*(?<description>.*)$/;

/** Bracket types and their corresponding characters */
export const brackets: Record<string, [string, string]> = {
  round: ['(', ')'],
  square: ['[', ']'],
  curly: ['{', '}'],
};

/** Default bracket type for code blocks */
export const defaultBracketType = 'round';

/** Characters that trigger completion */
export const completionTriggerCharacters = 'abcdefghijklmnopqrstuvwxyz0123456789$?!'.split('');
