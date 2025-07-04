import * as fs from 'fs';
import { spawn } from 'child_process';

/**
 * Generate function definitions from SAPF helpall output
 */
export async function generateLanguageDefinitions(
  sapfPath: string,
  preludePath?: string,
): Promise<Record<string, { items: Record<string, string> }>> {
  try {
    // Build command arguments
    const args: string[] = [];
    if (preludePath != null && preludePath.trim() !== '' && fs.existsSync(preludePath)) {
      args.push('-p', preludePath);
    } else if (preludePath != null && preludePath.trim() !== '') {
      throw new Error(`Prelude file not found: ${preludePath}`);
    }

    // Generate helpall output using spawn
    const output = await new Promise<string>((resolve, reject) => {
      const child = spawn(sapfPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: process.env,
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
    throw new Error(`Failed to generate function definitions: ${error}`);
  }
}

/**
 * Parse SAPF helpall output into structured function definitions
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
      const [, categoryName] = categoryMatch;
      currentCategory = categoryName;
      // Only create new category if it doesn't exist, otherwise merge
      result[currentCategory] ??= { items: {} };
      continue;
    }

    // Parse function definitions
    if (currentCategory != null && line.trim() && !line.startsWith(' Argument Automapping')) {
      // Try main pattern: function with signature and description
      const functionMatch = line.match(/^ ([^\s]+) (\([^)]*\)|@\w+\s*\([^)]*\)) (.+)$/);
      if (functionMatch) {
        const [, functionName, signature, description] = functionMatch;

        // Handle special annotations like @k, @kk, @ak
        let special = null;
        let cleanSignature = signature;
        const specialMatch = signature.match(/^@(\w+)\s*(.+)$/);
        if (specialMatch) {
          const [, specialType, sigContent] = specialMatch;
          special = specialType;
          cleanSignature = sigContent;
        }

        // Build description with special annotation if present
        let fullDescription = description;
        if (special != null) {
          fullDescription = `@${special} ${cleanSignature} ${description}`;
        } else {
          fullDescription = `${cleanSignature} ${description}`;
        }

        result[currentCategory].items[functionName] = fullDescription;
      }
      // Try pattern for operator variants with extra indentation (op/, op\, etc.)
      else if (line.match(/^\s{6,}/)) {
        const opMatch = line.match(/^\s+([^\s]+)\s+(\([^)]*\))\s+(.+)$/);
        if (opMatch) {
          const [, functionName, signature, description] = opMatch;
          result[currentCategory].items[functionName] = `${signature} ${description}`;
        }
      }
      // Try pattern for functions with signature but no description (or just whitespace)
      else {
        const sigOnlyMatch = line.match(/^ ([^\s]+) (\([^)]*\)|@\w+\s*\([^)]*\))\s*$/);
        if (sigOnlyMatch) {
          const [, functionName, signature] = sigOnlyMatch;
          result[currentCategory].items[functionName] = signature;
        }
        // Try pattern for functions without signature (name - description)
        else {
          const noSigMatch = line.match(/^ ([^\s]+) - (.+)$/);
          if (noSigMatch) {
            const [, functionName, description] = noSigMatch;
            result[currentCategory].items[functionName] = description;
          }
        }
      }
    }
  }

  return result;
}
