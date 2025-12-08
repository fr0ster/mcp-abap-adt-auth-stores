/**
 * ABAP Service key store - reads ABAP service keys from {destination}.json files
 */

import type { IServiceKeyStore, IAuthorizationConfig, IConnectionConfig, IConfig, ILogger } from '@mcp-abap-adt/interfaces';
import { JsonFileHandler } from '../../utils/JsonFileHandler';
import { AbapServiceKeyParser } from '../../parsers/abap/AbapServiceKeyParser';
import * as path from 'path';

/**
 * ABAP Service key store implementation
 * 
 * Uses JsonFileHandler for file operations and AbapServiceKeyParser for parsing.
 */
export class AbapServiceKeyStore implements IServiceKeyStore {
  private directory: string;
  private parser: AbapServiceKeyParser;
  private log?: ILogger;

  /**
   * Create a new AbapServiceKeyStore instance
   * @param directory Directory where service key .json files are located
   * @param log Optional logger for logging operations
   */
  constructor(directory: string, log?: ILogger) {
    this.directory = directory;
    this.parser = new AbapServiceKeyParser(log);
    this.log = log;
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
    const fileName = `${destination}.json`;
    const filePath = path.join(this.directory, fileName);
    this.log?.debug(`Reading service key file: ${filePath}`);
    
    const rawData = await JsonFileHandler.load(fileName, this.directory);
    if (!rawData) {
      this.log?.debug(`Service key file not found: ${filePath}`);
      return null;
    }

    this.log?.debug(`File read successfully, size: ${JSON.stringify(rawData).length} bytes, keys: ${Object.keys(rawData).join(', ')}`);

    try {
      const parsed = this.parser.parse(rawData);
      if (!parsed || typeof parsed !== 'object') {
        this.log?.warn(`Failed to parse service key for ${destination}: invalid format`);
        return null;
      }
      const key = parsed as { uaa?: { url?: string; clientid?: string; clientsecret?: string } };
      this.log?.debug(`Parsed service key structure: hasUaa(${!!key.uaa}), uaaKeys(${key.uaa ? Object.keys(key.uaa).join(', ') : 'none'})`);
      
      if (!key.uaa || !key.uaa.url || !key.uaa.clientid || !key.uaa.clientsecret) {
        this.log?.warn(`Service key for ${destination} missing required UAA fields: url(${!!key.uaa?.url}), clientid(${!!key.uaa?.clientid}), clientsecret(${!!key.uaa?.clientsecret})`);
        return null;
      }
      
      const result = {
        uaaUrl: key.uaa.url,
        uaaClientId: key.uaa.clientid,
        uaaClientSecret: key.uaa.clientsecret,
      };
      
      this.log?.info(`Authorization config loaded from ${filePath}: uaaUrl(${result.uaaUrl.substring(0, 40)}...), clientId(${result.uaaClientId.substring(0, 20)}...)`);
      return result;
    } catch (error) {
      this.log?.error(`Failed to parse service key from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
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
    const fileName = `${destination}.json`;
    const filePath = path.join(this.directory, fileName);
    this.log?.debug(`Reading service key file: ${filePath}`);
    
    const rawData = await JsonFileHandler.load(fileName, this.directory);
    if (!rawData) {
      this.log?.debug(`Service key file not found: ${filePath}`);
      return null;
    }

    this.log?.debug(`File read successfully, size: ${JSON.stringify(rawData).length} bytes, keys: ${Object.keys(rawData).join(', ')}`);

    try {
      const parsed = this.parser.parse(rawData);
      if (!parsed || typeof parsed !== 'object') {
        this.log?.warn(`Failed to parse service key for ${destination}: invalid format`);
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
      
      this.log?.debug(`Parsed service key structure: hasAbap(${!!key.abap}), hasSapUrl(${!!key.sap_url}), hasUrl(${!!key.url})`);
      
      // Service key doesn't have tokens - only URLs and client info
      const serviceUrl = key.abap?.url || key.sap_url || (key.url && !key.url.includes('authentication') ? key.url : undefined);
      const sapClient = key.abap?.client || key.sap_client || key.client;
      const language = key.abap?.language || key.language;
      
      const result = {
        serviceUrl,
        authorizationToken: '', // Service key doesn't contain tokens
        sapClient,
        language,
      };
      
      this.log?.info(`Connection config loaded from ${filePath}: serviceUrl(${serviceUrl ? serviceUrl.substring(0, 50) + '...' : 'none'}), client(${sapClient || 'none'}), language(${language || 'none'})`);
      return result;
    } catch (error) {
      this.log?.error(`Failed to parse service key from ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error(
        `Failed to parse service key for destination "${destination}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

}
