/**
 * An advisory lock per file, across processes: `<file>.lock`, created
 * exclusively (`wx`).
 *
 * Every writer of a store's `.env` file holds it from its read to its rename,
 * so two writers — a session store and `EnvDestinationStore` on a shared file,
 * in one process or two — never merge into a copy the other has already
 * replaced. Readers take no lock: a rename is atomic, so a reader sees the old
 * file or the new one.
 *
 * A lock older than `staleMs` is a crashed holder's and is taken over; a live
 * one is waited for, retrying every few milliseconds, up to `waitMs`, after
 * which the write fails with a `StorageError` naming the file. The lock is
 * released in a `finally`. (Two waiters taking over one stale lock at the
 * same moment could both proceed; that needs a holder crashed for `staleMs`
 * and two writers arriving together, and is accepted.)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { StorageError } from '../errors/StoreErrors';
import { toError } from './envFile';

export interface FileLockOptions {
  /** How long to wait for a live lock before giving up. Default 10 s. */
  waitMs?: number;
  /** How old a lock must be to count as a crashed holder's. Default 30 s. */
  staleMs?: number;
}

const DEFAULT_WAIT_MS = 10_000;
const DEFAULT_STALE_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function tryAcquire(lockPath: string): boolean {
  try {
    const fd = fs.openSync(lockPath, 'wx', 0o600);
    try {
      fs.writeSync(fd, `${process.pid} ${new Date().toISOString()}\n`);
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw new StorageError(
      'lock',
      `Cannot lock ${lockPath}: ${(error as NodeJS.ErrnoException).code ?? 'lock failed'}`,
      toError(error),
    );
  }
}

/** Remove a lock older than `staleMs`; true when it is gone. */
function removeIfStale(lockPath: string, staleMs: number): boolean {
  let mtime: number;
  try {
    mtime = fs.statSync(lockPath).mtimeMs;
  } catch {
    return true; // released meanwhile
  }
  if (Date.now() - mtime < staleMs) return false;
  try {
    fs.rmSync(lockPath, { force: true });
  } catch {
    // another waiter removed it first
  }
  return true;
}

export async function withFileLock<T>(
  filePath: string,
  fn: () => T | Promise<T>,
  options: FileLockOptions = {},
): Promise<T> {
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS;
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + waitMs;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  for (;;) {
    if (tryAcquire(lockPath)) break;
    if (removeIfStale(lockPath, staleMs)) continue;
    if (Date.now() >= deadline) {
      throw new StorageError(
        'lock',
        `Cannot write ${filePath}: another writer holds ${lockPath} (waited ${waitMs} ms)`,
      );
    }
    await sleep(2 + Math.floor(Math.random() * 8));
  }
  try {
    return await fn();
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
}
