/**
 * XSUAA Service key store - reads XSUAA service keys from {destination}.json files
 */

import type {
  IClientCertificate,
  IConfig,
  IConnectionConfig,
  IServiceKeyStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { IAuthorizationConfig } from '@mcp-abap-adt/interfaces-auth-sap';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { ClientCertificateError, ParseError } from '../../errors/StoreErrors';
import { asContract } from '../../utils/contractShape';
import { JsonFileHandler } from '../../utils/JsonFileHandler';
import {
  readServiceKeyStoreOptions,
  type ServiceKeyStoreOptions,
} from '../keyStoreOptions';

/** The fields whose presence makes a key carry a client certificate. */
const CERTIFICATE_FIELDS = ['certificate', 'key'] as const;
/** Every field of a certificate client, in the order a refusal names them. */
const CERTIFICATE_CLIENT_FIELDS = [
  'url',
  'clientid',
  'certificate',
  'key',
  'certurl',
] as const;

/** A value stated at all: present and not `''`. */
const stated = (value: unknown): boolean =>
  value !== undefined && value !== null && value !== '';

/**
 * XSUAA Service key store implementation
 *
 * Reads XSUAA service keys from JSON files. Supports:
 * - Flat format: { clientid, clientsecret, url }
 * - With credentials wrapper: { credentials: { clientid, clientsecret, url } }
 * - Nested uaa format: { uaa: { clientid, clientsecret, url } }
 *
 * An x509 key (3.3.0) carries `url`, `clientid`, `certificate`, `key` and
 * `certurl`; `getClientCertificate` answers that client. Without a
 * `clientsecret`, `getAuthorizationConfig` answers `null`, so no consumer
 * reads the missing secret as a public client. With one — a shape SAP
 * documents for `credential-type: x509` — the key offers both clients:
 * `getAuthorizationConfig` and `getServiceKey` answer the secret client
 * exactly as 3.2.0 did, `getClientCertificate` the certificate client, and
 * the consumer chooses (`credential-type` is not read). A key carrying part
 * of a certificate client only is refused by `getClientCertificate`
 * (`incomplete`), naming the missing fields. The PEM is answered as
 * given — line endings and chain untouched — and never logged; a refusal
 * names the key's fields, never a value.
 */
export class XsuaaServiceKeyStore implements IServiceKeyStore {
  private directory: string;
  private log?: ILogger | undefined;
  private grantType?: ServiceKeyStoreOptions['grantType'];

  /**
   * Create a new XsuaaServiceKeyStore instance
   * @param directory Directory where service key .json files are located
   * @param options `{ grantType?, log? }` — the grant a key cannot state, and
   *   a logger; or, as in 3.0.0, the logger itself. The resource URL is not an
   *   option: it is means, stated in an `EnvDestinationStore` with this store
   *   as its fallback.
   */
  constructor(directory: string, options?: ServiceKeyStoreOptions | ILogger) {
    const { grantType, log } = readServiceKeyStoreOptions(
      'XsuaaServiceKeyStore',
      options,
    );
    this.directory = directory;
    this.log = log;
    this.grantType = grantType;
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
    const rawData = await this.loadKeyFile(destination);
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

    // As in 3.2.0: only a key with a secret has a client here. An x509 key
    // without one answers null — never a public client — and its certificate
    // is answered by getClientCertificate alone. A key offering both answers
    // its secret client here; which one is used is the consumer's choice.
    if (!uaaUrl || !uaaClientId || !uaaClientSecret) {
      this.log?.warn(
        `Service key for ${destination} missing required fields (url, clientid, clientsecret); an x509 key (certificate, key, certurl) is answered by getClientCertificate`,
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
   * The key's client certificate, whether or not the key also carries a
   * client secret; `null` for a key with no certificate (neither `certificate`
   * nor `key`), or no key file. The PEM is answered as given. Refused in fixed
   * words naming fields — never a value — when the key carries part of a
   * certificate client only (`incomplete`).
   */
  async getClientCertificate(
    destination: string,
  ): Promise<IClientCertificate | null> {
    const rawData = await this.loadKeyFile(destination);
    if (!rawData || typeof rawData !== 'object') return null;
    let data = rawData as Record<string, unknown>;
    if (data.credentials && typeof data.credentials === 'object') {
      data = data.credentials as Record<string, unknown>;
    }
    const uaa = (data.uaa as Record<string, unknown>) || data;
    // `credential-type` is not read: the fields say what the key offers.
    if (!CERTIFICATE_FIELDS.some((field) => stated(uaa[field]))) return null;
    const missing = CERTIFICATE_CLIENT_FIELDS.filter(
      (field) => typeof uaa[field] !== 'string' || uaa[field] === '',
    );
    if (missing.length > 0) {
      throw new ClientCertificateError(
        `XsuaaServiceKeyStore: the client certificate in the service key of "${destination}" is incomplete: ${missing.join(', ')} missing`,
        'incomplete',
        [...missing],
      );
    }
    this.log?.debug(
      `Client certificate loaded for ${destination} from its service key`,
    );
    return {
      uaaUrl: uaa.url as string,
      clientId: uaa.clientid as string,
      certificate: uaa.certificate as string,
      key: uaa.key as string,
      certUrl: uaa.certurl as string,
    };
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
      const message = `XsuaaServiceKeyStore: the XSUAA service key file of "${destination}" cannot be read as JSON`;
      this.log?.error(message);
      throw new ParseError(message);
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
    const rawData = await this.loadKeyFile(destination);
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

    // A key holds an OAuth client and nothing else: a token destination.
    // Which grant it uses the key cannot state: the grant is answered only
    // when whoever built the store stated it. A token is secret — a key store
    // answers none.
    const result = asContract<IConnectionConfig>({
      serviceUrl,
      authType: 'jwt',
      sapClient: (abap?.client || data.sap_client || data.client) as
        | string
        | undefined,
      language: (abap?.language || data.language) as string | undefined,
    });
    if (this.grantType) result.grantType = this.grantType;
    return result;
  }
}
