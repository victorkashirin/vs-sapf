# Language Generation Scripts

This directory contains scripts for generating the `language.json` file with SAPF function definitions.

## Setup

1. Copy `.env.example` to `.env` in the project root
2. Update the paths in `.env` to match your local SAPF installation

## Usage

Generate the language.json file:

```bash
npm run build-language
```

This will:
1. Compile the TypeScript sources
2. Run the language generation script
3. Generate `src/language.json` with current SAPF function definitions

## Files

- `generate-language.js` - Language generation script

## Environment Variables

- `SAPF_BINARY_PATH` - Path to the SAPF binary (defaults to 'sapf')
- `SAPF_PRELUDE_PATH` - Path to the prelude file that comes with SAPF binary