/**
 * Safe ABAP Session Store - in-memory session storage for ABAP connections (with sapUrl)
 * 
 * Stores full ABAP configuration (with sapUrl) in memory only.
 * Does not persist to disk - suitable for secure environments.
 */

import type { ISessionStore, IConnectionConfig, IAuthorizationConfig, IConfig, ILogger } from '@mcp-abap-adt/interfaces';

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
  private log?: ILogger;
  private defaultServiceUrl?: string;

  /**
   * Create a new SafeAbapSessionStore instance
   * @param log Optional logger for logging operations
   * @param defaultServiceUrl Optional default service URL to use when serviceUrl is not provided in config
   */
  constructor(log?: ILogger, defaultServiceUrl?: string) {
    this.log = log;
    this.defaultServiceUrl = defaultServiceUrl;
  }

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


  async loadSession(destination: string): Promise<IConfig | null> {
    this.log?.debug(`Loading session for destination: ${destination}`);
    const authConfig = await this.getAuthorizationConfig(destination);
    const connConfig = await this.getConnectionConfig(destination);
    
    if (!authConfig && !connConfig) {
      this.log?.debug(`Session not found for destination: ${destination}`);
      return null;
    }
    
    const tokenLength = connConfig?.authorizationToken?.length || 0;
    const hasRefreshToken = !!authConfig?.refreshToken;
    this.log?.info(`Session loaded for ${destination}: token(${tokenLength} chars), hasRefreshToken(${hasRefreshToken}), sapUrl(${connConfig?.serviceUrl ? connConfig.serviceUrl.substring(0, 40) + '...' : 'none'})`);
    return {
      ...(authConfig || {}),
      ...(connConfig || {}),
    };
  }

  async saveSession(destination: string, config: IConfig): Promise<void> {
    this.log?.debug(`Saving session for destination: ${destination}`);
    this.validateSessionConfig(config);
    const internalConfig = this.convertToInternalFormat(config);
    const obj = config as Record<string, unknown>;
    const tokenLength = (obj.authorizationToken || obj.jwtToken) ? String(obj.authorizationToken || obj.jwtToken).length : 0;
    const hasRefreshToken = !!(obj.refreshToken);
    this.log?.info(`Session saved for ${destination}: token(${tokenLength} chars), hasRefreshToken(${hasRefreshToken}), sapUrl(${obj.serviceUrl || obj.sapUrl ? String(obj.serviceUrl || obj.sapUrl).substring(0, 40) + '...' : 'none'})`);
    this.sessions.set(destination, internalConfig);
  }

  async deleteSession(destination: string): Promise<void> {
    this.sessions.delete(destination);
  }

  async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
    const sessionConfig = this.loadRawSession(destination);
    if (!sessionConfig) {
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
    
    if (!current) {
      // Session doesn't exist - create new one
      // For ABAP, serviceUrl is required - use from config, defaultServiceUrl, or throw error
      const serviceUrl = config.serviceUrl || this.defaultServiceUrl;
      
      if (!serviceUrl) {
        throw new Error(`Cannot create session for destination "${destination}": serviceUrl is required for ABAP sessions. Provide it in config or constructor.`);
      }
      
      this.log?.debug(`Creating new session for ${destination} via setConnectionConfig: serviceUrl(${serviceUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars)`);
      
      const newSession: AbapSessionData = {
        sapUrl: serviceUrl,
        jwtToken: config.authorizationToken || '',
        sapClient: config.sapClient,
        language: config.language,
      };
      // Save directly to Map (internal format)
      this.sessions.set(destination, newSession);
      this.log?.info(`Session created for ${destination}: serviceUrl(${serviceUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars)`);
      return;
    }
    
    const updated: AbapSessionData = {
      ...current,
      sapUrl: config.serviceUrl || current.sapUrl,
      jwtToken: config.authorizationToken,
      sapClient: config.sapClient !== undefined ? config.sapClient : current.sapClient,
      language: config.language !== undefined ? config.language : current.language,
    };
    // Save directly to Map (internal format)
    this.sessions.set(destination, updated);
  }

  async getAuthorizationConfig(destination: string): Promise<IAuthorizationConfig | null> {
    const sessionConfig = this.loadRawSession(destination);
    if (!sessionConfig) {
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
    
    if (!current) {
      // Session doesn't exist - try to get serviceUrl from connection config or use defaultServiceUrl
      // For ABAP, we need sapUrl to create session
      const connConfig = await this.getConnectionConfig(destination);
      const sapUrl = connConfig?.serviceUrl || this.defaultServiceUrl;
      
      if (!sapUrl) {
        throw new Error(`Cannot set authorization config for destination "${destination}": session does not exist and serviceUrl is required for ABAP sessions. Call setConnectionConfig first or provide defaultServiceUrl in constructor.`);
      }
      
      this.log?.debug(`Creating new session for ${destination} via setAuthorizationConfig: sapUrl(${sapUrl.substring(0, 40)}...)`);
      
      const newSession: AbapSessionData = {
        sapUrl,
        jwtToken: connConfig?.authorizationToken || '', // Use token from connection config if available
        uaaUrl: config.uaaUrl,
        uaaClientId: config.uaaClientId,
        uaaClientSecret: config.uaaClientSecret,
        refreshToken: config.refreshToken,
      };
      // Save directly to Map (internal format)
      this.sessions.set(destination, newSession);
      return;
    }

    const updated: AbapSessionData = {
      ...current,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || current.refreshToken,
    };
    // Save directly to Map (internal format)
    this.sessions.set(destination, updated);
  }
}
