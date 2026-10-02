/**
 * 2.x session files keep being read, and stay 2.x files (3.0.0).
 *
 * A 2.x `<destination>.env` holds means and secret together. The session store
 * answers only the secret keys of such a file — and, from 3.1.0, the binding
 * its URL and client compose (`sessionBinding.test.ts`) — and a session write
 * rewrites only the secret and binding keys: every other line — the URL, the
 * type, the client, the SNC settings, a comment, a key this package does not
 * know — is left byte for byte, so the destination store can still read the
 * means from the same file.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ISessionStore } from '@mcp-abap-adt/interfaces-auth-broker';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

const COOKIES = 'SAP_SESSIONID_X=old-cookie; sap-usercontext=c';

const ABAP_2X = [
  '# written by auth-stores 2.0.0',
  'SAP_URL=https://legacy.example',
  'SAP_AUTH_TYPE=jwt',
  'SAP_USERNAME=legacy-user',
  'SAP_PASSWORD="pa ss#word"',
  'SAP_SNC_PARTNERNAME="p:CN=SID, O=ORG"',
  'SAP_SNC_QOP=9',
  'SAP_SNC_LIB=/usr/lib/libsapcrypto.so',
  'SAP_SNC_MYNAME=p:CN=ME',
  'SAP_UAA_URL=https://uaa.example',
  'SAP_UAA_CLIENT_ID=client',
  'SAP_UAA_CLIENT_SECRET=secret',
  'SAP_CLIENT=100',
  'SAP_LANGUAGE=EN',
  '',
  'SAP_JWT_TOKEN=old-token',
  `SAP_SESSION_COOKIES_B64=${Buffer.from(COOKIES).toString('base64')}`,
  'SAP_REFRESH_TOKEN=old-refresh',
  'SAP_EXPIRES_AT=1800000000000',
  'UNRELATED_KEY=keep me',
  '',
].join('\n');

const XSUAA_2X = [
  'XSUAA_MCP_URL=https://mcp.example',
  'XSUAA_UAA_URL=https://uaa.example',
  'XSUAA_UAA_CLIENT_ID=client',
  'XSUAA_UAA_CLIENT_SECRET=secret',
  '# 1.x keys the 2.x XSUAA writer used to delete',
  'SAP_URL=https://legacy.example',
  'SAP_JWT_TOKEN=legacy-sap-token',
  'XSUAA_JWT_TOKEN=old-token',
  'XSUAA_REFRESH_TOKEN=old-refresh',
  'XSUAA_EXPIRES_AT=1800000000000',
  '',
].join('\n');

const ABAP_SECRET = new Set([
  'SAP_JWT_TOKEN',
  'SAP_SESSION_COOKIES_B64',
  'SAP_REFRESH_TOKEN',
  'SAP_EXPIRES_AT',
  'SAP_ISSUED_FOR',
  'SAP_ISSUED_BY',
]);
const XSUAA_SECRET = new Set([
  'XSUAA_JWT_TOKEN',
  'XSUAA_REFRESH_TOKEN',
  'XSUAA_EXPIRES_AT',
  'XSUAA_ISSUED_FOR',
  'XSUAA_ISSUED_BY',
]);

const keyOf = (line: string) => /^\s*([\w.-]+)\s*=/.exec(line)?.[1];
const nonSecretLines = (content: string, secret: Set<string>) =>
  content.split('\n').filter((line) => {
    const key = keyOf(line);
    return !(key && secret.has(key));
  });

describe.each([
  {
    name: 'AbapSessionStore',
    make: (dir: string): ISessionStore => new AbapSessionStore(dir),
    fixture: ABAP_2X,
    secret: ABAP_SECRET,
    stored: {
      authorizationToken: 'old-token',
      sessionCookies: COOKIES,
      refreshToken: 'old-refresh',
      expiresAt: 1_800_000_000_000,
      issuedFor: 'https://legacy.example?sap-client=100',
      issuedBy: 'https://uaa.example?client_id=client',
    },
  },
  {
    name: 'EnvFileSessionStore',
    make: (dir: string): ISessionStore =>
      new EnvFileSessionStore(path.join(dir, 'D.env')),
    fixture: ABAP_2X,
    secret: ABAP_SECRET,
    stored: {
      authorizationToken: 'old-token',
      sessionCookies: COOKIES,
      refreshToken: 'old-refresh',
      expiresAt: 1_800_000_000_000,
      issuedFor: 'https://legacy.example?sap-client=100',
      issuedBy: 'https://uaa.example?client_id=client',
    },
  },
  {
    name: 'XsuaaSessionStore',
    make: (dir: string): ISessionStore => new XsuaaSessionStore(dir),
    fixture: XSUAA_2X,
    secret: XSUAA_SECRET,
    stored: {
      authorizationToken: 'old-token',
      refreshToken: 'old-refresh',
      expiresAt: 1_800_000_000_000,
      issuedFor: 'https://mcp.example',
      issuedBy: 'https://uaa.example?client_id=client',
    },
  },
])('$name — a 2.x file with every key', ({ make, fixture, secret, stored }) => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-2x-'));
    file = path.join(dir, 'D.env');
    fs.writeFileSync(file, fixture);
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('answers only the secret keys, and the binding they compose', async () => {
    const store = make(dir);
    expect(await store.loadSession('D')).toEqual(stored);
    const { refreshToken: _r, ...connection } = stored;
    expect(await store.getConnectionConfig('D')).toEqual(connection);
    expect(await store.getAuthorizationConfig('D')).toBeNull();
  });

  it('a session write leaves every non-secret line byte for byte', async () => {
    const store = make(dir);
    await store.saveSession('D', {
      authorizationToken: 'new-token',
      expiresAt: 1_900_000_000_000,
      refreshToken: 'new-refresh',
    });

    const after = fs.readFileSync(file, 'utf8');
    expect(nonSecretLines(after, secret)).toEqual(
      nonSecretLines(fixture, secret),
    );
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: 'new-token',
      expiresAt: 1_900_000_000_000,
      refreshToken: 'new-refresh',
    });
  });
});
