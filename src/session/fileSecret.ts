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
  /**
   * What the credential is bound to (3.1.0), answered exactly as written: a
   * non-empty key is answered, an empty one is not. Nothing is composed from
   * other keys of the file. Beside a token or cookies both keys are part of
   * the record's format (5.0.0): `writeFileSecret` always writes them there.
   */
  issuedFor: string;
  issuedBy: string;
}

/**
 * The store's refusal of a record not of its format (5.0.0): fixed words
 * naming the store and the destination — never a value of the record, which
 * holds secrets and URLs.
 */
export function recordFormatError(
  holder: string,
  destination: string,
): StorageError {
  return new StorageError(
    'read',
    `${holder}: the stored session for "${destination}" is not in this store's format; regenerate it with mcp-auth`,
    undefined,
    'record-format',
  );
}

/** Whether a thrown value is a store's `record-format` refusal. */
export function isRecordFormatError(error: unknown): boolean {
  return error instanceof StorageError && error.reason === 'record-format';
}

/** Decimal digits only, at least one: what `String(expiresAt)` writes. */
function isDigits(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) return false;
  }
  return true;
}

/** Whether `encoded` is exactly what the writer's base64 produces. */
function isWrittenBase64(encoded: string): boolean {
  return Buffer.from(encoded, 'base64').toString('base64') === encoded;
}

/**
 * The secret a file holds, or null when there is no file.
 *
 * The store validates its record against the format its writer
 * (`writeFileSecret`) always produces, and refuses one that is not of it as a
 * whole — nothing answered, nothing guessed (5.0.0):
 *
 * - a token or cookies, never both;
 * - beside a token or cookies, both binding keys present (empty is "no
 *   binding");
 * - `expiresAt`, when present, decimal epoch milliseconds (a safe integer);
 * - cookies, when present, the writer's base64.
 *
 * A file with no token and no cookies holds no credential to bind: its refresh
 * token and expiry are answered as they are, and a file holding none of the
 * store's keys is no session. An empty key reads as absent. Only plain code
 * runs over the record.
 */
export function readFileSecret(
  filePath: string,
  keys: SecretKeys,
  holder: string,
  destination: string,
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
  const record = vars;
  const has = (key: string) => typeof record[key] === 'string';
  const token = record[keys.authorizationToken]?.trim();
  const encoded = keys.sessionCookies
    ? record[keys.sessionCookies]?.trim()
    : undefined;
  if (token && encoded) throw recordFormatError(holder, destination);
  if ((token || encoded) && !(has(keys.issuedFor) && has(keys.issuedBy))) {
    throw recordFormatError(holder, destination);
  }
  const expiresAt = record[keys.expiresAt]?.trim();
  let expiry: number | undefined;
  if (expiresAt) {
    expiry = Number(expiresAt);
    if (!isDigits(expiresAt) || !Number.isSafeInteger(expiry)) {
      throw recordFormatError(holder, destination);
    }
  }
  if (encoded && !isWrittenBase64(encoded)) {
    throw recordFormatError(holder, destination);
  }

  const secret: SessionSecret = {};
  if (token) secret.authorizationToken = token;
  if (encoded) {
    secret.sessionCookies = Buffer.from(encoded, 'base64').toString('utf8');
  }
  if (token || encoded) {
    // Answered exactly as written: a binding is compared as a string, so the
    // store must not change it (an empty key is "no binding").
    const issuedFor = record[keys.issuedFor];
    if (issuedFor) secret.issuedFor = issuedFor;
    const issuedBy = record[keys.issuedBy];
    if (issuedBy) secret.issuedBy = issuedBy;
  }
  if (expiry !== undefined) secret.expiresAt = expiry;
  const refresh = record[keys.refreshToken]?.trim();
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
  // With a credential held, both binding keys are written as given — empty
  // when there is none, which reads as none; without a credential, removed.
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
