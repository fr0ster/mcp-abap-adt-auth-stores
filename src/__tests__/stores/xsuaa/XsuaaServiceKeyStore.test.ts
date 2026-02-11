import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { XsuaaServiceKeyStore } from '../../../stores/xsuaa/XsuaaServiceKeyStore';

describe('XsuaaServiceKeyStore (service key variants)', () => {
  const destination = 'sso-demo';

  const baseKey = {
    clientid: 'client-id',
    clientsecret: 'client-secret',
    url: 'https://example.authentication.test',
    xsappname: 'demo-xsapp',
    tenantmode: 'dedicated',
  };

  const wrappedKey = {
    credentials: baseKey,
  };

  function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'xsuaa-keys-'));
  }

  it('should parse direct XSUAA service key', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, `${destination}.json`);
    fs.writeFileSync(filePath, JSON.stringify(baseKey, null, 2));

    const store = new XsuaaServiceKeyStore(dir);
    const authConfig = await store.getAuthorizationConfig(destination);

    expect(authConfig?.uaaUrl).toBe(baseKey.url);
    expect(authConfig?.uaaClientId).toBe(baseKey.clientid);
    expect(authConfig?.uaaClientSecret).toBe(baseKey.clientsecret);
  });

  it('should parse "cf service-key" output with credentials wrapper', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, `${destination}.json`);
    const content = `Getting key ${destination}...\n\n${JSON.stringify(
      wrappedKey,
      null,
      2,
    )}\n`;
    fs.writeFileSync(filePath, content);

    const store = new XsuaaServiceKeyStore(dir);
    const authConfig = await store.getAuthorizationConfig(destination);

    expect(authConfig?.uaaUrl).toBe(baseKey.url);
    expect(authConfig?.uaaClientId).toBe(baseKey.clientid);
    expect(authConfig?.uaaClientSecret).toBe(baseKey.clientsecret);
  });
});
