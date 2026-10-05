/**
 * EnvDestinationStore — a destination's means in `<dir>/<destination>.env`.
 *
 * An `IServiceKeyStore` for a destination that has no SAP service key, or
 * whose key cannot state its grant: the 2.x session key names plus
 * `SAP_GRANT_TYPE`, `SAP_OIDC_*`, `SAP_SAML_*`. A public client is
 * `uaaClientSecret: ''`. Another `IServiceKeyStore` may be given to fall back
 * to, field by field. It answers means only — never a secret — and has a
 * write method of its own, outside the read-only contract.
 */
// the module object itself, so a spy on it sees every reader's call
import nodeFs, * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  IClientCertificate,
  IConfig,
  IConnectionConfig,
  IServiceKeyStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { IAuthorizationConfig } from '@mcp-abap-adt/interfaces-auth-sap';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { ClientCertificateError } from '../../errors/StoreErrors';
import {
  ABAP_DESTINATION_VARS,
  type DestinationVariables,
  EnvDestinationStore,
  XSUAA_DESTINATION_VARS,
} from '../../stores/destination/EnvDestinationStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';

const CERT_A = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBszCCAVmgAwIBAgIUAAAA',
  'AAAA/+==',
  '-----END CERTIFICATE-----',
].join('\n');
const CERT_B = 'MIIBbase64DERonly==';

/** Every means field of IConnectionConfig, with values that need care. */
const EVERY_CONNECTION_MEANS: IConnectionConfig = {
  serviceUrl: 'https://h.abap.example/sap?x=1',
  authType: 'saml',
  grantType: 'saml2_bearer',
  username: 'DEVELOPER',
  password: `p@ss w#rd'"=\\n`,
  sapClient: '100',
  language: 'EN',
  sncPartnerName: 'p:CN=SID, O=ORG, C=DE',
  sncQop: '9',
  sncLib: '/usr/sap/lib sapcrypto.so',
  sncMyName: 'p:CN=ME',
  oidcIssuerUrl: 'https://idp.example/realms/r',
  oidcAuthorizationEndpoint: 'https://idp.example/auth',
  oidcTokenEndpoint: 'https://idp.example/token',
  oidcDeviceAuthorizationEndpoint: 'https://idp.example/device',
  oidcScopes: ['openid', 'offline_access'],
  oidcSubjectToken: 'subject.jwt.value',
  oidcSubjectTokenType: 'urn:ietf:params:oauth:token-type:jwt',
  oidcAudience: 'api://aud',
  oidcActorToken: 'actor.jwt.value',
  oidcActorTokenType: 'urn:ietf:params:oauth:token-type:access_token',
  samlIdpSsoUrl: 'https://idp.example/sso',
  samlIdpEntityId: 'https://idp.example',
  samlIdpCertificates: [CERT_A, CERT_B],
  samlSpEntityId: 'https://h.abap.example',
  samlAcsUrl: 'https://h.abap.example/sap/saml2/sp/acs',
  samlRelayState: 'relay state',
  samlIdpInitiated: false,
  samlClockSkewMs: 30_000,
  samlTokenUrl: 'https://uaa.example/oauth/token/alias/x',
};

const CLIENT: IAuthorizationConfig = {
  uaaUrl: 'https://uaa.example',
  uaaClientId: 'client-id',
  uaaClientSecret: 'client-secret',
};

/** A fallback store answering what a fake service key would. */
function fakeKeyStore(
  connection: IConnectionConfig | null,
  client: IAuthorizationConfig | null,
): IServiceKeyStore {
  return {
    async getServiceKey() {
      return connection || client ? { ...client, ...connection } : null;
    },
    async getAuthorizationConfig() {
      return client;
    },
    async getConnectionConfig() {
      return connection;
    },
  };
}

describe('EnvDestinationStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'destination-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe.each([
    { name: 'ABAP keys', variables: ABAP_DESTINATION_VARS },
    { name: 'XSUAA keys', variables: XSUAA_DESTINATION_VARS },
  ])('$name', ({ variables }) => {
    it('writes every means field and reads it back', async () => {
      const store = new EnvDestinationStore(dir, { variables });
      await store.setDestination('D', { ...EVERY_CONNECTION_MEANS, ...CLIENT });

      // a fresh store reads the file, not a cache
      const reader = new EnvDestinationStore(dir, { variables });
      expect(await reader.getConnectionConfig('D')).toEqual(
        EVERY_CONNECTION_MEANS,
      );
      expect(await reader.getAuthorizationConfig('D')).toEqual(CLIENT);
      expect(await reader.getServiceKey('D')).toEqual({
        ...EVERY_CONNECTION_MEANS,
        ...CLIENT,
      });
      expect(fs.readFileSync(path.join(dir, 'D.env'), 'utf8')).toContain(
        `${variables.grantType}=saml2_bearer`,
      );
    });
  });

  it('keeps the 2.x key names and adds SAP_GRANT_TYPE, SAP_OIDC_*, SAP_SAML_*', () => {
    expect(ABAP_DESTINATION_VARS).toMatchObject({
      serviceUrl: 'SAP_URL',
      authType: 'SAP_AUTH_TYPE',
      username: 'SAP_USERNAME',
      password: 'SAP_PASSWORD',
      sapClient: 'SAP_CLIENT',
      language: 'SAP_LANGUAGE',
      sncPartnerName: 'SAP_SNC_PARTNERNAME',
      sncQop: 'SAP_SNC_QOP',
      sncLib: 'SAP_SNC_LIB',
      sncMyName: 'SAP_SNC_MYNAME',
      uaaUrl: 'SAP_UAA_URL',
      uaaClientId: 'SAP_UAA_CLIENT_ID',
      uaaClientSecret: 'SAP_UAA_CLIENT_SECRET',
      grantType: 'SAP_GRANT_TYPE',
    });
    expect(XSUAA_DESTINATION_VARS).toMatchObject({
      serviceUrl: 'XSUAA_MCP_URL',
      uaaUrl: 'XSUAA_UAA_URL',
      uaaClientId: 'XSUAA_UAA_CLIENT_ID',
      uaaClientSecret: 'XSUAA_UAA_CLIENT_SECRET',
      grantType: 'XSUAA_GRANT_TYPE',
    });
    for (const [field, key] of Object.entries(ABAP_DESTINATION_VARS)) {
      if (field.startsWith('oidc')) expect(key).toMatch(/^SAP_OIDC_/);
      if (field.startsWith('saml')) expect(key).toMatch(/^SAP_SAML_/);
    }
  });

  it("answers uaaClientSecret '' as a public client", async () => {
    const store = new EnvDestinationStore(dir);
    await store.setDestination('D', {
      authType: 'jwt',
      grantType: 'oidc_authorization_code',
      uaaUrl: 'https://idp.example/realms/r',
      uaaClientId: 'public-client',
      uaaClientSecret: '',
    });

    expect(fs.readFileSync(path.join(dir, 'D.env'), 'utf8')).toMatch(
      /^SAP_UAA_CLIENT_SECRET=$/m,
    );
    expect(await store.getAuthorizationConfig('D')).toEqual({
      uaaUrl: 'https://idp.example/realms/r',
      uaaClientId: 'public-client',
      uaaClientSecret: '',
    });
  });

  it('the fallback store fills only what the file leaves out', async () => {
    const fallback = fakeKeyStore(
      {
        serviceUrl: 'https://key.abap.example',
        authType: 'jwt',
        sapClient: '001',
        language: 'DE',
      },
      CLIENT,
    );
    const store = new EnvDestinationStore(dir, { fallback });
    await store.setDestination('TRIAL', {
      authType: 'saml',
      grantType: 'saml2_bearer',
      sapClient: '200',
      uaaClientSecret: '',
    });

    expect(await store.getConnectionConfig('TRIAL')).toEqual({
      serviceUrl: 'https://key.abap.example', // the key's
      authType: 'saml', // the file's, over the key's
      grantType: 'saml2_bearer', // the file's
      sapClient: '200', // the file's, over the key's
      language: 'DE', // the key's
    });
    // '' is stated by the file (a public client): not left out
    expect(await store.getAuthorizationConfig('TRIAL')).toEqual({
      uaaUrl: CLIENT.uaaUrl,
      uaaClientId: CLIENT.uaaClientId,
      uaaClientSecret: '',
    });
  });

  it('answers the fallback alone when there is no file', async () => {
    const fallback = fakeKeyStore(
      { serviceUrl: 'https://key.abap.example', authType: 'jwt' },
      CLIENT,
    );
    const store = new EnvDestinationStore(dir, { fallback });
    expect(await store.getConnectionConfig('TRIAL')).toEqual({
      serviceUrl: 'https://key.abap.example',
      authType: 'jwt',
    });
    expect(await store.getAuthorizationConfig('TRIAL')).toEqual(CLIENT);
  });

  it('answers no secret field, from the file or the fallback', async () => {
    fs.writeFileSync(
      path.join(dir, 'D.env'),
      [
        'SAP_URL=https://h.example',
        'SAP_AUTH_TYPE=jwt',
        'SAP_JWT_TOKEN=tok',
        `SAP_SESSION_COOKIES_B64=${Buffer.from('c=1').toString('base64')}`,
        'SAP_EXPIRES_AT=1800000000000',
        'SAP_REFRESH_TOKEN=refresh',
        '',
      ].join('\n'),
    );
    const fallback = fakeKeyStore(
      {
        authorizationToken: '',
        sessionCookies: 'x=1',
        expiresAt: 1,
        sapClient: '001',
      },
      { ...CLIENT, refreshToken: 'fallback-refresh' },
    );
    const store = new EnvDestinationStore(dir, { fallback });

    const connection = await store.getConnectionConfig('D');
    expect(connection).toEqual({
      serviceUrl: 'https://h.example',
      authType: 'jwt',
      sapClient: '001',
    });
    expect(await store.getAuthorizationConfig('D')).toEqual(CLIENT);
    const whole = await store.getServiceKey('D');
    for (const secret of [
      'authorizationToken',
      'sessionCookies',
      'expiresAt',
      'refreshToken',
    ]) {
      expect(whole).not.toHaveProperty(secret);
    }
  });

  it('reads a 2.x session file with every key as means', async () => {
    fs.writeFileSync(
      path.join(dir, 'D.env'),
      [
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
        'SAP_REFRESH_TOKEN=old-refresh',
        '',
      ].join('\n'),
    );
    const store = new EnvDestinationStore(dir);

    expect(await store.getConnectionConfig('D')).toEqual({
      serviceUrl: 'https://legacy.example',
      authType: 'jwt',
      username: 'legacy-user',
      password: 'pa ss#word',
      sncPartnerName: 'p:CN=SID, O=ORG',
      sncQop: '9',
      sncLib: '/usr/lib/libsapcrypto.so',
      sncMyName: 'p:CN=ME',
      sapClient: '100',
      language: 'EN',
    });
    expect(await store.getAuthorizationConfig('D')).toEqual({
      uaaUrl: 'https://uaa.example',
      uaaClientId: 'client',
      uaaClientSecret: 'secret',
    });
  });

  it('infers no type for a file without SAP_AUTH_TYPE', async () => {
    fs.writeFileSync(
      path.join(dir, 'D.env'),
      'SAP_URL=https://h.example\nSAP_USERNAME=u\nSAP_PASSWORD=p\nSAP_JWT_TOKEN=\n',
    );
    const store = new EnvDestinationStore(dir);
    expect(await store.getConnectionConfig('D')).toEqual({
      serviceUrl: 'https://h.example',
      username: 'u',
      password: 'p',
    });
  });

  it('refuses to write a secret field, naming it and no value', async () => {
    const store = new EnvDestinationStore(dir);
    const failure = await store
      .setDestination('D', {
        authType: 'jwt',
        authorizationToken: 'SENTINEL-token',
        refreshToken: 'SENTINEL-refresh',
        sessionCookies: 'SENTINEL-cookies',
        expiresAt: 42,
      } as IConfig)
      .catch((e: unknown) => e);

    const error = failure as Error & { code?: string; fields?: string[] };
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INVALID_CONFIG');
    expect(error.fields).toEqual([
      'authorizationToken',
      'expiresAt',
      'refreshToken',
      'sessionCookies',
    ]);
    expect(error.message).not.toContain('SENTINEL');
    expect(fs.existsSync(path.join(dir, 'D.env'))).toBe(false);
  });

  it('refuses a type or grant it does not know, naming the field', async () => {
    const store = new EnvDestinationStore(dir);
    await expect(
      store.setDestination('D', {
        authType: 'SENTINEL' as unknown as 'jwt',
      }),
    ).rejects.toThrow(/authType/);
    await expect(
      store.setDestination('D', {
        authType: 'jwt',
        grantType: 'SENTINEL' as unknown as 'none',
      }),
    ).rejects.toThrow(/grantType/);
    await expect(
      store.setDestination('D', { authType: 'jwt', grantType: 'none' }),
    ).resolves.toBeUndefined();
  });

  it('an update of one field keeps the others; null removes one', async () => {
    const store = new EnvDestinationStore(dir);
    await store.setDestination('D', {
      serviceUrl: 'https://h.example',
      authType: 'basic',
      username: 'u',
      password: 'p',
    });
    await store.setDestination('D', { password: 'p2' });
    expect(await store.getConnectionConfig('D')).toEqual({
      serviceUrl: 'https://h.example',
      authType: 'basic',
      username: 'u',
      password: 'p2',
    });
    await store.setDestination('D', { username: null, password: null });
    expect(await store.getConnectionConfig('D')).toEqual({
      serviceUrl: 'https://h.example',
      authType: 'basic',
    });
  });

  describe('forFile — one given file, whatever the destination', () => {
    it('reads a hand-written .env.dev for any destination name', async () => {
      const file = path.join(dir, '.env.dev');
      fs.writeFileSync(
        file,
        'SAP_URL=https://h.example\nSAP_AUTH_TYPE=jwt\nSAP_GRANT_TYPE=none\nSAP_JWT_TOKEN=t\n',
      );
      const store = EnvDestinationStore.forFile(file);
      const expected = {
        serviceUrl: 'https://h.example',
        authType: 'jwt',
        grantType: 'none',
      };
      expect(await store.getConnectionConfig('default')).toEqual(expected);
      expect(await store.getConnectionConfig('anything')).toEqual(expected);
      expect(await store.getConnectionConfig('../not/a/path')).toEqual(
        expected,
      );
    });

    it('writes to that file, and shares it with EnvFileSessionStore', async () => {
      const file = path.join(dir, 'conn.cfg');
      const means = EnvDestinationStore.forFile(file);
      const secret = new EnvFileSessionStore(file);

      await means.setDestination('x', {
        serviceUrl: 'https://h',
        authType: 'jwt',
      });
      await secret.saveSession('x', { authorizationToken: 'tok' });
      await means.setDestination('y', { grantType: 'none' });

      expect(await means.getConnectionConfig('z')).toEqual({
        serviceUrl: 'https://h',
        authType: 'jwt',
        grantType: 'none',
      });
      expect(await secret.loadSession('z')).toEqual({
        authorizationToken: 'tok',
      });
      expect(fs.readdirSync(dir)).toEqual(['conn.cfg']);
    });

    it('takes the same options (variables, fallback)', async () => {
      const file = path.join(dir, 'x.env');
      fs.writeFileSync(file, 'XSUAA_MCP_URL=https://mcp\n');
      const store = EnvDestinationStore.forFile(file, {
        variables: XSUAA_DESTINATION_VARS,
        fallback: fakeKeyStore({ sapClient: '001' }, CLIENT),
      });
      expect(await store.getConnectionConfig('D')).toEqual({
        serviceUrl: 'https://mcp',
        sapClient: '001',
      });
      expect(await store.getAuthorizationConfig('D')).toEqual(CLIENT);
    });
  });

  describe('the client is the client id (3.2.0)', () => {
    it('answers a client stated by its id alone, the rest as not stated', async () => {
      const store = new EnvDestinationStore(dir);
      // An OIDC public client: the server is the issuer, not a UAA URL.
      await store.setDestination('OIDC', {
        authType: 'jwt',
        grantType: 'device_code',
        oidcIssuerUrl: 'https://idp.example/realms/test',
        uaaClientId: 'public-client',
      });

      expect(await store.getAuthorizationConfig('OIDC')).toEqual({
        uaaUrl: '',
        uaaClientId: 'public-client',
        uaaClientSecret: '',
      });
    });

    it('answers no client without a client id, whatever else is stated', async () => {
      const store = new EnvDestinationStore(dir);
      await store.setDestination('D', {
        authType: 'jwt',
        uaaUrl: 'https://uaa.example',
        uaaClientSecret: 'secret',
      });

      expect(await store.getAuthorizationConfig('D')).toBeNull();
    });

    it("answers no client for an id written as '' — a client without an id is none", async () => {
      const store = new EnvDestinationStore(dir);
      await store.setDestination('D', {
        uaaUrl: 'https://uaa.example',
        uaaClientId: '',
        uaaClientSecret: 'secret',
      });

      expect(await store.getAuthorizationConfig('D')).toBeNull();
    });

    it('fills what the file leaves out from the fallback, field by field', async () => {
      const store = new EnvDestinationStore(dir, {
        fallback: fakeKeyStore(null, CLIENT),
      });
      await store.setDestination('D', { uaaClientId: 'file-client' });

      expect(await store.getAuthorizationConfig('D')).toEqual({
        ...CLIENT,
        uaaClientId: 'file-client',
      });
    });
  });

  it('answers null for a destination it has nothing for', async () => {
    const store = new EnvDestinationStore(dir);
    expect(await store.getConnectionConfig('NONE')).toBeNull();
    expect(await store.getAuthorizationConfig('NONE')).toBeNull();
    expect(await store.getServiceKey('NONE')).toBeNull();
  });

  it('writes no means value to the log', async () => {
    const lines: string[] = [];
    const record = (m: unknown) => lines.push(String(m));
    const log: ILogger = {
      debug: record,
      info: record,
      warn: record,
      error: record,
    };
    const store = new EnvDestinationStore(dir, { log });
    await store.setDestination('D', {
      authType: 'basic',
      username: 'SENTINEL-user',
      password: 'SENTINEL-password',
      uaaUrl: 'u',
      uaaClientId: 'SENTINEL-client',
      uaaClientSecret: 'SENTINEL-secret',
    });
    await store.getServiceKey('D');
    expect(lines.join('\n')).not.toContain('SENTINEL');
  });

  describe('a client certificate (3.3.0)', () => {
    const CERT_PEM = [
      '-----BEGIN CERTIFICATE-----',
      'SENTINELcertBODYleaf==',
      '-----END CERTIFICATE-----',
      '-----BEGIN CERTIFICATE-----',
      'SENTINELcertBODYchain==',
      '-----END CERTIFICATE-----',
      '',
    ].join('\r\n');
    const KEY_PEM = [
      '-----BEGIN PRIVATE KEY-----',
      'SENTINELkeyBODY==',
      '-----END PRIVATE KEY-----',
      '',
    ].join('\n');
    const UAA_URL = 'https://sub.authentication.example';
    const CERT_URL = 'https://sub.authentication.cert.example';

    /** Every case runs against the literal on-disk names of both maps. */
    const MAPS = [
      {
        name: 'ABAP keys',
        variables: ABAP_DESTINATION_VARS,
        names: {
          cert: 'SAP_UAA_CLIENT_CERT_PATH',
          key: 'SAP_UAA_CLIENT_KEY_PATH',
          certUrl: 'SAP_UAA_CERT_URL',
          secret: 'SAP_UAA_CLIENT_SECRET',
          url: 'SAP_UAA_URL',
          id: 'SAP_UAA_CLIENT_ID',
          language: 'SAP_LANGUAGE',
        },
      },
      {
        name: 'XSUAA keys',
        variables: XSUAA_DESTINATION_VARS,
        names: {
          cert: 'XSUAA_UAA_CLIENT_CERT_PATH',
          key: 'XSUAA_UAA_CLIENT_KEY_PATH',
          certUrl: 'XSUAA_UAA_CERT_URL',
          secret: 'XSUAA_UAA_CLIENT_SECRET',
          url: 'XSUAA_UAA_URL',
          id: 'XSUAA_UAA_CLIENT_ID',
          language: 'XSUAA_LANGUAGE',
        },
      },
    ];
    type Names = (typeof MAPS)[number]['names'];
    type CertVar = 'cert' | 'key' | 'certUrl';

    let certPath: string;
    let keyPath: string;
    let readSync: jest.SpyInstance;
    let readAsync: jest.SpyInstance;
    beforeEach(() => {
      certPath = path.join(dir, 'client.crt');
      keyPath = path.join(dir, 'client.key');
      fs.writeFileSync(certPath, CERT_PEM);
      fs.writeFileSync(keyPath, KEY_PEM);
      readSync = jest.spyOn(nodeFs, 'readFileSync');
      readAsync = jest.spyOn(nodeFs.promises, 'readFile');
    });
    afterEach(() => {
      jest.restoreAllMocks();
    });

    /** The paths handed to any file reader, sync or async. */
    const pathsRead = (): string[] =>
      [...readSync.mock.calls, ...readAsync.mock.calls].map((call) =>
        String(call[0]),
      );
    const expectNoCertificateFileRead = () => {
      expect(pathsRead()).not.toContain(certPath);
      expect(pathsRead()).not.toContain(keyPath);
    };

    /** A hand-written destination file under the literal key names. */
    function writeEnv(lines: Record<string, string>): void {
      fs.writeFileSync(
        path.join(dir, 'D.env'),
        Object.entries(lines)
          .map(([k, v]) => `${k}=${v}`)
          .join('\n'),
      );
    }
    const valueFor = (v: CertVar): string =>
      v === 'cert' ? certPath : v === 'key' ? keyPath : CERT_URL;
    const certLines = (names: Names, which: readonly CertVar[]) =>
      Object.fromEntries(which.map((v) => [names[v], valueFor(v)]));

    /** The rejection of a call, attached before it settles. */
    async function refusalOf(
      p: Promise<unknown>,
    ): Promise<ClientCertificateError> {
      const error = await p.then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ClientCertificateError);
      return error as ClientCertificateError;
    }

    describe.each(MAPS)('$name', ({ variables, names }) => {
      it('none of the three: the client as before, no certificate', async () => {
        writeEnv({
          [names.url]: UAA_URL,
          [names.id]: 'client-id',
          [names.secret]: 'client-secret',
        });
        const store = new EnvDestinationStore(dir, { variables });

        expect(await store.getAuthorizationConfig('D')).toEqual({
          uaaUrl: UAA_URL,
          uaaClientId: 'client-id',
          uaaClientSecret: 'client-secret',
        });
        expect(await store.getClientCertificate('D')).toBeNull();
        expectNoCertificateFileRead();
      });

      it('all three and no client secret: no authorization config, the certificate client with the files read as given', async () => {
        writeEnv({
          [names.url]: UAA_URL,
          [names.id]: 'client-id',
          ...certLines(names, ['cert', 'key', 'certUrl']),
        });
        const store = new EnvDestinationStore(dir, { variables });

        expect(await store.getAuthorizationConfig('D')).toBeNull();
        const certificate: IClientCertificate | null =
          await store.getClientCertificate('D');
        expect(certificate).toEqual({
          uaaUrl: UAA_URL,
          clientId: 'client-id',
          certificate: CERT_PEM,
          key: KEY_PEM,
          certUrl: CERT_URL,
        });
        // the service key view carries no client either (and here nothing else)
        expect(await store.getServiceKey('D')).toBeNull();
      });

      it('a certificate client is not mistaken for a public one, even with a fallback secret', async () => {
        writeEnv({
          [names.url]: UAA_URL,
          [names.id]: 'client-id',
          ...certLines(names, ['cert', 'key', 'certUrl']),
        });
        const store = new EnvDestinationStore(dir, {
          variables,
          fallback: fakeKeyStore(null, CLIENT),
        });

        expect(await store.getAuthorizationConfig('D')).toBeNull();
      });

      it.each([
        [['cert'], ['key', 'certUrl']],
        [['key'], ['cert', 'certUrl']],
        [['certUrl'], ['cert', 'key']],
        [['cert', 'key'], ['certUrl']],
        [['cert', 'certUrl'], ['key']],
        [['key', 'certUrl'], ['cert']],
      ] as [CertVar[], CertVar[]][])(
        'some but not all (%j set): both methods refuse as incomplete, naming %j, reading no file',
        async (set, missing) => {
          writeEnv({
            [names.url]: UAA_URL,
            [names.id]: 'client-id',
            ...certLines(names, set),
          });
          const store = new EnvDestinationStore(dir, { variables });

          for (const call of [
            () => store.getAuthorizationConfig('D'),
            () => store.getClientCertificate('D'),
          ]) {
            const error = await refusalOf(call());
            expect(error.reason).toBe('incomplete');
            expect(error.message).toContain('incomplete');
            expect(error.variables).toEqual(missing.map((v) => names[v]));
            for (const v of missing) expect(error.message).toContain(names[v]);
            expect(error.message).not.toContain(certPath);
            expect(error.message).not.toContain(keyPath);
          }
          expectNoCertificateFileRead();
        },
      );

      it.each([
        [['cert']],
        [['key']],
        [['certUrl']],
        [['cert', 'key', 'certUrl']],
      ] as [CertVar[]][])(
        'any of them (%j) with the client secret variable: both refuse as a mixed client, reading no file',
        async (set) => {
          writeEnv({
            [names.url]: UAA_URL,
            [names.id]: 'client-id',
            [names.secret]: 'SENTINEL-secret',
            ...certLines(names, set),
          });
          const store = new EnvDestinationStore(dir, { variables });

          for (const call of [
            () => store.getAuthorizationConfig('D'),
            () => store.getClientCertificate('D'),
          ]) {
            const error = await refusalOf(call());
            expect(error.reason).toBe('mixed');
            expect(error.message).toContain('both a client secret');
            expect(error.message).toContain(names.secret);
            expect(error.message).not.toContain('SENTINEL');
            expect(error.variables).toEqual([
              names.secret,
              ...set.map((v) => names[v]),
            ]);
          }
          expectNoCertificateFileRead();
        },
      );

      it('a client secret written empty (a public client) with a certificate is mixed too', async () => {
        writeEnv({
          [names.url]: UAA_URL,
          [names.id]: 'client-id',
          [names.secret]: '',
          ...certLines(names, ['cert', 'key', 'certUrl']),
        });
        const store = new EnvDestinationStore(dir, { variables });

        expect(
          (await refusalOf(store.getAuthorizationConfig('D'))).reason,
        ).toBe('mixed');
        expectNoCertificateFileRead();
      });

      it('a certificate with no client id or UAA URL is incomplete, reading no file', async () => {
        writeEnv(certLines(names, ['cert', 'key', 'certUrl']));
        const store = new EnvDestinationStore(dir, { variables });

        const error = await refusalOf(store.getClientCertificate('D'));
        expect(error.reason).toBe('incomplete');
        expect(error.variables).toEqual([names.url, names.id]);
        // the three make it a certificate destination: no client here either
        expect(await store.getAuthorizationConfig('D')).toBeNull();
        expectNoCertificateFileRead();
      });

      it.each(['cert', 'key'] as const)(
        'an unreadable %s file: fixed words naming its variable, nothing of a path or a file',
        async (broken) => {
          // the other file exists and is read; the broken one is a directory
          const brokenPath = path.join(dir, 'SENTINEL-dir');
          fs.mkdirSync(brokenPath);
          writeEnv({
            [names.url]: UAA_URL,
            [names.id]: 'client-id',
            ...certLines(names, ['cert', 'key', 'certUrl']),
            [names[broken]]: brokenPath,
          });
          const store = new EnvDestinationStore(dir, { variables });

          const error = await refusalOf(store.getClientCertificate('D'));
          expect(error.reason).toBe('unreadable');
          expect(error.message).toContain('cannot be read');
          expect(error.message).toContain(names[broken]);
          expect(error.variables).toEqual([names[broken]]);
          expect(error.message).not.toContain('SENTINEL');
          expect(error.message).not.toContain(dir);
          expect(error).not.toHaveProperty('cause');
        },
      );

      it('setDestination writes the three under these names; a certificate client removes the client secret', async () => {
        const store = new EnvDestinationStore(dir, { variables });
        await store.setDestination('D', CLIENT);
        await store.setDestination('D', {
          uaaClientCertPath: certPath,
          uaaClientKeyPath: keyPath,
          uaaCertUrl: CERT_URL,
        });

        const text = fs.readFileSync(path.join(dir, 'D.env'), 'utf8');
        expect(text).not.toContain(names.secret);
        expect(text).toContain(`${names.cert}=`);
        expect(text).toContain(`${names.key}=`);
        expect(text).toContain(`${names.certUrl}=`);
        expect(await store.getAuthorizationConfig('D')).toBeNull();
        expect(await store.getClientCertificate('D')).toEqual({
          uaaUrl: CLIENT.uaaUrl,
          clientId: CLIENT.uaaClientId,
          certificate: CERT_PEM,
          key: KEY_PEM,
          certUrl: CERT_URL,
        });
      });

      it('setDestination writing a secret client removes the three', async () => {
        const store = new EnvDestinationStore(dir, { variables });
        await store.setDestination('D', {
          uaaUrl: UAA_URL,
          uaaClientId: 'client-id',
          uaaClientCertPath: certPath,
          uaaClientKeyPath: keyPath,
          uaaCertUrl: CERT_URL,
        });
        await store.setDestination('D', { uaaClientSecret: 'client-secret' });

        const text = fs.readFileSync(path.join(dir, 'D.env'), 'utf8');
        expect(text).not.toContain(names.cert);
        expect(text).not.toContain(names.key);
        expect(text).not.toContain(names.certUrl);
        expect(await store.getClientCertificate('D')).toBeNull();
        expect(await store.getAuthorizationConfig('D')).toEqual({
          uaaUrl: UAA_URL,
          uaaClientId: 'client-id',
          uaaClientSecret: 'client-secret',
        });
      });

      it('setDestination refuses a write carrying both kinds, writing nothing', async () => {
        const store = new EnvDestinationStore(dir, { variables });
        await expect(
          store.setDestination('D', {
            uaaClientSecret: 'SENTINEL-secret',
            uaaClientCertPath: certPath,
          }),
        ).rejects.toBeInstanceOf(ClientCertificateError);
        expect(fs.existsSync(path.join(dir, 'D.env'))).toBe(false);
      });

      describe('the fallback certificate', () => {
        const FALLBACK_CERT: IClientCertificate = {
          uaaUrl: 'https://fallback.authentication.example',
          clientId: 'fallback-client',
          certificate: 'SENTINEL-fallback-certificate',
          key: 'SENTINEL-fallback-key',
          certUrl: 'https://fallback.authentication.cert.example',
        };
        /** An XsuaaServiceKeyStore-like stub, with or without the method. */
        function keyStore(withMethod: boolean) {
          const stub = fakeKeyStore(null, null) as IServiceKeyStore & {
            calls: number;
          };
          stub.calls = 0;
          if (withMethod) {
            stub.getClientCertificate = async () => {
              stub.calls++;
              return FALLBACK_CERT;
            };
          }
          return stub;
        }

        it("a file stating no client answers the fallback's certificate", async () => {
          writeEnv({ [names.language]: 'EN' });
          const fallback = keyStore(true);
          const store = new EnvDestinationStore(dir, { variables, fallback });

          expect(await store.getClientCertificate('D')).toEqual(FALLBACK_CERT);
          expect(fallback.calls).toBe(1);
        });

        it("a client id written as '' is no client: the fallback's certificate", async () => {
          writeEnv({ [names.id]: '' });
          const fallback = keyStore(true);
          const store = new EnvDestinationStore(dir, { variables, fallback });

          expect(await store.getClientCertificate('D')).toEqual(FALLBACK_CERT);
        });

        it('a file stating a public client answers null, the fallback unasked — one client from both methods', async () => {
          writeEnv({ [names.url]: UAA_URL, [names.id]: 'file-client' });
          const fallback = keyStore(true);
          const store = new EnvDestinationStore(dir, { variables, fallback });

          expect(await store.getAuthorizationConfig('D')).toEqual({
            uaaUrl: UAA_URL,
            uaaClientId: 'file-client',
            uaaClientSecret: '',
          });
          expect(await store.getClientCertificate('D')).toBeNull();
          expect(fallback.calls).toBe(0);
        });

        it("no file at all answers the fallback's certificate", async () => {
          const fallback = keyStore(true);
          const store = new EnvDestinationStore(dir, { variables, fallback });

          expect(await store.getClientCertificate('D')).toEqual(FALLBACK_CERT);
        });

        it('a fallback without the method answers null', async () => {
          writeEnv({ [names.language]: 'EN' });
          const store = new EnvDestinationStore(dir, {
            variables,
            fallback: keyStore(false),
          });

          expect(await store.getClientCertificate('D')).toBeNull();
        });

        it.each(['client-secret', ''])(
          'a file stating a client secret (%j) answers null, the fallback unasked',
          async (secret) => {
            writeEnv({
              [names.url]: UAA_URL,
              [names.id]: 'client-id',
              [names.secret]: secret,
            });
            const fallback = keyStore(true);
            const store = new EnvDestinationStore(dir, { variables, fallback });

            expect(await store.getClientCertificate('D')).toBeNull();
            expect(fallback.calls).toBe(0);
          },
        );

        it("a file stating all three answers the file's certificate, the fallback unasked", async () => {
          writeEnv({
            [names.url]: UAA_URL,
            [names.id]: 'client-id',
            ...certLines(names, ['cert', 'key', 'certUrl']),
          });
          const fallback = keyStore(true);
          const store = new EnvDestinationStore(dir, { variables, fallback });

          expect(await store.getClientCertificate('D')).toEqual({
            uaaUrl: UAA_URL,
            clientId: 'client-id',
            certificate: CERT_PEM,
            key: KEY_PEM,
            certUrl: CERT_URL,
          });
          expect(fallback.calls).toBe(0);
        });

        it('a file stating some, or any with a secret, refuses, the fallback unasked', async () => {
          const fallback = keyStore(true);
          const store = new EnvDestinationStore(dir, { variables, fallback });

          writeEnv(certLines(names, ['cert']));
          expect(
            (await refusalOf(store.getClientCertificate('D'))).reason,
          ).toBe('incomplete');
          writeEnv({
            [names.secret]: 'client-secret',
            ...certLines(names, ['cert', 'key', 'certUrl']),
          });
          expect(
            (await refusalOf(store.getClientCertificate('D'))).reason,
          ).toBe('mixed');
          expect(fallback.calls).toBe(0);
        });
      });

      it('deleteDestination removes the three', async () => {
        const store = new EnvDestinationStore(dir, { variables });
        await store.setDestination('D', {
          uaaClientCertPath: certPath,
          uaaClientKeyPath: keyPath,
          uaaCertUrl: CERT_URL,
        });
        await store.deleteDestination('D');
        expect(fs.existsSync(path.join(dir, 'D.env'))).toBe(false);
      });
    });

    it('the default maps name exactly these keys', () => {
      expect(ABAP_DESTINATION_VARS.uaaClientCertPath).toBe(
        'SAP_UAA_CLIENT_CERT_PATH',
      );
      expect(ABAP_DESTINATION_VARS.uaaClientKeyPath).toBe(
        'SAP_UAA_CLIENT_KEY_PATH',
      );
      expect(ABAP_DESTINATION_VARS.uaaCertUrl).toBe('SAP_UAA_CERT_URL');
      expect(XSUAA_DESTINATION_VARS.uaaClientCertPath).toBe(
        'XSUAA_UAA_CLIENT_CERT_PATH',
      );
      expect(XSUAA_DESTINATION_VARS.uaaClientKeyPath).toBe(
        'XSUAA_UAA_CLIENT_KEY_PATH',
      );
      expect(XSUAA_DESTINATION_VARS.uaaCertUrl).toBe('XSUAA_UAA_CERT_URL');
    });

    describe('a custom map without the three keys', () => {
      // a 3.2.0 consumer's map: every key it had then, none of the new three
      const {
        uaaClientCertPath: _cert,
        uaaClientKeyPath: _key,
        uaaCertUrl: _certUrl,
        ...old
      } = ABAP_DESTINATION_VARS;
      const custom: DestinationVariables = { ...old };

      it('type-checks and supports no certificate destination', async () => {
        expect(custom).not.toHaveProperty('uaaClientCertPath');
        writeEnv({
          SAP_UAA_URL: UAA_URL,
          SAP_UAA_CLIENT_ID: 'client-id',
          SAP_UAA_CLIENT_SECRET: 'client-secret',
          SAP_UAA_CLIENT_CERT_PATH: certPath,
          SAP_UAA_CLIENT_KEY_PATH: keyPath,
          SAP_UAA_CERT_URL: CERT_URL,
        });
        const store = new EnvDestinationStore(dir, { variables: custom });

        expect(await store.getClientCertificate('D')).toBeNull();
        expect(await store.getAuthorizationConfig('D')).toEqual({
          uaaUrl: UAA_URL,
          uaaClientId: 'client-id',
          uaaClientSecret: 'client-secret',
        });
        expectNoCertificateFileRead();
      });

      it('refuses to write a certificate field it has no key for', async () => {
        const store = new EnvDestinationStore(dir, { variables: custom });
        await expect(
          store.setDestination('D', { uaaClientCertPath: certPath }),
        ).rejects.toThrow('uaaClientCertPath');
        expect(fs.existsSync(path.join(dir, 'D.env'))).toBe(false);
      });
    });
  });
});
