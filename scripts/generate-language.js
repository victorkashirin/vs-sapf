#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { config } = require('dotenv');

// Load environment variables from .env file
config();

// Import the compiled language generator
const { generateLanguageDefinitions } = require('../out/language-generator');

async function main() {
	try {
		// Get configuration from environment variables
		const sapfPath = process.env.SAPF_BINARY_PATH || 'sapf';
		const preludePath = process.env.SAPF_PRELUDE_PATH;
		const outputFile = 'src/language.json';

		console.log(`Generating language definitions from SAPF binary: ${sapfPath}`);
		if (preludePath) {
			console.log(`Using prelude file: ${preludePath}`);
		} else {
			console.log('No prelude file specified');
		}

		// Generate language definitions
		const languageData = await generateLanguageDefinitions(sapfPath, preludePath);

		// Count functions
		let totalFunctions = 0;
		for (const category in languageData) {
			const count = Object.keys(languageData[category].items).length;
			console.log(`${category}: ${count} functions`);
			totalFunctions += count;
		}

		console.log(`Total functions: ${totalFunctions}`);

		// Ensure output directory exists
		const outputDir = path.dirname(outputFile);
		if (!fs.existsSync(outputDir)) {
			fs.mkdirSync(outputDir, { recursive: true });
		}

		// Write to output file
		fs.writeFileSync(outputFile, JSON.stringify(languageData, null, 2));
		console.log(`Generated ${outputFile}`);

	} catch (error) {
		console.error('Error:', error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

if (require.main === module) {
	main();
}