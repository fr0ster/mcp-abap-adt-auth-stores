/**
 * A key store states what its key cannot, when whoever builds it says so (3.1.0).
 *
 * A SAP service key cannot state a grant, so `AbapServiceKeyStore` and
 * `XsuaaServiceKeyStore` take `{ grantType }` from whoever builds them and
 * answer it from `getConnectionConfig` and `getServiceKey` — never inferred,
 * never answered without the option, never answered without a key. The 3.0.0
 * form `(directory, log)` keeps working; anything else where the options go
 * is refused at construction, naming what was wrong and never a value.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { IServiceKeyStore } from '@mcp-abap-adt/interfaces-auth-broker';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { AbapServiceKeyStore } from '../../stores/abap/AbapServiceKeyStore';
import { XsuaaServiceKeyStore } from '../../stores/xsuaa/XsuaaServiceKeyStore';

type Ctor = new (directory: string, options?: any) => IServiceKeyStore;

const VARIANTS: { name: string; Store: Ctor; key: object }[] = [
  {
    name: 'AbapServiceKeyStore',
    Store: AbapServiceKeyStore,
    key: {
      uaa: {
        url: 'https://t.authentication.example',
        clientid: 'client',
        clientsecret: 'secret',
      },
      abap: { url: 'https://t.abap.example', client: '001' },
    },
  },
  {
    name: 'XsuaaServiceKeyStore',
    Store: XsuaaServiceKeyStore,
    key: {
      url: 'https://t.authentication.example',
      clientid: 'client',
      clientsecret: 'secret',
      abap: { url: 'https://t.abap.example', client: '001' },
    },
  },
];

function recorder(): { log: ILogger; lines: string[] } {
  const lines: string[] = [];
  const record = (m: unknown) => {
    lines.push(String(m));
  };
  return {
    lines,
    log: { debug: record, info: record, warn: record, error: record },
  };
}

describe.each(VARIANTS)('$name options', ({ name, Store, key }) => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'key-options-'));
    fs.writeFileSync(path.join(dir, 'TRIAL.json'), JSON.stringify(key));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it.each(['authorization_code', 'client_credentials', 'passcode'] as const)(
    'answers grantType %s when it is given',
    async (grantType) => {
      const store = new Store(dir, { grantType });

      const connection = await store.getConnectionConfig('TRIAL');
      expect(connection?.grantType).toBe(grantType);
      expect(connection?.authType).toBe('jwt');
      expect(connection?.serviceUrl).toBe('https://t.abap.example');
      expect((await store.getServiceKey('TRIAL'))?.grantType).toBe(grantType);
    },
  );

  it('answers no grantType without the option — 3.0.0 unchanged', async () => {
    for (const store of [
      new Store(dir),
      new Store(dir, {}),
      new Store(dir, { grantType: undefined }),
    ]) {
      expect(await store.getConnectionConfig('TRIAL')).not.toHaveProperty(
        'grantType',
      );
      expect(await store.getServiceKey('TRIAL')).not.toHaveProperty(
        'grantType',
      );
    }
  });

  it('answers nothing for a destination without a key, option or not', async () => {
    const store = new Store(dir, { grantType: 'authorization_code' });
    expect(await store.getConnectionConfig('NONE')).toBeNull();
    expect(await store.getServiceKey('NONE')).toBeNull();
  });

  it('takes the logger in 3.0.0 form, (directory, log)', async () => {
    const { log, lines } = recorder();
    const store = new Store(dir, log);
    expect(await store.getConnectionConfig('TRIAL')).not.toHaveProperty(
      'grantType',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('takes the logger in the options, beside grantType', async () => {
    const { log, lines } = recorder();
    const store = new Store(dir, { grantType: 'passcode', log });
    expect((await store.getConnectionConfig('TRIAL'))?.grantType).toBe(
      'passcode',
    );
    expect(lines.length).toBeGreaterThan(0);
  });

  it('takes console — a logger with a log method — as the logger', async () => {
    const store = new Store(dir, console);
    expect(store).toBeInstanceOf(Store);
  });

  it('refuses a string where the options go, naming the type and not the value', () => {
    expect(() => new Store(dir, 'https://SENTINEL.example')).toThrow(TypeError);
    try {
      new Store(dir, 'https://SENTINEL.example');
    } catch (error) {
      expect((error as Error).message).toContain(name);
      expect((error as Error).message).toContain('string');
      expect((error as Error).message).not.toContain('SENTINEL');
    }
  });

  it('refuses a grantType it does not know, naming the option and not the value', () => {
    try {
      new Store(dir, { grantType: 'SENTINEL_grant' });
      throw new Error('not refused');
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toContain('grantType');
      expect((error as Error).message).not.toContain('SENTINEL');
    }
  });

  it('refuses an option it does not take — serviceUrl included — naming it', () => {
    try {
      new Store(dir, { serviceUrl: 'https://SENTINEL.example' });
      throw new Error('not refused');
    } catch (error) {
      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toContain('serviceUrl');
      expect((error as Error).message).not.toContain('SENTINEL');
    }
  });

  it('refuses a logger option that is not a logger', () => {
    expect(() => new Store(dir, { log: 'SENTINEL' })).toThrow(TypeError);
  });
});
