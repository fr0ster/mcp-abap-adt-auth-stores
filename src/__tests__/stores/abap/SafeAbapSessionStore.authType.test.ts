/**
 * SafeAbapSessionStore - basic / SAML / SNC sessions without a token,
 * explicit authType, and the SNC fields.
 */

import { SafeAbapSessionStore } from '../../../stores/abap/SafeAbapSessionStore';
import { createTestLogger } from '../../helpers/testLogger';

describe('SafeAbapSessionStore - authType and SNC', () => {
  let store: SafeAbapSessionStore;
  const dest = 'dest';

  beforeEach(() => {
    store = new SafeAbapSessionStore(createTestLogger());
  });

  it('saves a basic session without a token', async () => {
    await store.saveSession(dest, {
      serviceUrl: 'https://s',
      username: 'u',
      password: 'p',
      authType: 'basic',
    });
    expect(await store.getConnectionConfig(dest)).toMatchObject({
      username: 'u',
      password: 'p',
      authType: 'basic',
    });
    expect(await store.loadSession(dest)).toMatchObject({
      username: 'u',
      password: 'p',
      authType: 'basic',
    });
  });

  it('saves a SAML session without a token and keeps the cookies', async () => {
    await store.saveSession(dest, {
      serviceUrl: 'https://s',
      sessionCookies: 'a=b; c=d',
      authType: 'saml',
    });
    expect(await store.getConnectionConfig(dest)).toMatchObject({
      sessionCookies: 'a=b; c=d',
      authType: 'saml',
    });
    expect((await store.loadSession(dest))?.sessionCookies).toBe('a=b; c=d');
  });

  it('saves a SNC session without a token and returns the SNC fields', async () => {
    const snc = {
      sncPartnerName: 'p:CN=X',
      sncQop: '9',
      sncLib: '/opt/lib.so',
      sncMyName: 'p:CN=ME',
    };
    await store.saveSession(dest, {
      serviceUrl: 'https://s',
      authType: 'snc',
      sapClient: '100',
      ...snc,
    });
    expect(await store.getConnectionConfig(dest)).toEqual({
      serviceUrl: 'https://s',
      authType: 'snc',
      sapClient: '100',
      ...snc,
    });
    expect(await store.loadSession(dest)).toMatchObject({
      authType: 'snc',
      ...snc,
    });
  });

  it('still refuses a session with no credential at all', async () => {
    await expect(
      store.saveSession(dest, { serviceUrl: 'https://s' }),
    ).rejects.toThrow('missing required field');
  });

  it('creates and updates a snc session through setConnectionConfig', async () => {
    await store.setConnectionConfig(dest, {
      serviceUrl: 'https://s',
      authType: 'snc',
      sncPartnerName: 'p:CN=X',
    });
    await store.setConnectionConfig(dest, { sncQop: '3' });
    expect(await store.getConnectionConfig(dest)).toMatchObject({
      authType: 'snc',
      sncPartnerName: 'p:CN=X',
      sncQop: '3',
    });
  });

  it('a snc session without sncPartnerName is null', async () => {
    await store.setConnectionConfig(dest, {
      serviceUrl: 'https://s',
      authType: 'snc',
    });
    expect(await store.getConnectionConfig(dest)).toBeNull();
  });

  it('records the authType a saved session implies when none is given', async () => {
    await store.saveSession(dest, {
      serviceUrl: 'https://s',
      authorizationToken: 't',
    });
    expect((await store.loadSession(dest))?.authType).toBe('jwt');
  });
});
