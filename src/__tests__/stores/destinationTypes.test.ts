/**
 * The exported types stay what a 3.2.0 consumer typed against: `MeansField`
 * is `IConfig`'s means alone, so a map typed `Record<MeansField, string>`
 * still compiles and is still a `DestinationVariables`; the certificate
 * fields are `CertificateField`, optional in the map. Jest only transpiles
 * (isolatedModules), so the consumer's file is compiled here, by the
 * TypeScript compiler, with the project's options.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ts from 'typescript';
import { EnvDestinationStore } from '../../index';
import {
  AS_VARIABLES,
  CERTIFICATE_FIELDS,
  CERTIFICATE_WRITE,
  WITH_CERTIFICATE,
} from '../helpers/consumerDestinationMap';

const ROOT = path.resolve(__dirname, '../../..');
const FIXTURE = path.join(__dirname, '../helpers/consumerDestinationMap.ts');

describe('the exported destination types', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'destination-types-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('a 3.2.0 consumer map typed Record<MeansField, string> compiles unchanged', () => {
    const configPath = path.join(ROOT, 'tsconfig.json');
    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const { options } = ts.parseJsonConfigFileContent(config, ts.sys, ROOT);
    const program = ts.createProgram([FIXTURE], {
      ...options,
      noEmit: true,
      composite: false,
      incremental: false,
    });
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));

    expect(diagnostics).toEqual([]);
  }, 60_000);

  it('the 3.2.0 map works unchanged', async () => {
    const store = new EnvDestinationStore(dir, { variables: AS_VARIABLES });
    await store.setDestination('D', {
      uaaUrl: 'https://uaa.example',
      uaaClientId: 'id',
      uaaClientSecret: 'secret',
    });

    expect(fs.readFileSync(path.join(dir, 'D.env'), 'utf8')).toContain(
      'MY_UAA_CLIENT_SECRET=secret',
    );
    expect(await store.getAuthorizationConfig('D')).toEqual({
      uaaUrl: 'https://uaa.example',
      uaaClientId: 'id',
      uaaClientSecret: 'secret',
    });
    expect(await store.getClientCertificate('D')).toBeNull();
  });

  it('the certificate fields are their own type, optional in the map, writable as means', () => {
    expect(CERTIFICATE_FIELDS).toHaveLength(3);
    expect(WITH_CERTIFICATE.uaaClientCertPath).toBe('MY_CERT_PATH');
    expect(CERTIFICATE_WRITE.uaaCertUrl).toBe('https://cert.example');
  });
});
