import * as fs from "fs";
import { spawn } from "child_process";

/**
 * Generate language definitions from SAPF helpall output
 */
export async function generateLanguageDefinitions(sapfPath: string, preludePath?: string): Promise<Record<string, { items: Record<string, string> }>> {
	try {
		// Build command arguments
		const args: string[] = [];
		if (preludePath && fs.existsSync(preludePath)) {
			args.push('-p', preludePath);
		} else if (preludePath) {
			throw new Error(`Prelude file not found: ${preludePath}`);
		}
		
		// Generate helpall output using spawn
		const output = await new Promise<string>((resolve, reject) => {
			const child = spawn(sapfPath, args, {
				stdio: ['pipe', 'pipe', 'pipe'],
				env: process.env
			});
			
			let stdout = '';
			let stderr = '';
			
			child.stdout.on('data', (data) => {
				stdout += data.toString();
			});
			
			child.stderr.on('data', (data) => {
				stderr += data.toString();
			});
			
			child.on('close', (code) => {
				if (code === 0) {
					resolve(stdout);
				} else {
					reject(new Error(`Process exited with code ${code}. stderr: ${stderr}`));
				}
			});
			
			child.on('error', (err) => {
				reject(err);
			});
			
			// Send helpall command and quit
			child.stdin.write('helpall\n');
			child.stdin.write('quit\n');
			child.stdin.end();
		});

		// Parse the output
		return parseSapfHelpOutput(output);
	} catch (error) {
		throw new Error(`Failed to generate language definitions: ${error}`);
	}
}

/**
 * Parse SAPF helpall output into structured language definitions
 */
export function parseSapfHelpOutput(output: string): Record<string, { items: Record<string, string> }> {
	const lines = output.split('\n');
	const result: Record<string, { items: Record<string, string> }> = {};
	let currentCategory: string | null = null;
	let inFunctionSection = false;
	
	for (const line of lines) {
		// Skip header lines until we reach "BUILT IN FUNCTIONS"
		if (line.includes('BUILT IN FUNCTIONS')) {
			inFunctionSection = true;
			continue;
		}
		
		if (!inFunctionSection) {
			continue;
		}
		
		// Detect category headers: *** category name ***
		const categoryMatch = line.match(/^\*\*\* (.+) \*\*\*$/);
		if (categoryMatch) {
			currentCategory = categoryMatch[1];
			result[currentCategory] = { items: {} };
			continue;
		}
		
		// Parse function definitions
		if (currentCategory && line.trim() && !line.startsWith(' Argument Automapping')) {
			const functionMatch = line.match(/^ ([!][\w?!]*|[\w][\w?!]*) (\([^)]*\)|@\w+\s*\([^)]*\)) (.+)$/);
			if (functionMatch) {
				const [, functionName, signature, description] = functionMatch;
				
				// Handle special annotations like @k, @kk, @ak
				let special = null;
				let cleanSignature = signature;
				const specialMatch = signature.match(/^@(\w+)\s*(.+)$/);
				if (specialMatch) {
					special = specialMatch[1];
					cleanSignature = specialMatch[2];
				}
				
				// Build description with special annotation if present
				let fullDescription = description;
				if (special) {
					fullDescription = `@${special} ${cleanSignature} ${description}`;
				} else {
					fullDescription = `${cleanSignature} ${description}`;
				}
				
				result[currentCategory].items[functionName] = fullDescription;
			}
		}
	}
	
	return result;
}