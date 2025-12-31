/**
 * XSUAA Service key store - reads XSUAA service keys from {destination}.json files
 */

import type {
  IAuthorizationConfig,
  IConfig,
  IConnectionConfig,
  ILogger,
  IServiceKeyStore,
} from '@mcp-abap-adt/interfaces';
import { JsonFileHandler } from '../../utils/JsonFileHandler';

/**
 * XSUAA Service key store implementation
 *
 * Reads XSUAA service keys from JSON files. Supports:
 * - Flat format: { clientid, clientsecret, url }
 * - With credentials wrapper: { credentials: { clientid, clientsecret, url } }
 * - Nested uaa format: { uaa: { clientid, clientsecret, url } }
 */
export class XsuaaServiceKeyStore implements IServiceKeyStore {
  private directory: string;
  private log?: ILogger;

  /**
   * Create a new XsuaaServiceKeyStore instance
   * @param directory Directory where service key .json files are located
   * @param log Optional logger for logging operations
   */
  constructor(directory: string, log?: ILogger) {
    this.directory = directory;
    this.log = log;
  }

  /**
   * Get service key for destination
   * @param destination Destination name (e.g., "mcp")
   * @returns IConfig with actual values or null if not found
   */
  async getServiceKey(destination: string): Promise<IConfig | null> {
    const authConfig = await this.getAuthorizationConfig(destination);
    const connConfig = await this.getConnectionConfig(destination);

    if (!authConfig && !connConfig) {
      return null;
    }

    return {
      ...(authConfig || {}),
      ...(connConfig || {}),
    };
  }

  /**
   * Get authorization configuration from service key
   * @param destination Destination name (e.g., "mcp")
   * @returns IAuthorizationConfig with actual values or null if not found
   */
  async getAuthorizationConfig(
    destination: string,
  ): Promise<IAuthorizationConfig | null> {
    this.log?.debug(
      `Loading authorization config for destination: ${destination}`,
    );
    const rawData = await JsonFileHandler.load(
      `${destination}.json`,
      this.directory,
    );
    if (!rawData) {
      this.log?.debug(`Service key file not found: ${destination}.json`);
      return null;
    }

    if (!rawData || typeof rawData !== 'object') {
      this.log?.warn(
        `Failed to parse service key for ${destination}: invalid format`,
      );
      return null;
    }

    let data = rawData as Record<string, unknown>;

    // Unwrap credentials wrapper if present
    // Format: { credentials: { clientid, clientsecret, url, ... } }
    if (data.credentials && typeof data.credentials === 'object') {
      data = data.credentials as Record<string, unknown>;
    }

    // Support both flat XSUAA format and nested uaa format
    // Flat: { clientid, clientsecret, url }
    // Nested: { uaa: { clientid, clientsecret, url } }
    const uaa = (data.uaa as Record<string, unknown>) || data;
    const uaaUrl = uaa.url as string | undefined;
    const uaaClientId = uaa.clientid as string | undefined;
    const uaaClientSecret = uaa.clientsecret as string | undefined;

    if (!uaaUrl || !uaaClientId || !uaaClientSecret) {
      this.log?.warn(
        `Service key for ${destination} missing required fields (url, clientid, clientsecret)`,
      );
      return null;
    }

    this.log?.info(
      `Authorization config loaded for ${destination}: uaaUrl(${uaaUrl.substring(0, 30)}...)`,
    );
    return {
      uaaUrl,
      uaaClientId,
      uaaClientSecret,
    };
  }

  /**
   * Get connection configuration from service key
   * @param destination Destination name (e.g., "mcp")
   * @returns IConnectionConfig with actual values or null if not found
   */
  async getConnectionConfig(
    destination: string,
  ): Promise<IConnectionConfig | null> {
    this.log?.debug(
      `Loading connection config for destination: ${destination}`,
    );
    const rawData = await JsonFileHandler.load(
      `${destination}.json`,
      this.directory,
    );
    if (!rawData) {
      this.log?.debug(`Service key file not found: ${destination}.json`);
      return null;
    }

    if (!rawData || typeof rawData !== 'object') {
      this.log?.warn(
        `Failed to parse service key for ${destination}: invalid format`,
      );
      return null;
    }

    let data = rawData as Record<string, unknown>;

    // Unwrap credentials wrapper if present
    if (data.credentials && typeof data.credentials === 'object') {
      data = data.credentials as Record<string, unknown>;
    }

    const abap = data.abap as Record<string, unknown> | undefined;

    // Service key doesn't have tokens - only URLs and client info
    // serviceUrl is optional for XSUAA (only needed for ABAP)
    const url = data.url as string | undefined;
    const serviceUrl =
      (abap?.url as string | undefined) ||
      (data.sap_url as string | undefined) ||
      (url && !url.includes('authentication') ? url : undefined);

    this.log?.info(
      `Connection config loaded for ${destination}: serviceUrl(${serviceUrl ? `${serviceUrl.substring(0, 40)}...` : 'none'}), client(${abap?.client || data.sap_client || data.client || 'none'})`,
    );

    return {
      serviceUrl,
      authorizationToken: '', // Service key doesn't contain tokens
      sapClient: (abap?.client || data.sap_client || data.client) as
        | string
        | undefined,
      language: (abap?.language || data.language) as string | undefined,
    };
  }
}
