/**
 * Tests for AbapSessionStore - broker usage scenarios
 * Tests how store behaves when used as in AuthBroker (without saveSession)
 */

import { AbapSessionStore } from '../../../stores/abap/AbapSessionStore';
import type { IConnectionConfig, IAuthorizationConfig } from '@mcp-abap-adt/interfaces';
import { createTestLogger } from '../../helpers/testLogger';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

describe('AbapSessionStore - Broker Usage', () => {
  let tempDir: string;
  let store: AbapSessionStore;
  const testDestination = 'test-destination';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'abap-session-test-'));
    store = new AbapSessionStore(tempDir, createTestLogger());
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('setConnectionConfig - new session', () => {
    it('should create new session when calling setConnectionConfig on empty store', async () => {
      const connConfig: IConnectionConfig = {
        serviceUrl: 'https://test.sap.com',
        authorizationToken: 'test-jwt-token',
        sapClient: '001',
        language: 'EN',
      };

      await store.setConnectionConfig(testDestination, connConfig);

      const loaded = await store.getConnectionConfig(testDestination);
      expect(loaded).toBeDefined();
      expect(loaded?.serviceUrl).toBe(connConfig.serviceUrl);
      expect(loaded?.authorizationToken).toBe(connConfig.authorizationToken);
      expect(loaded?.sapClient).toBe(connConfig.sapClient);
      expect(loaded?.language).toBe(connConfig.language);
    });

    it('should throw error if serviceUrl is missing when creating new session', async () => {
      const connConfig: IConnectionConfig = {
        authorizationToken: 'test-jwt-token',
      };

      await expect(
        store.setConnectionConfig(testDestination, connConfig)
      ).rejects.toThrow('serviceUrl is required for ABAP sessions');
    });

    it('should use defaultServiceUrl from constructor when serviceUrl is not provided', async () => {
      const defaultServiceUrl = 'https://default.sap.com';
      const storeWithDefault = new AbapSessionStore(tempDir, createTestLogger(), defaultServiceUrl);
      
      const connConfig: IConnectionConfig = {
        authorizationToken: 'test-jwt-token',
        // serviceUrl not provided
      };

      await storeWithDefault.setConnectionConfig(testDestination, connConfig);

      const loaded = await storeWithDefault.getConnectionConfig(testDestination);
      expect(loaded).toBeDefined();
      expect(loaded?.serviceUrl).toBe(defaultServiceUrl);
      expect(loaded?.authorizationToken).toBe(connConfig.authorizationToken);
    });

    it('should prefer config.serviceUrl over defaultServiceUrl', async () => {
      const defaultServiceUrl = 'https://default.sap.com';
      const configServiceUrl = 'https://config.sap.com';
      const storeWithDefault = new AbapSessionStore(tempDir, createTestLogger(), defaultServiceUrl);
      
      const connConfig: IConnectionConfig = {
        serviceUrl: configServiceUrl,
        authorizationToken: 'test-jwt-token',
      };

      await storeWithDefault.setConnectionConfig(testDestination, connConfig);

      const loaded = await storeWithDefault.getConnectionConfig(testDestination);
      expect(loaded?.serviceUrl).toBe(configServiceUrl); // Should use config, not default
    });
  });

  describe('setAuthorizationConfig - new session', () => {
    it('should create new session when calling setAuthorizationConfig after setConnectionConfig', async () => {
      // First set connection config (creates session)
      const connConfig: IConnectionConfig = {
        serviceUrl: 'https://test.sap.com',
        authorizationToken: 'test-jwt-token',
      };
      await store.setConnectionConfig(testDestination, connConfig);

      // Then set authorization config (updates existing session)
      const authConfig: IAuthorizationConfig = {
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'test-client-id',
        uaaClientSecret: 'test-client-secret',
        refreshToken: 'test-refresh-token',
      };
      await store.setAuthorizationConfig(testDestination, authConfig);

      const loadedAuth = await store.getAuthorizationConfig(testDestination);
      expect(loadedAuth).toBeDefined();
      expect(loadedAuth?.uaaUrl).toBe(authConfig.uaaUrl);
      expect(loadedAuth?.uaaClientId).toBe(authConfig.uaaClientId);
      expect(loadedAuth?.uaaClientSecret).toBe(authConfig.uaaClientSecret);
      expect(loadedAuth?.refreshToken).toBe(authConfig.refreshToken);

      // Connection config should still be available
      const loadedConn = await store.getConnectionConfig(testDestination);
      expect(loadedConn?.serviceUrl).toBe(connConfig.serviceUrl);
      expect(loadedConn?.authorizationToken).toBe(connConfig.authorizationToken);
    });

    it('should throw error if calling setAuthorizationConfig without serviceUrl', async () => {
      const authConfig: IAuthorizationConfig = {
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'test-client-id',
        uaaClientSecret: 'test-client-secret',
      };

      await expect(
        store.setAuthorizationConfig(testDestination, authConfig)
      ).rejects.toThrow('serviceUrl is required for ABAP sessions');
    });

    it('should use defaultServiceUrl when calling setAuthorizationConfig without existing session', async () => {
      const defaultServiceUrl = 'https://default.sap.com';
      const storeWithDefault = new AbapSessionStore(tempDir, createTestLogger(), defaultServiceUrl);
      
      const authConfig: IAuthorizationConfig = {
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'test-client-id',
        uaaClientSecret: 'test-client-secret',
        refreshToken: 'test-refresh-token',
      };

      await storeWithDefault.setAuthorizationConfig(testDestination, authConfig);

      // Use loadSession to verify full session was created
      const fullSession = await storeWithDefault.loadSession(testDestination);
      expect(fullSession).toBeDefined();
      expect(fullSession?.serviceUrl).toBe(defaultServiceUrl);
      expect(fullSession?.uaaUrl).toBe(authConfig.uaaUrl);
      expect(fullSession?.uaaClientId).toBe(authConfig.uaaClientId);
      expect(fullSession?.uaaClientSecret).toBe(authConfig.uaaClientSecret);
      expect(fullSession?.refreshToken).toBe(authConfig.refreshToken);

      // getAuthorizationConfig should work
      const loadedAuth = await storeWithDefault.getAuthorizationConfig(testDestination);
      expect(loadedAuth).toBeDefined();
      expect(loadedAuth?.uaaUrl).toBe(authConfig.uaaUrl);
    });
  });

  describe('setConnectionConfig - update existing session', () => {
    it('should update existing session when calling setConnectionConfig again', async () => {
      const connConfig1: IConnectionConfig = {
        serviceUrl: 'https://test1.sap.com',
        authorizationToken: 'token1',
      };
      await store.setConnectionConfig(testDestination, connConfig1);

      const connConfig2: IConnectionConfig = {
        serviceUrl: 'https://test2.sap.com',
        authorizationToken: 'token2',
        sapClient: '002',
      };
      await store.setConnectionConfig(testDestination, connConfig2);

      const loaded = await store.getConnectionConfig(testDestination);
      expect(loaded?.serviceUrl).toBe(connConfig2.serviceUrl);
      expect(loaded?.authorizationToken).toBe(connConfig2.authorizationToken);
      expect(loaded?.sapClient).toBe(connConfig2.sapClient);
    });
  });

  describe('setAuthorizationConfig - update existing session', () => {
    it('should update existing session when calling setAuthorizationConfig again', async () => {
      const connConfig: IConnectionConfig = {
        serviceUrl: 'https://test.sap.com',
        authorizationToken: 'test-jwt-token',
      };
      await store.setConnectionConfig(testDestination, connConfig);

      const authConfig1: IAuthorizationConfig = {
        uaaUrl: 'https://test1.uaa.com',
        uaaClientId: 'client1',
        uaaClientSecret: 'secret1',
        refreshToken: 'refresh1',
      };
      await store.setAuthorizationConfig(testDestination, authConfig1);

      const authConfig2: IAuthorizationConfig = {
        uaaUrl: 'https://test2.uaa.com',
        uaaClientId: 'client2',
        uaaClientSecret: 'secret2',
        refreshToken: 'refresh2',
      };
      await store.setAuthorizationConfig(testDestination, authConfig2);

      const loaded = await store.getAuthorizationConfig(testDestination);
      expect(loaded?.uaaUrl).toBe(authConfig2.uaaUrl);
      expect(loaded?.uaaClientId).toBe(authConfig2.uaaClientId);
      expect(loaded?.uaaClientSecret).toBe(authConfig2.uaaClientSecret);
      expect(loaded?.refreshToken).toBe(authConfig2.refreshToken);
    });
  });

  describe('Broker flow simulation', () => {
    it('should handle broker flow: setConnectionConfig then setAuthorizationConfig', async () => {
      // Simulate broker flow: get token, then set connection config
      const connConfig: IConnectionConfig = {
        serviceUrl: 'https://test.sap.com',
        authorizationToken: 'new-jwt-token',
      };
      await store.setConnectionConfig(testDestination, connConfig);

      // Then set authorization config with refresh token
      const authConfig: IAuthorizationConfig = {
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'test-client-id',
        uaaClientSecret: 'test-client-secret',
        refreshToken: 'new-refresh-token',
      };
      await store.setAuthorizationConfig(testDestination, authConfig);

      // Verify full session is available
      const fullSession = await store.loadSession(testDestination);
      expect(fullSession).toBeDefined();
      expect(fullSession?.serviceUrl).toBe(connConfig.serviceUrl);
      expect(fullSession?.authorizationToken).toBe(connConfig.authorizationToken);
      expect(fullSession?.uaaUrl).toBe(authConfig.uaaUrl);
      expect(fullSession?.refreshToken).toBe(authConfig.refreshToken);
    });

    it('should handle broker flow: multiple token refreshes', async () => {
      // Initial setup
      await store.setConnectionConfig(testDestination, {
        serviceUrl: 'https://test.sap.com',
        authorizationToken: 'token1',
      });
      await store.setAuthorizationConfig(testDestination, {
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'client',
        uaaClientSecret: 'secret',
        refreshToken: 'refresh1',
      });

      // Simulate token refresh (broker calls setConnectionConfig with new token)
      await store.setConnectionConfig(testDestination, {
        serviceUrl: 'https://test.sap.com',
        authorizationToken: 'token2',
      });

      // Verify new token is stored
      const connConfig = await store.getConnectionConfig(testDestination);
      expect(connConfig?.authorizationToken).toBe('token2');
      
      // Authorization config should still be available
      const authConfig = await store.getAuthorizationConfig(testDestination);
      expect(authConfig?.refreshToken).toBe('refresh1');
    });
  });
});
