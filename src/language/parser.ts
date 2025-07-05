import * as fs from 'fs';
import * as path from 'path';
import keywordsData from '../language.json';
import type { KeywordInfo, LanguageData } from './types';
import { languagePattern } from '../config/constants';

/**
 * Parses the JSON language specification and returns a Map keyed by lowercase keyword.
 * @param languageData Optional language data to parse
 * @param extensionPath Optional extension path for loading local files
 * @returns Map of keywords to their information
 */
export function loadKeywords(languageData?: LanguageData, extensionPath?: string): Map<string, KeywordInfo> {
  let data = languageData;

  if (data == null && extensionPath != null && extensionPath.trim() !== '') {
    const localLanguagePath = path.join(extensionPath, 'language-local.json');
    if (fs.existsSync(localLanguagePath)) {
      try {
        const localData = JSON.parse(fs.readFileSync(localLanguagePath, 'utf8'));
        data = localData;
      } catch {
        // Failed to parse language-local.json, falling back to default
        data = keywordsData as LanguageData;
      }
    } else {
      data = keywordsData as LanguageData;
    }
  } else {
    data ??= keywordsData as LanguageData;
  }

  const map = new Map<string, KeywordInfo>();

  if (data != null) {
    Object.entries(data).forEach(([category, { items }]) => {
      Object.entries(items).forEach(([keyword, rawDescription]) => {
        const parsedInfo = parseKeywordDescription(rawDescription, keyword, category);
        map.set(keyword.toLowerCase(), parsedInfo);
      });
    });
  }

  return map;
}

/**
 * Parses a keyword description string into structured information.
 * @param rawDescription The raw description string
 * @param keyword The keyword name
 * @param category The category the keyword belongs to
 * @returns Parsed keyword information
 */
function parseKeywordDescription(rawDescription: string, keyword: string, category: string): KeywordInfo {
  const match = rawDescription.match(languagePattern);

  const special = match?.groups?.special ?? null;
  const signature = match?.groups?.signature ?? null;
  const description = (match?.groups?.description ?? rawDescription).trim();

  return {
    keyword,
    signature,
    description,
    category,
    special,
  };
}
