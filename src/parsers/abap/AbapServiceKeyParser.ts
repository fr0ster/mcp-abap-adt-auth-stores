/**
 * ABAP Service Key Parser
 * 
 * Parses standard ABAP service key format with nested uaa object:
 * {
 *   "uaa": {
 *     "url": "...",
 *     "clientid": "...",
 *     "clientsecret": "..."
 *   },
 *   "abap": {
 *     "url": "...",
 *     "client": "..."
 *   },
 *   ...
 * }
 */

import type { ILogger } from '@mcp-abap-adt/interfaces';

/**
 * Parser for standard ABAP service key format
 */
export class AbapServiceKeyParser {
  private log?: ILogger;

  /**
   * Create a new AbapServiceKeyParser instance
   * @param log Optional logger for logging operations
   */
  constructor(log?: ILogger) {
    this.log = log;
  }

  /**
   * Check if this parser can handle the given raw service key data
   * @param rawData Raw JSON data from service key file
   * @returns true if data has nested uaa object, false otherwise
   */
  canParse(rawData: any): boolean {
    const result = rawData && typeof rawData === 'object' && rawData.uaa && typeof rawData.uaa === 'object';
    this.log?.debug(`canParse check: hasUaa(${!!rawData?.uaa}), result(${result})`);
    return result;
  }

  /**
   * Parse raw service key data
   * @param rawData Raw JSON data from service key file
   * @returns Parsed service key object
   * @throws Error if data cannot be parsed or is invalid
   */
  parse(rawData: any): unknown {
    this.log?.debug(`Parsing ABAP service key: hasUaa(${!!rawData?.uaa}), keys(${rawData ? Object.keys(rawData).join(', ') : 'none'})`);
    
    if (!this.canParse(rawData)) {
      this.log?.error(`Service key does not match ABAP format: missing uaa object`);
      throw new Error('Service key does not match ABAP format (missing uaa object)');
    }

    // Validate UAA configuration
    const hasUrl = !!rawData.uaa.url;
    const hasClientId = !!rawData.uaa.clientid;
    const hasClientSecret = !!rawData.uaa.clientsecret;
    
    this.log?.debug(`UAA validation: url(${hasUrl}), clientid(${hasClientId}), clientsecret(${hasClientSecret})`);

    if (!hasUrl || !hasClientId || !hasClientSecret) {
      this.log?.error(`Service key uaa object missing required fields: url(${hasUrl}), clientid(${hasClientId}), clientsecret(${hasClientSecret})`);
      throw new Error('Service key "uaa" object missing required fields: url, clientid, clientsecret');
    }

    this.log?.debug(`ABAP service key parsed successfully: uaaUrl(${rawData.uaa.url.substring(0, 40)}...), hasAbap(${!!rawData.abap})`);
    return rawData;
  }
}

