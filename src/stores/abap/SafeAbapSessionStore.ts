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
      this.log?.error(`Invalid config format: not an object`);
      throw new Error('SafeAbapSessionStore can only store ABAP sessions (with sapUrl)');
    }
    const obj = config as Record<string, unknown>;
    // Accept IConfig format (has serviceUrl) or internal format (has sapUrl)
    const serviceUrl = obj.serviceUrl || obj.sapUrl;
    if (!serviceUrl) {
      this.log?.error(`Validation failed: missing required field serviceUrl or sapUrl`);
      throw new Error('ABAP session config missing required field: serviceUrl or sapUrl');
    }
    if (!obj.authorizationToken && !obj.jwtToken) {
      this.log?.error(`Validation failed: missing required field authorizationToken or jwtToken`);
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
    const rawSession = this.loadRawSession(destination);
    
    if (!rawSession) {
      this.log?.debug(`Session not found for destination: ${destination}`);
      return null;
    }
    
    // Convert internal format to IConfig format
    const result: IConfig = {};
    
    // Connection config fields
    if (rawSession.sapUrl) {
      result.serviceUrl = rawSession.sapUrl;
    }
    if (rawSession.jwtToken !== undefined) {
      result.authorizationToken = rawSession.jwtToken;
    }
    if (rawSession.sapClient) {
      result.sapClient = rawSession.sapClient;
    }
    if (rawSession.language) {
      result.language = rawSession.language;
    }
    
    // Authorization config fields
    if (rawSession.uaaUrl) {
      result.uaaUrl = rawSession.uaaUrl;
    }
    if (rawSession.uaaClientId) {
      result.uaaClientId = rawSession.uaaClientId;
    }
    if (rawSession.uaaClientSecret) {
      result.uaaClientSecret = rawSession.uaaClientSecret;
    }
    if (rawSession.refreshToken) {
      result.refreshToken = rawSession.refreshToken;
    }
    
    const tokenLength = rawSession.jwtToken?.length || 0;
    const hasRefreshToken = !!rawSession.refreshToken;
    this.log?.info(`Session loaded for ${destination}: token(${tokenLength} chars), hasRefreshToken(${hasRefreshToken}), sapUrl(${rawSession.sapUrl ? rawSession.sapUrl.substring(0, 40) + '...' : 'none'})`);
    return result;
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
    if (this.sessions.has(destination)) {
      this.log?.debug(`Deleting session for destination: ${destination}`);
      this.sessions.delete(destination);
      this.log?.info(`Session deleted for destination: ${destination}`);
    } else {
      this.log?.debug(`Session not found for deletion: ${destination}`);
    }
  }

  async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
    const sessionConfig = this.loadRawSession(destination);
    if (!sessionConfig) {
      this.log?.debug(`Connection config not found for ${destination}`);
      return null;
    }

    if (!sessionConfig.jwtToken || !sessionConfig.sapUrl) {
      this.log?.warn(`Connection config for ${destination} missing required fields: jwtToken(${!!sessionConfig.jwtToken}), sapUrl(${!!sessionConfig.sapUrl})`);
      return null;
    }
    
    this.log?.debug(`Connection config loaded for ${destination}: token(${sessionConfig.jwtToken.length} chars), sapUrl(${sessionConfig.sapUrl.substring(0, 40)}...)`);

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
        this.log?.error(`Cannot create session for ${destination}: serviceUrl is required. Missing in config and defaultServiceUrl in constructor.`);
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
    
    this.log?.debug(`Updating connection config for existing session ${destination}: serviceUrl(${config.serviceUrl ? config.serviceUrl.substring(0, 40) + '...' : 'unchanged'}), token(${config.authorizationToken?.length || 0} chars)`);
    const updated: AbapSessionData = {
      ...current,
      sapUrl: config.serviceUrl || current.sapUrl,
      jwtToken: config.authorizationToken,
      sapClient: config.sapClient !== undefined ? config.sapClient : current.sapClient,
      language: config.language !== undefined ? config.language : current.language,
    };
    // Save directly to Map (internal format)
    this.sessions.set(destination, updated);
    this.log?.info(`Connection config updated for ${destination}: serviceUrl(${updated.sapUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars)`);
  }

  async getAuthorizationConfig(destination: string): Promise<IAuthorizationConfig | null> {
    const sessionConfig = this.loadRawSession(destination);
    if (!sessionConfig) {
      this.log?.debug(`Authorization config not found for ${destination}`);
      return null;
    }

    if (!sessionConfig.uaaUrl || !sessionConfig.uaaClientId || !sessionConfig.uaaClientSecret) {
      this.log?.warn(`Authorization config for ${destination} missing required UAA fields`);
      return null;
    }
    
    this.log?.debug(`Authorization config loaded for ${destination}: uaaUrl(${sessionConfig.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!sessionConfig.refreshToken})`);

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
        this.log?.error(`Cannot set authorization config for ${destination}: session does not exist and serviceUrl is required. Missing defaultServiceUrl in constructor.`);
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
      this.log?.info(`New session created for ${destination} via setAuthorizationConfig: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`);
      return;
    }

    this.log?.debug(`Updating authorization config for existing session ${destination}: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`);
    const updated: AbapSessionData = {
      ...current,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || current.refreshToken,
    };
    // Save directly to Map (internal format)
    this.sessions.set(destination, updated);
    this.log?.info(`Authorization config updated for ${destination}: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`);
  }
}
