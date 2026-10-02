/**
 * A session store keeps what the secret is bound to, with the secret (3.1.0).
 *
 * `issuedFor` — the resource the secret was obtained for — and `issuedBy` — who
 * issued it, to which client — are kept beside the credential: written with
 * it, cleared with it, answered only while it is held. The store keeps the
 * strings as given; it neither canonicalises nor judges them (the broker
 * does, on both sides). The rules extend the secret's own:
 *
 * - a new credential (a token or cookies) takes the binding its write gives —
 *   given without one of them, that one is cleared;
 * - with no new credential, a binding field given sets it, `''` clears it,
 *   absent (`undefined`) keeps it;
 * - with no credential held, no binding is kept or answered.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ISessionStore } from '@mcp-abap-adt/interfaces-auth-broker';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import * as dotenv from 'dotenv';
import { AbapServiceKeyStore } from '../../stores/abap/AbapServiceKeyStore';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { SafeAbapSessionStore } from '../../stores/abap/SafeAbapSessionStore';
import {
  ABAP_DESTINATION_VARS,
  type DestinationVariables,
  EnvDestinationStore,
  XSUAA_DESTINATION_VARS,
} from '../../stores/destination/EnvDestinationStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { SafeXsuaaSessionStore } from '../../stores/xsuaa/SafeXsuaaSessionStore';
import { XsuaaServiceKeyStore } from '../../stores/xsuaa/XsuaaServiceKeyStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.SECRET-ACCESS.sig';
const REFRESH = 'SECRET-REFRESH-r';
const COOKIES = 'SAP_SESSIONID_X=SECRET-COOKIE; sap-usercontext=c';
const EXPIRES = 1_900_000_000_000;
const FOR = 'https://SENTINEL-for.example:443/sap/bc/adt?sap-client=100';
const BY = 'https://SENTINEL-by.example:443?client_id=SENTINEL-client';
const FOR_2 = 'https://SENTINEL-other.example:443?sap-client=200';
const BY_2 = 'https://SENTINEL-by-2.example:443?client_id=SENTINEL-client-2';

interface Variant {
  name: string;
  make: (dir: string, log?: ILogger) => ISessionStore;
  tokenOnly: boolean;
  /** The file's binding keys, for the file stores. */
  keys?: { issuedFor: string; issuedBy: string };
}

const VARIANTS: Variant[] = [
  {
    name: 'AbapSessionStore',
    make: (dir, log) => new AbapSessionStore(dir, log),
    tokenOnly: false,
    keys: { issuedFor: 'SAP_ISSUED_FOR', issuedBy: 'SAP_ISSUED_BY' },
  },
  {
    name: 'SafeAbapSessionStore',
    make: (_dir, log) => new SafeAbapSessionStore(log),
    tokenOnly: false,
  },
  {
    name: 'XsuaaSessionStore',
    make: (dir, log) => new XsuaaSessionStore(dir, log),
    tokenOnly: true,
    keys: { issuedFor: 'XSUAA_ISSUED_FOR', issuedBy: 'XSUAA_ISSUED_BY' },
  },
  {
    name: 'SafeXsuaaSessionStore',
    make: (_dir, log) => new SafeXsuaaSessionStore(log),
    tokenOnly: true,
  },
  {
    name: 'EnvFileSessionStore',
    make: (dir, log) => new EnvFileSessionStore(path.join(dir, 'D.env'), log),
    tokenOnly: false,
    keys: { issuedFor: 'SAP_ISSUED_FOR', issuedBy: 'SAP_ISSUED_BY' },
  },
];

const readVars = (file: string): Record<string, string> =>
  dotenv.parse(fs.readFileSync(file, 'utf8'));

describe.each(VARIANTS)('$name — the binding', ({ make, tokenOnly, keys }) => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-binding-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('keeps issuedFor and issuedBy written with a token', async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      expiresAt: EXPIRES,
      refreshToken: REFRESH,
      issuedFor: FOR,
      issuedBy: BY,
    });

    expect(await store.loadSession('D')).toEqual({
      authorizationToken: TOKEN,
      expiresAt: EXPIRES,
      refreshToken: REFRESH,
      issuedFor: FOR,
      issuedBy: BY,
    });
    expect(await store.getConnectionConfig('D')).toEqual({
      authorizationToken: TOKEN,
      expiresAt: EXPIRES,
      issuedFor: FOR,
      issuedBy: BY,
    });
  });

  it('keeps them through setConnectionConfig too', async () => {
    const store = make(dir);
    await store.setConnectionConfig('D', {
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
  });

  it('a new token without issuedFor clears the stored issuedFor alone', async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
    await store.saveSession('D', {
      authorizationToken: `${TOKEN}-2`,
      issuedBy: BY_2,
    });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: `${TOKEN}-2`,
      issuedBy: BY_2,
    });
  });

  it('a new token without issuedBy clears the stored issuedBy alone', async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
    await store.saveSession('D', {
      authorizationToken: `${TOKEN}-2`,
      issuedFor: FOR_2,
    });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: `${TOKEN}-2`,
      issuedFor: FOR_2,
    });
  });

  it('a new token given with neither clears both', async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
    await store.saveSession('D', { authorizationToken: `${TOKEN}-2` });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: `${TOKEN}-2`,
    });
  });

  it('a write with no new credential keeps the binding (undefined keeps)', async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
    await store.saveSession('D', { refreshToken: REFRESH });
    await store.saveSession('D', { expiresAt: EXPIRES });
    await store.saveSession('D', {
      refreshToken: undefined,
      issuedFor: undefined,
    });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: TOKEN,
      expiresAt: EXPIRES,
      refreshToken: REFRESH,
      issuedFor: FOR,
      issuedBy: BY,
    });
  });

  it("with no new credential, a binding field given sets it and '' clears it", async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
    await store.saveSession('D', { issuedFor: FOR_2 });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: TOKEN,
      issuedFor: FOR_2,
      issuedBy: BY,
    });
    await store.saveSession('D', { issuedBy: '' });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: TOKEN,
      issuedFor: FOR_2,
    });
    await store.saveSession('D', { issuedFor: '' });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: TOKEN,
    });
  });

  it("'' given with a new token clears, like absent", async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
    await store.saveSession('D', {
      authorizationToken: `${TOKEN}-2`,
      issuedFor: '',
      issuedBy: '',
    });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: `${TOKEN}-2`,
    });
  });

  it('deleteSession clears the binding with the secret', async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      issuedFor: FOR,
      issuedBy: BY,
    });
    await store.deleteSession?.('D');
    expect(await store.loadSession('D')).toBeNull();
    await store.saveSession('D', { authorizationToken: `${TOKEN}-2` });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: `${TOKEN}-2`,
    });
  });

  it('refuses a binding that is not a string, naming the field and no value', async () => {
    const store = make(dir);
    for (const field of ['issuedFor', 'issuedBy'] as const) {
      const failure = await store
        .saveSession('D', {
          authorizationToken: TOKEN,
          [field]: { url: 'https://SENTINEL.example' },
        })
        .catch((e: unknown) => e);
      const error = failure as Error & { missingFields?: string[] };
      expect(error).toBeInstanceOf(Error);
      expect(error.missingFields).toEqual([field]);
      expect(error.message).toContain(field);
      expect(error.message).not.toContain('SENTINEL');
      expect(error.message).not.toContain('SECRET');
    }
    expect(await store.loadSession('D')).toBeNull();
  });

  it('writes no binding value and no secret to the log', async () => {
    const lines: string[] = [];
    const record = (m: unknown, meta?: unknown) => {
      lines.push(
        `${String(m)} ${meta === undefined ? '' : JSON.stringify(meta)}`,
      );
    };
    const log: ILogger = {
      debug: record,
      info: record,
      warn: record,
      error: record,
    };
    const store = make(dir, log);
    await store.saveSession('D', {
      authorizationToken: TOKEN,
      refreshToken: REFRESH,
      issuedFor: FOR,
      issuedBy: BY,
    });
    await store.loadSession('D');
    await store.getConnectionConfig('D');
    await store.saveSession('D', { issuedFor: FOR_2 });
    const all = lines.join('\n');
    expect(all).not.toContain('SENTINEL');
    expect(all).not.toContain('SECRET');
  });

  if (tokenOnly) {
    it('a binding with no token is refused, as any session without a token', async () => {
      const store = make(dir);
      await expect(
        store.saveSession('D', { issuedFor: FOR, issuedBy: BY }),
      ).rejects.toThrow(/authorizationToken/);
      expect(await store.loadSession('D')).toBeNull();
    });
  } else {
    it('keeps issuedFor and issuedBy written with cookies', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        sessionCookies: COOKIES,
        expiresAt: EXPIRES,
        issuedFor: FOR,
        issuedBy: BY,
      });
      expect(await store.loadSession('D')).toEqual({
        sessionCookies: COOKIES,
        expiresAt: EXPIRES,
        issuedFor: FOR,
        issuedBy: BY,
      });
    });

    it('cookies after a token are a new credential: the old binding goes', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        issuedFor: FOR,
        issuedBy: BY,
      });
      await store.saveSession('D', { sessionCookies: COOKIES });
      expect(await store.loadSession('D')).toEqual({
        sessionCookies: COOKIES,
      });
    });

    it('clearing the credential clears the binding; the refresh token stays', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        refreshToken: REFRESH,
        issuedFor: FOR,
        issuedBy: BY,
      });
      await store.saveSession('D', { authorizationToken: '' });
      expect(await store.loadSession('D')).toEqual({ refreshToken: REFRESH });
      // and a new token later does not bring the old binding back
      await store.saveSession('D', { authorizationToken: `${TOKEN}-2` });
      expect(await store.loadSession('D')).toEqual({
        authorizationToken: `${TOKEN}-2`,
        refreshToken: REFRESH,
      });
    });

    it('clearing the kind not held keeps the credential and its binding', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        sessionCookies: COOKIES,
        issuedFor: FOR,
        issuedBy: BY,
      });
      await store.saveSession('D', { authorizationToken: '' });
      expect(await store.loadSession('D')).toEqual({
        sessionCookies: COOKIES,
        issuedFor: FOR,
        issuedBy: BY,
      });
    });

    it('a binding with no credential held is not kept', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        refreshToken: REFRESH,
        issuedFor: FOR,
        issuedBy: BY,
      });
      expect(await store.loadSession('D')).toEqual({ refreshToken: REFRESH });
      await store.saveSession('D', { authorizationToken: TOKEN });
      expect(await store.loadSession('D')).toEqual({
        authorizationToken: TOKEN,
        refreshToken: REFRESH,
      });
    });
  }

  if (keys) {
    it(`writes ${keys.issuedFor} and ${keys.issuedBy}`, async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        issuedFor: FOR,
        issuedBy: BY,
      });
      const vars = readVars(path.join(dir, 'D.env'));
      expect(vars[keys.issuedFor]).toBe(FOR);
      expect(vars[keys.issuedBy]).toBe(BY);
    });

    it('a credential written without a binding writes both keys empty', async () => {
      const store = make(dir);
      await store.saveSession('D', { authorizationToken: TOKEN });
      const vars = readVars(path.join(dir, 'D.env'));
      expect(vars[keys.issuedFor]).toBe('');
      expect(vars[keys.issuedBy]).toBe('');
    });

    it('deleteSession removes both keys, and the file when nothing else is left', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        issuedFor: FOR,
        issuedBy: BY,
      });
      await store.deleteSession?.('D');
      expect(fs.existsSync(path.join(dir, 'D.env'))).toBe(false);
    });
  }
});

describe('the key stores never answer a binding', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'key-binding-'));
    fs.writeFileSync(
      path.join(dir, 'D.json'),
      JSON.stringify({
        uaa: {
          url: 'https://uaa.example',
          clientid: 'client',
          clientsecret: 'secret',
        },
        url: 'https://uaa.example',
        clientid: 'client',
        clientsecret: 'secret',
        abap: { url: 'https://h.abap.example', client: '100' },
        issuedFor: FOR,
        issuedBy: BY,
      }),
    );
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each([
    ['AbapServiceKeyStore', (d: string) => new AbapServiceKeyStore(d)],
    ['XsuaaServiceKeyStore', (d: string) => new XsuaaServiceKeyStore(d)],
  ])('%s', async (_name, make) => {
    const store = make(dir);
    for (const answer of [
      await store.getConnectionConfig('D'),
      await store.getServiceKey('D'),
    ]) {
      expect(answer).not.toHaveProperty('issuedFor');
      expect(answer).not.toHaveProperty('issuedBy');
    }
  });

  it('EnvDestinationStore refuses them as secret fields, naming them and no value', async () => {
    const store = new EnvDestinationStore(dir);
    const failure = await store
      .setDestination('D', {
        serviceUrl: 'https://h.example',
        issuedFor: FOR,
        issuedBy: BY,
      } as never)
      .catch((e: unknown) => e);
    const error = failure as Error & { fields?: string[] };
    expect(error).toBeInstanceOf(Error);
    expect(error.fields).toEqual(['issuedBy', 'issuedFor']);
    expect(error.message).not.toContain('SENTINEL');
    expect(fs.existsSync(path.join(dir, 'D.env'))).toBe(false);
  });

  it('EnvDestinationStore answers none from a file that holds them', async () => {
    fs.writeFileSync(
      path.join(dir, 'D.env'),
      [
        'SAP_URL=https://h.example',
        'SAP_AUTH_TYPE=jwt',
        'SAP_JWT_TOKEN=tok',
        `SAP_ISSUED_FOR=${FOR}`,
        `SAP_ISSUED_BY=${BY}`,
        '',
      ].join('\n'),
    );
    const store = new EnvDestinationStore(dir);
    const answer = await store.getServiceKey('D');
    expect(answer).not.toHaveProperty('issuedFor');
    expect(answer).not.toHaveProperty('issuedBy');
    expect(answer?.serviceUrl).toBe('https://h.example');
  });
});

interface LegacyVariant {
  name: string;
  make: (dir: string) => ISessionStore;
  /** The destination keys a legacy file holds the URL and client under. */
  url: string;
  client: string;
  uaaUrl: string;
  uaaClientId: string;
  token: string;
  issuedForKey: string;
  issuedByKey: string;
  variables: DestinationVariables;
}

const LEGACY: LegacyVariant[] = [
  {
    name: 'AbapSessionStore',
    make: (dir) => new AbapSessionStore(dir),
    url: 'SAP_URL',
    client: 'SAP_CLIENT',
    uaaUrl: 'SAP_UAA_URL',
    uaaClientId: 'SAP_UAA_CLIENT_ID',
    token: 'SAP_JWT_TOKEN',
    issuedForKey: 'SAP_ISSUED_FOR',
    issuedByKey: 'SAP_ISSUED_BY',
    variables: ABAP_DESTINATION_VARS,
  },
  {
    name: 'EnvFileSessionStore',
    make: (dir) => new EnvFileSessionStore(path.join(dir, 'D.env')),
    url: 'SAP_URL',
    client: 'SAP_CLIENT',
    uaaUrl: 'SAP_UAA_URL',
    uaaClientId: 'SAP_UAA_CLIENT_ID',
    token: 'SAP_JWT_TOKEN',
    issuedForKey: 'SAP_ISSUED_FOR',
    issuedByKey: 'SAP_ISSUED_BY',
    variables: ABAP_DESTINATION_VARS,
  },
  {
    name: 'XsuaaSessionStore',
    make: (dir) => new XsuaaSessionStore(dir),
    url: 'XSUAA_MCP_URL',
    client: 'XSUAA_CLIENT',
    uaaUrl: 'XSUAA_UAA_URL',
    uaaClientId: 'XSUAA_UAA_CLIENT_ID',
    token: 'XSUAA_JWT_TOKEN',
    issuedForKey: 'XSUAA_ISSUED_FOR',
    issuedByKey: 'XSUAA_ISSUED_BY',
    variables: XSUAA_DESTINATION_VARS,
  },
];

describe.each(LEGACY)('$name — a legacy file (no binding keys)', (v) => {
  let dir: string;
  let file: string;
  const write = (lines: string[]) =>
    fs.writeFileSync(file, [...lines, ''].join('\n'));
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-legacy-'));
    file = path.join(dir, 'D.env');
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('answers issuedFor from the URL with the client, issuedBy from the UAA URL with the client id', async () => {
    write([
      `${v.url}=https://legacy.example/sap/bc/adt`,
      `${v.client}=100`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
    ]);
    const session = await v.make(dir).loadSession('D');
    expect(session?.issuedFor).toBe(
      'https://legacy.example/sap/bc/adt?sap-client=100',
    );
    expect(session?.issuedBy).toBe('https://uaa.example?client_id=client');
  });

  it('answers the URL alone as issuedFor when no client is stated', async () => {
    write([
      `${v.url}=https://legacy.example`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
    ]);
    const session = await v.make(dir).loadSession('D');
    expect(session?.issuedFor).toBe('https://legacy.example');
  });

  it('composes, never canonicalises: case, port and trailing / stay as written', async () => {
    write([
      `${v.url}=HTTPS://Legacy.Example:443/sap/`,
      `${v.client}=100`,
      `${v.uaaUrl}=https://UAA.example/`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
    ]);
    const session = await v.make(dir).loadSession('D');
    expect(session?.issuedFor).toBe(
      'HTTPS://Legacy.Example:443/sap/?sap-client=100',
    );
    expect(session?.issuedBy).toBe('https://UAA.example/?client_id=client');
  });

  it('appends to a query the URL already has, and encodes the values', async () => {
    write([
      `${v.url}=https://legacy.example/p?x=1`,
      `${v.client}=100`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=sb-a+b|c!t1`,
      `${v.token}=old-token`,
    ]);
    const session = await v.make(dir).loadSession('D');
    expect(session?.issuedFor).toBe(
      'https://legacy.example/p?x=1&sap-client=100',
    );
    expect(session?.issuedBy).toBe(
      'https://uaa.example?client_id=sb-a%2Bb%7Cc!t1',
    );
  });

  it('answers no issuedBy without the client id, and none without the UAA URL', async () => {
    write([
      `${v.url}=https://legacy.example`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.token}=old-token`,
    ]);
    expect(await v.make(dir).loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedFor: 'https://legacy.example',
    });
    write([
      `${v.url}=https://legacy.example`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
    ]);
    expect(await v.make(dir).loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedFor: 'https://legacy.example',
    });
  });

  it('answers no issuedFor without the URL, even with a client', async () => {
    write([`${v.client}=100`, `${v.token}=old-token`]);
    expect(await v.make(dir).loadSession('D')).toEqual({
      authorizationToken: 'old-token',
    });
  });

  it('answers no binding without a credential', async () => {
    write([
      `${v.url}=https://legacy.example`,
      `${v.client}=100`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=client`,
      `${v.token.replace('JWT_TOKEN', 'REFRESH_TOKEN')}=old-refresh`,
    ]);
    expect(await v.make(dir).loadSession('D')).toEqual({
      refreshToken: 'old-refresh',
    });
    write([`${v.url}=https://legacy.example`, `${v.client}=100`]);
    expect(await v.make(dir).loadSession('D')).toBeNull();
  });

  it('a file with the binding keys answers them and ignores the legacy keys', async () => {
    write([
      `${v.url}=https://legacy.example`,
      `${v.client}=100`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
      `${v.issuedForKey}=${FOR}`,
      `${v.issuedByKey}=${BY}`,
    ]);
    const session = await v.make(dir).loadSession('D');
    expect(session?.issuedFor).toBe(FOR);
    expect(session?.issuedBy).toBe(BY);
  });

  it('an empty binding key answers none, and the legacy keys are not read', async () => {
    write([
      `${v.url}=https://legacy.example`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
      `${v.issuedForKey}=`,
      `${v.issuedByKey}=`,
    ]);
    expect(await v.make(dir).loadSession('D')).toEqual({
      authorizationToken: 'old-token',
    });
  });

  it('each binding key stands alone: one written, the other still legacy', async () => {
    write([
      `${v.url}=https://legacy.example`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
      `${v.issuedForKey}=${FOR}`,
    ]);
    const session = await v.make(dir).loadSession('D');
    expect(session?.issuedFor).toBe(FOR);
    expect(session?.issuedBy).toBe('https://uaa.example?client_id=client');
  });

  it('a new token writes the binding keys: from then on the legacy keys are not read', async () => {
    write([
      `${v.url}=https://legacy.example`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
    ]);
    const store = v.make(dir);
    await store.saveSession('D', { authorizationToken: 'new-token' });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: 'new-token',
    });
    await store.saveSession('D', {
      authorizationToken: 'newer-token',
      issuedFor: FOR,
      issuedBy: BY,
    });
    const vars = readVars(file);
    expect(vars[v.url]).toBe('https://legacy.example');
    expect(vars[v.issuedForKey]).toBe(FOR);
    expect(vars[v.issuedByKey]).toBe(BY);
  });

  it('a write with no new credential writes what was answered, so a later edit of the URL does not move it', async () => {
    write([
      `${v.url}=https://legacy.example`,
      `${v.client}=100`,
      `${v.uaaUrl}=https://uaa.example`,
      `${v.uaaClientId}=client`,
      `${v.token}=old-token`,
    ]);
    const store = v.make(dir);
    await store.saveSession('D', { refreshToken: 'new-refresh' });
    const destinations = new EnvDestinationStore(dir, {
      variables: v.variables,
    });
    await destinations.setDestination('D', {
      serviceUrl: 'https://edited.example',
      uaaClientId: 'edited',
    });
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      refreshToken: 'new-refresh',
      issuedFor: 'https://legacy.example?sap-client=100',
      issuedBy: 'https://uaa.example?client_id=client',
    });
  });
});

it('a legacy XSUAA file reads XSUAA_MCP_URL, never the 1.x SAP_URL beside it', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-legacy-x-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'D.env'),
      [
        'SAP_URL=https://sap-1x.example',
        'SAP_CLIENT=100',
        'SAP_UAA_URL=https://sap-uaa.example',
        'SAP_UAA_CLIENT_ID=sap-client',
        'XSUAA_JWT_TOKEN=tok',
        '',
      ].join('\n'),
    );
    expect(await new XsuaaSessionStore(dir).loadSession('D')).toEqual({
      authorizationToken: 'tok',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

it('a legacy cookie session answers issuedFor and no issuedBy (no ACS was ever stored)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-legacy-c-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'D.env'),
      [
        'SAP_URL=https://legacy.example',
        'SAP_UAA_URL=https://uaa.example',
        'SAP_UAA_CLIENT_ID=client',
        `SAP_SESSION_COOKIES_B64=${Buffer.from(COOKIES).toString('base64')}`,
        '',
      ].join('\n'),
    );
    expect(await new AbapSessionStore(dir).loadSession('D')).toEqual({
      sessionCookies: COOKIES,
      issuedFor: 'https://legacy.example',
    });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe.each([
  {
    name: 'AbapSessionStore',
    variables: ABAP_DESTINATION_VARS,
    session: (dir: string): ISessionStore => new AbapSessionStore(dir),
  },
  {
    name: 'EnvFileSessionStore',
    variables: ABAP_DESTINATION_VARS,
    session: (dir: string): ISessionStore =>
      new EnvFileSessionStore(path.join(dir, 'D.env')),
  },
  {
    name: 'XsuaaSessionStore',
    variables: XSUAA_DESTINATION_VARS,
    session: (dir: string): ISessionStore => new XsuaaSessionStore(dir),
  },
])(
  '$name and EnvDestinationStore in one file — the binding and the means',
  ({ variables, session }) => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-binding-'));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
    const MEANS = {
      serviceUrl: 'https://h.abap.example',
      authType: 'jwt' as const,
      grantType: 'authorization_code' as const,
      sapClient: '100',
    };
    const CLIENT = {
      uaaUrl: 'https://uaa.example',
      uaaClientId: 'client',
      uaaClientSecret: 'secret',
    };
    const SECRET = {
      authorizationToken: TOKEN,
      refreshToken: REFRESH,
      issuedFor: FOR,
      issuedBy: BY,
    };

    it('means first, then the session: each keeps its own', async () => {
      const destinations = new EnvDestinationStore(dir, { variables });
      const sessions = session(dir);
      await destinations.setDestination('D', { ...MEANS, ...CLIENT });
      await sessions.saveSession('D', SECRET);

      expect(await sessions.loadSession('D')).toEqual(SECRET);
      expect(await destinations.getConnectionConfig('D')).toEqual(MEANS);
      expect(await destinations.getAuthorizationConfig('D')).toEqual(CLIENT);
    });

    it('the session first, then the means changed: the binding stays as written', async () => {
      const destinations = new EnvDestinationStore(dir, { variables });
      const sessions = session(dir);
      await sessions.saveSession('D', SECRET);
      await destinations.setDestination('D', { ...MEANS, ...CLIENT });
      await destinations.setDestination('D', {
        serviceUrl: 'https://moved.example',
        uaaClientId: 'other',
      });

      expect(await sessions.loadSession('D')).toEqual(SECRET);
      expect(await destinations.getConnectionConfig('D')).toEqual({
        ...MEANS,
        serviceUrl: 'https://moved.example',
      });
    });

    it('deleting the session keeps the means; deleting the means keeps the session and its binding', async () => {
      const destinations = new EnvDestinationStore(dir, { variables });
      const sessions = session(dir);
      await destinations.setDestination('D', { ...MEANS, ...CLIENT });
      await sessions.saveSession('D', SECRET);
      await destinations.deleteDestination('D');
      expect(await sessions.loadSession('D')).toEqual(SECRET);

      await destinations.setDestination('D', { ...MEANS, ...CLIENT });
      await sessions.deleteSession?.('D');
      expect(await sessions.loadSession('D')).toBeNull();
      expect(await destinations.getConnectionConfig('D')).toEqual(MEANS);
    });
  },
);
