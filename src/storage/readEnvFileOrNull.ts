import * as fs from 'node:fs';

/**
 * A session file's content, or null when there is no such file.
 *
 * Only `ENOENT` is "no file". Checking with `fs.existsSync` first answered
 * false for a file in a directory the process may not traverse (no `x`
 * permission), so an unreadable session read as absent and the caller asked
 * for a new login. Every other failure — `EACCES`, `EISDIR`, `ENOTDIR` — is
 * thrown to the caller.
 */
export function readEnvFileOrNull(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
