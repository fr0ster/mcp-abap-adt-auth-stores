/**
 * Integration tests for BtpSessionStore
 * Tests with real .env files from test-config.yaml
 */

import { BtpSessionStore } from '../../../stores/btp/BtpSessionStore';
import type { IConfig } from '@mcp-abap-adt/auth-broker';
import {
  loadTestConfig,
  hasRealConfig,
  getXsuaaDestinations,
  getSessionsDir,
} from '../../helpers/configHelpers';

describe('BtpSessionStore Integration', () => {
  const config = loadTestConfig();
  const xsuaaDestinations = getXsuaaDestinations(config);
  const sessionsDir = getSessionsDir(config);
  const hasRealXsuaaConfig = hasRealConfig(config, 'xsuaa');

  describe('Real file operations', () => {
    it('should load BTP session from real .env file', async () => {
      if (!hasRealXsuaaConfig) {
        console.warn('⚠️  Skipping BTP session load test - no real config');
        return;
      }

      if (!xsuaaDestinations.btp_destination || !sessionsDir) {
        console.warn('⚠️  Skipping BTP session load test - missing required config');
        return;
      }

      const store = new BtpSessionStore(sessionsDir);

      const session = await store.loadSession(xsuaaDestinations.btp_destination);
      
      // Session may not exist, but store should not throw error
      expect(session).toBeDefined();
    }, 10000);

    it('should save and load BTP session', async () => {
      if (!hasRealXsuaaConfig) {
        console.warn('⚠️  Skipping BTP session save/load test - no real config');
        return;
      }

      if (!xsuaaDestinations.btp_destination || !sessionsDir) {
        console.warn('⚠️  Skipping BTP session save/load test - missing required config');
        return;
      }

      const store = new BtpSessionStore(sessionsDir);

      // Create test session config
      const testSession: IConfig = {
        serviceUrl: xsuaaDestinations.mcp_url || 'https://test.mcp.com',
        authorizationToken: 'test-jwt-token',
        refreshToken: 'test-refresh-token',
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'test-client-id',
        uaaClientSecret: 'test-client-secret',
      };

      // Save session
      await store.saveSession(xsuaaDestinations.btp_destination, testSession);

      // Load session
      const loadedSession = await store.loadSession(xsuaaDestinations.btp_destination);
      
      expect(loadedSession).toBeDefined();
      expect(loadedSession).not.toBeNull();
      
      if (loadedSession) {
        expect(loadedSession.serviceUrl).toBe(testSession.serviceUrl);
        expect(loadedSession.authorizationToken).toBe(testSession.authorizationToken);
        expect(loadedSession.refreshToken).toBe(testSession.refreshToken);
        expect(loadedSession.uaaUrl).toBe(testSession.uaaUrl);
        expect(loadedSession.uaaClientId).toBe(testSession.uaaClientId);
        expect(loadedSession.uaaClientSecret).toBe(testSession.uaaClientSecret);
      }

      // Clean up - delete test session
      await store.deleteSession(xsuaaDestinations.btp_destination);
    }, 10000);

    it('should get authorization config from real session', async () => {
      if (!hasRealXsuaaConfig) {
        console.warn('⚠️  Skipping BTP authorization config test - no real config');
        return;
      }

      if (!xsuaaDestinations.btp_destination || !sessionsDir) {
        console.warn('⚠️  Skipping BTP authorization config test - missing required config');
        return;
      }

      const store = new BtpSessionStore(sessionsDir);

      const authConfig = await store.getAuthorizationConfig(xsuaaDestinations.btp_destination);
      
      // May be null if session doesn't exist
      if (authConfig) {
        expect(authConfig.uaaUrl).toBeDefined();
        expect(authConfig.uaaClientId).toBeDefined();
        expect(authConfig.uaaClientSecret).toBeDefined();
      }
    }, 10000);
  });
});

