/**
 * ABAP session stores - how a write changes the session's credential.
 *
 * A session holds one credential, of one type: jwt (a token), basic (username
 * and password), saml (session cookies) or snc (the SNC fields). These tests
 * pin what each kind of write does to it, in both stores, and what the file
 * store leaves on disk.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IConfig, ISessionStore } from '@mcp-abap-adt/interfaces-auth-sap';
import { saveTokenToEnv } from '../../../storage/abap/tokenStorage';
import { AbapSessionStore } from '../../../stores/abap/AbapSessionStore';
import { SafeAbapSessionStore } from '../../../stores/abap/SafeAbapSessionStore';
import { createTestLogger } from '../../helpers/testLogger';

const URL = 'https://s';
const dest = 'dest';

const credentials = {
  jwt: { authType: 'jwt', authorizationToken: 'TOKEN' },
  basic: { authType: 'basic', username: 'USER', password: 'PASS' },
  saml: { authType: 'saml', sessionCookies: 'COOKIE=1' },
  snc: {
    authType: 'snc',
    sncPartnerName: 'p:CN=PARTNER',
    sncQop: '9',
    sncLib: '/opt/libsnc.so',
    sncMyName: 'p:CN=ME',
  },
} as const;
type Mode = keyof typeof credentials;
const modes = Object.keys(credentials) as Mode[];

/** The credential fields of every mode, as loadSession names them. */
const modeFields: Record<Mode, string[]> = {
  jwt: ['authorizationToken'],
  basic: ['username', 'password'],
  saml: ['sessionCookies'],
  snc: ['sncPartnerName', 'sncQop', 'sncLib', 'sncMyName'],
};

/** The env keys that carry a value for each mode. */
const modeKeys: Record<Mode, string[]> = {
  jwt: ['SAP_JWT_TOKEN'],
  basic: ['SAP_USERNAME', 'SAP_PASSWORD'],
  saml: ['SAP_SESSION_COOKIES_B64'],
  snc: ['SAP_SNC_PARTNERNAME', 'SAP_SNC_QOP', 'SAP_SNC_LIB', 'SAP_SNC_MYNAME'],
};

/** Keys in the file text that carry a non-empty value. */
function keysWithValue(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.match(/^([^=]+)=(.+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);
}

/** Credential fields present (non-empty) in what loadSession returned. */
function credentialFieldsOf(session: IConfig | null): string[] {
  const s = (session ?? {}) as Record<string, unknown>;
  return modes
    .flatMap((m) => modeFields[m])
    .filter((f) => s[f] !== undefined && s[f] !== '');
}

describe('ABAP session stores - credential writes', () => {
  let dir: string;
  const file = () => path.join(dir, `${dest}.env`);
  const read = () => fs.readFile(file(), 'utf8');
  const write = (lines: string[]) =>
    fs.writeFile(file(), `${lines.join('\n')}\n`, 'utf8');

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'abap-credential-'));
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const stores: [string, () => ISessionStore][] = [
    ['AbapSessionStore', () => new AbapSessionStore(dir, createTestLogger())],
    [
      'SafeAbapSessionStore',
      () => new SafeAbapSessionStore(createTestLogger()),
    ],
  ];

  describe('AbapSessionStore: a save without a credential leaves it alone', () => {
    it('a refresh-only saveSession on a 1.2.4 basic file keeps it basic', async () => {
      const store = new AbapSessionStore(dir, createTestLogger());
      // as 1.2.4 wrote it: no SAP_AUTH_TYPE
      await write(['SAP_URL=https://s', 'SAP_USERNAME=u', 'SAP_PASSWORD=p']);
      await store.saveSession(dest, { serviceUrl: URL, refreshToken: 'r' });

      expect(await store.getConnectionConfig(dest)).toMatchObject({
        authType: 'basic',
        username: 'u',
        password: 'p',
      });
      const text = await read();
      expect(text).not.toContain('SAP_AUTH_TYPE');
      expect(text).toContain('SAP_REFRESH_TOKEN=r');
    });

    it('a refresh-only saveSession on an snc session keeps it snc with its fields', async () => {
      const store = new AbapSessionStore(dir, createTestLogger());
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        ...credentials.snc,
      });
      await store.saveSession(dest, { serviceUrl: URL, refreshToken: 'r' });

      const { authType: _t, ...sncFields } = credentials.snc;
      expect(await store.getConnectionConfig(dest)).toMatchObject({
        authType: 'snc',
        ...sncFields,
      });
      expect(await read()).toContain('SAP_AUTH_TYPE=snc');
    });
  });

  describe('AbapSessionStore: a mode change clears the other modes on disk', () => {
    const transitions = modes.flatMap((from) =>
      modes.filter((to) => to !== from).map((to) => [from, to] as const),
    );

    it.each(transitions)('%s -> %s', async (from, to) => {
      const store = new AbapSessionStore(dir, createTestLogger());
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        ...credentials[from],
      });
      await store.setConnectionConfig(dest, { ...credentials[to] });

      const text = await read();
      const others = modes.filter((m) => m !== to).flatMap((m) => modeKeys[m]);
      const withValue = keysWithValue(text);
      expect(withValue.filter((k) => others.includes(k))).toEqual([]);
      expect(withValue).toEqual(expect.arrayContaining(modeKeys[to]));
      expect(text).toContain(`SAP_AUTH_TYPE=${to}\n`);
    });
  });

  describe.each(stores)('%s', (_name, makeStore) => {
    let store: ISessionStore;
    beforeEach(() => {
      store = makeStore();
    });

    it('a password-only update keeps basic with the new password and the old username', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        ...credentials.basic,
      });
      await store.setConnectionConfig(dest, { password: 'P2' });

      expect(await store.getConnectionConfig(dest)).toMatchObject({
        authType: 'basic',
        username: 'USER',
        password: 'P2',
      });
    });

    it('an sncQop-only update keeps snc with the new qop', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        ...credentials.snc,
      });
      await store.setConnectionConfig(dest, { sncQop: '3' });

      expect(await store.getConnectionConfig(dest)).toMatchObject({
        authType: 'snc',
        sncPartnerName: 'p:CN=PARTNER',
        sncQop: '3',
        sncLib: '/opt/libsnc.so',
        sncMyName: 'p:CN=ME',
      });
    });

    it('basic -> jwt -> saml -> jwt leaves only the jwt fields in loadSession', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        ...credentials.basic,
      });
      await store.setConnectionConfig(dest, { ...credentials.jwt });
      await store.setConnectionConfig(dest, { ...credentials.saml });
      await store.setConnectionConfig(dest, {
        authType: 'jwt',
        authorizationToken: 'TOKEN2',
      });

      const session = await store.loadSession(dest);
      expect(session?.authType).toBe('jwt');
      expect(credentialFieldsOf(session)).toEqual(['authorizationToken']);
      expect(session?.authorizationToken).toBe('TOKEN2');
    });

    it.each(modes)(
      'a switch to %s leaves only its fields in loadSession',
      async (to) => {
        for (const from of modes.filter((m) => m !== to)) {
          await store.setConnectionConfig(dest, {
            serviceUrl: URL,
            ...credentials[from],
          });
          await store.setConnectionConfig(dest, { ...credentials[to] });
          const session = await store.loadSession(dest);
          expect([from, session?.authType]).toEqual([from, to]);
          expect([from, credentialFieldsOf(session)]).toEqual([
            from,
            modeFields[to],
          ]);
        }
      },
    );

    it('a declared jwt update with an empty token clears the token', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        ...credentials.jwt,
      });
      await store.setConnectionConfig(dest, {
        authType: 'jwt',
        authorizationToken: '',
      });
      expect(await store.getConnectionConfig(dest)).toBeNull();
    });

    it.each([
      ['jwt', { authorizationToken: '' }, 'authorizationToken', []],
      ['basic', { password: '' }, 'password', ['username']],
      ['saml', { sessionCookies: '' }, 'sessionCookies', []],
      [
        'snc',
        { sncQop: '' },
        'sncQop',
        ['sncPartnerName', 'sncLib', 'sncMyName'],
      ],
    ] as const)(
      'without a declared type, an empty %s field clears it',
      async (mode, update, field, kept) => {
        await store.setConnectionConfig(dest, {
          serviceUrl: URL,
          ...credentials[mode],
        });
        await store.setConnectionConfig(dest, { ...update });
        const session = await store.loadSession(dest);
        const present = credentialFieldsOf(session);
        expect(present).not.toContain(field);
        expect(present).toEqual(expect.arrayContaining([...kept]));
        expect(session?.authType).toBe(mode);
      },
    );

    it('without a declared type, a save carrying two credentials is refused', async () => {
      const saved = expect(
        store.saveSession(dest, {
          serviceUrl: URL,
          authorizationToken: 'TOKEN',
          username: 'USER',
          password: 'PASS',
        }),
      ).rejects.toThrow('carries more than one credential (jwt, basic)');
      await saved;
      expect(await store.getConnectionConfig(dest)).toBeNull();
    });

    it('without a declared type, an update carrying two credentials is refused and changes nothing', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        authorizationToken: 'TOKEN',
        authType: 'jwt',
      });
      const updated = expect(
        store.setConnectionConfig(dest, {
          serviceUrl: URL,
          sessionCookies: 'C=1',
          username: 'USER',
          password: 'PASS',
        }),
      ).rejects.toThrow('carries more than one credential (saml, basic)');
      await updated;
      const conn = await store.getConnectionConfig(dest);
      expect(conn?.authType).toBe('jwt');
      expect(conn?.authorizationToken).toBe('TOKEN');
    });

    it('a declared type takes its own credential from a config carrying two', async () => {
      await store.saveSession(dest, {
        serviceUrl: URL,
        authorizationToken: 'TOKEN',
        username: 'USER',
        password: 'PASS',
        authType: 'basic',
      });
      const conn = await store.getConnectionConfig(dest);
      expect(conn?.authType).toBe('basic');
      expect(conn?.username).toBe('USER');
      expect(conn?.authorizationToken).toBeFalsy();
    });

    it('sncPartnerName without authType is not snc', async () => {
      await store.saveSession(dest, {
        serviceUrl: URL,
        authorizationToken: 'TOKEN',
        sncPartnerName: 'p:CN=PARTNER',
      });
      const conn = await store.getConnectionConfig(dest);
      expect(conn?.authType).toBe('jwt');
      expect(conn?.sncPartnerName).toBeUndefined();
      expect((await store.loadSession(dest))?.sncPartnerName).toBeUndefined();
    });

    it('an SNC-only update without authType does not turn a jwt session into snc', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        ...credentials.jwt,
      });
      await store.setConnectionConfig(dest, { sncPartnerName: 'p:CN=PARTNER' });
      const conn = await store.getConnectionConfig(dest);
      expect(conn?.authType).toBe('jwt');
      expect(conn?.authorizationToken).toBe('TOKEN');
      expect((await store.loadSession(dest))?.sncPartnerName).toBeUndefined();
    });

    it('setAuthorizationConfig keeps username and password', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        ...credentials.basic,
      });
      await store.setAuthorizationConfig(dest, {
        uaaUrl: 'https://uaa',
        uaaClientId: 'id',
        uaaClientSecret: 'secret',
      });
      expect(await store.getConnectionConfig(dest)).toMatchObject({
        authType: 'basic',
        username: 'USER',
        password: 'PASS',
      });
      expect(await store.loadSession(dest)).toMatchObject({
        username: 'USER',
        password: 'PASS',
        uaaUrl: 'https://uaa',
      });
    });
  });

  describe('SNC is never inferred', () => {
    it('AbapSessionStore: a file with SAP_SNC_PARTNERNAME and no SAP_AUTH_TYPE is not snc', async () => {
      const store = new AbapSessionStore(dir, createTestLogger());
      await write(['SAP_URL=https://s', 'SAP_SNC_PARTNERNAME=p:CN=X']);
      expect(await store.getConnectionConfig(dest)).toBeNull();
      expect((await store.loadSession(dest))?.sncPartnerName).toBeUndefined();
    });

    it('SafeAbapSessionStore: sncPartnerName alone is not a credential', async () => {
      const store = new SafeAbapSessionStore(createTestLogger());
      await expect(
        store.saveSession(dest, { serviceUrl: URL, sncPartnerName: 'p:CN=X' }),
      ).rejects.toThrow('missing required field');
    });

    it('AbapSessionStore: a new session with sncPartnerName and no authType is not snc', async () => {
      const store = new AbapSessionStore(dir, createTestLogger());
      await store.setConnectionConfig(dest, {
        serviceUrl: URL,
        sncPartnerName: 'p:CN=X',
      });
      expect(await read()).not.toContain('SAP_SNC_');
      expect(await store.getConnectionConfig(dest)).toBeNull();
    });

    it('tokenStorage: sncPartnerName alone writes no SNC keys and no type', async () => {
      await saveTokenToEnv(dest, dir, {
        sapUrl: URL,
        sncPartnerName: 'p:CN=X',
      });
      const text = await read();
      expect(text).not.toContain('SAP_SNC_');
      expect(text).not.toContain('SAP_AUTH_TYPE');
    });

    it('tokenStorage: sncPartnerName without authType writes no SNC keys', async () => {
      await saveTokenToEnv(dest, dir, {
        sapUrl: URL,
        jwtToken: 'TOKEN',
        sncPartnerName: 'p:CN=X',
      });
      const text = await read();
      expect(text).not.toContain('SAP_SNC_');
      expect(text).toContain('SAP_AUTH_TYPE=jwt');
    });
  });
});
