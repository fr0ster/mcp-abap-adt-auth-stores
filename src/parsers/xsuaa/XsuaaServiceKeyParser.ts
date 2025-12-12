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
  canParse(rawData: any): boolean {
    if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
      this.log?.debug(`canParse check: invalid type, result(false)`);
      return false;
    }
    
    // Check for nested uaa object (ABAP format) - should not have it
    if (rawData.uaa) {
      this.log?.debug(`canParse check: has nested uaa (ABAP format), result(false)`);
      return false;
    }
    
    // Check for required XSUAA fields at root level
    const hasUrl = typeof rawData.url === 'string' && rawData.url.length > 0;
    const hasClientId = typeof rawData.clientid === 'string' && rawData.clientid.length > 0;
    const hasClientSecret = typeof rawData.clientsecret === 'string' && rawData.clientsecret.length > 0;
    const result = hasUrl && hasClientId && hasClientSecret;
    
    this.log?.debug(`canParse check: url(${hasUrl}), clientid(${hasClientId}), clientsecret(${hasClientSecret}), result(${result})`);
    return result;
  }

  /**
   * Parse raw service key data
   * @param rawData Raw JSON data from service key file
   * @returns Parsed service key object (normalized format)
   * @throws Error if data cannot be parsed or is invalid
   */
  parse(rawData: any): unknown {
    this.log?.debug(`Parsing XSUAA service key: hasUrl(${!!rawData?.url}), hasClientId(${!!rawData?.clientid}), hasClientSecret(${!!rawData?.clientsecret}), keys(${rawData ? Object.keys(rawData).join(', ') : 'none'})`);
    
    if (!this.canParse(rawData)) {
      this.log?.error(`Service key does not match XSUAA format: missing required fields at root level`);
      throw new Error('Service key does not match XSUAA format (missing url, clientid, or clientsecret at root level)');
    }

    // Normalize to standard format
    // For authorization (OAuth2 authorize endpoint), use 'url' (not 'apiurl')
    // 'apiurl' is for token endpoint, but authorization uses base 'url'
    const uaaUrl = rawData.url;
    const result = {
      uaa: {
        url: uaaUrl,
        clientid: rawData.clientid,
        clientsecret: rawData.clientsecret,
      },
      // Preserve abap.url if present
      abap: rawData.abap,
      // Preserve other optional fields
      url: rawData.url, // UAA URL
      apiurl: rawData.apiurl, // API URL (prioritized for UAA)
      sap_url: rawData.sap_url,
      client: rawData.client,
      sap_client: rawData.sap_client,
      language: rawData.language,
    };
    
    this.log?.debug(`XSUAA service key parsed successfully: uaaUrl(${uaaUrl.substring(0, 40)}...), hasAbap(${!!rawData.abap})`);
    return result;
  }
}

