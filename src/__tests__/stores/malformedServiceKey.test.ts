/**
 * A malformed service key file must not leak what it holds: Node's JSON.parse
 * quotes the input in its message (Node 26: `Unexpected token 'M',
 * "{"key":MIIPRIVATE"... is not valid JSON`), so a store passing a load
 * failure on would hand out private-key or client-secret bytes.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { ParseError } from '../../errors/StoreErrors';
import { AbapServiceKeyStore } from '../../stores/abap/AbapServiceKeyStore';
import { XsuaaServiceKeyStore } from '../../stores/xsuaa/XsuaaServiceKeyStore';

const MARKER = 'MIIPRIV';
const destination = 'LEAKY';

const MALFORMED: Array<[string, string]> = [
  ['a bare private key value', `{"key":${MARKER}KEYMARKER}`],
  ['a bare client secret value', `{"clientsecret":${MARKER}SECRET}`],
  [
    'a truncated PEM string',
    `{"key":"-----BEGIN PRIVATE KEY-----\n${MARKER}AAAA`,
  ],
  [
    'a truncated wrapped key',
    `Getting key...\n{"credentials":{"clientsecret":"${MARKER}", "key": ${MARKER}`,
  ],
];

const STORES: Array<
  [
    string,
    (dir: string, log: ILogger) => AbapServiceKeyStore | XsuaaServiceKeyStore,
    string,
  ]
> = [
  [
    'AbapServiceKeyStore',
    (dir, log) => new AbapServiceKeyStore(dir, { log }),
    `AbapServiceKeyStore: the ABAP service key file of "${destination}" cannot be read as JSON`,
  ],
  [
    'XsuaaServiceKeyStore',
    (dir, log) => new XsuaaServiceKeyStore(dir, { log }),
    `XsuaaServiceKeyStore: the XSUAA service key file of "${destination}" cannot be read as JSON`,
  ],
];

const METHODS = [
  'getAuthorizationConfig',
  'getConnectionConfig',
  'getServiceKey',
  'getClientCertificate',
] as const;

describe.each(STORES)('%s: a malformed key file', (name, make, fixed) => {
  it.each(MALFORMED)(
    '%s: every method throws fixed words, nothing of the file',
    async (_label, content) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'malformed-key-'));
      fs.writeFileSync(path.join(dir, `${destination}.json`), content);
      const lines: string[] = [];
      const record = (...args: unknown[]) => {
        lines.push(args.map((a) => String(a)).join(' '));
      };
      const store = make(dir, {
        debug: record,
        info: record,
        warn: record,
        error: record,
      });
      const methods = METHODS.filter(
        (method) =>
          typeof (store as unknown as Record<string, unknown>)[method] ===
          'function',
      );
      expect(methods.length).toBe(name === 'XsuaaServiceKeyStore' ? 4 : 3);
      for (const method of methods) {
        const call = (
          store as unknown as Record<
            string,
            ((d: string) => Promise<unknown>) | undefined
          >
        )[method];
        if (call === undefined) throw new Error(`no method ${method}`);
        const error = await call.call(store, destination).then(
          () => undefined,
          (e: unknown) => e,
        );
        expect(error).toBeInstanceOf(ParseError);
        const refusal = error as ParseError;
        expect(refusal.message).toBe(fixed);
        expect(refusal.cause).toBeUndefined();
        expect(refusal.filePath).toBeUndefined();
        for (const text of [
          refusal.message,
          String(refusal),
          JSON.stringify(refusal),
          refusal.stack ?? '',
        ]) {
          expect(text).not.toContain(MARKER);
          expect(text).not.toContain('BEGIN');
        }
      }
      for (const line of lines) {
        expect(line).not.toContain(MARKER);
        expect(line).not.toContain('BEGIN');
      }
    },
  );
});

describe('AbapServiceKeyStore: a key its parser refuses', () => {
  it('throws fixed words, no parser message, path or cause', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'malformed-key-'));
    fs.writeFileSync(
      path.join(dir, `${destination}.json`),
      JSON.stringify({ uaa: { url: 'https://u', clientsecret: MARKER } }),
    );
    const store = new AbapServiceKeyStore(dir);
    for (const method of [
      'getAuthorizationConfig',
      'getConnectionConfig',
      'getServiceKey',
    ] as const) {
      const error = await store[method](destination).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(ParseError);
      const refusal = error as ParseError;
      expect(refusal.message).toBe(
        `Failed to parse service key for destination "${destination}": not an ABAP service key (a uaa object with url, clientid and clientsecret)`,
      );
      expect(refusal.cause).toBeUndefined();
      expect(refusal.filePath).toBeUndefined();
      expect(JSON.stringify(refusal)).not.toContain(MARKER);
    }
  });
});
