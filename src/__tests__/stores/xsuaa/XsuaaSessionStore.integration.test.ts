/**
 * Integration tests for XsuaaSessionStore — with the real sessions directory named in
 * tests/test-config.yaml. Without that file (the template's placeholders), each
 * case returns at once, saying so.
 *
 * The write case writes a destination of its own and removes it: it never
 * touches the configured destination's real session.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { XsuaaSessionStore } from '../../../stores/xsuaa/XsuaaSessionStore';
import {
  getSessionsDir,
  getXsuaaDestinations,
  hasRealConfig,
  loadTestConfig,
} from '../../helpers/configHelpers';

describe('XsuaaSessionStore Integration', () => {
  const canWrite = async (dir: string): Promise<boolean> => {
    const probePath = path.join(dir, `.write-test-${Date.now().toString(36)}`);
    try {
      await fs.writeFile(probePath, 'probe', 'utf8');
      await fs.rm(probePath, { force: true });
      return true;
    } catch {
      return false;
    }
  };

  const config = loadTestConfig();
  const destination = getXsuaaDestinations(config).btp_destination;
  const sessionsDir = getSessionsDir(config);
  const hasReal = hasRealConfig(config, 'xsuaa');

  it('loads the configured session from its real .env file: the secret alone', async () => {
    if (!hasReal || !destination || !sessionsDir) {
      console.warn('⚠️  Skipping XSUAA session load test - no real config');
      return;
    }
    const store = new XsuaaSessionStore(sessionsDir);
    const session = await store.loadSession(destination);
    if (session) {
      for (const key of Object.keys(session)) {
        expect([
          'authorizationToken',
          'sessionCookies',
          'expiresAt',
          'refreshToken',
        ]).toContain(key);
      }
    }
    expect(await store.getAuthorizationConfig(destination)).toBeNull();
  }, 10000);

  it('saves, loads and removes a session of its own in the real directory', async () => {
    if (!hasReal || !sessionsDir) {
      console.warn('⚠️  Skipping XSUAA session save/load test - no real config');
      return;
    }
    if (!(await canWrite(sessionsDir))) {
      console.warn(
        '⚠️  Skipping XSUAA session save/load test - sessions directory not writable',
      );
      return;
    }
    const own = `auth-stores-it-${Date.now().toString(36)}`;
    const store = new XsuaaSessionStore(sessionsDir);
    try {
      await store.saveSession(own, {
        authorizationToken: 'test-jwt-token',
        expiresAt: 1_900_000_000_000,
        refreshToken: 'test-refresh-token',
      });
      expect(await store.loadSession(own)).toEqual({
        authorizationToken: 'test-jwt-token',
        expiresAt: 1_900_000_000_000,
        refreshToken: 'test-refresh-token',
      });
    } finally {
      await store.deleteSession(own);
    }
    expect(await store.loadSession(own)).toBeNull();
  }, 10000);
});
