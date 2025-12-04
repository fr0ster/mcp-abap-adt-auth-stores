/**
 * Safe ABAP Session Store - in-memory session storage for ABAP connections (with sapUrl)
 * 
 * Stores full ABAP configuration (with sapUrl) in memory only.
 * Does not persist to disk - suitable for secure environments.
 */

import type { ISessionStore, IConnectionConfig, IAuthorizationConfig, IConfig } from '@mcp-abap-adt/interfaces';

// Internal type for ABAP session storage (extends base BTP with sapUrl)
interface AbapSessionData {
  sapUrl: string;
  sapClient?: string;
  jwtToken: string;
  refreshToken?: string;
  uaaUrl?: string;
  uaaClientId?: string;
  uaaClientSecret?: string;
  language?: string;
}

/**
 * Safe ABAP Session store implementation
 * 
 * Stores session data in memory only (no file I/O).
 * Suitable for secure environments where tokens should not be persisted to disk.
 */
export class SafeAbapSessionStore implements ISessionStore {
  private sessions: Map<string, AbapSessionData> = new Map();

  private loadRawSession(destination: string): AbapSessionData | null {
    return this.sessions.get(destination) || null;
  }

  private validateSessionConfig(config: IConfig): void {
    if (!config || typeof config !== 'object') {
      throw new Error('SafeAbapSessionStore can only store ABAP sessions (with sapUrl)');
    }
    const obj = config as Record<string, unknown>;
    // Accept IConfig format (has serviceUrl) or internal format (has sapUrl)
    const serviceUrl = obj.serviceUrl || obj.sapUrl;
    if (!serviceUrl) {
      throw new Error('ABAP session config missing required field: serviceUrl or sapUrl');
    }
    if (!obj.authorizationToken && !obj.jwtToken) {
      throw new Error('ABAP session config missing required field: authorizationToken or jwtToken');
    }
  }

  private convertToInternalFormat(config: IConfig): AbapSessionData {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config');
    }
    const obj = config as Record<string, unknown>;
    // Convert IConfig format (serviceUrl, authorizationToken) to internal format (sapUrl, jwtToken)
    const internal: AbapSessionData = {
      sapUrl: (obj.serviceUrl || obj.sapUrl) as string,
      jwtToken: (obj.authorizationToken || obj.jwtToken) as string,
      refreshToken: obj.refreshToken as string | undefined,
      uaaUrl: obj.uaaUrl as string | undefined,
      uaaClientId: obj.uaaClientId as string | undefined,
      uaaClientSecret: obj.uaaClientSecret as string | undefined,
      sapClient: obj.sapClient as string | undefined,
      language: obj.language as string | undefined,
    };
    return internal;
  }

  private isValidSessionConfig(config: unknown): config is AbapSessionData {
    if (!config || typeof config !== 'object') return false;
    const obj = config as Record<string, unknown>;
    // Accept both IConfig format (serviceUrl, authorizationToken) and internal format (sapUrl, jwtToken)
    return (('serviceUrl' in obj || 'sapUrl' in obj) && ('authorizationToken' in obj || 'jwtToken' in obj));
  }

  async loadSession(destination: string): Promise<IConfig | null> {
    const authConfig = await this.getAuthorizationConfig(destination);
    const connConfig = await this.getConnectionConfig(destination);
    
    if (!authConfig && !connConfig) {
      return null;
    }
    
    return {
      ...(authConfig || {}),
      ...(connConfig || {}),
    };
  }

  async saveSession(destination: string, config: IConfig): Promise<void> {
    this.validateSessionConfig(config);
    const internalConfig = this.convertToInternalFormat(config);
    this.sessions.set(destination, internalConfig);
  }

  async deleteSession(destination: string): Promise<void> {
    this.sessions.delete(destination);
  }

  async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
    const sessionConfig = this.loadRawSession(destination);
    if (!this.isValidSessionConfig(sessionConfig)) {
      return null;
    }

    if (!sessionConfig.jwtToken || !sessionConfig.sapUrl) {
      return null;
    }

    return {
      serviceUrl: sessionConfig.sapUrl,
      authorizationToken: sessionConfig.jwtToken,
      sapClient: sessionConfig.sapClient,
      language: sessionConfig.language,
    };
  }

  async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void> {
    const current = this.loadRawSession(destination);
    if (!this.isValidSessionConfig(current)) {
      throw new Error(`No ABAP session found for destination "${destination}"`);
    }
    const updated: AbapSessionData = {
      ...current,
      sapUrl: config.serviceUrl || current.sapUrl,
      jwtToken: config.authorizationToken,
      sapClient: config.sapClient !== undefined ? config.sapClient : current.sapClient,
      language: config.language !== undefined ? config.language : current.language,
    };
    await this.saveSession(destination, updated);
  }

  async getAuthorizationConfig(destination: string): Promise<IAuthorizationConfig | null> {
    const sessionConfig = this.loadRawSession(destination);
    if (!this.isValidSessionConfig(sessionConfig)) {
      return null;
    }

    if (!sessionConfig.uaaUrl || !sessionConfig.uaaClientId || !sessionConfig.uaaClientSecret) {
      return null;
    }

    return {
      uaaUrl: sessionConfig.uaaUrl,
      uaaClientId: sessionConfig.uaaClientId,
      uaaClientSecret: sessionConfig.uaaClientSecret,
      refreshToken: sessionConfig.refreshToken,
    };
  }

  async setAuthorizationConfig(destination: string, config: IAuthorizationConfig): Promise<void> {
    const current = this.loadRawSession(destination);
    if (!this.isValidSessionConfig(current)) {
      throw new Error(`No ABAP session found for destination "${destination}"`);
    }

    const updated: AbapSessionData = {
      ...current,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || current.refreshToken,
    };
    await this.saveSession(destination, updated);
  }
}
