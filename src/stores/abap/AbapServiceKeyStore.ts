/**
 * ABAP Service key store - reads ABAP service keys from {destination}.json files
 */

import * as path from 'node:path';
import type {
  IConfig,
  IConnectionConfig,
  IServiceKeyStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { IAuthorizationConfig } from '@mcp-abap-adt/interfaces-auth-sap';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { ParseError } from '../../errors/StoreErrors';
import { AbapServiceKeyParser } from '../../parsers/abap/AbapServiceKeyParser';
import { JsonFileHandler } from '../../utils/JsonFileHandler';
import {
  readServiceKeyStoreOptions,
  type ServiceKeyStoreOptions,
} from '../keyStoreOptions';

/**
 * ABAP Service key store implementation
 *
 * Uses JsonFileHandler for file operations and AbapServiceKeyParser for parsing.
 */
export class AbapServiceKeyStore implements IServiceKeyStore {
  private directory: string;
  private parser: AbapServiceKeyParser;
  private log?: ILogger;
  private grantType?: ServiceKeyStoreOptions['grantType'];

  /**
   * Create a new AbapServiceKeyStore instance
   * @param directory Directory where service key .json files are located
   * @param options `{ grantType?, log? }` — the grant a key cannot state, and
   *   a logger; or, as in 3.0.0, the logger itself
   */
  constructor(directory: string, options?: ServiceKeyStoreOptions | ILogger) {
    const { grantType, log } = readServiceKeyStoreOptions(
      'AbapServiceKeyStore',
      options,
    );
    this.directory = directory;
    this.parser = new AbapServiceKeyParser(log);
    this.log = log;
    this.grantType = grantType;
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
  async getAuthorizationConfig(
    destination: string,
  ): Promise<IAuthorizationConfig | null> {
    const fileName = `${destination}.json`;
    const filePath = path.join(this.directory, fileName);
    this.log?.debug(`Reading service key file: ${filePath}`);

    const rawData = await this.loadKeyFile(destination);
    if (!rawData) {
      this.log?.debug(`Service key file not found: ${filePath}`);
      return null;
    }

    this.log?.debug(
      `File read successfully, size: ${JSON.stringify(rawData).length} bytes, keys: ${Object.keys(rawData).join(', ')}`,
    );

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
      this.log?.debug(
        `Parsed service key structure: hasUaa(${!!key.uaa}), uaaKeys(${key.uaa ? Object.keys(key.uaa).join(', ') : 'none'})`,
      );

      if (
        !key.uaa ||
        !key.uaa.url ||
        !key.uaa.clientid ||
        !key.uaa.clientsecret
      ) {
        this.log?.warn(
          `Service key for ${destination} missing required UAA fields: url(${!!key.uaa?.url}), clientid(${!!key.uaa?.clientid}), clientsecret(${!!key.uaa?.clientsecret})`,
        );
        return null;
      }

      const result = {
        uaaUrl: key.uaa.url,
        uaaClientId: key.uaa.clientid,
        uaaClientSecret: key.uaa.clientsecret,
      };

      this.log?.info(
        `Authorization config loaded from ${filePath}: uaaUrl(${result.uaaUrl.substring(0, 40)}...), clientId(${result.uaaClientId.substring(0, 20)}...)`,
      );
      return result;
    } catch {
      throw this.notAnAbapKey(destination);
    }
  }

  /**
   * Get connection configuration from service key
   * @param destination Destination name (e.g., "TRIAL")
   * @returns IConnectionConfig with actual values or null if not found
   */
  async getConnectionConfig(
    destination: string,
  ): Promise<IConnectionConfig | null> {
    const fileName = `${destination}.json`;
    const filePath = path.join(this.directory, fileName);
    this.log?.debug(`Reading service key file: ${filePath}`);

    const rawData = await this.loadKeyFile(destination);
    if (!rawData) {
      this.log?.debug(`Service key file not found: ${filePath}`);
      return null;
    }

    this.log?.debug(
      `File read successfully, size: ${JSON.stringify(rawData).length} bytes, keys: ${Object.keys(rawData).join(', ')}`,
    );

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

      this.log?.debug(
        `Parsed service key structure: hasAbap(${!!key.abap}), hasSapUrl(${!!key.sap_url}), hasUrl(${!!key.url})`,
      );

      // Service key doesn't have tokens - only URLs and client info
      const serviceUrl =
        key.abap?.url ||
        key.sap_url ||
        (key.url && !key.url.includes('authentication') ? key.url : undefined);
      const sapClient = key.abap?.client || key.sap_client || key.client;
      const language = key.abap?.language || key.language;

      // A key holds an OAuth client and nothing else: a token destination.
      // Which grant it uses the key cannot state: the grant is answered only
      // when whoever built the store stated it. A token is secret — a key
      // store answers none.
      const result: IConnectionConfig = {
        serviceUrl,
        authType: 'jwt',
        sapClient,
        language,
      };
      if (this.grantType) result.grantType = this.grantType;

      this.log?.info(
        `Connection config loaded from ${filePath}: serviceUrl(${serviceUrl ? `${serviceUrl.substring(0, 50)}...` : 'none'}), client(${sapClient || 'none'}), language(${language || 'none'})`,
      );
      return result;
    } catch {
      throw this.notAnAbapKey(destination);
    }
  }

  /**
   * The key file's JSON, or `null` when there is none. Any failure to read or
   * parse it is refused in fixed words: the underlying message may quote the
   * file (Node's `JSON.parse` does), and the file holds a client secret or a
   * private key — so no message, path or cause is passed on.
   */
  private async loadKeyFile(
    destination: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      return await JsonFileHandler.load(`${destination}.json`, this.directory);
    } catch {
      const message = `AbapServiceKeyStore: the ABAP service key file of "${destination}" cannot be read as JSON`;
      this.log?.error(message);
      throw new ParseError(message);
    }
  }

  /**
   * A key the parser refuses, in fixed words: no parser message, path or
   * cause is passed on (the same rule as for the file).
   */
  private notAnAbapKey(destination: string): ParseError {
    const message = `Failed to parse service key for destination "${destination}": not an ABAP service key (a uaa object with url, clientid and clientsecret)`;
    this.log?.error(message);
    return new ParseError(message);
  }
}
