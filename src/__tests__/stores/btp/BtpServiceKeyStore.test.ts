/**
 * Tests for BtpServiceKeyStore
 */

import { BtpServiceKeyStore } from '../../../stores/btp/BtpServiceKeyStore';
import * as fs from 'fs';
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

describe('BtpServiceKeyStore', () => {
  let store: BtpServiceKeyStore;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockPathResolver = require('../../../utils/pathResolver');

  beforeEach(() => {
    jest.clearAllMocks();
    mockPathResolver.resolveSearchPaths.mockReturnValue(['/test']);
    store = new BtpServiceKeyStore();
  });

  describe('getServiceKey', () => {
    it('should load and parse valid XSUAA service key', async () => {
      const destination = 'mcp';
      const filePath = `/test/${destination}.json`;
      const serviceKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
        clientsecret: 'test-secret',
        tenantmode: 'shared',
      };

      mockPathResolver.findFileInPaths.mockReturnValue(filePath);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceKey));

      const result = await store.getServiceKey(destination);

      expect(result).toBeDefined();
      expect(result?.uaaUrl).toBe(serviceKey.url);
      expect(result?.uaaClientId).toBe(serviceKey.clientid);
      expect(result?.uaaClientSecret).toBe(serviceKey.clientsecret);
      expect(mockPathResolver.findFileInPaths).toHaveBeenCalledWith(
        `${destination}.json`,
        expect.any(Array)
      );
      expect(mockFs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('should return null if file not found', async () => {
      const destination = 'mcp';

      mockPathResolver.findFileInPaths.mockReturnValue(null);

      const result = await store.getServiceKey(destination);
      expect(result).toBeNull();
    });

    it('should throw error if service key format is invalid', async () => {
      const destination = 'mcp';
      const filePath = `/test/${destination}.json`;
      const invalidKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
        },
      };

      mockPathResolver.findFileInPaths.mockReturnValue(filePath);
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidKey));

      await expect(store.getServiceKey(destination)).rejects.toThrow('Failed to parse service key');
    });
  });
});

