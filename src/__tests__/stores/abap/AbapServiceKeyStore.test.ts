/**
 * Tests for AbapServiceKeyStore
 */

import { AbapServiceKeyStore } from '../../../stores/abap/AbapServiceKeyStore';
import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

// Mock pathResolver
jest.mock('../../../utils/pathResolver', () => ({
  findFileInPaths: jest.fn(),
  resolveSearchPaths: jest.fn(() => ['/test']),
}));

describe('AbapServiceKeyStore', () => {
  let store: AbapServiceKeyStore;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockPathResolver = require('../../../utils/pathResolver');

  beforeEach(() => {
    jest.clearAllMocks();
    mockPathResolver.resolveSearchPaths.mockReturnValue(['/test']);
    store = new AbapServiceKeyStore();
  });

  describe('getServiceKey', () => {
    it('should load and parse valid ABAP service key', async () => {
      const destination = 'TRIAL';
      const filePath = `/test/${destination}.json`;
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

      mockPathResolver.findFileInPaths.mockReturnValue(filePath);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceKey));

      const result = await store.getServiceKey(destination);

      expect(result).toBeDefined();
      expect(result?.uaaUrl).toBe(serviceKey.uaa.url);
      expect(result?.uaaClientId).toBe(serviceKey.uaa.clientid);
      expect(result?.uaaClientSecret).toBe(serviceKey.uaa.clientsecret);
      expect(result?.serviceUrl).toBe(serviceKey.abap.url);
      expect(result?.sapClient).toBe(serviceKey.abap.client);
      expect(mockPathResolver.findFileInPaths).toHaveBeenCalledWith(
        `${destination}.json`,
        expect.any(Array)
      );
      expect(mockFs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('should return null if file not found', async () => {
      const destination = 'TRIAL';

      mockPathResolver.findFileInPaths.mockReturnValue(null);

      const result = await store.getServiceKey(destination);
      expect(result).toBeNull();
    });

    it('should throw error if file content is invalid JSON', async () => {
      const destination = 'TRIAL';
      const filePath = `/test/${destination}.json`;

      mockPathResolver.findFileInPaths.mockReturnValue(filePath);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('invalid json');

      await expect(store.getServiceKey(destination)).rejects.toThrow();
    });

    it('should throw error if service key format is invalid', async () => {
      const destination = 'TRIAL';
      const filePath = `/test/${destination}.json`;
      const invalidKey = {
        abap: {
          url: 'https://test.abap.sap.hana.ondemand.com',
        },
      };

      mockPathResolver.findFileInPaths.mockReturnValue(filePath);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidKey));

      await expect(store.getServiceKey(destination)).rejects.toThrow('Failed to parse service key');
    });
  });

  describe('getAuthorizationConfig', () => {
    it('should return authorization config from valid ABAP service key', async () => {
      const destination = 'TRIAL';
      const filePath = `/test/${destination}.json`;
      const serviceKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
          clientid: 'test-client',
          clientsecret: 'test-secret',
        },
      };

      mockPathResolver.findFileInPaths.mockReturnValue(filePath);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceKey));

      const result = await store.getAuthorizationConfig(destination);

      expect(result).toBeDefined();
      expect(result?.uaaUrl).toBe(serviceKey.uaa.url);
      expect(result?.uaaClientId).toBe(serviceKey.uaa.clientid);
      expect(result?.uaaClientSecret).toBe(serviceKey.uaa.clientsecret);
    });

    it('should return null if file not found', async () => {
      const destination = 'TRIAL';

      mockPathResolver.findFileInPaths.mockReturnValue(null);

      const result = await store.getAuthorizationConfig(destination);
      expect(result).toBeNull();
    });
  });

  describe('getConnectionConfig', () => {
    it('should return connection config from valid ABAP service key', async () => {
      const destination = 'TRIAL';
      const filePath = `/test/${destination}.json`;
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

      mockPathResolver.findFileInPaths.mockReturnValue(filePath);
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

      mockPathResolver.findFileInPaths.mockReturnValue(null);

      const result = await store.getConnectionConfig(destination);
      expect(result).toBeNull();
    });
  });
});

