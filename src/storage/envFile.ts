/**
 * Reading and rewriting the keys of one `.env` file, for every file store.
 *
 * A destination's `.env` may be shared: the session store writes the secret
 * keys and the destination store the means keys of the same file (auth-stores
 * 3.0.0). So a write touches only the keys it is given and leaves every other
 * line — keys it does not know, comments, blank lines, their order and their
 * quoting — byte for byte. A value is never put in an error message or a log
 * line; a key name may be.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { StorageError } from '../errors/StoreErrors';
import { readEnvFileOrNull } from './readEnvFileOrNull';

/**
 * An `Error` of this realm keeping the system error's `code`. Under Jest's VM
 * modules an fs error is not `instanceof Error`; wrapping it in a plain
 * `new Error(String(e))` lost `code`.
 */
export function toError(error: unknown): Error & { code?: string } {
  if (error instanceof Error) return error;
  const wrapped: Error & { code?: string } = new Error(
    (error as { message?: string })?.message ?? String(error),
  );
  const code = (error as { code?: unknown })?.code;
  if (typeof code === 'string') wrapped.code = code;
  return wrapped;
}

/** The key a line assigns, or undefined for a comment, a blank or other text. */
function keyOfLine(line: string): string | undefined {
  return /^\s*(?:export\s+)?([\w.-]+)\s*=/.exec(line)?.[1];
}

/**
 * The file's keys, or null when there is no such file. Any failure but a
 * missing file is thrown as a `StorageError` naming the file, never its content.
 */
export function readEnvKeys(filePath: string): Record<string, string> | null {
  let content: string | null;
  try {
    content = readEnvFileOrNull(filePath);
  } catch (error) {
    const cause = toError(error);
    throw new StorageError(
      'read',
      `Cannot read ${filePath}: ${(error as NodeJS.ErrnoException).code ?? 'unreadable'}`,
      cause,
    );
  }
  if (content === null) return null;
  return dotenv.parse(content);
}

/**
 * How a value is written so that dotenv reads back exactly that value.
 *
 * A value with nothing special is written bare. Otherwise it is wrapped in the
 * first quote character it does not contain — single quotes first, since
 * dotenv reads them literally; a double-quoted value would have `\n` expanded.
 * A value with a line break, or one containing every quote character, cannot
 * be written to one line, and is refused naming the key.
 */
export function formatEnvValue(key: string, value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new StorageError(
      'write',
      `Cannot write ${key} to an env file: its value contains a line break`,
    );
  }
  if (value === '' || /^[^\s#'"`\\=]+$/.test(value)) return value;
  for (const quote of ["'", '`', '"']) {
    if (!value.includes(quote)) {
      if (quote === '"' && /\\[nr]/.test(value)) continue;
      return `${quote}${value}${quote}`;
    }
  }
  throw new StorageError(
    'write',
    `Cannot write ${key} to an env file: no quoting reads its value back unchanged`,
  );
}

/**
 * Set or remove the given keys of an env file, atomically (a temporary file,
 * then a rename). `null` removes a key; a string sets it, in place when the key
 * is already there, else appended. Every line whose key is not given is kept
 * as it was. A new file is created readable by its owner alone; an existing
 * one keeps its mode.
 */
export function rewriteEnvKeys(
  filePath: string,
  updates: Record<string, string | null>,
): void {
  const existing = readEnvFileOrNull(filePath);
  const lines = existing === null ? [] : existing.split('\n');
  // a trailing newline leaves one empty last element: keep it as the end
  const hadTrailingNewline = lines.length > 0 && lines[lines.length - 1] === '';
  if (hadTrailingNewline) lines.pop();

  const pending = new Map(Object.entries(updates));
  const written = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const key = keyOfLine(line);
    if (key === undefined || !pending.has(key)) {
      out.push(line);
      continue;
    }
    const value = pending.get(key);
    // a key given more than once is written once, where it first was
    if (value === null || value === undefined || written.has(key)) continue;
    out.push(`${key}=${formatEnvValue(key, value)}`);
    written.add(key);
  }
  for (const [key, value] of pending) {
    if (value === null || written.has(key)) continue;
    out.push(`${key}=${formatEnvValue(key, value)}`);
  }

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const content = out.length > 0 ? `${out.join('\n')}\n` : '';
  const tempFilePath = `${filePath}.tmp`;
  try {
    const mode = existing === null ? 0o600 : fs.statSync(filePath).mode & 0o777;
    fs.writeFileSync(tempFilePath, content, { encoding: 'utf8', mode });
    fs.chmodSync(tempFilePath, mode);
    fs.renameSync(tempFilePath, filePath);
  } catch (error) {
    const cause = toError(error);
    throw new StorageError(
      'write',
      `Cannot write ${filePath}: ${(error as NodeJS.ErrnoException).code ?? 'write failed'}`,
      cause,
    );
  }
}

/** Whether a file holds any key at all. */
export function hasAnyKey(filePath: string): boolean {
  const content = readEnvFileOrNull(filePath);
  if (content === null) return false;
  return content.split('\n').some((line) => keyOfLine(line) !== undefined);
}
