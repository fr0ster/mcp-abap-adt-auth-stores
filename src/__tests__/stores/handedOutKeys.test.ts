/**
 * Every object a store hands out or writes keeps the own keys it had in
 * 3.3.0 — a key present with the value `undefined` included.
 *
 * Under `exactOptionalPropertyTypes` an optional contract field reads
 * "absent, never `undefined`"; this package has always handed some out
 * present and `undefined` (`sapClient: undefined`), and a consumer that
 * merges or enumerates them (`{ ...fromKey, ...fromFile }`, `Object.keys`)
 * sees the difference. The compiler setting changes no key: these lists are
 * what 3.3.0 answered for the same input.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { ParseError, StorageError } from '../../errors/StoreErrors';
import { loadServiceKey } from '../../loaders/abap/serviceKeyLoader';
import { loadXSUAAServiceKey } from '../../loaders/xsuaa/xsuaaServiceKeyLoader';
import { AbapServiceKeyStore } from '../../stores/abap/AbapServiceKeyStore';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { EnvDestinationStore } from '../../stores/destination/EnvDestinationStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { XsuaaServiceKeyStore } from '../../stores/xsuaa/XsuaaServiceKeyStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

/**
 * The own keys of a value, sorted, nested ones as `a.b`; a key whose value
 * is `undefined` reads `key=undefined`.
 */
function keysOf(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') return [];
  const out: string[] = [];
  for (const key of Object.keys(value).sort()) {
    const field = (value as Record<string, unknown>)[key];
    const name = `${prefix}${key}`;
    if (field === undefined) out.push(`${name}=undefined`);
    else if (
      typeof field === 'object' &&
      field !== null &&
      !Array.isArray(field)
    ) {
      out.push(name, ...keysOf(field, `${name}.`));
    } else out.push(name);
  }
  return out;
}

const ABAP_KEY_PARTIAL = {
  uaa: {
    url: 'https://t.authentication.example',
    clientid: 'client',
    clientsecret: 'secret',
  },
  url: 'https://t.abap.example',
};
const ABAP_KEY_FULL = {
  uaa: {
    url: 'https://t.authentication.example',
    clientid: 'client',
    clientsecret: 'secret',
  },
  abap: { url: 'https://t.abap.example', client: '001', language: 'EN' },
};
const XSUAA_KEY_PARTIAL = {
  url: 'https://t.authentication.example',
  clientid: 'client',
  clientsecret: 'secret',
};
const XSUAA_KEY_X509 = {
  url: 'https://t.authentication.example',
  certurl: 'https://t.authentication.cert.example',
  clientid: 'client',
  certificate: '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n',
  key: '-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----\n',
  'credential-type': 'x509',
};

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'handed-out-keys-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeJson(name: string, content: unknown): void {
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(content));
}

describe('the key stores', () => {
  it('AbapServiceKeyStore, a key without client and language', async () => {
    writeJson('D', ABAP_KEY_PARTIAL);
    const store = new AbapServiceKeyStore(dir);
    expect(keysOf(await store.getConnectionConfig('D'))).toEqual([
      'authType',
      'language=undefined',
      'sapClient=undefined',
      'serviceUrl',
    ]);
    expect(keysOf(await store.getAuthorizationConfig('D'))).toEqual(
      KEYS.abapAuthorization,
    );
    expect(keysOf(await store.getServiceKey('D'))).toEqual(
      KEYS.abapServiceKeyPartial,
    );
  });

  it('AbapServiceKeyStore, a full key and a grant', async () => {
    writeJson('D', ABAP_KEY_FULL);
    const store = new AbapServiceKeyStore(dir, { grantType: 'passcode' });
    expect(keysOf(await store.getConnectionConfig('D'))).toEqual([
      'authType',
      'grantType',
      'language',
      'sapClient',
      'serviceUrl',
    ]);
    expect(keysOf(await store.getServiceKey('D'))).toEqual(
      KEYS.abapServiceKeyFull,
    );
  });

  it('XsuaaServiceKeyStore, a secret key without the system', async () => {
    writeJson('D', XSUAA_KEY_PARTIAL);
    const store = new XsuaaServiceKeyStore(dir);
    expect(keysOf(await store.getConnectionConfig('D'))).toEqual([
      'authType',
      'language=undefined',
      'sapClient=undefined',
      'serviceUrl=undefined',
    ]);
    expect(keysOf(await store.getAuthorizationConfig('D'))).toEqual(
      KEYS.xsuaaAuthorization,
    );
    expect(keysOf(await store.getServiceKey('D'))).toEqual(
      KEYS.xsuaaServiceKey,
    );
  });

  it('XsuaaServiceKeyStore, an x509 key', async () => {
    writeJson('D', XSUAA_KEY_X509);
    const store = new XsuaaServiceKeyStore(dir);
    expect(keysOf(await store.getClientCertificate('D'))).toEqual(
      KEYS.xsuaaClientCertificate,
    );
    expect(keysOf(await store.getServiceKey('D'))).toEqual(
      KEYS.xsuaaServiceKeyX509,
    );
  });

  it('the loaders', async () => {
    writeJson('A', ABAP_KEY_FULL);
    writeJson('X', XSUAA_KEY_PARTIAL);
    expect(keysOf(await loadServiceKey('A', dir))).toEqual(KEYS.loadAbap);
    expect(keysOf(await loadXSUAAServiceKey('X', dir))).toEqual(KEYS.loadXsuaa);
  });
});

describe('EnvDestinationStore', () => {
  it('answers and writes the means it was given', async () => {
    const certPath = path.join(dir, 'client.crt');
    const keyPath = path.join(dir, 'client.key');
    fs.writeFileSync(certPath, XSUAA_KEY_X509.certificate);
    fs.writeFileSync(keyPath, XSUAA_KEY_X509.key);
    const store = new EnvDestinationStore(dir);
    await store.setDestination('D', {
      serviceUrl: 'https://t.abap.example',
      authType: 'jwt',
      grantType: 'authorization_code',
      uaaUrl: 'https://t.authentication.example',
      uaaClientId: 'client',
      uaaClientCertPath: certPath,
      uaaClientKeyPath: keyPath,
      uaaCertUrl: 'https://t.authentication.cert.example',
    });
    expect(
      Object.keys(
        dotenv.parse(fs.readFileSync(path.join(dir, 'D.env'), 'utf8')),
      ).sort(),
    ).toEqual(KEYS.destinationFile);
    expect(keysOf(await store.getConnectionConfig('D'))).toEqual(
      KEYS.destinationConnection,
    );
    // a certificate client states no secret: no authorization config
    expect(await store.getAuthorizationConfig('D')).toBeNull();
    expect(keysOf(await store.getClientCertificate('D'))).toEqual(
      KEYS.destinationClientCertificate,
    );
    expect(keysOf(await store.getServiceKey('D'))).toEqual(
      KEYS.destinationServiceKey,
    );
  });

  it('with a key store to fall back to', async () => {
    writeJson('D', ABAP_KEY_PARTIAL);
    const store = new EnvDestinationStore(dir, {
      fallback: new AbapServiceKeyStore(dir),
    });
    await store.setDestination('D', { grantType: 'client_credentials' });
    expect(keysOf(await store.getConnectionConfig('D'))).toEqual(
      KEYS.fallbackConnection,
    );
    expect(keysOf(await store.getAuthorizationConfig('D'))).toEqual(
      KEYS.fallbackAuthorization,
    );
    expect(keysOf(await store.getServiceKey('D'))).toEqual(
      KEYS.fallbackServiceKey,
    );
  });
});

describe.each([
  ['AbapSessionStore', () => new AbapSessionStore(dir), 'D.env'],
  ['XsuaaSessionStore', () => new XsuaaSessionStore(dir), 'D.env'],
  [
    'EnvFileSessionStore',
    () => new EnvFileSessionStore(path.join(dir, 'D.env')),
    'D.env',
  ],
])('%s', (name, make, file) => {
  it('answers and writes the session it was given', async () => {
    const store = make();
    await store.saveSession('D', {
      authorizationToken: 'T',
      refreshToken: 'R',
      expiresAt: 4102444800000,
    });
    expect(
      Object.keys(
        dotenv.parse(fs.readFileSync(path.join(dir, file), 'utf8')),
      ).sort(),
    ).toEqual(KEYS.sessionFile[name]);
    expect(keysOf(await store.loadSession('D'))).toEqual(KEYS.session[name]);
    expect(keysOf(await store.getConnectionConfig('D'))).toEqual(
      KEYS.sessionConnection[name],
    );
  });
});

describe('the errors', () => {
  it('carry filePath and cause as own keys, given or not', () => {
    expect(keysOf(new ParseError('m'))).toEqual([
      'cause=undefined',
      'code',
      'filePath=undefined',
      'name',
    ]);
    expect(keysOf(new StorageError('read', 'm'))).toEqual([
      'cause=undefined',
      'code',
      'name',
      'operation',
    ]);
  });
});

/** Measured on 3.3.0 for the inputs above. */
const CONNECTION_UNSTATED = [
  'authType',
  'language=undefined',
  'sapClient=undefined',
  'serviceUrl=undefined',
];
const CLIENT = ['uaaClientId', 'uaaClientSecret', 'uaaUrl'];
const SESSION = {
  file: (prefix: string) =>
    ['EXPIRES_AT', 'ISSUED_BY', 'ISSUED_FOR', 'JWT_TOKEN', 'REFRESH_TOKEN'].map(
      (suffix) => `${prefix}_${suffix}`,
    ),
  session: ['authorizationToken', 'expiresAt', 'refreshToken'],
  connection: ['authorizationToken', 'expiresAt'],
};
const KEYS = {
  abapAuthorization: CLIENT,
  abapServiceKeyPartial: [
    'authType',
    'language=undefined',
    'sapClient=undefined',
    'serviceUrl',
    ...CLIENT,
  ],
  abapServiceKeyFull: [
    'authType',
    'grantType',
    'language',
    'sapClient',
    'serviceUrl',
    ...CLIENT,
  ],
  xsuaaAuthorization: CLIENT,
  xsuaaServiceKey: [...CONNECTION_UNSTATED, ...CLIENT],
  xsuaaClientCertificate: [
    'certUrl',
    'certificate',
    'clientId',
    'key',
    'uaaUrl',
  ],
  xsuaaServiceKeyX509: CONNECTION_UNSTATED,
  loadAbap: [
    'abap',
    'abap.client',
    'abap.language',
    'abap.url',
    'uaa',
    'uaa.clientid',
    'uaa.clientsecret',
    'uaa.url',
  ],
  loadXsuaa: [
    'abap=undefined',
    'apiurl=undefined',
    'client=undefined',
    'language=undefined',
    'sap_client=undefined',
    'sap_url=undefined',
    'uaa',
    'uaa.clientid',
    'uaa.clientsecret',
    'uaa.url',
    'url',
  ],
  destinationFile: [
    'SAP_AUTH_TYPE',
    'SAP_GRANT_TYPE',
    'SAP_UAA_CERT_URL',
    'SAP_UAA_CLIENT_CERT_PATH',
    'SAP_UAA_CLIENT_ID',
    'SAP_UAA_CLIENT_KEY_PATH',
    'SAP_UAA_URL',
    'SAP_URL',
  ],
  destinationConnection: ['authType', 'grantType', 'serviceUrl'],
  destinationClientCertificate: [
    'certUrl',
    'certificate',
    'clientId',
    'key',
    'uaaUrl',
  ],
  destinationServiceKey: ['authType', 'grantType', 'serviceUrl'],
  fallbackConnection: ['authType', 'grantType', 'serviceUrl'],
  fallbackAuthorization: CLIENT,
  fallbackServiceKey: ['authType', 'grantType', 'serviceUrl', ...CLIENT],
  sessionFile: {
    AbapSessionStore: SESSION.file('SAP'),
    XsuaaSessionStore: SESSION.file('XSUAA'),
    EnvFileSessionStore: SESSION.file('SAP'),
  } as Record<string, string[]>,
  session: {
    AbapSessionStore: SESSION.session,
    XsuaaSessionStore: SESSION.session,
    EnvFileSessionStore: SESSION.session,
  } as Record<string, string[]>,
  sessionConnection: {
    AbapSessionStore: SESSION.connection,
    XsuaaSessionStore: SESSION.connection,
    EnvFileSessionStore: SESSION.connection,
  } as Record<string, string[]>,
};
