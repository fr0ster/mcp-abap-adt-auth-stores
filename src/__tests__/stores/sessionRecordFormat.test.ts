/**
 * A file session store validates its record against its own format (5.0.0).
 *
 * The store is the only one with access to the stored record, so it decides
 * whether the record is its own. The format is what `writeFileSecret` always
 * writes:
 *
 * - a token or cookies, never both;
 * - beside a token or cookies, both binding keys — present even when empty;
 * - `expiresAt`, when present, decimal epoch milliseconds;
 * - cookies, when present, the writer's base64.
 *
 * A record not of it is refused as a whole — `StorageError`, reason
 * `record-format`, fixed words naming the store and the destination, nothing
 * answered. A file with no token and no cookies is no credential to bind: no
 * session, or its refresh token alone. A write of a new credential replaces a
 * malformed record; any other write onto one is refused and leaves it byte for
 * byte. Whether a written binding matches the destination stays the broker's.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { STORE_ERROR_CODES } from '@mcp-abap-adt/interfaces-auth';
import type { ISessionStore } from '@mcp-abap-adt/interfaces-auth-broker';
import * as dotenv from 'dotenv';
import { StorageError } from '../../errors/StoreErrors';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.SECRET-ACCESS-tok.sig';
const REFRESH = 'SECRET-REFRESH-r';
const COOKIES = 'SAP_SESSIONID_X=SECRET-COOKIE; sap-usercontext=c';
const FOR = 'https://SENTINEL-for.example:443/sap/bc/adt?sap-client=100';
const BY = 'https://SENTINEL-by.example:443?client_id=SENTINEL-client';
const MEANS_URL = 'https://SENTINEL-means.example/sap/bc/adt';

interface Variant {
  name: string;
  make: (dir: string) => ISessionStore;
  url: string;
  token: string;
  cookies?: string;
  expiresAt: string;
  refresh: string;
  issuedFor: string;
  issuedBy: string;
}

const VARIANTS: Variant[] = [
  {
    name: 'AbapSessionStore',
    make: (dir) => new AbapSessionStore(dir),
    url: 'SAP_URL',
    token: 'SAP_JWT_TOKEN',
    cookies: 'SAP_SESSION_COOKIES_B64',
    expiresAt: 'SAP_EXPIRES_AT',
    refresh: 'SAP_REFRESH_TOKEN',
    issuedFor: 'SAP_ISSUED_FOR',
    issuedBy: 'SAP_ISSUED_BY',
  },
  {
    name: 'EnvFileSessionStore',
    make: (dir) => new EnvFileSessionStore(path.join(dir, 'D.env')),
    url: 'SAP_URL',
    token: 'SAP_JWT_TOKEN',
    cookies: 'SAP_SESSION_COOKIES_B64',
    expiresAt: 'SAP_EXPIRES_AT',
    refresh: 'SAP_REFRESH_TOKEN',
    issuedFor: 'SAP_ISSUED_FOR',
    issuedBy: 'SAP_ISSUED_BY',
  },
  {
    name: 'XsuaaSessionStore',
    make: (dir) => new XsuaaSessionStore(dir),
    url: 'XSUAA_MCP_URL',
    token: 'XSUAA_JWT_TOKEN',
    expiresAt: 'XSUAA_EXPIRES_AT',
    refresh: 'XSUAA_REFRESH_TOKEN',
    issuedFor: 'XSUAA_ISSUED_FOR',
    issuedBy: 'XSUAA_ISSUED_BY',
  },
];

describe.each(VARIANTS)('$name — the record format', (v) => {
  let dir: string;
  let file: string;
  const write = (lines: string[]) => {
    const content = [...lines, ''].join('\n');
    fs.writeFileSync(file, content);
    return content;
  };
  const means = () => [`${v.url}=${MEANS_URL}`];
  const encoded = Buffer.from(COOKIES).toString('base64');

  /** What a refused read must look like: the error, and no value of the record. */
  const expectRefused = (failure: unknown) => {
    expect(failure).toBeInstanceOf(StorageError);
    const error = failure as StorageError;
    expect(error.code).toBe(STORE_ERROR_CODES.STORAGE_ERROR);
    expect(error.reason).toBe('record-format');
    expect(error.message).toBe(
      `${v.name}: the stored session for "D" is not in this store's format; regenerate it with mcp-auth`,
    );
    for (const text of [error.message, String(error)]) {
      expect(text).not.toContain('SECRET');
      expect(text).not.toContain('SENTINEL');
      expect(text).not.toContain(dir);
    }
  };
  const refusedReads = async (store: ISessionStore) => {
    for (const read of [
      () => store.loadSession('D'),
      () => store.getConnectionConfig('D'),
    ]) {
      expectRefused(await read().catch((e: unknown) => e));
    }
  };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-format-'));
    file = path.join(dir, 'D.env');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe('accepted', () => {
    it('a token with both binding keys written empty: no binding', async () => {
      write([
        ...means(),
        `${v.token}=${TOKEN}`,
        `${v.issuedFor}=`,
        `${v.issuedBy}=`,
      ]);
      expect(await v.make(dir).loadSession('D')).toEqual({
        authorizationToken: TOKEN,
      });
    });

    it('a token with both binding keys written: answered as written', async () => {
      write([
        ...means(),
        `${v.token}=${TOKEN}`,
        `${v.issuedFor}=${FOR}`,
        `${v.issuedBy}=${BY}`,
        `${v.expiresAt}=1900000000000`,
        `${v.refresh}=${REFRESH}`,
      ]);
      expect(await v.make(dir).loadSession('D')).toEqual({
        authorizationToken: TOKEN,
        issuedFor: FOR,
        issuedBy: BY,
        expiresAt: 1_900_000_000_000,
        refreshToken: REFRESH,
      });
    });

    it('what the store writes reads back', async () => {
      const store = v.make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        expiresAt: 1_900_000_000_000,
      });
      expect(await store.loadSession('D')).toEqual({
        authorizationToken: TOKEN,
        expiresAt: 1_900_000_000_000,
      });
    });

    if (v.cookies) {
      const cookies = v.cookies;
      it('cookies with both binding keys written empty', async () => {
        write([`${cookies}=${encoded}`, `${v.issuedFor}=`, `${v.issuedBy}=`]);
        expect(await v.make(dir).loadSession('D')).toEqual({
          sessionCookies: COOKIES,
        });
      });
    }
  });

  describe('no credential: no session, no error', () => {
    it('a file holding only the means', async () => {
      write(means());
      const store = v.make(dir);
      expect(await store.loadSession('D')).toBeNull();
      expect(await store.getConnectionConfig('D')).toBeNull();
    });

    it('empty placeholders of the credential keys', async () => {
      write([...means(), `${v.token}=`, `${v.refresh}=`, `${v.expiresAt}=`]);
      expect(await v.make(dir).loadSession('D')).toBeNull();
    });

    it('a refresh token alone needs no binding keys: none is bound', async () => {
      write([...means(), `${v.refresh}=${REFRESH}`]);
      expect(await v.make(dir).loadSession('D')).toEqual({
        refreshToken: REFRESH,
      });
    });
  });

  describe('refused as a whole', () => {
    it.each([
      ['issuedFor missing', (_f: string, b: string) => [b]],
      ['issuedBy missing', (f: string) => [f]],
      ['both missing', () => []],
    ])('a token with %s', async (_case, keys) => {
      write([
        ...means(),
        `${v.token}=${TOKEN}`,
        `${v.refresh}=${REFRESH}`,
        ...keys(`${v.issuedFor}=${FOR}`, `${v.issuedBy}=${BY}`),
      ]);
      await refusedReads(v.make(dir));
    });

    it('a malformed expiresAt', async () => {
      for (const expiry of ['soon', '-1', '1e12', '12.5', '9007199254740993']) {
        write([
          `${v.token}=${TOKEN}`,
          `${v.issuedFor}=${FOR}`,
          `${v.issuedBy}=${BY}`,
          `${v.expiresAt}=${expiry}`,
        ]);
        await refusedReads(v.make(dir));
      }
    });

    if (v.cookies) {
      const cookies = v.cookies;
      it('cookies with one binding key only', async () => {
        write([`${cookies}=${encoded}`, `${v.issuedFor}=${FOR}`]);
        await refusedReads(v.make(dir));
      });

      it('a token and cookies at once', async () => {
        write([
          `${v.token}=${TOKEN}`,
          `${cookies}=${encoded}`,
          `${v.issuedFor}=`,
          `${v.issuedBy}=`,
        ]);
        await refusedReads(v.make(dir));
      });

      it('cookies not in the writer’s base64', async () => {
        write([
          `${cookies}=SECRET-COOKIE-not*base64`,
          `${v.issuedFor}=`,
          `${v.issuedBy}=`,
        ]);
        await refusedReads(v.make(dir));
      });
    }
  });

  describe('a write onto a malformed record', () => {
    const malformed = () =>
      write([
        ...means(),
        '# a comment',
        `${v.token}=${TOKEN}`,
        `${v.refresh}=${REFRESH}`,
        `${v.expiresAt}=1800000000000`,
      ]);

    it('a new credential replaces it whole; the means stay; nothing of it is carried', async () => {
      malformed();
      const store = v.make(dir);
      await store.saveSession('D', {
        authorizationToken: 'new-token',
        expiresAt: 1_900_000_000_000,
        issuedFor: FOR,
        issuedBy: BY,
      });
      expect(await store.loadSession('D')).toEqual({
        authorizationToken: 'new-token',
        expiresAt: 1_900_000_000_000,
        issuedFor: FOR,
        issuedBy: BY,
      });
      const vars = dotenv.parse(fs.readFileSync(file, 'utf8'));
      expect(vars[v.url]).toBe(MEANS_URL);
      expect(vars[v.refresh]).toBeUndefined();
      expect(fs.readFileSync(file, 'utf8')).toContain('# a comment\n');
    });

    it('deleteSession removes it', async () => {
      malformed();
      const store = v.make(dir);
      await store.deleteSession?.('D');
      expect(await store.loadSession('D')).toBeNull();
      expect(dotenv.parse(fs.readFileSync(file, 'utf8'))[v.url]).toBe(
        MEANS_URL,
      );
    });

    it.each([
      ['expiresAt alone', { expiresAt: 1_900_000_000_000 }],
      ['a refresh token alone', { refreshToken: 'new-refresh' }],
      ['clearing the refresh token', { refreshToken: '' }],
      ['a binding alone', { issuedFor: FOR, issuedBy: BY }],
      ['clearing the token', { authorizationToken: '' }],
    ])(
      '%s is refused, the record left byte for byte',
      async (_case, partial) => {
        const before = malformed();
        const store = v.make(dir);
        expectRefused(
          await store.saveSession('D', partial).catch((e: unknown) => e),
        );
        expect(fs.readFileSync(file, 'utf8')).toBe(before);
      },
    );
  });
});
