/**
 * A SAP service key answers the means its format holds (3.0.0).
 *
 * The key holds an OAuth client and nothing else, and every grant that client
 * alone serves yields a token: `authType: 'jwt'`. It cannot state which grant
 * — the grants a client may use are declared on the XSUAA instance, not in the
 * key — so no `grantType` is answered (the destination states it elsewhere,
 * e.g. through EnvDestinationStore). A token is secret: a key store answers
 * none, not even `''`.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IServiceKeyStore } from '@mcp-abap-adt/interfaces-auth-broker';
import { AbapServiceKeyStore } from '../../stores/abap/AbapServiceKeyStore';
import { XsuaaServiceKeyStore } from '../../stores/xsuaa/XsuaaServiceKeyStore';

describe.each([
  {
    name: 'AbapServiceKeyStore',
    make: (dir: string): IServiceKeyStore => new AbapServiceKeyStore(dir),
    key: {
      uaa: {
        url: 'https://t.authentication.example',
        clientid: 'client',
        clientsecret: 'secret',
      },
      abap: { url: 'https://t.abap.example', client: '001', language: 'EN' },
    },
  },
  {
    name: 'XsuaaServiceKeyStore',
    make: (dir: string): IServiceKeyStore => new XsuaaServiceKeyStore(dir),
    key: {
      url: 'https://t.authentication.example',
      clientid: 'client',
      clientsecret: 'secret',
      abap: { url: 'https://t.abap.example', client: '001' },
    },
  },
])('$name', ({ make, key }) => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'service-key-'));
    fs.writeFileSync(path.join(dir, 'TRIAL.json'), JSON.stringify(key));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("answers authType 'jwt', no grantType and no token", async () => {
    const store = make(dir);
    const connection = await store.getConnectionConfig('TRIAL');

    expect(connection?.authType).toBe('jwt');
    expect(connection?.serviceUrl).toBe('https://t.abap.example');
    expect(connection).not.toHaveProperty('grantType');
    expect(connection).not.toHaveProperty('authorizationToken');

    const whole = await store.getServiceKey('TRIAL');
    expect(whole?.authType).toBe('jwt');
    expect(whole).not.toHaveProperty('grantType');
    expect(whole).not.toHaveProperty('authorizationToken');
  });
});
