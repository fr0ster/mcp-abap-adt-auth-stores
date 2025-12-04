/**
 * Safe Base BTP Session Store - in-memory session storage for base BTP connections (without sapUrl)
 * 
 * Stores base BTP configuration in memory only.
 * Does not persist to disk - suitable for secure environments.
 */

import type { IConnectionConfig, ISessionStore, IAuthorizationConfig, IConfig } from '@mcp-abap-adt/interfaces';

// Internal type for base BTP session storage (without sapUrl)
interface BtpBaseSessionData {
  mcpUrl?: string;
  jwtToken: string;
  refreshToken?: string;
  uaaUrl?: string;
  uaaClientId?: string;
  uaaClientSecret?: string;
}

/**
 * Safe Base BTP Session store implementation
 * 
 * Stores session data in memory only (no file I/O).
 * Suitable for secure environments where tokens should not be persisted to disk.
 */
export class SafeBtpSessionStore implements ISessionStore {
  private sessions: Map<string, BtpBaseSessionData> = new Map();

  private loadRawSession(destination: string): BtpBaseSessionData | null {
    return this.sessions.get(destination) || null;
  }

  private validateSessionConfig(config: IConfig): void {
    if (!config || typeof config !== 'object') {
      throw new Error('SafeBtpSessionStore can only store base BTP sessions (without sapUrl)');
    }
    const obj = config as Record<string, unknown>;
    
    // Reject ABAP sessions (has sapUrl)
    if ('sapUrl' in obj) {
      throw new Error('SafeBtpSessionStore can only store base BTP sessions (without sapUrl)');
    }
    
    // Reject BTP sessions with abapUrl (that's for ABAP store)
    if ('abapUrl' in obj) {
      throw new Error('SafeBtpSessionStore can only store base BTP sessions (without abapUrl)');
    }
    
    // Accept IConfig format (has authorizationToken) or internal format (has jwtToken)
    if (!obj.authorizationToken && !obj.jwtToken) {
      throw new Error('Base BTP session config missing required field: authorizationToken or jwtToken');
    }
  }

  private convertToInternalFormat(config: IConfig): BtpBaseSessionData {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config');
    }
    const obj = config as Record<string, unknown>;
    // Convert IConfig format (serviceUrl, authorizationToken) to internal format (mcpUrl, jwtToken)
    const internal: BtpBaseSessionData = {
      mcpUrl: obj.serviceUrl as string | undefined,
      jwtToken: (obj.authorizationToken || obj.jwtToken) as string,
      refreshToken: obj.refreshToken as string | undefined,
      uaaUrl: obj.uaaUrl as string | undefined,
      uaaClientId: obj.uaaClientId as string | undefined,
      uaaClientSecret: obj.uaaClientSecret as string | undefined,
    };
    return internal;
  }

  private isValidSessionConfig(config: unknown): config is BtpBaseSessionData {
    if (!config || typeof config !== 'object') return false;
    const obj = config as Record<string, unknown>;
    // Accept both IConfig format (authorizationToken) and internal format (jwtToken)
    // Reject ABAP (sapUrl) and BTP with abapUrl
    return (('authorizationToken' in obj || 'jwtToken' in obj) && !('sapUrl' in obj) && !('abapUrl' in obj));
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

    if (!sessionConfig.jwtToken) {
      return null;
    }

    return {
      serviceUrl: sessionConfig.mcpUrl, // May be undefined for base BTP
      authorizationToken: sessionConfig.jwtToken,
    };
  }

  async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void> {
    const current = this.loadRawSession(destination);
    if (!this.isValidSessionConfig(current)) {
      throw new Error(`No base BTP session found for destination "${destination}"`);
    }
    const updated: BtpBaseSessionData = {
      ...current,
      mcpUrl: config.serviceUrl !== undefined ? config.serviceUrl : current.mcpUrl,
      jwtToken: config.authorizationToken,
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
      throw new Error(`No base BTP session found for destination "${destination}"`);
    }

    const updated: BtpBaseSessionData = {
      ...current,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || current.refreshToken,
    };
    await this.saveSession(destination, updated);
  }
}
