/**
 * Tests for AbapServiceKeyParser
 */

import { AbapServiceKeyParser } from '../../../parsers/abap/AbapServiceKeyParser';

describe('AbapServiceKeyParser', () => {
  let parser: AbapServiceKeyParser;

  beforeEach(() => {
    parser = new AbapServiceKeyParser();
  });

  describe('canParse', () => {
    it('should return true for valid ABAP service key with nested uaa object', () => {
      const validKey = {
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

      expect(parser.canParse(validKey)).toBe(true);
    });

    it('should return false for XSUAA format (no nested uaa)', () => {
      const xsuaaKey = {
        url: 'https://test.authentication.sap.hana.ondemand.com',
        clientid: 'test-client',
        clientsecret: 'test-secret',
      };

      const result = parser.canParse(xsuaaKey);
      expect(result).toBeFalsy();
    });

    it('should return false for null', () => {
      const result = parser.canParse(null);
      expect(result).toBeFalsy();
    });

    it('should return false for undefined', () => {
      const result = parser.canParse(undefined);
      expect(result).toBeFalsy();
    });

    it('should return false for array', () => {
      const result = parser.canParse([]);
      expect(result).toBeFalsy();
    });

    it('should return false for string', () => {
      expect(parser.canParse('string')).toBe(false);
    });
  });

  describe('parse', () => {
    it('should parse valid ABAP service key', () => {
      const validKey = {
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

      const result = parser.parse(validKey);
      expect(result).toEqual(validKey);
    });

    it('should throw error if uaa object is missing', () => {
      const invalidKey = {
        abap: {
          url: 'https://test.abap.sap.hana.ondemand.com',
        },
      };

      expect(() => parser.parse(invalidKey)).toThrow(
        'Service key does not match ABAP format (missing uaa object)',
      );
    });

    it('should throw error if uaa.url is missing', () => {
      const invalidKey = {
        uaa: {
          clientid: 'test-client',
          clientsecret: 'test-secret',
        },
      };

      expect(() => parser.parse(invalidKey)).toThrow(
        'Service key "uaa" object missing required fields: url, clientid, clientsecret',
      );
    });

    it('should throw error if uaa.clientid is missing', () => {
      const invalidKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
          clientsecret: 'test-secret',
        },
      };

      expect(() => parser.parse(invalidKey)).toThrow(
        'Service key "uaa" object missing required fields: url, clientid, clientsecret',
      );
    });

    it('should throw error if uaa.clientsecret is missing', () => {
      const invalidKey = {
        uaa: {
          url: 'https://test.authentication.sap.hana.ondemand.com',
          clientid: 'test-client',
        },
      };

      expect(() => parser.parse(invalidKey)).toThrow(
        'Service key "uaa" object missing required fields: url, clientid, clientsecret',
      );
    });
  });
});
