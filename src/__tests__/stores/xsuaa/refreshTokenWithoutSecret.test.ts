/**
 * A session with a refresh token and no client secret keeps its refresh token.
 *
 * The broker keeps the client secret in the service key and writes only the
 * tokens to the session. `loadSession` took the refresh token from
 * `getAuthorizationConfig`, which answers only a complete config (URL, client
 * ID and secret), so such a session came back without its refresh token and
 * the next expiry meant a new login. Measured on 1.2.2 for both XSUAA stores;
 * the ABAP stores were not affected.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SafeXsuaaSessionStore } from '../../../stores/xsuaa/SafeXsuaaSessionStore';
import { XsuaaSessionStore } from '../../../stores/xsuaa/XsuaaSessionStore';

const SESSION = {
  serviceUrl: 'https://mcp.example',
  authorizationToken: 'eyJ.header.sig',
  refreshToken: 'opaque-refresh-token-34-characters',
  uaaUrl: 'https://uaa.example',
  uaaClientId: 'client-id',
};

describe.each([
  [
    'XsuaaSessionStore',
    () =>
      new XsuaaSessionStore(
        fs.mkdtempSync(path.join(os.tmpdir(), 'xsuaa-')),
        'https://mcp.example',
      ),
  ],
  [
    'SafeXsuaaSessionStore',
    () => new SafeXsuaaSessionStore('https://mcp.example'),
  ],
])('%s, a session without a client secret', (_name, make) => {
  it('loads the refresh token it saved', async () => {
    const store = make();
    await store.saveSession('D', SESSION);

    const loaded = await store.loadSession('D');

    expect(loaded?.refreshToken).toBe(SESSION.refreshToken);
    expect(loaded?.uaaUrl).toBe(SESSION.uaaUrl);
    expect(loaded?.uaaClientId).toBe(SESSION.uaaClientId);
    expect(loaded?.uaaClientSecret).toBeUndefined();
  });

  it('still answers no complete authorization config', async () => {
    // Unchanged on purpose: a refresh grant needs the secret, which lives in
    // the service key, and callers of getAuthorizationConfig rely on getting
    // all three fields or nothing.
    const store = make();
    await store.saveSession('D', SESSION);
    expect(await store.getAuthorizationConfig('D')).toBeNull();
  });

  it('keeps a secret the session does hold', async () => {
    const store = make();
    await store.saveSession('D', { ...SESSION, uaaClientSecret: 'secret' });
    const loaded = await store.loadSession('D');
    expect(loaded?.uaaClientSecret).toBe('secret');
    expect(loaded?.refreshToken).toBe(SESSION.refreshToken);
  });
});
