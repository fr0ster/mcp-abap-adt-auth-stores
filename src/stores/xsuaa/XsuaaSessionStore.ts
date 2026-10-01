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
import { XSUAA_SESSION_VARS } from '../../utils/constants';

const KEYS: SecretKeys = {
  authorizationToken: XSUAA_SESSION_VARS.AUTHORIZATION_TOKEN,
  expiresAt: XSUAA_SESSION_VARS.EXPIRES_AT,
  refreshToken: XSUAA_SESSION_VARS.REFRESH_TOKEN,
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
    return path.join(this.directory, `${destination}.env`);
  }

  protected async readSecret(
    destination: string,
  ): Promise<SessionSecret | null> {
    return readFileSecret(this.fileOf(destination), KEYS, destination);
  }

  protected async writeSecret(
    destination: string,
    next: SessionSecret,
  ): Promise<void> {
    writeFileSecret(this.fileOf(destination), KEYS, next);
  }

  /**
   * Remove the session: its secret keys. Other lines stay; a file left with no
   * key is removed.
   */
  async deleteSession(destination: string): Promise<void> {
    await this.writeSecret(destination, {});
    this.log?.debug(`Session deleted for destination: ${destination}`);
  }
}
