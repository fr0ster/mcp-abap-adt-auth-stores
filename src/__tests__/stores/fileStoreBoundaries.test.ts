/**
 * The edges of the file stores (3.0.0).
 *
 * - A destination name is a file name: one with a path separator or `..`
 *   would read or write outside the store's directory, and is refused by
 *   every store that builds a path from it.
 * - A JavaScript caller still passing 2.x's `defaultServiceUrl` where the
 *   logger now goes gets a clear error at construction, not a failure on the
 *   first log line.
 * - A malformed `SAP_EXPIRES_AT` is reported by reads, and overwritten by the
 *   next write instead of blocking it.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { InvalidConfigError, StorageError } from '../../errors/StoreErrors';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { SafeAbapSessionStore } from '../../stores/abap/SafeAbapSessionStore';
import { EnvDestinationStore } from '../../stores/destination/EnvDestinationStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { SafeXsuaaSessionStore } from '../../stores/xsuaa/SafeXsuaaSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

let root: string;
let dir: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundaries-'));
  dir = path.join(root, 'store');
  fs.mkdirSync(dir);
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

const BAD_NAMES = ['../escaped', '..', 'a/b', 'a\\b', '/abs', 'x/../../y'];

describe.each([
  [
    'AbapSessionStore',
    (d: string) => new AbapSessionStore(d),
    (s: AbapSessionStore, n: string) =>
      s.saveSession(n, { authorizationToken: 'T' }),
    (s: AbapSessionStore, n: string) => s.loadSession(n),
  ],
  [
    'XsuaaSessionStore',
    (d: string) => new XsuaaSessionStore(d),
    (s: XsuaaSessionStore, n: string) =>
      s.saveSession(n, { authorizationToken: 'T' }),
    (s: XsuaaSessionStore, n: string) => s.loadSession(n),
  ],
  [
    'EnvDestinationStore',
    (d: string) => new EnvDestinationStore(d),
    (s: EnvDestinationStore, n: string) =>
      s.setDestination(n, { serviceUrl: 'https://u' }),
    (s: EnvDestinationStore, n: string) => s.getConnectionConfig(n),
  ],
] as const)(
  '%s — a destination name outside its directory',
  (_n, make, write, read) => {
    it.each(BAD_NAMES)(
      'refuses %j for a write and a read, writing nothing',
      async (name) => {
        const store = make(dir) as any;
        const w = await write(store, name).catch((e: unknown) => e);
        expect(w).toBeInstanceOf(InvalidConfigError);
        expect((w as Error).message).toMatch(/destination name/);
        const r = await read(store, name).catch((e: unknown) => e);
        expect(r).toBeInstanceOf(InvalidConfigError);
        expect(fs.readdirSync(root)).toEqual(['store']);
        expect(fs.readdirSync(dir)).toEqual([]);
      },
    );

    it("accepts a plain name and '' (the file named .env)", async () => {
      const store = make(dir) as any;
      await write(store, 'TRIAL');
      await write(store, '');
      expect(fs.readdirSync(dir).sort()).toEqual(['.env', 'TRIAL.env']);
    });
  },
);

describe('a 2.x defaultServiceUrl where the logger now goes', () => {
  it.each([
    [
      'XsuaaSessionStore(dir, url, log)',
      () => new XsuaaSessionStore(dir, '' as never),
    ],
    [
      'XsuaaSessionStore(dir, url)',
      () => new XsuaaSessionStore(dir, 'https://u' as never),
    ],
    [
      'SafeXsuaaSessionStore(url, log)',
      () => new SafeXsuaaSessionStore('' as never),
    ],
    [
      'AbapSessionStore(dir, url)',
      () => new AbapSessionStore(dir, 'https://u' as never),
    ],
    [
      'SafeAbapSessionStore(url)',
      () => new SafeAbapSessionStore('https://u' as never),
    ],
    [
      'EnvFileSessionStore(file, url)',
      () => new EnvFileSessionStore(path.join(dir, 'x.env'), 'u' as never),
    ],
    [
      'EnvDestinationStore(dir, url)',
      () => new EnvDestinationStore(dir, 'u' as never),
    ],
  ])('%s throws a TypeError naming defaultServiceUrl', (_n, construct) => {
    expect(construct).toThrow(TypeError);
    expect(construct).toThrow(/defaultServiceUrl/);
  });

  it('a logger, undefined or no argument is accepted', () => {
    const log = { debug() {}, info() {}, warn() {}, error() {} };
    expect(() => new XsuaaSessionStore(dir, log)).not.toThrow();
    expect(() => new SafeXsuaaSessionStore(undefined)).not.toThrow();
    expect(() => new SafeAbapSessionStore()).not.toThrow();
    expect(() => new EnvDestinationStore(dir, { log })).not.toThrow();
  });
});

describe('a malformed SAP_EXPIRES_AT', () => {
  it('is reported by a read, and overwritten by the next write', async () => {
    const file = path.join(dir, 'D.env');
    fs.writeFileSync(
      file,
      'SAP_URL=u\nSAP_JWT_TOKEN=old\nSAP_EXPIRES_AT=soon\n',
    );
    const store = new AbapSessionStore(dir);

    await expect(store.loadSession('D')).rejects.toBeInstanceOf(StorageError);

    await store.saveSession('D', {
      authorizationToken: 'new',
      expiresAt: 1_900_000_000_000,
    });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: 'new',
      expiresAt: 1_900_000_000_000,
    });
    expect(fs.readFileSync(file, 'utf8')).toMatch(/^SAP_URL=u$/m);
  });

  it('does not block a write that leaves the credential alone', async () => {
    fs.writeFileSync(
      path.join(dir, 'D.env'),
      'SAP_JWT_TOKEN=old\nSAP_EXPIRES_AT=soon\n',
    );
    const store = new AbapSessionStore(dir);
    await store.saveSession('D', { refreshToken: 'R' });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: 'old',
      refreshToken: 'R',
    });
  });
});
