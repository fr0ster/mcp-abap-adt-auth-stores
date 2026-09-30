/**
 * AbapSessionStore - explicit authType (SAP_AUTH_TYPE), SNC fields, and basic
 * credentials through the ISessionStore contract.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AbapSessionStore } from '../../../stores/abap/AbapSessionStore';
import { createTestLogger } from '../../helpers/testLogger';

describe('AbapSessionStore - authType and SNC', () => {
  let dir: string;
  let store: AbapSessionStore;
  const dest = 'dest';
  const file = () => path.join(dir, `${dest}.env`);
  const write = (lines: string[]) =>
    fs.writeFile(file(), `${lines.join('\n')}\n`, 'utf8');

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'abap-authtype-'));
    store = new AbapSessionStore(dir, createTestLogger());
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  describe('SAP_AUTH_TYPE', () => {
    it.each([
      ['jwt', { authorizationToken: 't' }],
      ['basic', { username: 'u', password: 'p' }],
      ['saml', { sessionCookies: 'a=b' }],
      ['snc', { sncPartnerName: 'p:CN=X' }],
    ] as const)(
      'writes SAP_AUTH_TYPE=%s on save and reads it back',
      async (type, creds) => {
        await store.saveSession(dest, {
          serviceUrl: 'https://s',
          authType: type,
          ...creds,
        });
        expect(await fs.readFile(file(), 'utf8')).toContain(
          `SAP_AUTH_TYPE=${type}`,
        );
        expect((await store.getConnectionConfig(dest))?.authType).toBe(type);
        expect((await store.loadSession(dest))?.authType).toBe(type);
      },
    );

    it('infers a file without SAP_AUTH_TYPE as before', async () => {
      await write(['SAP_URL=https://s', 'SAP_JWT_TOKEN=tok']);
      expect((await store.getConnectionConfig(dest))?.authType).toBe('jwt');
      await write(['SAP_URL=https://s', 'SAP_USERNAME=u', 'SAP_PASSWORD=p']);
      expect((await store.getConnectionConfig(dest))?.authType).toBe('basic');
      await write([
        'SAP_URL=https://s',
        `SAP_SESSION_COOKIES_B64=${Buffer.from('a=b').toString('base64')}`,
      ]);
      const saml = await store.getConnectionConfig(dest);
      expect(saml?.authType).toBe('saml');
      expect(saml?.sessionCookies).toBe('a=b');
    });

    it('lets SAP_AUTH_TYPE win over inference', async () => {
      // inference alone says jwt (a token is present); the file says basic
      await write([
        'SAP_URL=https://s',
        'SAP_JWT_TOKEN=tok',
        'SAP_USERNAME=u',
        'SAP_PASSWORD=p',
        'SAP_AUTH_TYPE=basic',
      ]);
      const basic = await store.getConnectionConfig(dest);
      expect(basic?.authType).toBe('basic');
      expect(basic?.username).toBe('u');

      // inference alone says saml (cookies present); the file says jwt
      await write([
        'SAP_URL=https://s',
        'SAP_JWT_TOKEN=tok',
        `SAP_SESSION_COOKIES_B64=${Buffer.from('a=b').toString('base64')}`,
        'SAP_AUTH_TYPE=jwt',
      ]);
      const jwt = await store.getConnectionConfig(dest);
      expect(jwt?.authType).toBe('jwt');
      expect(jwt?.authorizationToken).toBe('tok');
    });

    it('ignores an unknown SAP_AUTH_TYPE and infers', async () => {
      await write([
        'SAP_URL=https://s',
        'SAP_JWT_TOKEN=tok',
        'SAP_AUTH_TYPE=bogus',
      ]);
      expect((await store.getConnectionConfig(dest))?.authType).toBe('jwt');
    });
  });

  describe('SNC', () => {
    const snc = {
      sncPartnerName: 'p:CN=SID, O=ORG',
      sncQop: '9',
      sncLib: '/opt/libsapcrypto.so',
      sncMyName: 'p:CN=ME',
    };

    it('round-trips through saveSession -> getConnectionConfig / loadSession', async () => {
      await store.saveSession(dest, {
        serviceUrl: 'https://s',
        authType: 'snc',
        sapClient: '100',
        language: 'EN',
        ...snc,
      });
      const text = await fs.readFile(file(), 'utf8');
      expect(text).toContain('SAP_SNC_QOP=9');
      expect(text).toContain('SAP_SNC_LIB=/opt/libsapcrypto.so');
      const conn = await store.getConnectionConfig(dest);
      expect(conn).toEqual({
        serviceUrl: 'https://s',
        authType: 'snc',
        sapClient: '100',
        language: 'EN',
        ...snc,
      });
      expect(await store.loadSession(dest)).toMatchObject({
        serviceUrl: 'https://s',
        authType: 'snc',
        ...snc,
      });
    });

    it('round-trips through setConnectionConfig with the optional fields absent', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: 'https://s',
        authType: 'snc',
        sncPartnerName: 'p:CN=X',
      });
      const conn = await store.getConnectionConfig(dest);
      expect(conn?.authType).toBe('snc');
      expect(conn?.sncPartnerName).toBe('p:CN=X');
      expect(conn?.sncQop).toBeUndefined();
      expect(conn?.authorizationToken).toBeUndefined();
    });

    it('needs sncPartnerName: a snc session without one is null', async () => {
      await write(['SAP_URL=https://s', 'SAP_AUTH_TYPE=snc']);
      expect(await store.getConnectionConfig(dest)).toBeNull();
    });

    it('a snc write clears the other modes credentials, and they clear the snc keys', async () => {
      await store.saveSession(dest, {
        serviceUrl: 'https://s',
        authorizationToken: 'tok',
        username: 'u',
        password: 'p',
        authType: 'basic',
      });
      await store.setConnectionConfig(dest, {
        serviceUrl: 'https://s',
        authType: 'snc',
        sncPartnerName: 'p:CN=X',
      });
      let text = await fs.readFile(file(), 'utf8');
      expect(text).not.toContain('SAP_USERNAME');
      expect(text).not.toContain('SAP_PASSWORD');
      expect(text).toMatch(/SAP_JWT_TOKEN=\n/);

      await store.setConnectionConfig(dest, {
        serviceUrl: 'https://s',
        authType: 'jwt',
        authorizationToken: 'tok2',
      });
      text = await fs.readFile(file(), 'utf8');
      expect(text).not.toContain('SAP_SNC_');
      const conn = await store.getConnectionConfig(dest);
      expect(conn?.authType).toBe('jwt');
      expect(conn?.authorizationToken).toBe('tok2');
    });

    it('keeps the snc fields when the authorization config is set on a snc session', async () => {
      await store.saveSession(dest, {
        serviceUrl: 'https://s',
        authType: 'snc',
        ...snc,
      });
      await store.setAuthorizationConfig(dest, {
        uaaUrl: 'https://uaa',
        uaaClientId: 'id',
        uaaClientSecret: 'secret',
      });
      const conn = await store.getConnectionConfig(dest);
      expect(conn?.authType).toBe('snc');
      expect(conn?.sncPartnerName).toBe(snc.sncPartnerName);
    });
  });

  describe('basic through setConnectionConfig', () => {
    it('creates a basic session', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: 'https://s',
        username: 'u',
        password: 'p',
        authType: 'basic',
      });
      const conn = await store.getConnectionConfig(dest);
      expect(conn).toMatchObject({
        serviceUrl: 'https://s',
        username: 'u',
        password: 'p',
        authType: 'basic',
      });
    });

    it('updates a basic session', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: 'https://s',
        username: 'u',
        password: 'p',
        authType: 'basic',
      });
      await store.setConnectionConfig(dest, {
        username: 'u2',
        password: 'p2',
        authType: 'basic',
      });
      expect(await store.getConnectionConfig(dest)).toMatchObject({
        serviceUrl: 'https://s',
        username: 'u2',
        password: 'p2',
        authType: 'basic',
      });
    });

    it('keeps the credentials when only another field is updated', async () => {
      await store.setConnectionConfig(dest, {
        serviceUrl: 'https://s',
        username: 'u',
        password: 'p',
        authType: 'basic',
      });
      await store.setConnectionConfig(dest, { language: 'DE' });
      expect(await store.getConnectionConfig(dest)).toMatchObject({
        username: 'u',
        password: 'p',
        authType: 'basic',
        language: 'DE',
      });
    });
  });
});
