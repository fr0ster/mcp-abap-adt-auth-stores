/**
 * XSUAA Service key store - reads XSUAA service keys from {destination}.json files
 * 
 * Uses AbstractServiceKeyStore for file I/O and XsuaaServiceKeyParser for parsing.
 * Supports direct XSUAA service key format from BTP (without nested uaa object).
 * 
 * This is an alias for BtpServiceKeyStore for backward compatibility.
 */

import type { IServiceKeyStore } from '@mcp-abap-adt/auth-broker';
import { AbstractServiceKeyStore } from '../abstract/AbstractServiceKeyStore';
import { XsuaaServiceKeyParser } from '../../parsers/xsuaa/XsuaaServiceKeyParser';

/**
 * XSUAA Service key store implementation
 * 
 * Uses AbstractServiceKeyStore for file operations and XsuaaServiceKeyParser for parsing.
 * Search paths priority:
 * 1. Constructor parameter (highest)
 * 2. AUTH_BROKER_PATH environment variable
 * 3. Current working directory (lowest)
 */
export class XsuaaServiceKeyStore extends AbstractServiceKeyStore implements IServiceKeyStore {
  private parser: XsuaaServiceKeyParser;

  /**
   * Create a new XsuaaServiceKeyStore instance
   * @param searchPaths Optional search paths for .json files.
   *                    Can be a single path (string) or array of paths.
   *                    If not provided, uses AUTH_BROKER_PATH env var or current working directory.
   */
  constructor(searchPaths?: string | string[]) {
    super(searchPaths);
    this.parser = new XsuaaServiceKeyParser();
  }

  /**
   * Parse raw JSON data using XsuaaServiceKeyParser
   * @param rawData Raw JSON data from service key file
   * @returns Parsed service key object
   * @throws Error if data cannot be parsed or is invalid
   */
  protected parse(rawData: any): unknown {
    // XsuaaServiceKeyParser throws error if format doesn't match
    if (!this.parser.canParse(rawData)) {
      throw new Error('Service key does not match XSUAA format');
    }
    return this.parser.parse(rawData);
  }
}

