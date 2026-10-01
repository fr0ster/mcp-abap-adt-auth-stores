/**
 * Safe ABAP Session Store — the session secret in memory only.
 *
 * Holds the secret alone (auth-stores 3.0.0): a token or cookies, their
 * `expiresAt`, the refresh token. Nothing is written to disk.
 */

import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { SecretSessionStore } from '../../session/SecretSessionStore';
import { isEmptySecret, type SessionSecret } from '../../session/sessionSecret';

export class SafeAbapSessionStore extends SecretSessionStore {
  private sessions = new Map<string, SessionSecret>();

  /** @param log Optional logger */
  constructor(log?: ILogger) {
    super({ name: 'SafeAbapSessionStore', tokenOnly: false, log });
  }

  protected async readSecret(
    destination: string,
  ): Promise<SessionSecret | null> {
    const secret = this.sessions.get(destination);
    return secret ? { ...secret } : null;
  }

  protected async writeSecret(
    destination: string,
    next: SessionSecret,
  ): Promise<void> {
    if (isEmptySecret(next)) this.sessions.delete(destination);
    else this.sessions.set(destination, { ...next });
  }
}
