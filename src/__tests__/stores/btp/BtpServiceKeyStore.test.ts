/**
 * Unit tests for BtpServiceKeyStore (with mocks)
 */

import { BtpServiceKeyStore } from '../../../stores/btp/BtpServiceKeyStore';
import * as fs from 'fs';
import * as path from 'path';
import { jest } from '@jest/globals';

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('BtpServiceKeyStore', () => {
  let store: BtpServiceKeyStore;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const testDir = '/test';

  beforeEach(() => {
    jest.clearAllMocks();
    store = new BtpServiceKeyStore(testDir);
  });

  describe('getServiceKey', () => {
    it('should load and parse valid XSUAA service key', async () => {
      const destination = 'mcp';
      const filePath = path.join(testDir, `${destination}.json`);
      const serviceKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
        clientsecret: 'test-secret',
        tenantmode: 'shared',
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(serviceKey));

      const result = await store.getServiceKey(destination);

      expect(result).toBeDefined();
      expect(result?.uaaUrl).toBe(serviceKey.url);
      expect(result?.uaaClientId).toBe(serviceKey.clientid);
      expect(result?.uaaClientSecret).toBe(serviceKey.clientsecret);
      expect(mockFs.existsSync).toHaveBeenCalledWith(filePath);
      expect(mockFs.readFileSync).toHaveBeenCalledWith(filePath, 'utf8');
    });

    it('should return null if file not found', async () => {
      const destination = 'mcp';
      const filePath = path.join(testDir, `${destination}.json`);

      mockFs.existsSync.mockReturnValue(false);

      const result = await store.getServiceKey(destination);
      expect(result).toBeNull();
      expect(mockFs.existsSync).toHaveBeenCalledWith(filePath);
    });

    it('should throw error if service key format is invalid', async () => {
      const destination = 'mcp';
      const filePath = path.join(testDir, `${destination}.json`);
      const invalidKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
        },
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(invalidKey));

      await expect(store.getServiceKey(destination)).rejects.toThrow('Failed to parse service key');
    });
  });
});
