/**
 * The RFC address as means (5.1.0): `ashost`, `sysnr`, `mshost`, `msserv`,
 * `sysid`, `group`, `saprouter` of `IConnectionConfig` (interfaces-auth-broker
 * 1.4.0), under `SAP_<SUFFIX>` for the ABAP set and `XSUAA_<SUFFIX>` for the
 * XSUAA set. Each is read from the file, taken from the fallback only when the
 * file does not state it (`''` stated wins), written and removed by
 * `setDestination`. The store requires and refuses none of them: it holds
 * means, the consumer validates.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  IConnectionConfig,
  IServiceKeyStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import {
  ABAP_DESTINATION_VARS,
  type AddressField,
  type DestinationMeans,
  type DestinationVariables,
  EnvDestinationStore,
  XSUAA_DESTINATION_VARS,
} from '../../stores/destination/EnvDestinationStore';

/** The seven, with the suffix each is stored under. */
const SUFFIX: Readonly<Record<AddressField, string>> = {
  ashost: 'ASHOST',
  sysnr: 'SYSNR',
  mshost: 'MSHOST',
  msserv: 'MSSERV',
  sysid: 'SYSID',
  group: 'GROUP',
  saprouter: 'SAPROUTER',
};

/** A value per field, each its own, none of them a default. */
const VALUE: Readonly<Record<AddressField, string>> = {
  ashost: 'app.abap.example',
  sysnr: '07',
  mshost: 'ms.abap.example',
  msserv: '3607',
  sysid: 'NPL',
  group: 'SPACE',
  saprouter: '/H/router.example/S/3299/H/',
};

/** What the fallback (a service key, say) answers. */
const FALLBACK_VALUE: Readonly<Record<AddressField, string>> = {
  ashost: 'key-app.abap.example',
  sysnr: '42',
  mshost: 'key-ms.abap.example',
  msserv: '3642',
  sysid: 'KEY',
  group: 'KEYGROUP',
  saprouter: '/H/key-router.example/H/',
};

const FIELDS: readonly AddressField[] = [
  'ashost',
  'sysnr',
  'mshost',
  'msserv',
  'sysid',
  'group',
  'saprouter',
];

function fallbackStating(connection: IConnectionConfig): IServiceKeyStore {
  return {
    async getServiceKey() {
      return connection;
    },
    async getAuthorizationConfig() {
      return null;
    },
    async getConnectionConfig() {
      return connection;
    },
  };
}

function oneField(field: AddressField, value: string | null): DestinationMeans {
  const means: DestinationMeans = {};
  means[field] = value;
  return means;
}

function stating(field: AddressField, value: string): IConnectionConfig {
  const connection: IConnectionConfig = {};
  connection[field] = value;
  return connection;
}

function lines(file: string): string[] {
  return fs.readFileSync(file, 'utf8').split('\n');
}

describe('EnvDestinationStore: the RFC address (5.1.0)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'destination-address-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  describe.each([
    { name: 'ABAP', prefix: 'SAP', variables: ABAP_DESTINATION_VARS },
    { name: 'XSUAA', prefix: 'XSUAA', variables: XSUAA_DESTINATION_VARS },
  ])('the $name variable set', ({ prefix, variables }) => {
    const file = (): string => path.join(dir, 'D.env');
    const keyOf = (field: AddressField): string => `${prefix}_${SUFFIX[field]}`;

    describe.each(FIELDS.map((field) => ({ field })))('$field', ({ field }) => {
      it('is stored under its own variable', () => {
        expect(variables[field]).toBe(keyOf(field));
      });

      it('is read from the file', async () => {
        fs.writeFileSync(file(), `${keyOf(field)}=${VALUE[field]}\n`);
        const config = await new EnvDestinationStore(dir, {
          variables,
        }).getConnectionConfig('D');

        expect(config?.[field]).toBe(VALUE[field]);
        expect(config).toEqual(oneField(field, VALUE[field]));
      });

      it('is taken from the fallback when the file does not state it', async () => {
        fs.writeFileSync(file(), `${variables.authType}=basic\n`);
        const store = new EnvDestinationStore(dir, {
          variables,
          fallback: fallbackStating(stating(field, FALLBACK_VALUE[field])),
        });

        expect((await store.getConnectionConfig('D'))?.[field]).toBe(
          FALLBACK_VALUE[field],
        );
      });

      it('is the file’s when the file states it, over the fallback', async () => {
        fs.writeFileSync(file(), `${keyOf(field)}=${VALUE[field]}\n`);
        const store = new EnvDestinationStore(dir, {
          variables,
          fallback: fallbackStating(stating(field, FALLBACK_VALUE[field])),
        });

        expect((await store.getConnectionConfig('D'))?.[field]).toBe(
          VALUE[field],
        );
      });

      it("is the file’s '' when the file states it empty, over the fallback", async () => {
        fs.writeFileSync(file(), `${keyOf(field)}=\n`);
        const store = new EnvDestinationStore(dir, {
          variables,
          fallback: fallbackStating(stating(field, FALLBACK_VALUE[field])),
        });

        expect((await store.getConnectionConfig('D'))?.[field]).toBe('');
      });

      it('is written by setDestination under its variable', async () => {
        const store = new EnvDestinationStore(dir, { variables });
        await store.setDestination('D', oneField(field, VALUE[field]));

        expect(lines(file())).toContain(`${keyOf(field)}=${VALUE[field]}`);
        // a fresh store reads the file, not a cache
        expect(
          (
            await new EnvDestinationStore(dir, {
              variables,
            }).getConnectionConfig('D')
          )?.[field],
        ).toBe(VALUE[field]);
      });

      it('is removed by setDestination with null, the other keys kept', async () => {
        fs.writeFileSync(
          file(),
          `${variables.authType}=basic\n${keyOf(field)}=${VALUE[field]}\n`,
        );
        const store = new EnvDestinationStore(dir, { variables });
        await store.setDestination('D', oneField(field, null));

        const written = lines(file());
        expect(
          written.some((line) => line.startsWith(`${keyOf(field)}=`)),
        ).toBe(false);
        expect(written).toContain(`${variables.authType}=basic`);
        const config = await store.getConnectionConfig('D');
        expect(config).toEqual({ authType: 'basic' });
      });

      it('is removed by deleteDestination', async () => {
        fs.writeFileSync(
          file(),
          `${keyOf(field)}=${VALUE[field]}\nOTHER_KEY=kept\n`,
        );
        await new EnvDestinationStore(dir, { variables }).deleteDestination(
          'D',
        );

        expect(lines(file())).not.toContain(`${keyOf(field)}=${VALUE[field]}`);
        expect(lines(file())).toContain('OTHER_KEY=kept');
      });
    });

    it('carries the seven together, as stated, with the rest of the means', async () => {
      const store = new EnvDestinationStore(dir, { variables });
      const address: IConnectionConfig = {
        authType: 'snc',
        sapClient: '100',
        language: 'EN',
        ...VALUE,
      };
      await store.setDestination('D', address);

      expect(await store.getConnectionConfig('D')).toEqual(address);
    });
  });

  describe('a custom map without the seven keys (written for 5.0)', () => {
    const {
      ashost: _ashost,
      sysnr: _sysnr,
      mshost: _mshost,
      msserv: _msserv,
      sysid: _sysid,
      group: _group,
      saprouter: _saprouter,
      ...old
    } = ABAP_DESTINATION_VARS;
    const custom: DestinationVariables = { ...old };

    it('type-checks and reads none of the seven', async () => {
      fs.writeFileSync(
        path.join(dir, 'D.env'),
        `SAP_AUTH_TYPE=basic\n${FIELDS.map((field) => `SAP_${SUFFIX[field]}=${VALUE[field]}`).join('\n')}\n`,
      );
      const store = new EnvDestinationStore(dir, { variables: custom });

      expect(await store.getConnectionConfig('D')).toEqual({
        authType: 'basic',
      });
    });

    it.each(FIELDS.map((field) => ({ field })))(
      'refuses to write $field, which it has no key for, writing nothing',
      async ({ field }) => {
        const store = new EnvDestinationStore(dir, { variables: custom });
        await expect(
          store.setDestination('D', oneField(field, VALUE[field])),
        ).rejects.toThrow(`the variables map names no key for ${field};`);
        expect(fs.existsSync(path.join(dir, 'D.env'))).toBe(false);
      },
    );
  });
});
