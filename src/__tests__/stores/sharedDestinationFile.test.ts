/**
 * One file shared by the destination store and the session store.
 *
 * A consumer may point EnvDestinationStore and a session store at the same
 * directory: disjoint keys in one `<destination>.env`, each store touching only
 * its own. Whatever order they write in, neither loses the other's keys.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
  IConnectionConfig,
  ISessionStore,
} from '@mcp-abap-adt/interfaces-auth-broker';
import { AbapSessionStore } from '../../stores/abap/AbapSessionStore';
import {
  ABAP_DESTINATION_VARS,
  type DestinationVariables,
  EnvDestinationStore,
  XSUAA_DESTINATION_VARS,
} from '../../stores/destination/EnvDestinationStore';
import { EnvFileSessionStore } from '../../stores/env/EnvFileSessionStore';
import { XsuaaSessionStore } from '../../stores/xsuaa/XsuaaSessionStore';

const MEANS: IConnectionConfig = {
  serviceUrl: 'https://h.abap.example',
  authType: 'jwt',
  grantType: 'authorization_code',
  sapClient: '100',
  language: 'EN',
};
const CLIENT = {
  uaaUrl: 'https://uaa.example',
  uaaClientId: 'client',
  uaaClientSecret: 'secret',
};

interface Pair {
  name: string;
  variables: DestinationVariables;
  session: (dir: string) => ISessionStore;
  secret: Record<string, unknown>;
}

const PAIRS: Pair[] = [
  {
    name: 'AbapSessionStore, token',
    variables: ABAP_DESTINATION_VARS,
    session: (dir) => new AbapSessionStore(dir),
    secret: {
      authorizationToken: 'tok',
      expiresAt: 1_900_000_000_000,
      refreshToken: 'refresh',
    },
  },
  {
    name: 'AbapSessionStore, cookies',
    variables: ABAP_DESTINATION_VARS,
    session: (dir) => new AbapSessionStore(dir),
    secret: {
      sessionCookies: 'SAP_SESSIONID=1; x=2',
      expiresAt: 1_900_000_000_000,
    },
  },
  {
    name: 'EnvFileSessionStore, token',
    variables: ABAP_DESTINATION_VARS,
    session: (dir) => new EnvFileSessionStore(path.join(dir, 'D.env')),
    secret: {
      authorizationToken: 'tok',
      expiresAt: 1_900_000_000_000,
      refreshToken: 'refresh',
    },
  },
  {
    name: 'XsuaaSessionStore, token',
    variables: XSUAA_DESTINATION_VARS,
    session: (dir) => new XsuaaSessionStore(dir),
    secret: {
      authorizationToken: 'tok',
      expiresAt: 1_900_000_000_000,
      refreshToken: 'refresh',
    },
  },
];

describe.each(PAIRS)(
  '$name and EnvDestinationStore in one directory',
  ({ variables, session, secret }) => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-'));
    });
    afterEach(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('a session written, then the means updated: every secret key stays', async () => {
      const sessions = session(dir);
      const destinations = new EnvDestinationStore(dir, { variables });

      await sessions.saveSession('D', secret);
      await destinations.setDestination('D', { ...MEANS, ...CLIENT });
      await destinations.setDestination('D', { language: 'DE' });

      expect(await sessions.loadSession('D')).toEqual(secret);
      expect(await destinations.getConnectionConfig('D')).toEqual({
        ...MEANS,
        language: 'DE',
      });
    });

    it('means written, then a session: every means key stays', async () => {
      const sessions = session(dir);
      const destinations = new EnvDestinationStore(dir, { variables });

      await destinations.setDestination('D', { ...MEANS, ...CLIENT });
      await sessions.saveSession('D', secret);

      expect(await destinations.getConnectionConfig('D')).toEqual(MEANS);
      expect(await destinations.getAuthorizationConfig('D')).toEqual(CLIENT);
      expect(await sessions.loadSession('D')).toEqual(secret);
    });

    it('an update of one means field keeps the other means and the secret', async () => {
      const sessions = session(dir);
      const destinations = new EnvDestinationStore(dir, { variables });

      await destinations.setDestination('D', { ...MEANS, ...CLIENT });
      await sessions.saveSession('D', secret);
      await destinations.setDestination('D', { grantType: 'passcode' });

      expect(await destinations.getConnectionConfig('D')).toEqual({
        ...MEANS,
        grantType: 'passcode',
      });
      expect(await destinations.getAuthorizationConfig('D')).toEqual(CLIENT);
      expect(await sessions.loadSession('D')).toEqual(secret);
    });

    it('deleting the session keeps the means', async () => {
      const sessions = session(dir);
      const destinations = new EnvDestinationStore(dir, { variables });

      await destinations.setDestination('D', { ...MEANS, ...CLIENT });
      await sessions.saveSession('D', secret);
      await sessions.deleteSession?.('D');

      expect(await sessions.loadSession('D')).toBeNull();
      expect(await destinations.getConnectionConfig('D')).toEqual(MEANS);
      expect(await destinations.getAuthorizationConfig('D')).toEqual(CLIENT);
    });
  },
);
