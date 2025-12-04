/**
 * ENV File Handler - utility class for reading/writing .env files
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * Utility class for working with .env files
 */
export class EnvFileHandler {
  /**
   * Load environment variables from .env file
   * @param fileName File name (e.g., "TRIAL.env")
   * @param directory Directory where the file is located
   * @returns Parsed environment variables or null if file not found
   * @throws Error if file exists but cannot be read
   */
  static async load(fileName: string, directory: string): Promise<Record<string, string> | null> {
    const filePath = path.join(directory, fileName);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      return dotenv.parse(fileContent);
    } catch (error) {
      throw new Error(
        `Failed to load ENV file "${fileName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Save environment variables to .env file
   * @param filePath Full path to the file
   * @param variables Environment variables to save (key-value pairs)
   * @param preserveExisting If true, preserves existing variables not in the new set
   * @throws Error if file cannot be written
   */
  static async save(
    filePath: string,
    variables: Record<string, string>,
    preserveExisting: boolean = true
  ): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Read existing .env file if it exists and preserveExisting is true
    let existingVars = new Map<string, string>();
    if (preserveExisting && fs.existsSync(filePath)) {
      try {
        const existingContent = fs.readFileSync(filePath, 'utf8');
        const parsed = dotenv.parse(existingContent);
        for (const [key, value] of Object.entries(parsed)) {
          existingVars.set(key, value);
        }
      } catch (error) {
        // If existing file is invalid, ignore it
      }
    }

    // Update with new values
    for (const [key, value] of Object.entries(variables)) {
      existingVars.set(key, value);
    }

    // Write to temporary file first (atomic write)
    const tempFilePath = `${filePath}.tmp`;
    const envLines: string[] = [];
    
    for (const [key, value] of existingVars.entries()) {
      // Escape value if it contains spaces or special characters
      const escapedValue = value.includes(' ') || value.includes('=') || value.includes('#')
        ? `"${value.replace(/"/g, '\\"')}"`
        : value;
      envLines.push(`${key}=${escapedValue}`);
    }

    const envContent = envLines.join('\n') + '\n';
    fs.writeFileSync(tempFilePath, envContent, 'utf8');

    // Atomic rename
    fs.renameSync(tempFilePath, filePath);
  }
}

