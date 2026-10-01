/**
 * A session store holds the session secret and nothing else (3.0.0).
 *
 * The secret is what authorizes within a session: `authorizationToken` or
 * `sessionCookies`, their `expiresAt`, and the `refreshToken`. Everything that
 * is used to obtain a secret — the URL, the type and grant, a user and
 * password, the SNC, OIDC and SAML settings, the client, `sapClient`,
 * `language` — is means, and lives in a key store. A session write carrying
 * means is refused, naming the fields and never a value, so a caller still on
 * the 2.x roles learns of it instead of losing what it wrote.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  IConfig,
  ISessionStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import { SafeAbapSessionStore } from '../../stores/abap/SafeAbapSessionStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { SafeXsuaaSessionStore } from '../../stores/xsuaa/SafeXsuaaSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

type Make = (dir: string, log?: ILogger) => ISessionStore;

interface Variant {
  name: string;
  make: Make;
  /** The XSUAA stores hold a token: no cookies, never without a token. */
  tokenOnly: boolean;
}

const VARIANTS: Variant[] = [
  {
    name: 'AbapSessionStore',
    make: (dir, log) => new AbapSessionStore(dir, log),
    tokenOnly: false,
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
  },
];

/** Means fields by group, each with a value no message may carry. */
const MEANS_GROUPS: Record<string, IConfig> = {
  'URL and type': {
    serviceUrl: 'https://SENTINEL-url.example',
    authType: 'jwt',
    grantType: 'authorization_code',
  },
  basic: { username: 'SENTINEL-user', password: 'SENTINEL-password' },
  SNC: {
    sncPartnerName: 'p:CN=SENTINEL',
    sncQop: '9',
    sncLib: '/SENTINEL/lib.so',
    sncMyName: 'p:CN=SENTINEL-me',
  },
  client: {
    uaaUrl: 'https://SENTINEL-uaa.example',
    uaaClientId: 'SENTINEL-client',
    uaaClientSecret: 'SENTINEL-secret',
  },
  OIDC: {
    oidcIssuerUrl: 'https://SENTINEL-issuer.example',
    oidcAuthorizationEndpoint: 'https://SENTINEL-issuer.example/auth',
    oidcTokenEndpoint: 'https://SENTINEL-issuer.example/token',
    oidcDeviceAuthorizationEndpoint: 'https://SENTINEL-issuer.example/device',
    oidcScopes: ['SENTINEL-scope'],
    oidcSubjectToken: 'SENTINEL-subject',
    oidcSubjectTokenType: 'SENTINEL-subject-type',
    oidcAudience: 'SENTINEL-audience',
    oidcActorToken: 'SENTINEL-actor',
    oidcActorTokenType: 'SENTINEL-actor-type',
  },
  SAML: {
    samlIdpSsoUrl: 'https://SENTINEL-idp.example/sso',
    samlIdpEntityId: 'SENTINEL-idp',
    samlIdpCertificates: ['SENTINEL-cert'],
    samlSpEntityId: 'SENTINEL-sp',
    samlAcsUrl: 'https://SENTINEL-sp.example/acs',
    samlRelayState: 'SENTINEL-relay',
    samlIdpInitiated: true,
    samlClockSkewMs: 1234567,
    samlTokenUrl: 'https://SENTINEL-uaa.example/oauth/token',
  },
  'sapClient and language': { sapClient: '777', language: 'SENTINEL-lang' },
};

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.SECRET-ACCESS.sig';
const REFRESH = 'SECRET-REFRESH-r';
const COOKIES = 'SAP_SESSIONID_X=SECRET-COOKIE; sap-usercontext=c';
const EXPIRES = 1_900_000_000_000;

describe.each(VARIANTS)(
  '$name — the session secret alone',
  ({ make, tokenOnly }) => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-secret-'));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('keeps a token, its expiry and a refresh token written with no serviceUrl', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        expiresAt: EXPIRES,
        refreshToken: REFRESH,
      });

      expect(await store.loadSession('D')).toEqual({
        authorizationToken: TOKEN,
        expiresAt: EXPIRES,
        refreshToken: REFRESH,
      });
      expect(await store.getConnectionConfig('D')).toEqual({
        authorizationToken: TOKEN,
        expiresAt: EXPIRES,
      });
    });

    describe.each(Object.entries(MEANS_GROUPS))(
      'a write carrying means (%s)',
      (_group, means) => {
        const fields = Object.keys(means).sort();

        it('is refused by saveSession, naming every field and no value', async () => {
          const store = make(dir);
          const failure = await store
            .saveSession('D', { authorizationToken: TOKEN, ...means })
            .catch((e: unknown) => e);

          expect(failure).toBeInstanceOf(Error);
          const error = failure as Error & { code?: string; fields?: string[] };
          expect(error.code).toBe('INVALID_CONFIG');
          expect(error.fields).toEqual(fields);
          for (const field of fields) expect(error.message).toContain(field);
          expect(error.message).not.toContain('SENTINEL');
          expect(error.message).not.toContain('777');
          expect(error.message).not.toContain('1234567');
          expect(error.message).not.toContain(TOKEN);
          // and nothing was written
          expect(await store.loadSession('D')).toBeNull();
        });

        it('is refused by setConnectionConfig, naming every field and no value', async () => {
          const store = make(dir);
          const failure = await store
            .setConnectionConfig('D', { authorizationToken: TOKEN, ...means })
            .catch((e: unknown) => e);

          const error = failure as Error & { fields?: string[] };
          expect(error).toBeInstanceOf(Error);
          expect(error.fields).toEqual(fields);
          expect(error.message).not.toContain('SENTINEL');
          expect(await store.loadSession('D')).toBeNull();
        });
      },
    );

    it('ignores a means field given as undefined (not carried)', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        serviceUrl: undefined,
        authType: undefined,
      });
      expect(await store.loadSession('D')).toEqual({
        authorizationToken: TOKEN,
      });
    });

    it('refuses setAuthorizationConfig: a session holds no client', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        refreshToken: REFRESH,
      });
      const failure = await store
        .setAuthorizationConfig('D', {
          uaaUrl: 'https://SENTINEL-uaa.example',
          uaaClientId: 'SENTINEL-client',
          uaaClientSecret: 'SENTINEL-secret',
          refreshToken: 'SENTINEL-refresh',
        })
        .catch((e: unknown) => e);

      const error = failure as Error & { fields?: string[] };
      expect(error).toBeInstanceOf(Error);
      expect(error.fields).toEqual([
        'uaaClientId',
        'uaaClientSecret',
        'uaaUrl',
      ]);
      expect(error.message).not.toContain('SENTINEL');
      expect(await store.loadSession('D')).toEqual({
        authorizationToken: TOKEN,
        refreshToken: REFRESH,
      });
    });

    it('answers getAuthorizationConfig with null', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        refreshToken: REFRESH,
      });
      expect(await store.getAuthorizationConfig('D')).toBeNull();
    });

    it('keeps the stored refresh token when a new token comes without one', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        refreshToken: REFRESH,
      });
      await store.saveSession('D', { authorizationToken: `${TOKEN}-2` });
      expect(await store.loadSession('D')).toEqual({
        authorizationToken: `${TOKEN}-2`,
        refreshToken: REFRESH,
      });
    });

    it('writes and clears expiresAt with the credential it belongs to', async () => {
      const store = make(dir);
      await store.saveSession('D', {
        authorizationToken: TOKEN,
        expiresAt: EXPIRES,
      });
      // a new credential with no expiry does not inherit the old one's
      await store.saveSession('D', { authorizationToken: `${TOKEN}-2` });
      expect(await store.loadSession('D')).toEqual({
        authorizationToken: `${TOKEN}-2`,
      });
    });

    it('answers no session when nothing was written', async () => {
      const store = make(dir);
      expect(await store.loadSession('D')).toBeNull();
      expect(await store.getConnectionConfig('D')).toBeNull();
    });

    it('writes no secret value to the log', async () => {
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
        expiresAt: EXPIRES,
        refreshToken: REFRESH,
      });
      await store.loadSession('D');
      await store.getConnectionConfig('D');
      await store.saveSession('D', { serviceUrl: 'x' }).catch(() => undefined);
      const all = lines.join('\n');
      expect(all).not.toContain('SECRET');
    });

    if (tokenOnly) {
      it('still refuses a session without a token', async () => {
        const store = make(dir);
        await expect(
          store.saveSession('D', { refreshToken: REFRESH }),
        ).rejects.toThrow(/authorizationToken/);
        expect(await store.loadSession('D')).toBeNull();
      });

      it('refuses cookies: its session is a token', async () => {
        const store = make(dir);
        const failure = await store
          .saveSession('D', {
            authorizationToken: TOKEN,
            sessionCookies: COOKIES,
          })
          .catch((e: unknown) => e);
        const error = failure as Error & { fields?: string[] };
        expect(error).toBeInstanceOf(Error);
        expect(error.fields).toEqual(['sessionCookies']);
        expect(error.message).not.toContain('SECRET');
      });
    } else {
      it('a token then cookies clears the token, and back', async () => {
        const store = make(dir);
        await store.saveSession('D', {
          authorizationToken: TOKEN,
          expiresAt: EXPIRES,
        });
        await store.saveSession('D', {
          sessionCookies: COOKIES,
          expiresAt: EXPIRES + 1,
        });
        expect(await store.loadSession('D')).toEqual({
          sessionCookies: COOKIES,
          expiresAt: EXPIRES + 1,
        });

        await store.setConnectionConfig('D', { authorizationToken: TOKEN });
        expect(await store.loadSession('D')).toEqual({
          authorizationToken: TOKEN,
        });
      });

      it('an empty token clears it', async () => {
        const store = make(dir);
        await store.saveSession('D', {
          authorizationToken: TOKEN,
          expiresAt: EXPIRES,
          refreshToken: REFRESH,
        });
        await store.saveSession('D', { authorizationToken: '' });
        expect(await store.loadSession('D')).toEqual({ refreshToken: REFRESH });
      });
    }
  },
);
