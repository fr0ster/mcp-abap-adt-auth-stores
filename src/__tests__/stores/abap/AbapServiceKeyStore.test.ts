/**
 * Unit tests for AbapServiceKeyStore (with mocks)
 */

import { AbapServiceKeyStore } from '../../../stores/abap/AbapServiceKeyStore';
import { createTestLogger } from '../../helpers/testLogger';
import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('AbapServiceKeyStore', () => {
  let store: AbapServiceKeyStore;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const testDir = '/test';

  beforeEach(() => {
    jest.clearAllMocks();
    store = new AbapServiceKeyStore(testDir);
  });

  describe('getServiceKey', () => {
    it('should load and parse valid ABAP service key', async () => {
      const destination = 'TRIAL';
      const filePath = path.join(testDir, `${destination}.json`);
      const serviceKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
          clientid: 'test-client',
          clientsecret: 'test-secret',
        },
        abap: {
          url: 'https://test.abap.sap.hana.ondemand.com',
          client: '001',
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceKey));

      const result = await store.getServiceKey(destination);

      expect(result).toBeDefined();
      expect(result?.uaaUrl).toBe(serviceKey.uaa.url);
      expect(result?.uaaClientId).toBe(serviceKey.uaa.clientid);
      expect(result?.uaaClientSecret).toBe(serviceKey.uaa.clientsecret);
      expect(result?.serviceUrl).toBe(serviceKey.abap.url);
      expect(result?.sapClient).toBe(serviceKey.abap.client);
      expect(mockFs.existsSync).toHaveBeenCalledWith(filePath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('should return null if file not found', async () => {
      const destination = 'TRIAL';
      const filePath = path.join(testDir, `${destination}.json`);

      mockFs.existsSync.mockReturnValue(false);

      const result = await store.getServiceKey(destination);
      expect(result).toBeNull();
      expect(mockFs.existsSync).toHaveBeenCalledWith(filePath);
    });

    it('should throw error if file content is invalid JSON', async () => {
      const destination = 'TRIAL';
      const filePath = path.join(testDir, `${destination}.json`);

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      await expect(store.getServiceKey(destination)).rejects.toThrow();
    });

    it('should throw error if service key format is invalid', async () => {
      const destination = 'TRIAL';
      const filePath = path.join(testDir, `${destination}.json`);
      const invalidKey = {
        abap: {
          url: 'https://test.abap.sap.hana.ondemand.com',
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidKey));

      await expect(store.getServiceKey(destination)).rejects.toThrow('Failed to parse service key');
    });
  });

  describe('getAuthorizationConfig', () => {
    it('should return authorization config from valid ABAP service key', async () => {
      const destination = 'TRIAL';
      const filePath = path.join(testDir, `${destination}.json`);
      const serviceKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
          clientid: 'test-client',
          clientsecret: 'test-secret',
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceKey));

      const result = await store.getAuthorizationConfig(destination);

      expect(result).toBeDefined();
      expect(result?.uaaUrl).toBe(serviceKey.uaa.url);
      expect(result?.uaaClientId).toBe(serviceKey.uaa.clientid);
      expect(result?.uaaClientSecret).toBe(serviceKey.uaa.clientsecret);
    });

    it('should log operations when logger is provided', async () => {
      const logger = createTestLogger('TEST-STORE');
      const storeWithLogger = new AbapServiceKeyStore(testDir, logger);
      const destination = 'TRIAL';
      const serviceKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
          clientid: 'test-client',
          clientsecret: 'test-secret',
        },
      };

      jest.spyOn(logger, 'debug');
      jest.spyOn(logger, 'info');

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceKey));

      await storeWithLogger.getAuthorizationConfig(destination);

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining(`Reading service key file:`));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining(`File read successfully`));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining(`Parsed service key structure`));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Authorization config loaded from`));
    });

    it('should return null if file not found', async () => {
      const destination = 'TRIAL';
      const filePath = path.join(testDir, `${destination}.json`);

      mockFs.existsSync.mockReturnValue(false);

      const result = await store.getAuthorizationConfig(destination);
      expect(result).toBeNull();
      expect(mockFs.existsSync).toHaveBeenCalledWith(filePath);
    });
  });

  describe('getConnectionConfig', () => {
    it('should return connection config from valid ABAP service key', async () => {
      const destination = 'TRIAL';
      const filePath = path.join(testDir, `${destination}.json`);
      const serviceKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
          clientid: 'test-client',
          clientsecret: 'test-secret',
        },
        abap: {
          url: 'https://test.abap.sap.hana.ondemand.com',
          client: '001',
          language: 'EN',
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceKey));

      const result = await store.getConnectionConfig(destination);

      expect(result).toBeDefined();
      expect(result?.serviceUrl).toBe(serviceKey.abap.url);
      expect(result?.sapClient).toBe(serviceKey.abap.client);
      expect(result?.language).toBe(serviceKey.abap.language);
    });

    it('should return null if file not found', async () => {
      const destination = 'TRIAL';
      const filePath = path.join(testDir, `${destination}.json`);

      mockFs.existsSync.mockReturnValue(false);

      const result = await store.getConnectionConfig(destination);
      expect(result).toBeNull();
      expect(mockFs.existsSync).toHaveBeenCalledWith(filePath);
    });
  });
});
