import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { ClientCertificateError } from '../../../errors/StoreErrors';
import { EnvDestinationStore } from '../../../stores/destination/EnvDestinationStore';
import { XsuaaServiceKeyStore } from '../../../stores/xsuaa/XsuaaServiceKeyStore';

describe('XsuaaServiceKeyStore (service key variants)', () => {
  const destination = 'sso-demo';

  const baseKey = {
    clientid: 'client-id',
    clientsecret: 'client-secret',
    url: 'https://example.authentication.test',
    xsappname: 'demo-xsapp',
    tenantmode: 'dedicated',
  };

  const wrappedKey = {
    credentials: baseKey,
  };

  function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'xsuaa-keys-'));
  }

  it('should parse direct XSUAA service key', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, `${destination}.json`);
    fs.writeFileSync(filePath, JSON.stringify(baseKey, null, 2));

    const store = new XsuaaServiceKeyStore(dir);
    const authConfig = await store.getAuthorizationConfig(destination);

    expect(authConfig?.uaaUrl).toBe(baseKey.url);
    expect(authConfig?.uaaClientId).toBe(baseKey.clientid);
    expect(authConfig?.uaaClientSecret).toBe(baseKey.clientsecret);
  });

  it('should parse "cf service-key" output with credentials wrapper', async () => {
    const dir = createTempDir();
    const filePath = path.join(dir, `${destination}.json`);
    const content = `Getting key ${destination}...\n\n${JSON.stringify(
      wrappedKey,
      null,
      2,
    )}\n`;
    fs.writeFileSync(filePath, content);

    const store = new XsuaaServiceKeyStore(dir);
    const authConfig = await store.getAuthorizationConfig(destination);

    expect(authConfig?.uaaUrl).toBe(baseKey.url);
    expect(authConfig?.uaaClientId).toBe(baseKey.clientid);
    expect(authConfig?.uaaClientSecret).toBe(baseKey.clientsecret);
  });
});

describe('XsuaaServiceKeyStore (x509 keys)', () => {
  const destination = 'x509-demo';
  const MARKER = 'PEMMARKERq7Zx';
  // A chain (leaf first) with CRLF line endings: returned as given.
  const CHAIN = [
    '-----BEGIN CERTIFICATE-----',
    `MIIBleaf${MARKER}AAAA`,
    '-----END CERTIFICATE-----',
    '-----BEGIN CERTIFICATE-----',
    `MIIBintermediate${MARKER}BBBB`,
    '-----END CERTIFICATE-----',
    '',
  ].join('\r\n');
  const KEY = [
    '-----BEGIN RSA PRIVATE KEY-----',
    `MIIEkey${MARKER}CCCC`,
    '-----END RSA PRIVATE KEY-----',
    '',
  ].join('\r\n');

  const x509Key = {
    clientid: 'sb-x509!t1',
    url: 'https://example.authentication.test',
    certurl: 'https://example.authentication.cert.test',
    certificate: CHAIN,
    key: KEY,
    'credential-type': 'x509',
    xsappname: 'demo-xsapp',
  };
  const secretKey = {
    clientid: 'client-id',
    clientsecret: 'client-secret',
    url: 'https://example.authentication.test',
  };

  function writeKey(content: unknown): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsuaa-x509-'));
    fs.writeFileSync(
      path.join(dir, `${destination}.json`),
      JSON.stringify(content, null, 2),
    );
    return dir;
  }

  function capturingLogger(lines: string[]): ILogger {
    const record = (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(' '));
    };
    return { debug: record, info: record, warn: record, error: record };
  }

  const expectedCertificate = {
    uaaUrl: x509Key.url,
    clientId: x509Key.clientid,
    certificate: CHAIN,
    key: KEY,
    certUrl: x509Key.certurl,
  };

  it.each([
    ['bare', x509Key],
    ['wrapped in credentials', { credentials: x509Key }],
    ['wrapped beside other fields', { credentials: x509Key, name: 'k' }],
  ])(
    'a %s x509 key: no authorization config, the whole certificate client',
    async (_label, content) => {
      const store = new XsuaaServiceKeyStore(writeKey(content));
      expect(await store.getAuthorizationConfig(destination)).toBeNull();
      expect(await store.getClientCertificate(destination)).toEqual(
        expectedCertificate,
      );
    },
  );

  it('returns the PEM unchanged: CRLF line endings and the chain as given', async () => {
    const store = new XsuaaServiceKeyStore(writeKey({ credentials: x509Key }));
    const client = await store.getClientCertificate(destination);
    expect(client?.certificate).toBe(CHAIN);
    expect(client?.key).toBe(KEY);
    expect(client?.certificate).toContain('\r\n');
    expect(client?.certificate.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
  });

  it('answers an x509 key the same connection config as a secret key', async () => {
    const withAbap = {
      ...x509Key,
      abap: { url: 'https://h.abap.test', client: '100' },
    };
    const store = new XsuaaServiceKeyStore(writeKey(withAbap));
    expect(await store.getConnectionConfig(destination)).toEqual({
      serviceUrl: 'https://h.abap.test',
      authType: 'jwt',
      sapClient: '100',
      language: undefined,
    });
    const secretStore = new XsuaaServiceKeyStore(
      writeKey({ ...secretKey, abap: withAbap.abap }),
    );
    expect(await secretStore.getConnectionConfig(destination)).toEqual(
      await store.getConnectionConfig(destination),
    );
  });

  it('a secret key has no client certificate, and its client is answered as before', async () => {
    const store = new XsuaaServiceKeyStore(
      writeKey({ credentials: secretKey }),
    );
    expect(await store.getClientCertificate(destination)).toBeNull();
    expect(await store.getAuthorizationConfig(destination)).toEqual({
      uaaUrl: secretKey.url,
      uaaClientId: secretKey.clientid,
      uaaClientSecret: secretKey.clientsecret,
    });
  });

  it('a secret key that also names a certurl is a secret key', async () => {
    const store = new XsuaaServiceKeyStore(
      writeKey({ ...secretKey, certurl: x509Key.certurl }),
    );
    expect(await store.getClientCertificate(destination)).toBeNull();
    expect(await store.getAuthorizationConfig(destination)).toEqual({
      uaaUrl: secretKey.url,
      uaaClientId: secretKey.clientid,
      uaaClientSecret: secretKey.clientsecret,
    });
  });

  it('a missing key file has no client certificate', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsuaa-x509-'));
    const store = new XsuaaServiceKeyStore(dir);
    expect(await store.getClientCertificate(destination)).toBeNull();
  });

  it.each([
    ['certificate and key', {}],
    ['certificate only', { key: undefined }],
    ['key only', { certificate: undefined }],
  ])(
    'a key with a secret and a client certificate (%s) is refused by both methods in fixed words',
    async (_label, drop) => {
      const mixed = { ...x509Key, clientsecret: 'the-secret', ...drop };
      const store = new XsuaaServiceKeyStore(writeKey({ credentials: mixed }));
      for (const call of [
        () => store.getClientCertificate(destination),
        () => store.getAuthorizationConfig(destination),
      ]) {
        const error = await call().then(
          () => undefined,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(ClientCertificateError);
        const refusal = error as ClientCertificateError;
        expect(refusal.reason).toBe('mixed');
        expect(refusal.message).toContain(
          'carries both a client secret and a client certificate',
        );
        expect(refusal.variables[0]).toBe('clientsecret');
        expect(refusal.message).not.toContain(MARKER);
        expect(refusal.message).not.toContain('the-secret');
      }
    },
  );

  it('an x509 key missing part of its certificate client is refused as incomplete, naming the fields', async () => {
    const { key: _key, certurl: _certurl, ...partial } = x509Key;
    const store = new XsuaaServiceKeyStore(writeKey(partial));
    expect(await store.getAuthorizationConfig(destination)).toBeNull();
    const error = await store.getClientCertificate(destination).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(ClientCertificateError);
    const refusal = error as ClientCertificateError;
    expect(refusal.reason).toBe('incomplete');
    expect(refusal.variables).toEqual(['key', 'certurl']);
    expect(refusal.message).toContain('is incomplete: key, certurl missing');
    expect(refusal.message).not.toContain(MARKER);
  });

  it('no store log line carries the PEM', async () => {
    const lines: string[] = [];
    const log = capturingLogger(lines);
    const keys = [
      x509Key,
      { credentials: x509Key },
      { ...x509Key, clientsecret: 'the-secret' },
      { ...x509Key, certurl: undefined },
    ];
    for (const content of keys) {
      const store = new XsuaaServiceKeyStore(writeKey(content), { log });
      for (const call of [
        () => store.getAuthorizationConfig(destination),
        () => store.getConnectionConfig(destination),
        () => store.getServiceKey(destination),
        () => store.getClientCertificate(destination),
      ]) {
        await call().catch(() => undefined);
      }
    }
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(MARKER);
      expect(line).not.toContain('BEGIN');
    }
  });
  it('behind an EnvDestinationStore whose file states no client, the x509 key answers', async () => {
    const keys = writeKey({ credentials: x509Key });
    const envDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsuaa-x509-env-'));
    fs.writeFileSync(
      path.join(envDir, `${destination}.env`),
      'SAP_URL=https://h.abap.test\nSAP_AUTH_TYPE=jwt\nSAP_GRANT_TYPE=client_credentials\n',
    );
    const store = new EnvDestinationStore(envDir, {
      fallback: new XsuaaServiceKeyStore(keys),
    });
    expect(await store.getAuthorizationConfig(destination)).toBeNull();
    expect(await store.getClientCertificate(destination)).toEqual(
      expectedCertificate,
    );
  });
});
