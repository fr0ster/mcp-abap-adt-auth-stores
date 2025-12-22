/**
 * Integration tests for AbapServiceKeyStore
 * Tests with real JSON files from test-config.yaml
 */

import { AbapServiceKeyStore } from '../../../stores/abap/AbapServiceKeyStore';
import {
  getAbapDestination,
  getServiceKeysDir,
  hasRealConfig,
  loadTestConfig,
} from '../../helpers/configHelpers';

describe('AbapServiceKeyStore Integration', () => {
  const config = loadTestConfig();
  const abapDestination = getAbapDestination(config);
  const serviceKeysDir = getServiceKeysDir(config);
  const hasRealAbapConfig = hasRealConfig(config, 'abap');

  describe('Real file operations', () => {
    it('should load ABAP service key from real file', async () => {
      if (!hasRealAbapConfig) {
        console.warn('⚠️  Skipping ABAP integration test - no real config');
        return;
      }

      if (!abapDestination || !serviceKeysDir) {
        console.warn(
          '⚠️  Skipping ABAP integration test - missing required config',
        );
        return;
      }

      const store = new AbapServiceKeyStore(serviceKeysDir);

      const serviceKey = await store.getServiceKey(abapDestination);

      expect(serviceKey).toBeDefined();
      expect(serviceKey).not.toBeNull();

      if (serviceKey) {
        expect(serviceKey.uaaUrl).toBeDefined();
        expect(serviceKey.uaaClientId).toBeDefined();
        expect(serviceKey.uaaClientSecret).toBeDefined();
      }
    }, 10000);

    it('should get authorization config from real ABAP service key', async () => {
      if (!hasRealAbapConfig) {
        console.warn(
          '⚠️  Skipping ABAP authorization config test - no real config',
        );
        return;
      }

      if (!abapDestination || !serviceKeysDir) {
        console.warn(
          '⚠️  Skipping ABAP authorization config test - missing required config',
        );
        return;
      }

      const store = new AbapServiceKeyStore(serviceKeysDir);

      const authConfig = await store.getAuthorizationConfig(abapDestination);

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

    it('should get connection config from real ABAP service key', async () => {
      if (!hasRealAbapConfig) {
        console.warn(
          '⚠️  Skipping ABAP connection config test - no real config',
        );
        return;
      }

      if (!abapDestination || !serviceKeysDir) {
        console.warn(
          '⚠️  Skipping ABAP connection config test - missing required config',
        );
        return;
      }

      const store = new AbapServiceKeyStore(serviceKeysDir);

      const connConfig = await store.getConnectionConfig(abapDestination);

      expect(connConfig).toBeDefined();
      // Service key may not have serviceUrl, but should return config object
      expect(connConfig).not.toBeNull();
    }, 10000);
  });
});
