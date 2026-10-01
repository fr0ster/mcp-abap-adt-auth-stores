/**
 * Env File Session Store — the session secret in one given `.env` file.
 *
 * For `--env=/path/to/.env`: one file, whatever the destination. Holds the
 * secret alone (auth-stores 3.0.0): `SAP_JWT_TOKEN` or
 * `SAP_SESSION_COOKIES_B64`, `SAP_EXPIRES_AT`, `SAP_REFRESH_TOKEN`, read from
 * the file and written back to it. Every other line — the URL, the type, a
 * user and password, the client: means, read by `EnvDestinationStore` — is
 * left as it is.
 */

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

export class EnvFileSessionStore extends SecretSessionStore {
  private envFilePath: string;

  /**
   * @param envFilePath Path to the .env file
   * @param log Optional logger
   */
  constructor(envFilePath: string, log?: ILogger) {
    super({ name: 'EnvFileSessionStore', tokenOnly: false, log });
    this.envFilePath = path.resolve(envFilePath);
  }

  protected async readSecret(
    destination: string,
  ): Promise<SessionSecret | null> {
    return readFileSecret(this.envFilePath, KEYS, destination);
  }

  protected async writeSecret(
    _destination: string,
    next: SessionSecret,
  ): Promise<void> {
    writeFileSecret(this.envFilePath, KEYS, next);
  }

  /** Remove the secret keys from the file; every other line stays. */
  async deleteSession(destination: string): Promise<void> {
    await this.writeSecret(destination, {});
  }

  /** The stored access token. */
  async getToken(destination: string): Promise<string | undefined> {
    return (await this.readSecret(destination))?.authorizationToken;
  }

  /** Write an access token (an expiry stored with the old one is cleared). */
  async setToken(destination: string, token: string): Promise<void> {
    await this.saveSession(destination, { authorizationToken: token });
  }

  /** The stored refresh token. */
  async getRefreshToken(destination: string): Promise<string | undefined> {
    return (await this.readSecret(destination))?.refreshToken;
  }

  /** Write a refresh token. */
  async setRefreshToken(
    destination: string,
    refreshToken: string,
  ): Promise<void> {
    await this.saveSession(destination, { refreshToken });
  }
}
