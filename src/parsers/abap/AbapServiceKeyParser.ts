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
  canParse(rawData: unknown): boolean {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      return false;
    }
    const data = rawData as Record<string, unknown>;
    const result = !!(
      data.uaa &&
      typeof data.uaa === 'object' &&
      !Array.isArray(data.uaa)
    );
    this.log?.debug(`canParse check: hasUaa(${!!data.uaa}), result(${result})`);
    return result;
  }

  /**
   * Parse raw service key data
   * @param rawData Raw JSON data from service key file
   * @returns Parsed service key object
   * @throws Error if data cannot be parsed or is invalid
   */
  parse(rawData: unknown): unknown {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      throw new Error('Service key data must be an object');
    }

    const data = rawData as Record<string, unknown>;
    this.log?.debug(
      `Parsing ABAP service key: hasUaa(${!!data.uaa}), keys(${Object.keys(data).join(', ')})`,
    );

    if (!this.canParse(rawData)) {
      this.log?.error(
        `Service key does not match ABAP format: missing uaa object`,
      );
      throw new Error(
        'Service key does not match ABAP format (missing uaa object)',
      );
    }

    // After canParse, we know uaa exists and is an object
    const uaa = data.uaa as Record<string, unknown>;

    // Validate UAA configuration
    const hasUrl = typeof uaa.url === 'string' && uaa.url.length > 0;
    const hasClientId =
      typeof uaa.clientid === 'string' && uaa.clientid.length > 0;
    const hasClientSecret =
      typeof uaa.clientsecret === 'string' && uaa.clientsecret.length > 0;

    this.log?.debug(
      `UAA validation: url(${hasUrl}), clientid(${hasClientId}), clientsecret(${hasClientSecret})`,
    );

    if (!hasUrl || !hasClientId || !hasClientSecret) {
      this.log?.error(
        `Service key uaa object missing required fields: url(${hasUrl}), clientid(${hasClientId}), clientsecret(${hasClientSecret})`,
      );
      throw new Error(
        'Service key "uaa" object missing required fields: url, clientid, clientsecret',
      );
    }

    const uaaUrl = typeof uaa.url === 'string' ? uaa.url : '';
    this.log?.debug(
      `ABAP service key parsed successfully: uaaUrl(${uaaUrl.substring(0, 40)}...), hasAbap(${!!data.abap})`,
    );
    return rawData;
  }
}
