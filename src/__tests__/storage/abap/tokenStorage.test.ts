/**
 * Tests for ABAP token storage (SAML cookies)
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
import { saveTokenToEnv } from '../../../storage/abap/tokenStorage';
import { ABAP_CONNECTION_VARS } from '../../../utils/constants';

describe('saveTokenToEnv (ABAP)', () => {
  it('should store SAML session cookies as base64 and clear other auth fields', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abap-env-'));
    const destination = 'saml-destination';

    const sessionCookies = 'MYSAPSSO2=abc; SAP_SESSIONID=123';
    const cookiesB64 = Buffer.from(sessionCookies, 'utf8').toString('base64');

    await saveTokenToEnv(destination, tempDir, {
      sapUrl: 'https://test.sap.com',
      sessionCookies,
    });

    const envPath = path.join(tempDir, `${destination}.env`);
    const envContent = await fs.readFile(envPath, 'utf8');
    const parsed = dotenv.parse(envContent);

    expect(parsed[ABAP_CONNECTION_VARS.SERVICE_URL]).toBe(
      'https://test.sap.com',
    );
    expect(parsed[ABAP_CONNECTION_VARS.SESSION_COOKIES_B64]).toBe(cookiesB64);
    expect(parsed[ABAP_CONNECTION_VARS.AUTHORIZATION_TOKEN]).toBe('');
    expect(parsed[ABAP_CONNECTION_VARS.USERNAME]).toBeUndefined();
    expect(parsed[ABAP_CONNECTION_VARS.PASSWORD]).toBeUndefined();

    await fs.rm(tempDir, { recursive: true, force: true });
  });
});
