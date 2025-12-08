/**
 * Tests for SafeBtpSessionStore - broker usage scenarios
 * Tests how store behaves when used as in AuthBroker (without saveSession)
 */

import { SafeBtpSessionStore } from '../../../stores/btp/SafeBtpSessionStore';
import type { IConnectionConfig, IAuthorizationConfig } from '@mcp-abap-adt/interfaces';
import { createTestLogger } from '../../helpers/testLogger';

describe('SafeBtpSessionStore - Broker Usage', () => {
  let store: SafeBtpSessionStore;
  const testDestination = 'test-destination';

  beforeEach(() => {
    store = new SafeBtpSessionStore(createTestLogger());
  });

  describe('setConnectionConfig - new session', () => {
    it('should create new session when calling setConnectionConfig on empty store', async () => {
      const connConfig: IConnectionConfig = {
        serviceUrl: 'https://test.mcp.com',
        authorizationToken: 'test-jwt-token',
      };

      await store.setConnectionConfig(testDestination, connConfig);

      const loaded = await store.getConnectionConfig(testDestination);
      expect(loaded).toBeDefined();
      expect(loaded?.serviceUrl).toBe(connConfig.serviceUrl);
      expect(loaded?.authorizationToken).toBe(connConfig.authorizationToken);
    });

    it('should create new session even without serviceUrl (mcpUrl is optional)', async () => {
      const connConfig: IConnectionConfig = {
        authorizationToken: 'test-jwt-token',
      };

      await store.setConnectionConfig(testDestination, connConfig);

      const loaded = await store.getConnectionConfig(testDestination);
      expect(loaded).toBeDefined();
      expect(loaded?.authorizationToken).toBe(connConfig.authorizationToken);
      expect(loaded?.serviceUrl).toBeUndefined();
    });
  });

  describe('setAuthorizationConfig - new session', () => {
    it('should create new session when calling setAuthorizationConfig first (mcpUrl optional)', async () => {
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
    });

    it('should create new session when calling setAuthorizationConfig after setConnectionConfig', async () => {
      const connConfig: IConnectionConfig = {
        serviceUrl: 'https://test.mcp.com',
        authorizationToken: 'test-jwt-token',
      };
      await store.setConnectionConfig(testDestination, connConfig);

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

      const loadedConn = await store.getConnectionConfig(testDestination);
      expect(loadedConn?.serviceUrl).toBe(connConfig.serviceUrl);
      expect(loadedConn?.authorizationToken).toBe(connConfig.authorizationToken);
    });
  });

  describe('setConnectionConfig - update existing session', () => {
    it('should update existing session when calling setConnectionConfig again', async () => {
      const connConfig1: IConnectionConfig = {
        serviceUrl: 'https://test1.mcp.com',
        authorizationToken: 'token1',
      };
      await store.setConnectionConfig(testDestination, connConfig1);

      const connConfig2: IConnectionConfig = {
        serviceUrl: 'https://test2.mcp.com',
        authorizationToken: 'token2',
      };
      await store.setConnectionConfig(testDestination, connConfig2);

      const loaded = await store.getConnectionConfig(testDestination);
      expect(loaded?.serviceUrl).toBe(connConfig2.serviceUrl);
      expect(loaded?.authorizationToken).toBe(connConfig2.authorizationToken);
    });
  });

  describe('setAuthorizationConfig - update existing session', () => {
    it('should update existing session when calling setAuthorizationConfig again', async () => {
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
      const connConfig: IConnectionConfig = {
        serviceUrl: 'https://test.mcp.com',
        authorizationToken: 'new-jwt-token',
      };
      await store.setConnectionConfig(testDestination, connConfig);

      const authConfig: IAuthorizationConfig = {
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'test-client-id',
        uaaClientSecret: 'test-client-secret',
        refreshToken: 'new-refresh-token',
      };
      await store.setAuthorizationConfig(testDestination, authConfig);

      const fullSession = await store.loadSession(testDestination);
      expect(fullSession).toBeDefined();
      expect(fullSession?.serviceUrl).toBe(connConfig.serviceUrl);
      expect(fullSession?.authorizationToken).toBe(connConfig.authorizationToken);
      expect(fullSession?.uaaUrl).toBe(authConfig.uaaUrl);
      expect(fullSession?.refreshToken).toBe(authConfig.refreshToken);
    });

    it('should handle broker flow: setAuthorizationConfig then setConnectionConfig', async () => {
      const authConfig: IAuthorizationConfig = {
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'test-client-id',
        uaaClientSecret: 'test-client-secret',
        refreshToken: 'refresh-token',
      };
      await store.setAuthorizationConfig(testDestination, authConfig);

      const connConfig: IConnectionConfig = {
        serviceUrl: 'https://test.mcp.com',
        authorizationToken: 'new-jwt-token',
      };
      await store.setConnectionConfig(testDestination, connConfig);

      const fullSession = await store.loadSession(testDestination);
      expect(fullSession).toBeDefined();
      expect(fullSession?.serviceUrl).toBe(connConfig.serviceUrl);
      expect(fullSession?.authorizationToken).toBe(connConfig.authorizationToken);
      expect(fullSession?.uaaUrl).toBe(authConfig.uaaUrl);
      expect(fullSession?.refreshToken).toBe(authConfig.refreshToken);
    });

    it('should handle broker flow: multiple token refreshes', async () => {
      await store.setConnectionConfig(testDestination, {
        serviceUrl: 'https://test.mcp.com',
        authorizationToken: 'token1',
      });
      await store.setAuthorizationConfig(testDestination, {
        uaaUrl: 'https://test.uaa.com',
        uaaClientId: 'client',
        uaaClientSecret: 'secret',
        refreshToken: 'refresh1',
      });

      await store.setConnectionConfig(testDestination, {
        serviceUrl: 'https://test.mcp.com',
        authorizationToken: 'token2',
      });

      const connConfig = await store.getConnectionConfig(testDestination);
      expect(connConfig?.authorizationToken).toBe('token2');
      
      const authConfig = await store.getAuthorizationConfig(testDestination);
      expect(authConfig?.refreshToken).toBe('refresh1');
    });
  });
});
