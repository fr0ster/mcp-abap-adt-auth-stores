/**
 * JSON File Handler - utility class for reading/writing JSON files
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility class for working with JSON files
 */
export class JsonFileHandler {
  /**
   * Load JSON data from file
   * @param fileName File name (e.g., "TRIAL.json")
   * @param directory Directory where the file is located
   * @returns Parsed JSON data or null if file not found
   * @throws Error if file exists but contains invalid JSON
   */
  static async load(fileName: string, directory: string): Promise<Record<string, unknown> | null> {
    const filePath = path.join(directory, fileName);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(fileContent);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `Invalid JSON in file "${fileName}": ${error.message}`
        );
      }
      throw new Error(
        `Failed to load JSON file "${fileName}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Save JSON data to file
   * @param filePath Full path to the file
   * @param data Data to save (will be JSON stringified)
   * @throws Error if file cannot be written
   */
  static async save(filePath: string, data: Record<string, unknown>): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write to temporary file first (atomic write)
    const tempFilePath = `${filePath}.tmp`;
    const jsonContent = JSON.stringify(data, null, 2) + '\n';
    
    fs.writeFileSync(tempFilePath, jsonContent, 'utf8');
    
    // Atomic rename
    fs.renameSync(tempFilePath, filePath);
  }
}

