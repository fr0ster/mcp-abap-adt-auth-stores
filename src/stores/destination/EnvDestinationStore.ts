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
 * - **A client certificate** (3.3.0) is three means of this store's own —
 *   `uaaClientCertPath`, `uaaClientKeyPath`, `uaaCertUrl` (`SAP_UAA_CLIENT_CERT_PATH`,
 *   `SAP_UAA_CLIENT_KEY_PATH`, `SAP_UAA_CERT_URL`, or `XSUAA_UAA_…`): two paths
 *   and a URL, never PEM. Which variables are set decides, and no file is read
 *   to decide: none of the three → as before, and `getClientCertificate`
 *   answers `null`; all three and no client secret variable → a certificate
 *   client: `getAuthorizationConfig` answers `null` (an x509 client is never a
 *   public one) and `getClientCertificate` reads the two files; some but not
 *   all, or any with the client secret variable (`''` included) → both throw
 *   a `ClientCertificateError` naming the variables. A variable written as `''`
 *   is not set. A custom `variables` map without the three keys supports no
 *   certificate (`getClientCertificate` → `null`). The certificate's client id
 *   and UAA URL are the file's, never the fallback's.
 * - **Writing** is this class's own `setDestination`, outside the read-only
 *   contract; it touches only the means keys, so the file may be shared with a
 *   session store, which touches only its secret keys. Writing a certificate
 *   client removes the client secret variable; writing a secret client removes
 *   the three — a switch leaves no credential of the other kind.
 *
 * The directory has no default: the consumer that composes the stores decides
 * where means and secrets live.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  IClientCertificate,
  IConfig,
  IConnectionConfig,
  IServiceKeyStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { IAuthorizationConfig } from '@mcp-abap-adt/interfaces-auth-sap';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  ClientCertificateError,
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

/**
 * A client certificate: two paths and a URL — never PEM. This store's own
 * means, not `IConfig`'s; the certificate itself is answered by
 * `getClientCertificate`.
 */
const CERT_FIELDS = [
  'uaaClientCertPath',
  'uaaClientKeyPath',
  'uaaCertUrl',
] as const;
type CertField = (typeof CERT_FIELDS)[number];

export type MeansField = ConnectionField | ClientField | CertField;

const MEANS_FIELDS: readonly MeansField[] = [
  ...CONNECTION_FIELDS,
  ...CLIENT_FIELDS,
  ...CERT_FIELDS,
];

/**
 * The env key of every means field. The three certificate keys are optional,
 * so a map written for 3.2.0 still type-checks; a map without them supports
 * no certificate destination.
 */
export type DestinationVariables = Readonly<
  Record<Exclude<MeansField, CertField>, string> &
    Partial<Record<CertField, string>>
>;

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
  uaaClientCertPath: 'UAA_CLIENT_CERT_PATH',
  uaaClientKeyPath: 'UAA_CLIENT_KEY_PATH',
  uaaCertUrl: 'UAA_CERT_URL',
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
  [K in MeansField]?: (K extends keyof IConfig ? IConfig[K] : string) | null;
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

type Kind =
  | 'string'
  | 'nonEmpty'
  | 'list'
  | 'certificates'
  | 'boolean'
  | 'number';
const KIND: Partial<Record<MeansField, Kind>> = {
  uaaClientCertPath: 'nonEmpty',
  uaaClientKeyPath: 'nonEmpty',
  uaaCertUrl: 'nonEmpty',
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
      if (key === undefined || !(key in vars)) continue;
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

  /**
   * Whether the file states a client certificate, decided from which
   * variables are set alone — no file is read. Some but not all three, or any
   * with the client secret variable, is refused.
   */
  private certificateStated(
    destination: string,
    file: Partial<Record<MeansField, unknown>>,
  ): boolean {
    const set = CERT_FIELDS.filter(
      (field) => typeof file[field] === 'string' && file[field] !== '',
    );
    if (set.length === 0) return false;
    if ('uaaClientSecret' in file) {
      const variables = [
        this.variables.uaaClientSecret,
        ...set.map((field) => this.variableOf(field)),
      ];
      throw new ClientCertificateError(
        `EnvDestinationStore: "${destination}" states both a client secret (${variables[0]}) and a client certificate (${variables.slice(1).join(', ')}); a client has one or the other`,
        'mixed',
        variables,
      );
    }
    const missing = CERT_FIELDS.filter((field) => !set.includes(field));
    if (missing.length > 0) {
      throw this.incomplete(
        destination,
        missing.map((field) => this.variableOf(field)),
      );
    }
    return true;
  }

  /** A field's variable; only a field read from the file is asked for. */
  private variableOf(field: MeansField): string {
    return this.variables[field] as string;
  }

  private incomplete(
    destination: string,
    variables: string[],
  ): ClientCertificateError {
    return new ClientCertificateError(
      `EnvDestinationStore: the client certificate of "${destination}" is incomplete: ${variables.join(', ')} not set`,
      'incomplete',
      variables,
    );
  }

  async getAuthorizationConfig(
    destination: string,
  ): Promise<IAuthorizationConfig | null> {
    const file = this.readFile(destination);
    // An x509 client is never answered here: an older consumer would read
    // its missing secret as a public client.
    if (this.certificateStated(destination, file)) {
      this.log?.debug(`Destination ${destination}: a certificate client`);
      return null;
    }
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

  /**
   * The destination's client certificate: `null` when none of the three
   * variables is set (or the map has no key for them). The two files are read
   * only once the variables say a certificate client; the client id and UAA
   * URL are the file's. A failure is fixed words naming variables — never a
   * path, a file's content or the underlying error.
   */
  async getClientCertificate(
    destination: string,
  ): Promise<IClientCertificate | null> {
    const file = this.readFile(destination);
    if (!this.certificateStated(destination, file)) return null;
    const missing = (['uaaUrl', 'uaaClientId'] as const).filter(
      (field) => typeof file[field] !== 'string' || file[field] === '',
    );
    if (missing.length > 0) {
      throw this.incomplete(
        destination,
        missing.map((field) => this.variableOf(field)),
      );
    }
    const certificate = await this.readCertificateFile(
      destination,
      'uaaClientCertPath',
      file.uaaClientCertPath as string,
    );
    const key = await this.readCertificateFile(
      destination,
      'uaaClientKeyPath',
      file.uaaClientKeyPath as string,
    );
    return {
      uaaUrl: file.uaaUrl as string,
      clientId: file.uaaClientId as string,
      certificate,
      key,
      certUrl: file.uaaCertUrl as string,
    };
  }

  private async readCertificateFile(
    destination: string,
    field: CertField,
    filePath: string,
  ): Promise<string> {
    try {
      return await fs.promises.readFile(filePath, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException)?.code;
      const variable = this.variableOf(field);
      throw new ClientCertificateError(
        `EnvDestinationStore: the file ${variable} names for "${destination}" cannot be read (${typeof code === 'string' && /^E[A-Z0-9]+$/.test(code) ? code : 'unknown error'})`,
        'unreadable',
        [variable],
      );
    }
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
    const given = (field: MeansField): unknown =>
      (means as Record<string, unknown>)[field];
    const unnamed = CERT_FIELDS.filter(
      (field) => this.variables[field] === undefined && given(field) != null,
    );
    if (unnamed.length > 0) {
      throw new InvalidConfigError(
        `EnvDestinationStore: the variables map names no key for ${unnamed.join(', ')}; the write for "${destination}" cannot be stored`,
        [...unnamed],
      );
    }
    // A client is a secret or a certificate: writing one removes the other,
    // so a switch leaves no stale credential of the other kind.
    const certificateWritten = CERT_FIELDS.filter(
      (field) => given(field) != null,
    );
    const secretWritten = given('uaaClientSecret') != null;
    if (certificateWritten.length > 0 && secretWritten) {
      const variables = [
        this.variables.uaaClientSecret,
        ...certificateWritten.map((field) => this.variableOf(field)),
      ];
      throw new ClientCertificateError(
        `EnvDestinationStore: the write for "${destination}" carries both a client secret (${variables[0]}) and a client certificate (${variables.slice(1).join(', ')}); a client has one or the other`,
        'mixed',
        variables,
      );
    }
    const updates: Record<string, string | null> = {};
    for (const field of MEANS_FIELDS) {
      const value = given(field);
      const key = this.variables[field];
      if (value === undefined || key === undefined) continue;
      updates[key] = value === null ? null : encode(field, value, destination);
    }
    if (certificateWritten.length > 0) {
      updates[this.variables.uaaClientSecret] = null;
    }
    if (secretWritten) {
      for (const field of CERT_FIELDS) {
        const key = this.variables[field];
        if (key !== undefined) updates[key] = null;
      }
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
    case 'nonEmpty':
      if (typeof value !== 'string' || value === '')
        throw formError(destination, field, 'a non-empty string');
      return value;
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
