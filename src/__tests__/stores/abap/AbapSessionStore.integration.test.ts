/**
 * Integration tests for AbapSessionStore
 * Tests with real .env files from test-config.yaml
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { IConfig } from '@mcp-abap-adt/interfaces';
import { AbapSessionStore } from '../../../stores/abap/AbapSessionStore';
import {
  getAbapDestination,
  getSessionsDir,
  hasRealConfig,
  loadTestConfig,
} from '../../helpers/configHelpers';

describe('AbapSessionStore Integration', () => {
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
  const abapDestination = getAbapDestination(config);
  const sessionsDir = getSessionsDir(config);
  const hasRealAbapConfig = hasRealConfig(config, 'abap');

  describe('Real file operations', () => {
    it('should load ABAP session from real .env file', async () => {
      if (!hasRealAbapConfig) {
        console.warn('⚠️  Skipping ABAP session load test - no real config');
        return;
      }

      if (!abapDestination || !sessionsDir) {
        console.warn(
          '⚠️  Skipping ABAP session load test - missing required config',
        );
        return;
      }

      const store = new AbapSessionStore(sessionsDir);

      const session = await store.loadSession(abapDestination);

      // Session may not exist, but store should not throw error
      expect(session).toBeDefined();
    }, 10000);

    it('should save and load ABAP session', async () => {
      if (!hasRealAbapConfig) {
        console.warn(
          '⚠️  Skipping ABAP session save/load test - no real config',
        );
        return;
      }

      if (!abapDestination || !sessionsDir) {
        console.warn(
          '⚠️  Skipping ABAP session save/load test - missing required config',
        );
        return;
      }
      if (!(await canWrite(sessionsDir))) {
        console.warn(
          '⚠️  Skipping ABAP session save/load test - sessions directory not writable',
        );
        return;
      }

      const store = new AbapSessionStore(sessionsDir);

      // Create test session config
      const testSession: IConfig = {
        serviceUrl: 'https://test.sap.com',
        authorizationToken: 'test-jwt-token',
        refreshToken: 'test-refresh-token',
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'test-client-id',
        uaaClientSecret: 'test-client-secret',
        sapClient: '001',
        language: 'EN',
      };

      // Save session
      await store.saveSession(abapDestination, testSession);

      // Load session
      const loadedSession = await store.loadSession(abapDestination);

      expect(loadedSession).toBeDefined();
      expect(loadedSession).not.toBeNull();

      if (loadedSession) {
        expect(loadedSession.serviceUrl).toBe(testSession.serviceUrl);
        expect(loadedSession.authorizationToken).toBe(
          testSession.authorizationToken,
        );
        expect(loadedSession.refreshToken).toBe(testSession.refreshToken);
        expect(loadedSession.uaaUrl).toBe(testSession.uaaUrl);
        expect(loadedSession.uaaClientId).toBe(testSession.uaaClientId);
        expect(loadedSession.uaaClientSecret).toBe(testSession.uaaClientSecret);
        expect(loadedSession.sapClient).toBe(testSession.sapClient);
        expect(loadedSession.language).toBe(testSession.language);
      }

      // Clean up - delete test session
      await store.deleteSession(abapDestination);
    }, 10000);

    it('should get authorization config from real session', async () => {
      if (!hasRealAbapConfig) {
        console.warn(
          '⚠️  Skipping ABAP authorization config test - no real config',
        );
        return;
      }

      if (!abapDestination || !sessionsDir) {
        console.warn(
          '⚠️  Skipping ABAP authorization config test - missing required config',
        );
        return;
      }

      const store = new AbapSessionStore(sessionsDir);

      const authConfig = await store.getAuthorizationConfig(abapDestination);

      // May be null if session doesn't exist
      if (authConfig) {
        expect(authConfig.uaaUrl).toBeDefined();
        expect(authConfig.uaaClientId).toBeDefined();
        expect(authConfig.uaaClientSecret).toBeDefined();
      }
    }, 10000);

    it('should get connection config from real session', async () => {
      if (!hasRealAbapConfig) {
        console.warn(
          '⚠️  Skipping ABAP connection config test - no real config',
        );
        return;
      }

      if (!abapDestination || !sessionsDir) {
        console.warn(
          '⚠️  Skipping ABAP connection config test - missing required config',
        );
        return;
      }

      const store = new AbapSessionStore(sessionsDir);

      const connConfig = await store.getConnectionConfig(abapDestination);

      // May be null if session doesn't exist
      if (connConfig) {
        expect(connConfig.serviceUrl).toBeDefined();
        expect(connConfig.authorizationToken).toBeDefined();
      }
    }, 10000);
  });
});
