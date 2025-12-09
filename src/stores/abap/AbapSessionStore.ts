/**
 * ABAP Session Store - extends base BTP store with sapUrl support
 * 
 * Reads/writes session data from/to {destination}.env files in search paths.
 * Stores full ABAP configuration: SAP URL (sapUrl), JWT token, refresh token, UAA config, SAP client, language.
 * This extends base BTP store by adding sapUrl requirement.
 */

import type { IAuthorizationConfig, IConnectionConfig, ISessionStore, IConfig, ILogger } from '@mcp-abap-adt/interfaces';
import { loadEnvFile } from '../../storage/abap/envLoader';
import { saveTokenToEnv } from '../../storage/abap/tokenStorage';
import * as fs from 'fs';
import * as path from 'path';

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
 * ABAP Session store implementation
 * 
 * Searches for {destination}.env files in configured search paths.
 * Writes to first search path (highest priority).
 * Search paths priority:
 * 1. Constructor parameter (highest)
 * 2. AUTH_BROKER_PATH environment variable
 * 3. Current working directory (lowest)
 */
export class AbapSessionStore implements ISessionStore {
  protected directory: string;
  private log?: ILogger;
  private defaultServiceUrl?: string;

  /**
   * Create a new AbapSessionStore instance
   * @param directory Directory where session .env files are located
   * @param log Optional logger for logging operations
   * @param defaultServiceUrl Optional default service URL to use when serviceUrl is not provided in config
   */
  constructor(directory: string, log?: ILogger, defaultServiceUrl?: string) {
    this.directory = directory;
    this.log = log;
    this.defaultServiceUrl = defaultServiceUrl;
    
    // Ensure directory exists - create if it doesn't
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
      this.log?.debug(`Created session directory: ${directory}`);
    }
  }
  /**
   * Load session from file
   * @param filePath Path to session file
   * @returns Parsed EnvConfig or null if invalid
   */
  private async loadFromFile(filePath: string): Promise<unknown | null> {
    // Extract destination from file path
    const fileName = path.basename(filePath);
    const destination = fileName.replace(/\.env$/, '');
    return loadEnvFile(destination, this.directory);
  }

  /**
   * Convert IConfig to internal format for ENV file storage
   * @param config IConfig to convert
   * @returns Internal format (AbapSessionData)
   */
  private convertToInternalFormat(config: IConfig): Record<string, unknown> {
    const obj = config as Record<string, unknown>;
    // Convert IConfig format (serviceUrl, authorizationToken) to internal format (sapUrl, jwtToken)
    return {
      sapUrl: (obj.serviceUrl || obj.sapUrl) as string,
      jwtToken: (obj.authorizationToken || obj.jwtToken) as string,
      refreshToken: obj.refreshToken as string | undefined,
      uaaUrl: obj.uaaUrl as string | undefined,
      uaaClientId: obj.uaaClientId as string | undefined,
      uaaClientSecret: obj.uaaClientSecret as string | undefined,
      sapClient: obj.sapClient as string | undefined,
      language: obj.language as string | undefined,
    };
  }

  /**
   * Save session to ENV file
   * @param filePath Path to session file
   * @param config Internal format (AbapSessionData) for ENV file
   */
  private async saveToFile(filePath: string, config: Record<string, unknown>): Promise<void> {
    // Type guard - ensure it's EnvConfig (has sapUrl)
    if (!config || typeof config !== 'object' || !('sapUrl' in config)) {
      throw new Error('AbapSessionStore can only store ABAP sessions (with sapUrl)');
    }

    // Extract destination from file path
    const fileName = path.basename(filePath);
    const destination = fileName.replace(/\.env$/, '');
    const savePath = path.dirname(filePath);

    // Convert to format expected by saveTokenToEnv
    const abapConfig = config as unknown as AbapSessionData;
    await saveTokenToEnv(destination, savePath, {
      sapUrl: abapConfig.sapUrl,
      jwtToken: abapConfig.jwtToken,
      refreshToken: abapConfig.refreshToken,
      uaaUrl: abapConfig.uaaUrl,
      uaaClientId: abapConfig.uaaClientId,
      uaaClientSecret: abapConfig.uaaClientSecret,
      sapClient: abapConfig.sapClient,
      language: abapConfig.language,
    }, this.log);
  }

  /**
   * Save session configuration for destination
   * @param destination Destination name (e.g., "TRIAL" or "mcp")
   * @param config Session configuration to save
   */
  async saveSession(destination: string, config: IConfig): Promise<void> {
    this.log?.debug(`Saving session for destination: ${destination}`);
    const fileName = `${destination}.env`;
    const filePath = path.join(this.directory, fileName);

    // Ensure directory exists
    if (!fs.existsSync(this.directory)) {
      this.log?.debug(`Creating directory: ${this.directory}`);
      fs.mkdirSync(this.directory, { recursive: true });
    }

    // Convert IConfig to internal format for ENV file
    const internalConfig = this.convertToInternalFormat(config);
    const obj = config as Record<string, unknown>;
    const tokenLength = (obj.authorizationToken || obj.jwtToken) ? String(obj.authorizationToken || obj.jwtToken).length : 0;
    const hasRefreshToken = !!(obj.refreshToken);
    this.log?.info(`Session saved for ${destination}: token(${tokenLength} chars), hasRefreshToken(${hasRefreshToken}), sapUrl(${obj.serviceUrl || obj.sapUrl ? String(obj.serviceUrl || obj.sapUrl).substring(0, 40) + '...' : 'none'})`);
    await this.saveToFile(filePath, internalConfig);
  }

  /**
   * Delete session for destination
   * @param destination Destination name (e.g., "TRIAL" or "mcp")
   */
  async deleteSession(destination: string): Promise<void> {
    const fileName = `${destination}.env`;
    const filePath = path.join(this.directory, fileName);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Load session configuration for destination
   * Returns optional composition of IAuthorizationConfig and IConnectionConfig
   * @param destination Destination name
   * @returns IConfig with actual values or null if not found
   */
  async loadSession(destination: string): Promise<IConfig | null> {
    this.log?.debug(`Loading session for destination: ${destination}`);
    const authConfig = await this.getAuthorizationConfig(destination);
    const connConfig = await this.getConnectionConfig(destination);
    
    // Return null if both are null, otherwise return composition (even if one is null)
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

  /**
   * Load raw session data (internal representation)
   * Used internally for setAuthorizationConfig and setConnectionConfig
   */
  private async loadRawSession(destination: string): Promise<AbapSessionData | null> {
    const fileName = `${destination}.env`;
    const sessionPath = path.join(this.directory, fileName);
    
    if (!sessionPath) {
      return null;
    }
    
    try {
      const raw = await this.loadFromFile(sessionPath);
      if (!raw || !isEnvConfig(raw)) {
        return null;
      }
      return raw;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get authorization configuration with actual values (not file paths)
   * Returns values needed for obtaining and refreshing tokens
   * @param destination Destination name
   * @returns AuthorizationConfig with actual values or null if not found
   */
  async getAuthorizationConfig(destination: string): Promise<IAuthorizationConfig | null> {
    const sessionConfig = await this.loadRawSession(destination);
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

  /**
   * Get connection configuration with actual values (not file paths)
   * Returns values needed for connecting to services
   * @param destination Destination name
   * @returns ConnectionConfig with actual values or null if not found
   */
  async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
    const sessionConfig = await this.loadRawSession(destination);
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

  /**
   * Set authorization configuration
   * Updates values needed for obtaining and refreshing tokens
   * Creates new session if it doesn't exist
   * @param destination Destination name
   * @param config IAuthorizationConfig with values to set
   */
  async setAuthorizationConfig(destination: string, config: IAuthorizationConfig): Promise<void> {
    const current = await this.loadRawSession(destination);
    
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
      await this.saveSession(destination, newSession);
      return;
    }

    // Update authorization fields
    const updated: AbapSessionData = {
      ...current,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || current.refreshToken,
    };
    await this.saveSession(destination, updated);
  }

  /**
   * Set connection configuration
   * Updates values needed for connecting to services
   * Creates new session if it doesn't exist
   * @param destination Destination name
   * @param config IConnectionConfig with values to set
   */
  async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void> {
    const current = await this.loadRawSession(destination);
    
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
      await this.saveSession(destination, newSession);
      this.log?.info(`Session created for ${destination}: serviceUrl(${serviceUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars)`);
      return;
    }

    // Update connection fields
    const updated: AbapSessionData = {
      ...current,
      sapUrl: config.serviceUrl || current.sapUrl,
      jwtToken: config.authorizationToken,
      sapClient: config.sapClient !== undefined ? config.sapClient : current.sapClient,
      language: config.language !== undefined ? config.language : current.language,
    };
    
    await this.saveSession(destination, updated);
  }
}

/**
 * Type guard for EnvConfig (ABAP session with sapUrl)
 */
function isEnvConfig(config: unknown): config is AbapSessionData {
  if (!config || typeof config !== 'object') return false;
  const obj = config as Record<string, unknown>;
  return 'sapUrl' in obj && 'jwtToken' in obj;
}

