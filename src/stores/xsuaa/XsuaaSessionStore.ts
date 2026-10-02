/**
 * XSUAA Session Store — the session secret in `{destination}.env` files.
 *
 * Holds the secret alone (auth-stores 3.0.0): `XSUAA_JWT_TOKEN`,
 * `XSUAA_EXPIRES_AT`, `XSUAA_REFRESH_TOKEN`. An XSUAA session is a token:
 * cookies are refused, and so is a write that leaves the session without a
 * token. A write touches only those keys; every other line of the file stays
 * as it is — the 2.x keys `XSUAA_MCP_URL` and `XSUAA_UAA_*`, and the 1.x
 * `SAP_*` keys 2.x deleted.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  readFileSecret,
  type SecretKeys,
  writeFileSecret,
} from '../../session/fileSecret';
import { SecretSessionStore } from '../../session/SecretSessionStore';
import type { SessionSecret } from '../../session/sessionSecret';
import { assertDestinationName } from '../../storage/destinationName';
import { withFileLock } from '../../storage/fileLock';
import { XSUAA_SESSION_VARS } from '../../utils/constants';
import { XSUAA_DESTINATION_VARS } from '../destination/EnvDestinationStore';

const KEYS: SecretKeys = {
  authorizationToken: XSUAA_SESSION_VARS.AUTHORIZATION_TOKEN,
  expiresAt: XSUAA_SESSION_VARS.EXPIRES_AT,
  refreshToken: XSUAA_SESSION_VARS.REFRESH_TOKEN,
  issuedFor: XSUAA_SESSION_VARS.ISSUED_FOR,
  issuedBy: XSUAA_SESSION_VARS.ISSUED_BY,
  legacy: {
    serviceUrl: XSUAA_DESTINATION_VARS.serviceUrl,
    sapClient: XSUAA_DESTINATION_VARS.sapClient,
    uaaUrl: XSUAA_DESTINATION_VARS.uaaUrl,
    uaaClientId: XSUAA_DESTINATION_VARS.uaaClientId,
  },
};

/**
 * Reads and writes {destination}.env in the constructor's directory. It does
 * not search other locations.
 */
export class XsuaaSessionStore extends SecretSessionStore {
  protected directory: string;

  /**
   * @param directory Directory where session .env files are located (created if missing)
   * @param log Optional logger
   */
  constructor(directory: string, log?: ILogger) {
    super({ name: 'XsuaaSessionStore', tokenOnly: true, log });
    this.directory = directory;
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
      this.log?.debug(`Created session directory: ${directory}`);
    }
  }

  private fileOf(destination: string): string {
    assertDestinationName(destination);
    return path.join(this.directory, `${destination}.env`);
  }

  protected async exclusive<T>(
    destination: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    return withFileLock(this.fileOf(destination), fn);
  }

  protected async readSecret(
    destination: string,
    forWrite = false,
  ): Promise<SessionSecret | null> {
    return readFileSecret(
      this.fileOf(destination),
      KEYS,
      destination,
      forWrite,
    );
  }

  protected async writeSecret(
    destination: string,
    next: SessionSecret,
  ): Promise<void> {
    writeFileSecret(this.fileOf(destination), KEYS, next);
  }
}
