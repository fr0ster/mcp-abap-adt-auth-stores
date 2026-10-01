/**
 * ABAP Session Store — the session secret in `{destination}.env` files.
 *
 * Holds the secret alone (auth-stores 3.0.0): `SAP_JWT_TOKEN` or
 * `SAP_SESSION_COOKIES_B64`, `SAP_EXPIRES_AT`, `SAP_REFRESH_TOKEN`. A write
 * touches only those keys; every other line of the file — the means a 2.x
 * session file holds beside the secret, or the means `EnvDestinationStore`
 * writes to the same file — stays as it is.
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
import { ABAP_SESSION_VARS } from '../../utils/constants';

const KEYS: SecretKeys = {
  authorizationToken: ABAP_SESSION_VARS.AUTHORIZATION_TOKEN,
  sessionCookies: ABAP_SESSION_VARS.SESSION_COOKIES_B64,
  expiresAt: ABAP_SESSION_VARS.EXPIRES_AT,
  refreshToken: ABAP_SESSION_VARS.REFRESH_TOKEN,
};

/**
 * Reads and writes {destination}.env in the constructor's directory. It does
 * not search other locations.
 */
export class AbapSessionStore extends SecretSessionStore {
  protected directory: string;

  /**
   * @param directory Directory where session .env files are located (created if missing)
   * @param log Optional logger
   */
  constructor(directory: string, log?: ILogger) {
    super({ name: 'AbapSessionStore', tokenOnly: false, log });
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
   * Remove the session: its secret keys. Means the file holds beside them stay;
   * a file left with no key is removed.
   */
  async deleteSession(destination: string): Promise<void> {
    await this.writeSecret(destination, {});
    this.log?.debug(`Session deleted for destination: ${destination}`);
  }
}
