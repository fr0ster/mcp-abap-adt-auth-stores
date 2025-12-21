/**
 * Tests for EnvFileSessionStore
 * Tests reading .env files and in-memory token updates
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EnvFileSessionStore } from '../../../stores/env/EnvFileSessionStore';
import { createTestLogger } from '../../helpers/testLogger';

describe('EnvFileSessionStore', () => {
  let tempDir: string;
  let store: EnvFileSessionStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-store-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createEnvFile(content: string): string {
    const envPath = path.join(tempDir, '.env');
    fs.writeFileSync(envPath, content, 'utf8');
    return envPath;
  }

  describe('Basic Auth', () => {
    it('should load basic auth config from .env file', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_CLIENT=100
SAP_AUTH_TYPE=basic
SAP_USERNAME=testuser
SAP_PASSWORD=testpass
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const authType = store.getAuthType();
      expect(authType).toBe('basic');

      const config = await store.getConnectionConfig('default');
      expect(config).toBeDefined();
      expect(config?.serviceUrl).toBe('https://test.sap.com');
      expect(config?.sapClient).toBe('100');
      expect(config?.authType).toBe('basic');
      expect(config?.username).toBe('testuser');
      expect(config?.password).toBe('testpass');
    });

    it('should default to basic auth when SAP_AUTH_TYPE is not specified', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_USERNAME=testuser
SAP_PASSWORD=testpass
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const authType = store.getAuthType();
      expect(authType).toBe('basic');
    });

    it('should fail if SAP_USERNAME is missing for basic auth', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_AUTH_TYPE=basic
SAP_PASSWORD=testpass
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const authType = store.getAuthType();
      expect(authType).toBeNull(); // Failed to load
    });
  });

  describe('JWT Auth', () => {
    it('should load JWT auth config from .env file', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test
SAP_REFRESH_TOKEN=refresh-token-123
SAP_UAA_URL=https://test.uaa.com
SAP_UAA_CLIENT_ID=client-id
SAP_UAA_CLIENT_SECRET=client-secret
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const authType = store.getAuthType();
      expect(authType).toBe('jwt');

      const config = await store.getConnectionConfig('default');
      expect(config).toBeDefined();
      expect(config?.serviceUrl).toBe('https://test.sap.com');
      expect(config?.authType).toBe('jwt');
      expect(config?.authorizationToken).toBe('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test');

      const authConfig = await store.getAuthorizationConfig('default');
      expect(authConfig).toBeDefined();
      expect(authConfig?.uaaUrl).toBe('https://test.uaa.com');
      expect(authConfig?.uaaClientId).toBe('client-id');
      expect(authConfig?.uaaClientSecret).toBe('client-secret');

      const refreshToken = await store.getRefreshToken('default');
      expect(refreshToken).toBe('refresh-token-123');
    });

    it('should fail if SAP_JWT_TOKEN is missing for JWT auth', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_AUTH_TYPE=jwt
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const authType = store.getAuthType();
      expect(authType).toBeNull(); // Failed to load
    });
  });

  describe('Validation', () => {
    it('should fail if SAP_URL is missing', async () => {
      const envPath = createEnvFile(`
SAP_CLIENT=100
SAP_USERNAME=testuser
SAP_PASSWORD=testpass
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const config = await store.getConnectionConfig('default');
      expect(config).toBeNull();
    });

    it('should fail if .env file does not exist', async () => {
      store = new EnvFileSessionStore('/non/existent/path/.env', createTestLogger());

      const config = await store.getConnectionConfig('default');
      expect(config).toBeNull();
    });
  });

  describe('Parsing', () => {
    it('should handle quoted values', async () => {
      const envPath = createEnvFile(`
SAP_URL="https://test.sap.com"
SAP_USERNAME='testuser'
SAP_PASSWORD="test'pass"
SAP_AUTH_TYPE=basic
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const config = await store.getConnectionConfig('default');
      expect(config?.serviceUrl).toBe('https://test.sap.com');
      expect(config?.username).toBe('testuser');
      expect(config?.password).toBe("test'pass");
    });

    it('should handle comments', async () => {
      const envPath = createEnvFile(`
# This is a comment
SAP_URL=https://test.sap.com
SAP_USERNAME=testuser
SAP_PASSWORD=testpass # inline comment
SAP_AUTH_TYPE=basic
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const config = await store.getConnectionConfig('default');
      expect(config?.serviceUrl).toBe('https://test.sap.com');
      expect(config?.password).toBe('testpass');
    });

    it('should handle empty lines', async () => {
      const envPath = createEnvFile(`

SAP_URL=https://test.sap.com

SAP_USERNAME=testuser
SAP_PASSWORD=testpass
SAP_AUTH_TYPE=basic

      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const config = await store.getConnectionConfig('default');
      expect(config).toBeDefined();
      expect(config?.serviceUrl).toBe('https://test.sap.com');
    });
  });

  describe('In-Memory Updates', () => {
    it('should store token updates in memory', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=original-token
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      // Original token
      let token = await store.getToken('default');
      expect(token).toBe('original-token');

      // Update token in memory
      await store.setToken('default', 'new-refreshed-token');

      // Should get updated token
      token = await store.getToken('default');
      expect(token).toBe('new-refreshed-token');

      // Original file should not be modified
      const fileContent = fs.readFileSync(envPath, 'utf8');
      expect(fileContent).toContain('original-token');
      expect(fileContent).not.toContain('new-refreshed-token');
    });

    it('should store refresh token updates in memory', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=token
SAP_REFRESH_TOKEN=original-refresh
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      await store.setRefreshToken('default', 'new-refresh-token');

      const refreshToken = await store.getRefreshToken('default');
      expect(refreshToken).toBe('new-refresh-token');
    });

    it('should merge in-memory updates with file data', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=original-token
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      // Update only token
      await store.setToken('default', 'new-token');

      // Connection config should still have original serviceUrl and sapClient
      const config = await store.getConnectionConfig('default');
      expect(config?.serviceUrl).toBe('https://test.sap.com');
      expect(config?.sapClient).toBe('100');
      expect(config?.authorizationToken).toBe('new-token');
    });

    it('clear() should reset in-memory updates', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=original-token
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      await store.setToken('default', 'new-token');
      store.clear();

      // Should re-read from file
      const token = await store.getToken('default');
      expect(token).toBe('original-token');
    });
  });

  describe('loadSession / saveSession', () => {
    it('loadSession should return IConfig format', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_CLIENT=100
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=test-token
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      const session = await store.loadSession('default');
      expect(session).toBeDefined();
      expect(session?.serviceUrl).toBe('https://test.sap.com');
      expect(session?.sapClient).toBe('100');
      expect(session?.authorizationToken).toBe('test-token');
    });

    it('saveSession should update in-memory state', async () => {
      const envPath = createEnvFile(`
SAP_URL=https://test.sap.com
SAP_AUTH_TYPE=jwt
SAP_JWT_TOKEN=original-token
      `);

      store = new EnvFileSessionStore(envPath, createTestLogger());

      await store.saveSession('default', {
        serviceUrl: 'https://test.sap.com',
        authType: 'jwt',
        authorizationToken: 'saved-token',
      });

      const session = await store.loadSession('default');
      expect(session?.authorizationToken).toBe('saved-token');
    });
  });
});
