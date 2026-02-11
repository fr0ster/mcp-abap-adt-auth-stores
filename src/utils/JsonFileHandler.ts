/**
 * JSON File Handler - utility class for reading/writing JSON files
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Utility class for working with JSON files
 */
export class JsonFileHandler {
  private static unwrapCredentials(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const keys = Object.keys(data);
    if (keys.length !== 1 || keys[0] !== 'credentials') {
      return data;
    }
    const credentials = data.credentials;
    if (
      credentials &&
      typeof credentials === 'object' &&
      !Array.isArray(credentials)
    ) {
      return credentials as Record<string, unknown>;
    }
    return data;
  }

  private static extractJsonFromText(text: string): string | null {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      return null;
    }
    return text.slice(start, end + 1);
  }

  /**
   * Load JSON data from file
   * @param fileName File name (e.g., "TRIAL.json")
   * @param directory Directory where the file is located
   * @returns Parsed JSON data or null if file not found
   * @throws Error if file exists but contains invalid JSON
   */
  static async load(
    fileName: string,
    directory: string,
  ): Promise<Record<string, unknown> | null> {
    const filePath = path.join(directory, fileName);

    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(fileContent);
      if (
        parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        return JsonFileHandler.unwrapCredentials(
          parsed as Record<string, unknown>,
        );
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      if (error instanceof SyntaxError) {
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const extracted = JsonFileHandler.extractJsonFromText(fileContent);
          if (!extracted) {
            throw new Error(
              `Invalid JSON in file "${fileName}": ${error.message}`,
            );
          }
          const parsed = JSON.parse(extracted);
          if (
            parsed &&
            typeof parsed === 'object' &&
            !Array.isArray(parsed)
          ) {
            return JsonFileHandler.unwrapCredentials(
              parsed as Record<string, unknown>,
            );
          }
          return parsed as Record<string, unknown>;
        } catch (inner) {
          if (inner instanceof Error) {
            throw new Error(
              `Invalid JSON in file "${fileName}": ${inner.message}`,
            );
          }
          throw new Error(
            `Invalid JSON in file "${fileName}": ${String(inner)}`,
          );
        }
      }
      throw new Error(
        `Failed to load JSON file "${fileName}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Save JSON data to file
   * @param filePath Full path to the file
   * @param data Data to save (will be JSON stringified)
   * @throws Error if file cannot be written
   */
  static async save(
    filePath: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Write to temporary file first (atomic write)
    const tempFilePath = `${filePath}.tmp`;
    const jsonContent = `${JSON.stringify(data, null, 2)}\n`;

    fs.writeFileSync(tempFilePath, jsonContent, 'utf8');

    // Atomic rename
    fs.renameSync(tempFilePath, filePath);
  }
}
