/**
 * Type definitions for language-related functionality.
 */
import type * as vscode from 'vscode';

/**
 * Keyword metadata parsed from the JSON definition file.
 */
export interface KeywordInfo {
  keyword: string;
  signature: string | null;
  description: string;
  category: string;
  special: string | null;
}

/**
 * Language data structure from JSON files.
 */
export interface LanguageData {
  [category: string]: {
    items: Record<string, string>;
  };
}

/**
 * Configuration options for completion behavior.
 */
export type CompletionInfoLevel = 'off' | 'minimum' | 'full';

/**
 * Configuration options for hover behavior.
 */
export type HoverInfoLevel = 'off' | 'minimum' | 'full';

/**
 * (Selection text, Range) tuple returned by helper extractors.
 */
export interface BlockInfo {
  text: string;
  range: vscode.Range;
}

/**
 * Bracket type configuration.
 */
export type BracketType = 'round' | 'square' | 'curly';
