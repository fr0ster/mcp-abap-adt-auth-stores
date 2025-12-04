/**
 * Integration tests for BtpServiceKeyStore
 * Tests with real JSON files from test-config.yaml
 */

import { BtpServiceKeyStore } from '../../../stores/btp/BtpServiceKeyStore';
import {
  loadTestConfig,
  hasRealConfig,
  getXsuaaDestinations,
  getServiceKeysDir,
} from '../../helpers/configHelpers';

describe('BtpServiceKeyStore Integration', () => {
  const config = loadTestConfig();
  const xsuaaDestinations = getXsuaaDestinations(config);
  const serviceKeysDir = getServiceKeysDir(config);
  const hasRealXsuaaConfig = hasRealConfig(config, 'xsuaa');

  describe('Real file operations', () => {
    it('should load BTP service key from real file', async () => {
      if (!hasRealXsuaaConfig) {
        console.warn('⚠️  Skipping BTP integration test - no real config');
        return;
      }

      if (!xsuaaDestinations.btp_destination || !serviceKeysDir) {
        console.warn('⚠️  Skipping BTP integration test - missing required config');
        return;
      }

      const store = new BtpServiceKeyStore(serviceKeysDir);

      const serviceKey = await store.getServiceKey(xsuaaDestinations.btp_destination);
      
      expect(serviceKey).toBeDefined();
      expect(serviceKey).not.toBeNull();
      
      if (serviceKey) {
        expect(serviceKey.uaaUrl).toBeDefined();
        expect(serviceKey.uaaClientId).toBeDefined();
        expect(serviceKey.uaaClientSecret).toBeDefined();
      }
    }, 10000);

    it('should get authorization config from real BTP service key', async () => {
      if (!hasRealXsuaaConfig) {
        console.warn('⚠️  Skipping BTP authorization config test - no real config');
        return;
      }

      if (!xsuaaDestinations.btp_destination || !serviceKeysDir) {
        console.warn('⚠️  Skipping BTP authorization config test - missing required config');
        return;
      }

      const store = new BtpServiceKeyStore(serviceKeysDir);

      const authConfig = await store.getAuthorizationConfig(xsuaaDestinations.btp_destination);
      
      expect(authConfig).toBeDefined();
      expect(authConfig).not.toBeNull();
      
      if (authConfig) {
        expect(authConfig.uaaUrl).toBeDefined();
        expect(authConfig.uaaUrl?.length).toBeGreaterThan(0);
        expect(authConfig.uaaClientId).toBeDefined();
        expect(authConfig.uaaClientId?.length).toBeGreaterThan(0);
        expect(authConfig.uaaClientSecret).toBeDefined();
        expect(authConfig.uaaClientSecret?.length).toBeGreaterThan(0);
      }
    }, 10000);
  });
});

