/**
 * An unreadable session file is an error, not an absent session.
 *
 * The session stores caught every loader failure and answered null, so a file
 * the process may not read looked like no session at all: auth-broker then
 * logged in again or reported a missing field, and the file and its error were
 * never named. A missing file is still null — the loaders answer that before
 * anything can fail.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { STORE_ERROR_CODES } from '@mcp-abap-adt/interfaces-auth';
import { StorageError } from '../../errors/StoreErrors';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

// Root reads a mode-000 file anyway; the case cannot be staged there.
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

describe.each([
  [
    'AbapSessionStore',
    (dir: string) => new AbapSessionStore(dir),
    'SAP_URL=https://x\n',
  ],
  [
    'XsuaaSessionStore',
    (dir: string) => new XsuaaSessionStore(dir, ''),
    'XSUAA_JWT_TOKEN=t\n',
  ],
])('%s', (_name, make, content) => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unreadable-'));
  });
  afterEach(() => {
    const file = path.join(dir, 'D.env');
    if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('answers a missing session with null', async () => {
    const store = make(dir);
    expect(await store.loadSession('D')).toBeNull();
    expect(await store.getConnectionConfig('D')).toBeNull();
  });

  (asRoot ? it.skip : it)(
    'raises a StorageError for a file it may not read',
    async () => {
      const file = path.join(dir, 'D.env');
      fs.writeFileSync(file, content);
      fs.chmodSync(file, 0);
      const store = make(dir);

      const failure = await store.loadSession('D').catch((e: unknown) => e);

      expect(failure).toBeInstanceOf(StorageError);
      expect((failure as StorageError).code).toBe(
        STORE_ERROR_CODES.STORAGE_ERROR,
      );
      expect((failure as StorageError).message).toMatch(/"D"/);
      expect((failure as StorageError).cause).toBeInstanceOf(Error);
      await expect(store.getConnectionConfig('D')).rejects.toBeInstanceOf(
        StorageError,
      );
      await expect(store.getAuthorizationConfig('D')).rejects.toBeInstanceOf(
        StorageError,
      );
    },
  );
});
