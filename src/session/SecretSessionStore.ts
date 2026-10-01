/**
 * What every session store does with the secret, whatever it keeps it in.
 *
 * A session store holds the session secret and nothing else (auth-stores
 * 3.0.0): `authorizationToken` or `sessionCookies`, their `expiresAt`, and the
 * `refreshToken`. A write carrying any other field is refused naming the
 * fields; `setAuthorizationConfig` always refuses (a session holds no client),
 * and `getAuthorizationConfig` answers `null`. Subclasses say only where the
 * secret is kept.
 */

import type {
  IConfig,
  IConnectionConfig,
  ISessionStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { IAuthorizationConfig } from '@mcp-abap-adt/interfaces-auth-sap';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { InvalidConfigError, RefusedFieldsError } from '../errors/StoreErrors';
import { formatToken } from '../utils/formatting';
import {
  applySecret,
  carriedFields,
  isEmptySecret,
  SESSION_SECRET_FIELDS,
  type SecretField,
  type SessionSecret,
  takeSecret,
} from './sessionSecret';

export interface SecretSessionStoreOptions {
  /** The store's name, for messages. */
  name: string;
  /**
   * A session of this store is a token: cookies are refused, and so is a write
   * that would leave the session without a token (the XSUAA stores).
   */
  tokenOnly: boolean;
  log?: ILogger;
}

export abstract class SecretSessionStore implements ISessionStore {
  protected readonly log?: ILogger;
  private readonly storeName: string;
  private readonly tokenOnly: boolean;

  protected constructor(options: SecretSessionStoreOptions) {
    this.storeName = options.name;
    this.tokenOnly = options.tokenOnly;
    this.log = options.log;
  }

  /** The stored secret, or null when there is none. */
  protected abstract readSecret(
    destination: string,
  ): Promise<SessionSecret | null>;

  /** Replace the stored secret with `next` (an empty one removes it). */
  protected abstract writeSecret(
    destination: string,
    next: SessionSecret,
  ): Promise<void>;

  private get accepted(): readonly SecretField[] {
    return this.tokenOnly
      ? SESSION_SECRET_FIELDS.filter((f) => f !== 'sessionCookies')
      : SESSION_SECRET_FIELDS;
  }

  async loadSession(destination: string): Promise<IConfig | null> {
    const secret = await this.readSecret(destination);
    this.log?.debug(
      `Session loaded for ${destination}: ${describeSecret(secret)}`,
    );
    return isEmptySecret(secret) ? null : { ...secret };
  }

  async saveSession(destination: string, config: unknown): Promise<void> {
    await this.write(destination, config);
  }

  async setConnectionConfig(
    destination: string,
    config: IConnectionConfig,
  ): Promise<void> {
    await this.write(destination, config);
  }

  async getConnectionConfig(
    destination: string,
  ): Promise<IConnectionConfig | null> {
    const secret = await this.readSecret(destination);
    if (!secret) return null;
    const { refreshToken: _refresh, ...connection } = secret;
    return isEmptySecret(connection) ? null : connection;
  }

  /** A session holds no client: the client is means, in a key store. */
  async getAuthorizationConfig(
    _destination: string,
  ): Promise<IAuthorizationConfig | null> {
    return null;
  }

  /**
   * Always refused: `IAuthorizationConfig` is the client, and the client is
   * means. A refresh token is written through `saveSession`.
   */
  async setAuthorizationConfig(
    destination: string,
    config: IAuthorizationConfig,
  ): Promise<void> {
    const fields = carriedFields(config)
      .filter((f) => f !== 'refreshToken')
      .sort();
    throw new RefusedFieldsError(
      `${this.storeName} holds no client; setAuthorizationConfig for "${destination}" is refused${fields.length ? ` (carried ${fields.join(', ')})` : ''}. Write the client through a key store, the refresh token through saveSession.`,
      fields,
    );
  }

  private async write(destination: string, config: unknown): Promise<void> {
    const write = takeSecret(
      config,
      this.storeName,
      destination,
      this.accepted,
    );
    const current = (await this.readSecret(destination)) ?? {};
    const next = applySecret(current, write, this.storeName, destination);
    if (this.tokenOnly && !next.authorizationToken) {
      throw new InvalidConfigError(
        `${this.storeName}: the session for "${destination}" needs authorizationToken — its session is a token`,
        ['authorizationToken'],
      );
    }
    await this.writeSecret(destination, next);
    this.log?.debug(
      `Session saved for ${destination}: ${describeSecret(next)}`,
    );
  }
}

/** What a log line may say about a secret: which parts are there, and lengths. */
export function describeSecret(secret: SessionSecret | null): string {
  if (isEmptySecret(secret) || !secret) return 'none';
  const parts: string[] = [];
  if (secret.authorizationToken)
    parts.push(`token(${formatToken(secret.authorizationToken)})`);
  if (secret.sessionCookies)
    parts.push(`cookies(${formatToken(secret.sessionCookies)})`);
  if (secret.expiresAt !== undefined) parts.push('expiresAt');
  if (secret.refreshToken)
    parts.push(`refreshToken(${formatToken(secret.refreshToken)})`);
  return parts.join(', ');
}
