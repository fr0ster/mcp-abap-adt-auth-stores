/**
 * The session secret: what authorizes within a session, and nothing else.
 *
 * `authorizationToken` or `sessionCookies` — one kind at a time — with the
 * `expiresAt` of that credential, and the `refreshToken`. Everything used to
 * obtain a secret is means and lives in a key store (auth-stores 3.0.0).
 *
 * Beside the credential, what it is bound to (3.1.0): `issuedFor`, the
 * resource it was obtained for, and `issuedBy`, who issued it and to which
 * client — kept as given, written and cleared with the credential.
 */

import { InvalidConfigError, RefusedFieldsError } from '../errors/StoreErrors';

export interface SessionSecret {
  authorizationToken?: string;
  sessionCookies?: string;
  /** Epoch milliseconds, as the provider reported it. */
  expiresAt?: number;
  refreshToken?: string;
  /** The URI of the resource the credential was obtained for, as given. */
  issuedFor?: string;
  /** The URI of who issued the credential and to which client, as given. */
  issuedBy?: string;
}

/** The fields that bind a credential: kept only while a credential is held. */
export const BINDING_FIELDS = ['issuedFor', 'issuedBy'] as const;

export type SecretField = keyof SessionSecret;

export const SESSION_SECRET_FIELDS: readonly SecretField[] = [
  'authorizationToken',
  'sessionCookies',
  'expiresAt',
  'refreshToken',
  ...BINDING_FIELDS,
];

/** The fields a write carries: those given with a value other than undefined. */
export function carriedFields(config: unknown): string[] {
  if (!config || typeof config !== 'object') return [];
  return Object.entries(config as Record<string, unknown>)
    .filter(([, value]) => value !== undefined)
    .map(([key]) => key);
}

/**
 * The secret a write carries. A write carrying any other field — means, or a
 * field no store knows — is refused naming those fields, never their values:
 * dropping them would lose what a caller still on the 2.x roles wrote.
 */
export function takeSecret(
  config: unknown,
  holder: string,
  destination: string,
  accepted: readonly SecretField[] = SESSION_SECRET_FIELDS,
): SessionSecret {
  if (!config || typeof config !== 'object') {
    throw new InvalidConfigError(
      `${holder}: the session for "${destination}" is not an object`,
    );
  }
  const refused = carriedFields(config)
    .filter((field) => !(accepted as readonly string[]).includes(field))
    .sort();
  if (refused.length > 0) {
    throw new RefusedFieldsError(
      `${holder} holds the session secret alone (${accepted.join(', ')}); the write for "${destination}" carried ${refused.join(', ')}. Write means through a key store.`,
      refused,
    );
  }
  const obj = config as Record<string, unknown>;
  const secret: SessionSecret = {};
  for (const field of [
    'authorizationToken',
    'sessionCookies',
    'refreshToken',
    ...BINDING_FIELDS,
  ] as const) {
    const value = obj[field];
    if (value === undefined) continue;
    if (typeof value !== 'string') {
      throw new InvalidConfigError(
        `${holder}: ${field} for "${destination}" must be a string`,
        [field],
      );
    }
    secret[field] = value;
  }
  if (obj.expiresAt !== undefined) {
    // What a file store can read back: a non-negative safe integer.
    if (
      typeof obj.expiresAt !== 'number' ||
      !Number.isSafeInteger(obj.expiresAt) ||
      obj.expiresAt < 0
    ) {
      throw new InvalidConfigError(
        `${holder}: expiresAt for "${destination}" must be a non-negative whole number (epoch milliseconds)`,
        ['expiresAt'],
      );
    }
    secret.expiresAt = obj.expiresAt;
  }
  return secret;
}

/**
 * The secret after a write.
 *
 * - A credential written (a token or cookies) replaces the other kind, and its
 *   `expiresAt` is what the write gives — none given, none kept: a new
 *   credential does not inherit the old one's expiry.
 * - A credential given as `''` clears it, and its `expiresAt` with it; clearing
 *   the kind not held leaves the held credential and its expiry as they are.
 * - A write of both kinds at once is refused: a session holds one.
 * - `expiresAt` alone updates the expiry of the credential held.
 * - `refreshToken` given is kept, `''` clears it, absent leaves it.
 * - `issuedFor` and `issuedBy` (3.1.0) go with the credential: a credential
 *   written (a token or cookies) takes those its write gives, and one the
 *   write leaves out — absent or `''` — is cleared. With no credential written,
 *   each given is set, `''` clears it, absent leaves it. With no credential
 *   held after the write, neither is kept.
 */
export function applySecret(
  current: SessionSecret,
  write: SessionSecret,
  holder: string,
  destination: string,
): SessionSecret {
  if (write.authorizationToken && write.sessionCookies) {
    throw new InvalidConfigError(
      `${holder}: the write for "${destination}" carries a token and cookies; a session holds one`,
      [],
    );
  }
  const next: SessionSecret = { ...current };
  const credentialGiven =
    write.authorizationToken !== undefined ||
    write.sessionCookies !== undefined;
  if (credentialGiven) {
    if (write.authorizationToken) {
      next.authorizationToken = write.authorizationToken;
      delete next.sessionCookies;
      delete next.expiresAt;
    } else if (write.sessionCookies) {
      next.sessionCookies = write.sessionCookies;
      delete next.authorizationToken;
      delete next.expiresAt;
    } else {
      // '' clears the kind given; the expiry goes only with the credential
      // it belongs to, so clearing the kind not held leaves both alone
      if (write.authorizationToken !== undefined)
        delete next.authorizationToken;
      if (write.sessionCookies !== undefined) delete next.sessionCookies;
      if (!next.authorizationToken && !next.sessionCookies)
        delete next.expiresAt;
    }
    if (
      write.expiresAt !== undefined &&
      (next.authorizationToken || next.sessionCookies)
    ) {
      next.expiresAt = write.expiresAt;
    }
  } else if (write.expiresAt !== undefined) {
    next.expiresAt = write.expiresAt;
  }
  if (write.refreshToken !== undefined) {
    if (write.refreshToken) next.refreshToken = write.refreshToken;
    else delete next.refreshToken;
  }
  const newCredential = !!(write.authorizationToken || write.sessionCookies);
  for (const field of BINDING_FIELDS) {
    if (newCredential || write[field] !== undefined) {
      if (write[field]) next[field] = write[field];
      else delete next[field];
    }
    if (!next.authorizationToken && !next.sessionCookies) delete next[field];
  }
  return next;
}

/** Whether a secret holds anything. */
export function isEmptySecret(secret: SessionSecret | null): boolean {
  return (
    !secret ||
    (!secret.authorizationToken &&
      !secret.sessionCookies &&
      secret.expiresAt === undefined &&
      !secret.refreshToken)
  );
}
