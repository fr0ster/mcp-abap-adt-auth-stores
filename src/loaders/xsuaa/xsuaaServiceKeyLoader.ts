/**
 * XSUAA Service key loader - loads XSUAA service key JSON files by destination name
 *
 * Supports direct XSUAA service key format from BTP (without nested uaa object):
 * {
 *   "url": "https://...authentication...hana.ondemand.com",
 *   "clientid": "...",
 *   "clientsecret": "...",
 *   ...
 * }
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsuaaServiceKeyParser } from '../../parsers/xsuaa/XsuaaServiceKeyParser';

/**
 * Load XSUAA service key from {destination}.json file
 * Normalizes direct XSUAA format to standard ServiceKey format
 * @param destination Destination name
 * @param directory Directory where the service key file is located
 * @returns Service key object or null if file not found
 */
export async function loadXSUAAServiceKey(
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

    // Use XSUAA parser
    const parser = new XsuaaServiceKeyParser();
    if (!parser.canParse(rawData)) {
      return null; // Not an XSUAA format
    }

    return parser.parse(rawData);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(
        `Invalid JSON in XSUAA service key file for destination "${destination}": ${error.message}`,
      );
    }
    throw new Error(
      `Failed to load XSUAA service key for destination "${destination}": ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
