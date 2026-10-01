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

import { randomBytes } from 'node:crypto';
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
 * dotenv's own line pattern (dotenv 18, `parse`), with match indices: the
 * rewriter finds a key exactly where dotenv finds it — `KEY=value`,
 * `export KEY=value`, `KEY: value`, a quoted value spanning lines — so it
 * never rewrites text dotenv reads as part of another key's value.
 */
const DOTENV_LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/dgm;

interface KeySpan {
  key: string;
  /** Start of the line the key is on. */
  start: number;
  /** End of the line the value ends on, before its line break. */
  end: number;
}

/** Where each key assignment of a file is, as dotenv reads it. */
function keySpans(content: string): KeySpan[] {
  const spans: KeySpan[] = [];
  const re = new RegExp(DOTENV_LINE.source, DOTENV_LINE.flags);
  for (let m = re.exec(content); m !== null; m = re.exec(content)) {
    if (m[0] === '') {
      re.lastIndex++;
      continue;
    }
    const indices = (m as RegExpExecArray & { indices: [number, number][] })
      .indices;
    const keyStart = indices[1][0];
    const valueEnd = indices[2] ? indices[2][1] : indices[1][1];
    const start = content.lastIndexOf('\n', keyStart - 1) + 1;
    let end = content.indexOf('\n', valueEnd);
    if (end === -1) end = content.length;
    if (end > valueEnd && content[end - 1] === '\r') end--;
    spans.push({ key: m[1], start, end });
  }
  return spans;
}

/** The line break right after `end`, if any. */
function breakAt(content: string, end: number): number {
  if (content.startsWith('\r\n', end)) return 2;
  if (content[end] === '\n') return 1;
  return 0;
}

/**
 * Set or remove the given keys of an env file. `null` removes a key; a string
 * sets it — in place of its first assignment, any other assignment of it
 * removed — or appends it. Every other byte of the file stays: keys not given,
 * comments, blank lines, line breaks (CRLF included). Keys are found where
 * dotenv finds them (`DOTENV_LINE`); the result is parsed back, and if any key
 * would not read as intended the file is left alone and the write refused,
 * naming the file and the key — a hand-written file the stores cannot map
 * safely. The stores write one key per line.
 *
 * Written through a temporary file of this writer's own (`wx`), then renamed.
 * A new file is `0600`; an existing one keeps its owner's bits only — never
 * widened. The caller holds the file's lock (`withFileLock`).
 */
export function rewriteEnvKeys(
  filePath: string,
  updates: Record<string, string | null>,
): void {
  const existing = readEnvFileOrNull(filePath) ?? '';
  const spans = keySpans(existing);

  const edits: { start: number; end: number; text: string }[] = [];
  const appended: string[] = [];
  for (const [key, value] of Object.entries(updates)) {
    const found = spans.filter((span) => span.key === key);
    found.forEach((span, i) => {
      if (i === 0 && value !== null) {
        edits.push({
          start: span.start,
          end: span.end,
          text: `${key}=${formatEnvValue(key, value)}`,
        });
      } else {
        edits.push({
          start: span.start,
          end: span.end + breakAt(existing, span.end),
          text: '',
        });
      }
    });
    if (found.length === 0 && value !== null) {
      appended.push(`${key}=${formatEnvValue(key, value)}`);
    }
  }
  let content = existing;
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    content =
      content.slice(0, edit.start) + edit.text + content.slice(edit.end);
  }
  if (appended.length > 0) {
    const eol = existing.includes('\r\n') ? '\r\n' : '\n';
    if (content !== '' && !content.endsWith('\n')) content += eol;
    content += appended.map((line) => line + eol).join('');
  }

  const expected: Record<string, string> = dotenv.parse(existing);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null) delete expected[key];
    else expected[key] = value;
  }
  const actual = dotenv.parse(content);
  for (const key of new Set([
    ...Object.keys(expected),
    ...Object.keys(actual),
  ])) {
    if (expected[key] !== actual[key]) {
      throw new StorageError(
        'write',
        `Cannot rewrite ${filePath} safely: ${key} would not read back as written — keep one key per line, each value closed on its line`,
      );
    }
  }

  writeAtomically(filePath, content);
}

/**
 * Write `content` to `filePath` through a temporary file of this writer's own,
 * created exclusively, then a rename. The temporary file is removed when
 * anything fails.
 */
function writeAtomically(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  let mode = 0o600;
  try {
    mode = fs.statSync(filePath).mode & 0o600;
  } catch {
    // a new file
  }
  const tempFilePath = `${filePath}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    fs.writeFileSync(tempFilePath, content, {
      encoding: 'utf8',
      mode,
      flag: 'wx',
    });
    fs.chmodSync(tempFilePath, mode);
    fs.renameSync(tempFilePath, filePath);
  } catch (error) {
    fs.rmSync(tempFilePath, { force: true });
    const cause = toError(error);
    throw new StorageError(
      'write',
      `Cannot write ${filePath}: ${(error as NodeJS.ErrnoException).code ?? 'write failed'}`,
      cause,
    );
  }
}

/** Whether a file holds any key at all, as dotenv reads it. */
export function hasAnyKey(filePath: string): boolean {
  const content = readEnvFileOrNull(filePath);
  if (content === null) return false;
  return Object.keys(dotenv.parse(content)).length > 0;
}
