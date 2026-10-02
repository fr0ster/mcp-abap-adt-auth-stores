/**
 * The session secret in a `.env` file: its own keys, and no other line touched.
 */

import * as fs from 'node:fs';
import { StorageError } from '../errors/StoreErrors';
import { hasAnyKey, readEnvKeys, rewriteEnvKeys } from '../storage/envFile';
import type { SessionSecret } from './sessionSecret';

/** The env keys of the secret. A store with no cookies key holds no cookies. */
export interface SecretKeys {
  authorizationToken: string;
  sessionCookies?: string;
  expiresAt: string;
  refreshToken: string;
  /** What the credential is bound to (3.1.0). */
  issuedFor: string;
  issuedBy: string;
  /**
   * Where a file written before 3.1.0 — with no binding key — holds what its
   * credential was used for: the means keys the 2.x/3.x writers put beside the
   * token (`legacyBinding`).
   */
  legacy: LegacyBindingKeys;
}

/** The means keys a legacy binding is composed from. */
export interface LegacyBindingKeys {
  serviceUrl: string;
  sapClient: string;
  uaaUrl: string;
  uaaClientId: string;
}

/** `base` with one more query parameter, its value percent-encoded. */
function withQuery(base: string, name: string, value: string): string {
  return `${base}${base.includes('?') ? '&' : '?'}${name}=${encodeURIComponent(value)}`;
}

/**
 * The binding of a file with no binding key (written by 2.x or 3.0.0),
 * composed — not canonicalised — from the means keys beside the credential:
 *
 * - `issuedFor`: the URL, with `sap-client=<client>` when a client is stated;
 *   none without a URL;
 * - `issuedBy`, for a token only: the UAA URL with `client_id=<client id>`;
 *   none unless both are stated. Cookies were never bound to an ACS, so a
 *   cookie session has none.
 *
 * Each field is composed only when its own key is absent from the file: a key
 * present — empty included — is what a 3.1.0 writer stated.
 */
function legacyBinding(
  vars: Record<string, string>,
  keys: SecretKeys,
  secret: SessionSecret,
): Pick<SessionSecret, 'issuedFor' | 'issuedBy'> {
  const value = (key: string) => vars[key]?.trim() || undefined;
  const binding: Pick<SessionSecret, 'issuedFor' | 'issuedBy'> = {};
  if (!(keys.issuedFor in vars)) {
    const url = value(keys.legacy.serviceUrl);
    const client = value(keys.legacy.sapClient);
    if (url)
      binding.issuedFor = client ? withQuery(url, 'sap-client', client) : url;
  }
  if (!(keys.issuedBy in vars) && secret.authorizationToken) {
    const uaaUrl = value(keys.legacy.uaaUrl);
    const clientId = value(keys.legacy.uaaClientId);
    if (uaaUrl && clientId)
      binding.issuedBy = withQuery(uaaUrl, 'client_id', clientId);
  }
  return binding;
}

/** The binding the file states, or composes for a legacy file. */
function readBinding(
  vars: Record<string, string>,
  keys: SecretKeys,
  secret: SessionSecret,
): void {
  if (!secret.authorizationToken && !secret.sessionCookies) return;
  // Answered exactly as written: a binding is compared as a string, so the
  // file must not change it (an empty key is "cleared").
  const issuedFor = vars[keys.issuedFor];
  if (issuedFor) secret.issuedFor = issuedFor;
  const issuedBy = vars[keys.issuedBy];
  if (issuedBy) secret.issuedBy = issuedBy;
  Object.assign(secret, legacyBinding(vars, keys, secret));
}

/** The secret a file holds, or null when there is no file. */
export function readFileSecret(
  filePath: string,
  keys: SecretKeys,
  destination: string,
  /**
   * For a write: a malformed expiry is ignored, so the write replaces it
   * instead of failing on it. A read reports it.
   */
  forWrite = false,
): SessionSecret | null {
  let vars: Record<string, string> | null;
  try {
    vars = readEnvKeys(filePath);
  } catch (error) {
    // The file is there and could not be read — not "no session": a null here
    // would make the caller log in again instead of naming the file's error.
    const cause = (error as StorageError).cause ?? (error as Error);
    throw new StorageError(
      'read',
      `Cannot read the session for "${destination}": ${(cause as NodeJS.ErrnoException).code ?? 'unreadable'}`,
      cause,
    );
  }
  if (vars === null) return null;
  const secret: SessionSecret = {};
  const token = vars[keys.authorizationToken]?.trim();
  if (token) secret.authorizationToken = token;
  if (keys.sessionCookies) {
    const encoded = vars[keys.sessionCookies]?.trim();
    if (encoded) {
      secret.sessionCookies = Buffer.from(encoded, 'base64').toString('utf8');
    }
  }
  readBinding(vars, keys, secret);
  const expiresAt = vars[keys.expiresAt]?.trim();
  if (expiresAt) {
    const value = Number(expiresAt);
    if (!/^\d+$/.test(expiresAt) || !Number.isSafeInteger(value)) {
      if (forWrite) return withoutExpiry(secret, vars, keys);
      throw new StorageError(
        'read',
        `Cannot read the session for "${destination}": ${keys.expiresAt} is not epoch milliseconds`,
      );
    }
    secret.expiresAt = value;
  }
  const refresh = vars[keys.refreshToken]?.trim();
  if (refresh) secret.refreshToken = refresh;
  return secret;
}

/**
 * Write the secret's keys — set, or removed when the secret lacks them — and
 * nothing else. A file left with no key at all is removed.
 */
export function writeFileSecret(
  filePath: string,
  keys: SecretKeys,
  next: SessionSecret,
): void {
  const updates: Record<string, string | null> = {
    [keys.authorizationToken]: next.authorizationToken || null,
    [keys.expiresAt]:
      next.expiresAt === undefined ? null : String(next.expiresAt),
    [keys.refreshToken]: next.refreshToken || null,
  };
  // With a credential held, both binding keys are written — empty when there
  // is none — so the file is no longer read as a legacy one; without, removed.
  const held = !!(next.authorizationToken || next.sessionCookies);
  updates[keys.issuedFor] = held ? (next.issuedFor ?? '') : null;
  updates[keys.issuedBy] = held ? (next.issuedBy ?? '') : null;
  if (keys.sessionCookies) {
    updates[keys.sessionCookies] = next.sessionCookies
      ? Buffer.from(next.sessionCookies, 'utf8').toString('base64')
      : null;
  }
  const removesOnly = Object.values(updates).every((v) => v === null);
  if (removesOnly && !fs.existsSync(filePath)) return;
  rewriteEnvKeys(filePath, updates);
  if (!hasAnyKey(filePath)) fs.rmSync(filePath, { force: true });
}

/** The rest of the secret, when the expiry cannot be read (for a write). */
function withoutExpiry(
  secret: SessionSecret,
  vars: Record<string, string>,
  keys: SecretKeys,
): SessionSecret {
  const refresh = vars[keys.refreshToken]?.trim();
  if (refresh) secret.refreshToken = refresh;
  return secret;
}
