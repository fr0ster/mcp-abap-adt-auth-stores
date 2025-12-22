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
import { ParseError } from '../../errors/StoreErrors';
import { XsuaaServiceKeyParser } from '../../parsers/xsuaa/XsuaaServiceKeyParser';
import { JsonFileHandler } from '../../utils/JsonFileHandler';

/**
 * XSUAA Service key store implementation
 *
 * Uses JsonFileHandler for file operations and XsuaaServiceKeyParser for parsing.
 */
export class XsuaaServiceKeyStore implements IServiceKeyStore {
  private directory: string;
  private parser: XsuaaServiceKeyParser;
  private log?: ILogger;

  /**
   * Create a new XsuaaServiceKeyStore instance
   * @param directory Directory where service key .json files are located
   * @param log Optional logger for logging operations
   */
  constructor(directory: string, log?: ILogger) {
    this.directory = directory;
    this.parser = new XsuaaServiceKeyParser(log);
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

    try {
      const parsed = this.parser.parse(rawData);
      if (!parsed || typeof parsed !== 'object') {
        this.log?.warn(
          `Failed to parse service key for ${destination}: invalid format`,
        );
        return null;
      }
      const key = parsed as {
        uaa?: { url?: string; clientid?: string; clientsecret?: string };
      };
      if (
        !key.uaa ||
        !key.uaa.url ||
        !key.uaa.clientid ||
        !key.uaa.clientsecret
      ) {
        this.log?.warn(
          `Service key for ${destination} missing required UAA fields`,
        );
        return null;
      }
      this.log?.info(
        `Authorization config loaded for ${destination}: uaaUrl(${key.uaa.url.substring(0, 30)}...)`,
      );
      return {
        uaaUrl: key.uaa.url,
        uaaClientId: key.uaa.clientid,
        uaaClientSecret: key.uaa.clientsecret,
      };
    } catch (error) {
      this.log?.error(
        `Failed to parse service key for ${destination}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ParseError(
        `Failed to parse service key for destination "${destination}"`,
        `${destination}.json`,
        error instanceof Error ? error : undefined,
      );
    }
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

    try {
      const parsed = this.parser.parse(rawData);
      if (!parsed || typeof parsed !== 'object') {
        this.log?.warn(
          `Failed to parse service key for ${destination}: invalid format`,
        );
        return null;
      }
      const key = parsed as {
        abap?: { url?: string; client?: string; language?: string };
        sap_url?: string;
        url?: string;
        sap_client?: string;
        client?: string;
        language?: string;
      };
      // Service key doesn't have tokens - only URLs and client info
      const serviceUrl =
        key.abap?.url ||
        key.sap_url ||
        (key.url && !key.url.includes('authentication') ? key.url : undefined);
      this.log?.info(
        `Connection config loaded for ${destination}: serviceUrl(${serviceUrl ? `${serviceUrl.substring(0, 40)}...` : 'none'}), client(${key.abap?.client || key.sap_client || key.client || 'none'})`,
      );
      return {
        serviceUrl,
        authorizationToken: '', // Service key doesn't contain tokens
        sapClient: key.abap?.client || key.sap_client || key.client,
        language: key.abap?.language || key.language,
      };
    } catch (error) {
      this.log?.error(
        `Failed to parse service key for ${destination}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new ParseError(
        `Failed to parse service key for destination "${destination}"`,
        `${destination}.json`,
        error instanceof Error ? error : undefined,
      );
    }
  }
}
