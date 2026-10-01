/**
 * Concurrent writers of one destination lose nothing (3.0.0).
 *
 * - Within one store instance, writes for a destination are applied one after
 *   another: two `saveSession` calls in flight both land.
 * - Across stores and processes, every writer of a `.env` file — a session
 *   store's secret, `EnvDestinationStore`'s means, `deleteSession` — holds an
 *   advisory lock (`<file>.lock`, created exclusively) from its read to its
 *   rename, and writes through a temporary file of its own. A crashed holder's
 *   lock is taken over once stale; a live one is waited for, within a bound.
 */
import { execFileSync, spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ISessionStore } from '@mcp-abap-adt/interfaces-auth-broker';
import { StorageError } from '../../errors/StoreErrors';
import { withFileLock } from '../../storage/fileLock';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { SafeAbapSessionStore } from '../../stores/abap/SafeAbapSessionStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { SafeXsuaaSessionStore } from '../../stores/xsuaa/SafeXsuaaSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

const ROOT = path.resolve(__dirname, '../../..');

describe.each([
  [
    'AbapSessionStore',
    (dir: string): ISessionStore => new AbapSessionStore(dir),
  ],
  ['SafeAbapSessionStore', (): ISessionStore => new SafeAbapSessionStore()],
  [
    'XsuaaSessionStore',
    (dir: string): ISessionStore => new XsuaaSessionStore(dir),
  ],
  ['SafeXsuaaSessionStore', (): ISessionStore => new SafeXsuaaSessionStore()],
  [
    'EnvFileSessionStore',
    (dir: string): ISessionStore =>
      new EnvFileSessionStore(path.join(dir, 'D.env')),
  ],
])('%s — concurrent writes on one instance', (_name, make) => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'concurrent-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies both of two writes in flight', async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: 'T0',
      refreshToken: 'R0',
      expiresAt: 1,
    });
    await Promise.all([
      store.saveSession('D', {
        authorizationToken: 'T1',
        refreshToken: 'R1',
        expiresAt: 2,
      }),
      store.saveSession('D', { expiresAt: 3 }),
    ]);
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: 'T1',
      refreshToken: 'R1',
      expiresAt: 3,
    });

    await Promise.all([
      store.saveSession('D', { authorizationToken: 'T2', expiresAt: 4 }),
      store.saveSession('D', { refreshToken: 'R2' }),
    ]);
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: 'T2',
      expiresAt: 4,
      refreshToken: 'R2',
    });
  });
});

describe('the file lock', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
    file = path.join(dir, 'D.env');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is released after the body, also when it throws', async () => {
    await withFileLock(file, () => undefined);
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
    await expect(
      withFileLock(file, () => {
        throw new Error('body failed');
      }),
    ).rejects.toThrow('body failed');
    expect(fs.existsSync(`${file}.lock`)).toBe(false);
  });

  it('runs bodies for one file one at a time', async () => {
    let inside = 0;
    let most = 0;
    const body = async () => {
      inside++;
      most = Math.max(most, inside);
      await new Promise((r) => setTimeout(r, 5));
      inside--;
    };
    await Promise.all(
      Array.from({ length: 5 }, () => withFileLock(file, body)),
    );
    expect(most).toBe(1);
  });

  it('takes over a stale lock left by a crashed holder', async () => {
    fs.writeFileSync(`${file}.lock`, '999999');
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(`${file}.lock`, old, old);
    await expect(
      withFileLock(file, () => 'done', { staleMs: 1000, waitMs: 2000 }),
    ).resolves.toBe('done');
  });

  it('gives up on a live lock after the bound, naming the file', async () => {
    fs.writeFileSync(`${file}.lock`, String(process.pid));
    const failure = await withFileLock(file, () => 'never', {
      staleMs: 60_000,
      waitMs: 150,
    }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(StorageError);
    expect((failure as Error).message).toContain('D.env');
    // the other holder's lock is not removed
    expect(fs.existsSync(`${file}.lock`)).toBe(true);
  });
});

describe('two processes writing one shared file', () => {
  let build: string;
  let dir: string;

  beforeAll(() => {
    // the children run the code under test, compiled from src
    build = fs.mkdtempSync(path.join(os.tmpdir(), 'stores-build-'));
    execFileSync(
      process.execPath,
      [
        path.join(ROOT, 'node_modules/typescript/bin/tsc'),
        '-p',
        path.join(ROOT, 'tsconfig.json'),
        '--outDir',
        build,
        '--composite',
        'false',
        '--incremental',
        'false',
        '--declaration',
        'false',
      ],
      { stdio: 'pipe' },
    );
  }, 60_000);
  afterAll(() => {
    fs.rmSync(build, { recursive: true, force: true });
  });
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'two-procs-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const CHILD = `
const S = require(process.argv[1]);
const [role, dir, n] = process.argv.slice(2);
(async () => {
  const errors = {}; let overwritten = 0;
  const s = new S.AbapSessionStore(dir), d = new S.EnvDestinationStore(dir, { fallback: undefined });
  for (let i = 0; i < +n; i++) {
    try {
      if (role === 's') await s.saveSession('D', { authorizationToken: 'T' + i, refreshToken: 'R' });
      else await d.setDestination('D', { language: 'L' + i });
      const own = role === 's'
        ? (await s.loadSession('D'))?.authorizationToken
        : (await d.getConnectionConfig('D'))?.language;
      if (own !== (role === 's' ? 'T' : 'L') + i) overwritten++;
    } catch (e) {
      const k = (e && e.constructor && e.constructor.name) + ':' + ((e && e.cause && e.cause.code) || (e && e.code) || '');
      errors[k] = (errors[k] || 0) + 1;
    }
  }
  process.stdout.write(JSON.stringify({ role, errors, overwritten }));
})();
`;

  const run = (role: string, n: number) =>
    new Promise<{ errors: Record<string, number>; overwritten: number }>(
      (resolve, reject) => {
        const child = spawn(
          process.execPath,
          ['-e', CHILD, path.join(build, 'index.js'), role, dir, String(n)],
          {
            stdio: ['ignore', 'pipe', 'inherit'],
            env: { ...process.env, NODE_PATH: path.join(ROOT, 'node_modules') },
          },
        );
        let out = '';
        child.stdout.on('data', (b) => {
          out += b;
        });
        child.on('error', reject);
        child.on('close', () => {
          try {
            resolve(JSON.parse(out));
          } catch (e) {
            reject(e);
          }
        });
      },
    );

  it('a session store and EnvDestinationStore lose no key and fail no write', async () => {
    const file = path.join(dir, 'D.env');
    const { EnvDestinationStore } = await import(
      '../../stores/destination/EnvDestinationStore'
    );
    await new EnvDestinationStore(dir).setDestination('D', {
      serviceUrl: 'https://u',
      authType: 'jwt',
      grantType: 'authorization_code',
      language: 'L',
    });
    await new AbapSessionStore(dir).saveSession('D', {
      authorizationToken: 'T',
      refreshToken: 'R',
    });

    const N = 300;
    let samples = 0;
    let lost = 0;
    let sampling = true;
    const sampler = (async () => {
      while (sampling) {
        let content = '';
        try {
          content = fs.readFileSync(file, 'utf8');
        } catch {
          // a missing file is a lost key set too
        }
        samples++;
        if (
          !/^SAP_URL=/m.test(content) ||
          !/^SAP_GRANT_TYPE=/m.test(content) ||
          !/^SAP_JWT_TOKEN=/m.test(content) ||
          !/^SAP_REFRESH_TOKEN=/m.test(content)
        )
          lost++;
        await new Promise((r) => setImmediate(r));
      }
    })();
    const results = await Promise.all([run('s', N), run('d', N)]);
    sampling = false;
    await sampler;

    for (const result of results) {
      expect(result.errors).toEqual({});
      expect(result.overwritten).toBe(0);
    }
    expect(samples).toBeGreaterThan(0);
    expect(lost).toBe(0);
    const final = fs.readFileSync(file, 'utf8');
    expect(final).toMatch(/^SAP_URL=https:\/\/u$/m);
    expect(final).toMatch(/^SAP_AUTH_TYPE=jwt$/m);
    expect(final).toMatch(/^SAP_GRANT_TYPE=authorization_code$/m);
    expect(final).toMatch(new RegExp(`^SAP_JWT_TOKEN=T${N - 1}$`, 'm'));
    expect(final).toMatch(/^SAP_REFRESH_TOKEN=R$/m);
    expect(final).toMatch(new RegExp(`^SAP_LANGUAGE=L${N - 1}$`, 'm'));
    expect(fs.readdirSync(dir).sort()).toEqual(['D.env']);
  }, 60_000);
});
