/**
 * `EnvFileSessionStore` composes no legacy binding for a file that states
 * none (4.1.0).
 *
 * Its file holds the destination's own means (`EnvDestinationStore.forFile`
 * reads `SAP_URL`, `SAP_CLIENT`, `SAP_UAA_URL`, `SAP_UAA_CLIENT_ID` from the
 * same file), so a binding composed from them protected nothing — and made a
 * legacy `jwt/none` file read as half a binding. A file with neither
 * `SAP_ISSUED_FOR` nor `SAP_ISSUED_BY` answers no binding; one with either key
 * reads exactly as in 4.0.0. The session-folder stores, whose session file is
 * not where the means are read from, keep composing.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ISessionStore } from '@mcp-abap-adt/interfaces-auth-broker';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

const COOKIES = 'SAP_SESSIONID_X=SECRET-COOKIE; sap-usercontext=c';
const FOR = 'https://SENTINEL-for.example:443/sap/bc/adt?sap-client=100';
const BY = 'https://SENTINEL-by.example:443?client_id=SENTINEL-client';

const MEANS = ['SAP_URL=https://legacy.example', 'SAP_CLIENT=100'];
const UAA = ['SAP_UAA_URL=https://uaa.example', 'SAP_UAA_CLIENT_ID=client'];
const TOKEN = 'SAP_JWT_TOKEN=old-token';

let dir: string;
let file: string;
const write = (lines: string[]) =>
  fs.writeFileSync(file, [...lines, ''].join('\n'));
const envStore = () => new EnvFileSessionStore(file);

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-unbound-'));
  file = path.join(dir, 'D.env');
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('EnvFileSessionStore — a file with neither binding key', () => {
  it('a token beside SAP_URL and SAP_CLIENT answers no binding', async () => {
    write([...MEANS, TOKEN]);
    const store = envStore();
    expect(await store.loadSession('D')).toEqual({
      authorizationToken: 'old-token',
    });
    expect(await store.getConnectionConfig('D')).toEqual({
      authorizationToken: 'old-token',
    });
  });

  it('the legacy UAA pair beside them adds no binding either', async () => {
    write([...MEANS, ...UAA, TOKEN]);
    expect(await envStore().loadSession('D')).toEqual({
      authorizationToken: 'old-token',
    });
  });

  it('a cookie session answers no binding', async () => {
    write([
      ...MEANS,
      ...UAA,
      `SAP_SESSION_COOKIES_B64=${Buffer.from(COOKIES).toString('base64')}`,
    ]);
    expect(await envStore().loadSession('D')).toEqual({
      sessionCookies: COOKIES,
    });
  });
});

describe('EnvFileSessionStore — a file with a binding key reads as in 4.0.0', () => {
  it('only SAP_ISSUED_BY: issuedFor is composed from the means', async () => {
    write([...MEANS, ...UAA, TOKEN, `SAP_ISSUED_BY=${BY}`]);
    expect(await envStore().loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedFor: 'https://legacy.example?sap-client=100',
      issuedBy: BY,
    });
  });

  it('only an empty SAP_ISSUED_BY: issuedFor is still composed', async () => {
    write([...MEANS, ...UAA, TOKEN, 'SAP_ISSUED_BY=']);
    expect(await envStore().loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedFor: 'https://legacy.example?sap-client=100',
    });
  });

  it('only SAP_ISSUED_FOR: issuedBy is composed from the UAA pair', async () => {
    write([...MEANS, ...UAA, TOKEN, `SAP_ISSUED_FOR=${FOR}`]);
    expect(await envStore().loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedFor: FOR,
      issuedBy: 'https://uaa.example?client_id=client',
    });
  });

  it('only an empty SAP_ISSUED_FOR: issuedBy is still composed', async () => {
    write([...MEANS, ...UAA, TOKEN, 'SAP_ISSUED_FOR=']);
    expect(await envStore().loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedBy: 'https://uaa.example?client_id=client',
    });
  });

  it('both keys stated: answered as written', async () => {
    write([
      ...MEANS,
      ...UAA,
      TOKEN,
      `SAP_ISSUED_FOR=${FOR}`,
      `SAP_ISSUED_BY=${BY}`,
    ]);
    expect(await envStore().loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedFor: FOR,
      issuedBy: BY,
    });
  });

  it('both keys stated empty: no binding, nothing composed', async () => {
    write([...MEANS, ...UAA, TOKEN, 'SAP_ISSUED_FOR=', 'SAP_ISSUED_BY=']);
    expect(await envStore().loadSession('D')).toEqual({
      authorizationToken: 'old-token',
    });
  });
});

describe.each([
  {
    name: 'AbapSessionStore',
    make: (d: string): ISessionStore => new AbapSessionStore(d),
    means: MEANS,
    uaa: UAA,
    token: TOKEN,
  },
  {
    name: 'XsuaaSessionStore',
    make: (d: string): ISessionStore => new XsuaaSessionStore(d),
    means: ['XSUAA_MCP_URL=https://legacy.example', 'XSUAA_CLIENT=100'],
    uaa: ['XSUAA_UAA_URL=https://uaa.example', 'XSUAA_UAA_CLIENT_ID=client'],
    token: 'XSUAA_JWT_TOKEN=old-token',
  },
])('$name — still composes for a file with neither binding key', (v) => {
  it('a token beside the URL and client answers issuedFor', async () => {
    write([...v.means, v.token]);
    expect(await v.make(dir).loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedFor: 'https://legacy.example?sap-client=100',
    });
  });

  it('with the UAA pair, issuedBy too', async () => {
    write([...v.means, ...v.uaa, v.token]);
    expect(await v.make(dir).loadSession('D')).toEqual({
      authorizationToken: 'old-token',
      issuedFor: 'https://legacy.example?sap-client=100',
      issuedBy: 'https://uaa.example?client_id=client',
    });
  });
});
