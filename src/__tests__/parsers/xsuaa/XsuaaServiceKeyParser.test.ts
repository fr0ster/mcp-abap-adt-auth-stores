/**
 * Tests for XsuaaServiceKeyParser
 */

import { XsuaaServiceKeyParser } from '../../../parsers/xsuaa/XsuaaServiceKeyParser';

describe('XsuaaServiceKeyParser', () => {
  let parser: XsuaaServiceKeyParser;

  beforeEach(() => {
    parser = new XsuaaServiceKeyParser();
  });

  describe('canParse', () => {
    it('should return true for valid XSUAA service key', () => {
      const validKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
        clientsecret: 'test-secret',
        tenantmode: 'shared',
      };

      expect(parser.canParse(validKey)).toBe(true);
    });

    it('should return false for ABAP format (with nested uaa)', () => {
      const abapKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
          clientid: 'test-client',
          clientsecret: 'test-secret',
        },
      };

      expect(parser.canParse(abapKey)).toBe(false);
    });

    it('should return false if url is missing', () => {
      const invalidKey = {
        clientid: 'test-client',
        clientsecret: 'test-secret',
      };

      expect(parser.canParse(invalidKey)).toBe(false);
    });

    it('should return false if clientid is missing', () => {
      const invalidKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientsecret: 'test-secret',
      };

      expect(parser.canParse(invalidKey)).toBe(false);
    });

    it('should return false if clientsecret is missing', () => {
      const invalidKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
      };

      expect(parser.canParse(invalidKey)).toBe(false);
    });

    it('should return false for empty strings', () => {
      const invalidKey = {
        url: '',
        clientid: 'test-client',
        clientsecret: 'test-secret',
      };

      expect(parser.canParse(invalidKey)).toBe(false);
    });

    it('should return false for null', () => {
      expect(parser.canParse(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(parser.canParse(undefined)).toBe(false);
    });

    it('should return false for array', () => {
      expect(parser.canParse([])).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse valid XSUAA service key', () => {
      const validKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
        clientsecret: 'test-secret',
        tenantmode: 'shared',
      };

      const result = parser.parse(validKey) as any;
      expect(result.uaa.url).toBe(validKey.url);
      expect(result.uaa.clientid).toBe(validKey.clientid);
      expect(result.uaa.clientsecret).toBe(validKey.clientsecret);
    });

    it('should use url (not apiurl) for UAA authorization', () => {
      const validKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        apiurl: 'https://api.test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
        clientsecret: 'test-secret',
      };

      const result = parser.parse(validKey) as any;
      // For OAuth2 authorization endpoint, use 'url' (not 'apiurl')
      // 'apiurl' is for API calls, authorization uses base 'url'
      expect(result.uaa.url).toBe('https://test.authentication.sap.hana.ondemand.com');
    });

    it('should preserve abap object if present', () => {
      const validKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
        clientsecret: 'test-secret',
        abap: {
          url: 'https://test.abap.sap.hana.ondemand.com',
          client: '001',
        },
      };

      const result = parser.parse(validKey) as any;
      expect(result.abap).toEqual(validKey.abap);
    });

    it('should preserve optional fields', () => {
      const validKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
        clientsecret: 'test-secret',
        sap_url: 'https://test.sap.sap.hana.ondemand.com',
        client: '001',
        sap_client: '001',
        language: 'EN',
      };

      const result = parser.parse(validKey) as any;
      expect(result.sap_url).toBe(validKey.sap_url);
      expect(result.client).toBe(validKey.client);
      expect(result.sap_client).toBe(validKey.sap_client);
      expect(result.language).toBe(validKey.language);
    });

    it('should throw error if format does not match', () => {
      const invalidKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
        },
      };

      expect(() => parser.parse(invalidKey)).toThrow('Service key does not match XSUAA format');
    });
  });
});

