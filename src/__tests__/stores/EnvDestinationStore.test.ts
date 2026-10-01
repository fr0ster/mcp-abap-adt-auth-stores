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
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  IConfig,
  IConnectionConfig,
  IServiceKeyStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { IAuthorizationConfig } from '@mcp-abap-adt/interfaces-auth-sap';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  ABAP_DESTINATION_VARS,
  EnvDestinationStore,
  XSUAA_DESTINATION_VARS,
} from '../../stores/destination/EnvDestinationStore';

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
      const { EnvFileSessionStore } = await import(
        '../../stores/env/EnvFileSessionStore'
      );
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
});
