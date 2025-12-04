/**
 * ABAP Service key store - reads ABAP service keys from {destination}.json files
 */

import type { IServiceKeyStore, IAuthorizationConfig, IConnectionConfig, IConfig } from '@mcp-abap-adt/interfaces';
import { JsonFileHandler } from '../../utils/JsonFileHandler';
import { AbapServiceKeyParser } from '../../parsers/abap/AbapServiceKeyParser';

/**
 * ABAP Service key store implementation
 * 
 * Uses JsonFileHandler for file operations and AbapServiceKeyParser for parsing.
 */
export class AbapServiceKeyStore implements IServiceKeyStore {
  private directory: string;
  private parser: AbapServiceKeyParser;

  /**
   * Create a new AbapServiceKeyStore instance
   * @param directory Directory where service key .json files are located
   */
  constructor(directory: string) {
    this.directory = directory;
    this.parser = new AbapServiceKeyParser();
  }

  /**
   * Get service key for destination
   * @param destination Destination name (e.g., "TRIAL")
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
   * @param destination Destination name (e.g., "TRIAL")
   * @returns IAuthorizationConfig with actual values or null if not found
   */
  async getAuthorizationConfig(destination: string): Promise<IAuthorizationConfig | null> {
    const rawData = await JsonFileHandler.load(`${destination}.json`, this.directory);
    if (!rawData) {
      return null;
    }

    try {
      const parsed = this.parser.parse(rawData);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }
      const key = parsed as { uaa?: { url?: string; clientid?: string; clientsecret?: string } };
      if (!key.uaa || !key.uaa.url || !key.uaa.clientid || !key.uaa.clientsecret) {
        return null;
      }
      return {
        uaaUrl: key.uaa.url,
        uaaClientId: key.uaa.clientid,
        uaaClientSecret: key.uaa.clientsecret,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse service key for destination "${destination}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get connection configuration from service key
   * @param destination Destination name (e.g., "TRIAL")
   * @returns IConnectionConfig with actual values or null if not found
   */
  async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
    const rawData = await JsonFileHandler.load(`${destination}.json`, this.directory);
    if (!rawData) {
      return null;
    }

    try {
      const parsed = this.parser.parse(rawData);
      if (!parsed || typeof parsed !== 'object') {
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
      const serviceUrl = key.abap?.url || key.sap_url || (key.url && !key.url.includes('authentication') ? key.url : undefined);
      return {
        serviceUrl,
        authorizationToken: '', // Service key doesn't contain tokens
        sapClient: key.abap?.client || key.sap_client || key.client,
        language: key.abap?.language || key.language,
      };
    } catch (error) {
      throw new Error(
        `Failed to parse service key for destination "${destination}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

}
