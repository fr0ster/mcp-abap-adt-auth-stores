/**
 * XSUAA Service Key Parser
 *
 * Parses direct XSUAA service key format from BTP (without nested uaa object):
 * {
 *   "url": "https://...authentication...hana.ondemand.com",
 *   "clientid": "...",
 *   "clientsecret": "...",
 *   "tenantmode": "shared",
 *   ...
 * }
 */

import type { ILogger } from '@mcp-abap-adt/interfaces';

/**
 * Parser for direct XSUAA service key format from BTP
 */
export class XsuaaServiceKeyParser {
  private log?: ILogger;

  /**
   * Create a new XsuaaServiceKeyParser instance
   * @param log Optional logger for logging operations
   */
  constructor(log?: ILogger) {
    this.log = log;
  }
  /**
   * Check if this parser can handle the given raw service key data
   * @param rawData Raw JSON data from service key file
   * @returns true if data has direct XSUAA fields (url, clientid, clientsecret) without nested uaa object
   */
  canParse(rawData: unknown): boolean {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      this.log?.debug(`canParse check: invalid type, result(false)`);
      return false;
    }

    const data = rawData as Record<string, unknown>;

    // Check for nested uaa object (ABAP format) - should not have it
    if (data.uaa) {
      this.log?.debug(
        `canParse check: has nested uaa (ABAP format), result(false)`,
      );
      return false;
    }

    // Check for required XSUAA fields at root level
    const hasUrl = typeof data.url === 'string' && data.url.length > 0;
    const hasClientId =
      typeof data.clientid === 'string' && data.clientid.length > 0;
    const hasClientSecret =
      typeof data.clientsecret === 'string' && data.clientsecret.length > 0;
    const result = hasUrl && hasClientId && hasClientSecret;

    this.log?.debug(
      `canParse check: url(${hasUrl}), clientid(${hasClientId}), clientsecret(${hasClientSecret}), result(${result})`,
    );
    return result;
  }

  /**
   * Parse raw service key data
   * @param rawData Raw JSON data from service key file
   * @returns Parsed service key object (normalized format)
   * @throws Error if data cannot be parsed or is invalid
   */
  parse(rawData: unknown): unknown {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      throw new Error('Service key data must be an object');
    }

    const data = rawData as Record<string, unknown>;
    this.log?.debug(
      `Parsing XSUAA service key: hasUrl(${!!data.url}), hasClientId(${!!data.clientid}), hasClientSecret(${!!data.clientsecret}), keys(${Object.keys(data).join(', ')})`,
    );

    if (!this.canParse(rawData)) {
      this.log?.error(
        `Service key does not match XSUAA format: missing required fields at root level`,
      );
      throw new Error(
        'Service key does not match XSUAA format (missing url, clientid, or clientsecret at root level)',
      );
    }

    // After canParse, we know url, clientid, and clientsecret exist and are strings
    const uaaUrl = typeof data.url === 'string' ? data.url : '';
    const clientId = typeof data.clientid === 'string' ? data.clientid : '';
    const clientSecret =
      typeof data.clientsecret === 'string' ? data.clientsecret : '';

    // Normalize to standard format
    // For authorization (OAuth2 authorize endpoint), use 'url' (not 'apiurl')
    // 'apiurl' is for token endpoint, but authorization uses base 'url'
    const result = {
      uaa: {
        url: uaaUrl,
        clientid: clientId,
        clientsecret: clientSecret,
      },
      // Preserve abap.url if present
      abap: data.abap,
      // Preserve other optional fields
      url: data.url, // UAA URL
      apiurl: data.apiurl, // API URL (prioritized for UAA)
      sap_url: data.sap_url,
      client: data.client,
      sap_client: data.sap_client,
      language: data.language,
    };

    this.log?.debug(
      `XSUAA service key parsed successfully: uaaUrl(${uaaUrl.substring(0, 40)}...), hasAbap(${!!data.abap})`,
    );
    return result;
  }
}
