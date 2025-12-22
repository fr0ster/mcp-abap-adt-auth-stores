/**
 * Service key loader - loads service key JSON files by destination name for ABAP
 *
 * Uses parsers to handle different service key formats:
 * - AbapServiceKeyParser: Standard ABAP service key format with nested uaa object
 * - XsuaaServiceKeyParser: Direct XSUAA service key format from BTP
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { AbapServiceKeyParser } from '../../parsers/abap/AbapServiceKeyParser';
import { XsuaaServiceKeyParser } from '../../parsers/xsuaa/XsuaaServiceKeyParser';

/**
 * Load service key from {destination}.json file
 * Automatically detects format and uses appropriate parser
 * @param destination Destination name
 * @param directory Directory where the service key file is located
 * @returns Service key object or null if file not found
 */
export async function loadServiceKey(
  destination: string,
  directory: string,
): Promise<unknown | null> {
  const fileName = `${destination}.json`;
  const serviceKeyPath = path.join(directory, fileName);

  if (!fs.existsSync(serviceKeyPath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(serviceKeyPath, 'utf8');
    const rawData = JSON.parse(fileContent);

    // Try parsers in order: ABAP format first, then XSUAA format
    const parsers = [new AbapServiceKeyParser(), new XsuaaServiceKeyParser()];

    for (const parser of parsers) {
      if (parser.canParse(rawData)) {
        return parser.parse(rawData);
      }
    }

    // No parser could handle the data
    throw new Error(
      'Service key does not match any supported format. ' +
        'Expected either ABAP format (with nested uaa object) or XSUAA format (with url, clientid, clientsecret at root level)',
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in service key file for destination "${destination}": ${error.message}`,
      );
    }
    throw new Error(
      `Failed to load service key for destination "${destination}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
