/**
 * Tests for ABAP env loader (SAML cookies)
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadEnvFile } from '../../../storage/abap/envLoader';
import { ABAP_CONNECTION_VARS } from '../../../utils/constants';

describe('loadEnvFile (ABAP)', () => {
  it('should decode SAML session cookies from base64', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abap-env-'));
    const destination = 'saml-destination';
    const envPath = path.join(tempDir, `${destination}.env`);

    const sessionCookies = 'MYSAPSSO2=abc; SAP_SESSIONID=123';
    const cookiesB64 = Buffer.from(sessionCookies, 'utf8').toString('base64');

    const envContent = [
      `${ABAP_CONNECTION_VARS.SERVICE_URL}=https://test.sap.com`,
      `${ABAP_CONNECTION_VARS.SESSION_COOKIES_B64}=${cookiesB64}`,
    ].join('\n');

    await fs.writeFile(envPath, `${envContent}\n`, 'utf8');

    const config = await loadEnvFile(destination, tempDir);

    expect(config).toBeDefined();
    expect(config?.sapUrl).toBe('https://test.sap.com');
    expect(config?.authType).toBe('saml');
    expect(config?.sessionCookies).toBe(sessionCookies);

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
