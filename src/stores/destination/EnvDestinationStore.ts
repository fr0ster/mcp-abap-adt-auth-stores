/**
 * EnvDestinationStore — a destination's means in `<directory>/<destination>.env`.
 *
 * An `IServiceKeyStore` for where a destination states how it obtains its
 * session secret when there is no SAP service key, or the key cannot say
 * (auth-stores 3.0.0): the type and grant, a user and password, the SNC, OIDC
 * and SAML settings, the client, the URL, `sapClient`, `language`. It answers
 * means only — never a token, cookies, an expiry or a refresh token: those are
 * the session store's.
 *
 * - **Key names:** the 2.x session key names plus `SAP_GRANT_TYPE`,
 *   `SAP_OIDC_*` and `SAP_SAML_*` (`ABAP_DESTINATION_VARS`), or the same with
 *   `XSUAA_*` (`XSUAA_DESTINATION_VARS`). A 2.x session file is already a
 *   readable destination; nothing is inferred from it — a file without
 *   `SAP_AUTH_TYPE` states no type.
 * - **The client is its id**: answered whenever `uaaClientId` is stated and
 *   not empty (`''` is no id, so no client); a
 *   `uaaUrl` or `uaaClientSecret` not stated is answered as `''`. A public
 *   client is a secret of `''`, written as an empty value or not at all.
 * - **A fallback** `IServiceKeyStore` (a SAP service key store, say) fills, field
 *   by field, what the file leaves out: a key supplies the client and URL, the
 *   file the grant. A field the file states — `''` included — wins.
 * - **Writing** is this class's own `setDestination`, outside the read-only
 *   contract; it touches only the means keys, so the file may be shared with a
 *   session store, which touches only its secret keys.
 *
 * The directory has no default: the consumer that composes the stores decides
 * where means and secrets live.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  IConfig,
  IConnectionConfig,
  IServiceKeyStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { IAuthorizationConfig } from '@mcp-abap-adt/interfaces-auth-sap';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  InvalidConfigError,
  RefusedFieldsError,
  StorageError,
} from '../../errors/StoreErrors';
import { assertLogger } from '../../session/SecretSessionStore';
import { carriedFields } from '../../session/sessionSecret';
import { assertDestinationName } from '../../storage/destinationName';
import {
  hasAnyKey,
  readEnvKeys,
  rewriteEnvKeys,
  toError,
} from '../../storage/envFile';
import { withFileLock } from '../../storage/fileLock';
import { DESTINATION_GRANTS } from '../keyStoreOptions';

/** The client: `IAuthorizationConfig` without the refresh token (a secret). */
const CLIENT_FIELDS = ['uaaUrl', 'uaaClientId', 'uaaClientSecret'] as const;
type ClientField = (typeof CLIENT_FIELDS)[number];

/** Every means field of `IConnectionConfig`. */
const CONNECTION_FIELDS = [
  'serviceUrl',
  'authType',
  'grantType',
  'username',
  'password',
  'sapClient',
  'language',
  'sncPartnerName',
  'sncQop',
  'sncLib',
  'sncMyName',
  'oidcIssuerUrl',
  'oidcAuthorizationEndpoint',
  'oidcTokenEndpoint',
  'oidcDeviceAuthorizationEndpoint',
  'oidcScopes',
  'oidcSubjectToken',
  'oidcSubjectTokenType',
  'oidcAudience',
  'oidcActorToken',
  'oidcActorTokenType',
  'samlIdpSsoUrl',
  'samlIdpEntityId',
  'samlIdpCertificates',
  'samlSpEntityId',
  'samlAcsUrl',
  'samlRelayState',
  'samlIdpInitiated',
  'samlClockSkewMs',
  'samlTokenUrl',
] as const satisfies readonly (keyof IConnectionConfig)[];
type ConnectionField = (typeof CONNECTION_FIELDS)[number];

export type MeansField = ConnectionField | ClientField;

const MEANS_FIELDS: readonly MeansField[] = [
  ...CONNECTION_FIELDS,
  ...CLIENT_FIELDS,
];

/** The env key of every means field. */
export type DestinationVariables = Readonly<Record<MeansField, string>>;

const SUFFIXES: Record<MeansField, string> = {
  serviceUrl: 'URL',
  authType: 'AUTH_TYPE',
  grantType: 'GRANT_TYPE',
  username: 'USERNAME',
  password: 'PASSWORD',
  sapClient: 'CLIENT',
  language: 'LANGUAGE',
  sncPartnerName: 'SNC_PARTNERNAME',
  sncQop: 'SNC_QOP',
  sncLib: 'SNC_LIB',
  sncMyName: 'SNC_MYNAME',
  uaaUrl: 'UAA_URL',
  uaaClientId: 'UAA_CLIENT_ID',
  uaaClientSecret: 'UAA_CLIENT_SECRET',
  oidcIssuerUrl: 'OIDC_ISSUER_URL',
  oidcAuthorizationEndpoint: 'OIDC_AUTHORIZATION_ENDPOINT',
  oidcTokenEndpoint: 'OIDC_TOKEN_ENDPOINT',
  oidcDeviceAuthorizationEndpoint: 'OIDC_DEVICE_AUTHORIZATION_ENDPOINT',
  oidcScopes: 'OIDC_SCOPES',
  oidcSubjectToken: 'OIDC_SUBJECT_TOKEN',
  oidcSubjectTokenType: 'OIDC_SUBJECT_TOKEN_TYPE',
  oidcAudience: 'OIDC_AUDIENCE',
  oidcActorToken: 'OIDC_ACTOR_TOKEN',
  oidcActorTokenType: 'OIDC_ACTOR_TOKEN_TYPE',
  samlIdpSsoUrl: 'SAML_IDP_SSO_URL',
  samlIdpEntityId: 'SAML_IDP_ENTITY_ID',
  samlIdpCertificates: 'SAML_IDP_CERTIFICATES_B64',
  samlSpEntityId: 'SAML_SP_ENTITY_ID',
  samlAcsUrl: 'SAML_ACS_URL',
  samlRelayState: 'SAML_RELAY_STATE',
  samlIdpInitiated: 'SAML_IDP_INITIATED',
  samlClockSkewMs: 'SAML_CLOCK_SKEW_MS',
  samlTokenUrl: 'SAML_TOKEN_URL',
};

function withPrefix(
  prefix: string,
  overrides: Partial<Record<MeansField, string>> = {},
): DestinationVariables {
  const vars = {} as Record<MeansField, string>;
  for (const field of MEANS_FIELDS) {
    vars[field] = overrides[field] ?? `${prefix}_${SUFFIXES[field]}`;
  }
  return Object.freeze(vars);
}

/**
 * The ABAP key names: the 2.x session keys (`SAP_URL`, `SAP_AUTH_TYPE`,
 * `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_SNC_*`, `SAP_UAA_*`, `SAP_CLIENT`,
 * `SAP_LANGUAGE`) plus `SAP_GRANT_TYPE`, `SAP_OIDC_*` and `SAP_SAML_*`.
 * `samlIdpCertificates` is `SAP_SAML_IDP_CERTIFICATES_B64`: each certificate
 * base64-encoded, comma-separated (a PEM spans lines; an env value may not).
 */
export const ABAP_DESTINATION_VARS: DestinationVariables = withPrefix('SAP');

/**
 * The XSUAA key names: as `ABAP_DESTINATION_VARS` with `XSUAA_`, the URL under
 * the 2.x XSUAA session key `XSUAA_MCP_URL`.
 */
export const XSUAA_DESTINATION_VARS: DestinationVariables = withPrefix(
  'XSUAA',
  { serviceUrl: 'XSUAA_MCP_URL' },
);

/** A means write: a value sets a field, `null` removes it, absent leaves it. */
export type DestinationMeans = {
  [K in MeansField]?: IConfig[K] | null;
};

export interface EnvDestinationStoreOptions {
  /** Answers, field by field, what the file leaves out. */
  fallback?: IServiceKeyStore;
  /** The key names. `ABAP_DESTINATION_VARS` when not given. */
  variables?: DestinationVariables;
  log?: ILogger;
}

const AUTH_TYPES = ['basic', 'jwt', 'saml', 'snc'] as const;
const GRANTS = DESTINATION_GRANTS;

type Kind = 'string' | 'list' | 'certificates' | 'boolean' | 'number';
const KIND: Partial<Record<MeansField, Kind>> = {
  oidcScopes: 'list',
  samlIdpCertificates: 'certificates',
  samlIdpInitiated: 'boolean',
  samlClockSkewMs: 'number',
};
const kindOf = (field: MeansField): Kind => KIND[field] ?? 'string';

export class EnvDestinationStore implements IServiceKeyStore {
  private readonly directory: string;
  /** Set by `forFile`: every destination resolves to this one file. */
  private singleFile?: string;
  private readonly fallback?: IServiceKeyStore;
  private readonly variables: DestinationVariables;
  private readonly log?: ILogger;

  /**
   * @param directory Where `<destination>.env` files are — no default
   * @param options A fallback key store, the key names, a logger
   */
  constructor(directory: string, options: EnvDestinationStoreOptions = {}) {
    if (typeof options !== 'object' || options === null) {
      throw new TypeError(
        `EnvDestinationStore: got a ${options === null ? 'null' : typeof options} where the options go ({ fallback?, variables?, log? }). The URL — 2.x's defaultServiceUrl — is means: write it with setDestination.`,
      );
    }
    assertLogger('EnvDestinationStore', options.log);
    this.directory = directory;
    this.fallback = options.fallback;
    this.variables = options.variables ?? ABAP_DESTINATION_VARS;
    this.log = options.log;
  }

  /**
   * One given file for every destination — the hand-written `--env` file,
   * whatever its name (`.env.dev`, `conn.cfg`). Like `EnvFileSessionStore`,
   * the destination name is not used to find the file: any name resolves to
   * it (and is not checked as a file name). The options are the
   * constructor's; the fallback is still asked by the destination name.
   */
  static forFile(
    filePath: string,
    options: EnvDestinationStoreOptions = {},
  ): EnvDestinationStore {
    const resolved = path.resolve(filePath);
    const store = new EnvDestinationStore(path.dirname(resolved), options);
    store.singleFile = resolved;
    return store;
  }

  private fileOf(destination: string): string {
    if (this.singleFile) return this.singleFile;
    assertDestinationName(destination);
    return path.join(this.directory, `${destination}.env`);
  }

  /** The means the file states: every field whose key is present. */
  private readFile(destination: string): Partial<Record<MeansField, unknown>> {
    const file = this.fileOf(destination);
    let vars: Record<string, string> | null;
    try {
      vars = readEnvKeys(file);
    } catch (error) {
      const cause = (error as StorageError).cause ?? toError(error);
      throw new StorageError(
        'read',
        `Cannot read the destination "${destination}": ${(cause as NodeJS.ErrnoException).code ?? 'unreadable'}`,
        cause,
      );
    }
    const means: Partial<Record<MeansField, unknown>> = {};
    if (vars === null) return means;
    for (const field of MEANS_FIELDS) {
      const key = this.variables[field];
      if (!(key in vars)) continue;
      const value = decode(field, key, vars[key], destination);
      if (value !== undefined) means[field] = value;
    }
    return means;
  }

  async getConnectionConfig(
    destination: string,
  ): Promise<IConnectionConfig | null> {
    const file = this.readFile(destination);
    const fallback = this.fallback
      ? await this.fallback.getConnectionConfig(destination)
      : null;
    const result: Record<string, unknown> = {};
    for (const field of CONNECTION_FIELDS) {
      if (field in file) result[field] = file[field];
      else if (fallback && fallback[field] !== undefined)
        result[field] = fallback[field];
    }
    this.log?.debug(
      `Destination ${destination}: connection fields ${Object.keys(result).join(', ') || 'none'}`,
    );
    return Object.keys(result).length > 0
      ? (result as IConnectionConfig)
      : null;
  }

  async getAuthorizationConfig(
    destination: string,
  ): Promise<IAuthorizationConfig | null> {
    const file = this.readFile(destination);
    const fallback = this.fallback
      ? await this.fallback.getAuthorizationConfig(destination)
      : null;
    const client: Partial<Record<ClientField, string>> = {};
    for (const field of CLIENT_FIELDS) {
      if (field in file) client[field] = file[field] as string;
      else if (fallback && typeof fallback[field] === 'string')
        client[field] = fallback[field];
    }
    // The client is its id: answered whenever a non-empty id is stated ('' is
    // no id, so no client — a client without an id is none). A field not
    // stated is answered as '' — not stated — and whoever builds a grant
    // decides whether it needs it (an OIDC client has an issuer, not a UAA
    // URL; a public client has no secret). The store judges no grant. The
    // refresh token is a secret: never answered.
    if (!client.uaaClientId) {
      this.log?.debug(`Destination ${destination}: no client id`);
      return null;
    }
    return {
      uaaUrl: client.uaaUrl ?? '',
      uaaClientId: client.uaaClientId,
      uaaClientSecret: client.uaaClientSecret ?? '',
    };
  }

  async getServiceKey(destination: string): Promise<IConfig | null> {
    const client = await this.getAuthorizationConfig(destination);
    const connection = await this.getConnectionConfig(destination);
    if (!client && !connection) return null;
    return { ...(client ?? {}), ...(connection ?? {}) };
  }

  /**
   * Write a destination's means. A field given sets it, `null` removes it, a
   * field not given stays; `uaaClientSecret: ''` is a public client. A secret
   * field (a token, cookies, an expiry, a refresh token) or any field that is
   * not means is refused naming the fields, and so is a value of the wrong
   * form, naming the field — never a value. Only the means keys of the file
   * are touched.
   */
  async setDestination(
    destination: string,
    means: DestinationMeans,
  ): Promise<void> {
    const refused = carriedFields(means)
      .filter((field) => !(MEANS_FIELDS as readonly string[]).includes(field))
      .sort();
    if (refused.length > 0) {
      throw new RefusedFieldsError(
        `EnvDestinationStore holds means alone; the write for "${destination}" carried ${refused.join(', ')}. Write the session secret through a session store.`,
        refused,
      );
    }
    const updates: Record<string, string | null> = {};
    for (const field of MEANS_FIELDS) {
      const value = (means as Record<string, unknown>)[field];
      if (value === undefined) continue;
      updates[this.variables[field]] =
        value === null ? null : encode(field, value, destination);
    }
    const file = this.fileOf(destination);
    const removesOnly = Object.values(updates).every((v) => v === null);
    if (removesOnly && !fs.existsSync(file)) return;
    // from the read to the rename, no other writer of the file — a session
    // store's secret, another process — may merge into the same copy
    await withFileLock(file, () => {
      if (removesOnly && !fs.existsSync(file)) return;
      rewriteEnvKeys(file, updates);
      if (!hasAnyKey(file)) fs.rmSync(file, { force: true });
    });
    this.log?.debug(
      `Destination ${destination} written: ${Object.keys(updates).join(', ')}`,
    );
  }

  /**
   * Remove a destination's means: its means keys. Other lines — a session's
   * secret in a shared file — stay; a file left with no key is removed.
   */
  async deleteDestination(destination: string): Promise<void> {
    const removal: DestinationMeans = {};
    for (const field of MEANS_FIELDS) {
      (removal as Record<string, null>)[field] = null;
    }
    await this.setDestination(destination, removal);
  }
}

function formError(destination: string, field: string, form: string): Error {
  return new InvalidConfigError(
    `EnvDestinationStore: ${field} for "${destination}" must be ${form}`,
    [field],
  );
}

/** A field's value as its env text, or a refusal naming the field. */
function encode(
  field: MeansField,
  value: unknown,
  destination: string,
): string {
  switch (kindOf(field)) {
    case 'list': {
      if (
        !Array.isArray(value) ||
        value.some((v) => typeof v !== 'string' || v === '' || /\s/.test(v))
      ) {
        throw formError(
          destination,
          field,
          'a list of non-empty strings without whitespace',
        );
      }
      return value.join(' ');
    }
    case 'certificates': {
      if (
        !Array.isArray(value) ||
        value.some((v) => typeof v !== 'string' || v === '')
      ) {
        throw formError(destination, field, 'a list of non-empty strings');
      }
      return value
        .map((cert: string) => Buffer.from(cert, 'utf8').toString('base64'))
        .join(',');
    }
    case 'boolean':
      if (typeof value !== 'boolean')
        throw formError(destination, field, 'a boolean');
      return String(value);
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value))
        throw formError(destination, field, 'a finite number');
      return String(value);
    default:
      if (typeof value !== 'string')
        throw formError(destination, field, 'a string');
      if (
        field === 'authType' &&
        !(AUTH_TYPES as readonly string[]).includes(value)
      ) {
        throw formError(destination, field, `one of ${AUTH_TYPES.join(', ')}`);
      }
      if (
        field === 'grantType' &&
        !(GRANTS as readonly string[]).includes(value)
      ) {
        throw formError(destination, field, `one of ${GRANTS.join(', ')}`);
      }
      return value;
  }
}

/** A field's value from its env text; undefined for an empty typed value. */
function decode(
  field: MeansField,
  key: string,
  text: string,
  destination: string,
): unknown {
  switch (kindOf(field)) {
    case 'list':
      return text.split(/\s+/).filter(Boolean);
    case 'certificates':
      return text
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => Buffer.from(part, 'base64').toString('utf8'));
    case 'boolean':
      if (text === '') return undefined;
      if (text !== 'true' && text !== 'false') {
        throw new StorageError(
          'read',
          `Cannot read the destination "${destination}": ${key} is not true or false`,
        );
      }
      return text === 'true';
    case 'number': {
      if (text === '') return undefined;
      const value = Number(text);
      if (!Number.isFinite(value)) {
        throw new StorageError(
          'read',
          `Cannot read the destination "${destination}": ${key} is not a number`,
        );
      }
      return value;
    }
    default:
      // as stored; authType and grantType included — a value this package
      // does not know is the consumer's to name, not the store's to drop
      return text;
  }
}
