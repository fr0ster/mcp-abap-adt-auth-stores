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
import { ClientCertificateError } from '../../errors/StoreErrors';
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
 * `certurl` and no `clientsecret`. Its client is answered only by
 * `getClientCertificate` — `getAuthorizationConfig` answers `null`, so no
 * consumer reads the missing secret as a public client. A key carrying both a
 * client secret and a certificate (`certificate` or `key`) does not say what it
 * is: both methods refuse it with a `ClientCertificateError` (`mixed`). A
 * key with a certificate and no secret but missing any of the five fields is
 * refused by `getClientCertificate` (`incomplete`). The PEM is answered as
 * given — line endings and chain untouched — and never logged; a refusal
 * names the key's fields, never a value.
 */
export class XsuaaServiceKeyStore implements IServiceKeyStore {
  private directory: string;
  private log?: ILogger;
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

    // An x509 client is never answered here: an older consumer would read its
    // missing secret as a public client.
    if (this.certificateStated(destination, uaa)) {
      this.log?.debug(
        `Service key for ${destination} carries a client certificate: no authorization config`,
      );
      return null;
    }

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
   * The key's client certificate, when it is an x509 key; `null` for a key
   * with a client secret, a key with no certificate, or no key file. The PEM
   * is answered as given. Refused in fixed words naming fields — never a
   * value — when the key also carries a client secret (`mixed`) or misses
   * part of the certificate client (`incomplete`).
   */
  async getClientCertificate(
    destination: string,
  ): Promise<IClientCertificate | null> {
    const rawData = await JsonFileHandler.load(
      `${destination}.json`,
      this.directory,
    );
    if (!rawData || typeof rawData !== 'object') return null;
    let data = rawData as Record<string, unknown>;
    if (data.credentials && typeof data.credentials === 'object') {
      data = data.credentials as Record<string, unknown>;
    }
    const uaa = (data.uaa as Record<string, unknown>) || data;
    if (!this.certificateStated(destination, uaa)) return null;
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
   * Whether the key carries a client certificate (`certificate` or `key`
   * stated). One that also carries a client secret is refused.
   */
  private certificateStated(
    destination: string,
    uaa: Record<string, unknown>,
  ): boolean {
    const carried = CERTIFICATE_FIELDS.filter((field) => stated(uaa[field]));
    if (carried.length === 0) return false;
    if (typeof uaa.clientsecret === 'string' && uaa.clientsecret !== '') {
      throw new ClientCertificateError(
        `XsuaaServiceKeyStore: the service key of "${destination}" carries both a client secret and a client certificate (clientsecret, ${carried.join(', ')}); a client has one or the other`,
        'mixed',
        ['clientsecret', ...carried],
      );
    }
    return true;
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

    // A key holds an OAuth client and nothing else: a token destination.
    // Which grant it uses the key cannot state: the grant is answered only
    // when whoever built the store stated it. A token is secret — a key store
    // answers none.
    const result: IConnectionConfig = {
      serviceUrl,
      authType: 'jwt',
      sapClient: (abap?.client || data.sap_client || data.client) as
        | string
        | undefined,
      language: (abap?.language || data.language) as string | undefined,
    };
    if (this.grantType) result.grantType = this.grantType;
    return result;
  }
}
