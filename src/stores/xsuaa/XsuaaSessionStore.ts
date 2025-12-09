/**
 * XSUAA Session Store - stores XSUAA session data (same as base BTP, without sapUrl)
 * 
 * This is an alias for BtpSessionStore for backward compatibility.
 * Stores to {destination}.env files with XSUAA_* variables.
 */

import type { IAuthorizationConfig, IConnectionConfig, ISessionStore, IConfig, ILogger } from '@mcp-abap-adt/interfaces';
import { loadXsuaaEnvFile } from '../../storage/xsuaa/xsuaaEnvLoader';
import { saveXsuaaTokenToEnv } from '../../storage/xsuaa/xsuaaTokenStorage';
import * as fs from 'fs';
import * as path from 'path';

// Internal type for XSUAA session storage (same as base BTP, without sapUrl)
interface XsuaaSessionData {
  mcpUrl?: string;
  jwtToken: string;
  refreshToken?: string;
  uaaUrl?: string;
  uaaClientId?: string;
  uaaClientSecret?: string;
}

/**
 * XSUAA Session Store implementation
 * 
 * Stores session data in {destination}.env files using XSUAA_* variables.
 * Search paths priority:
 * 1. Constructor parameter (highest)
 * 2. AUTH_BROKER_PATH environment variable
 * 3. Current working directory (lowest)
 */
export class XsuaaSessionStore implements ISessionStore {
  protected directory: string;
  private log?: ILogger;
  private defaultServiceUrl?: string;

  /**
   * Create a new XsuaaSessionStore instance
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
   * Get file name for destination
   * @param destination Destination name
   * @returns File name (e.g., "mcp.env")
   */
  protected getFileName(destination: string): string {
    return `${destination}.env`;
  }

  /**
   * Load session from file
   * @param filePath Path to session file
   * @returns Parsed XsuaaSessionData or null if invalid
   */
  protected async loadFromFile(filePath: string): Promise<unknown | null> {
    // Extract destination from file path
    const fileName = path.basename(filePath);
    const destination = fileName.replace(/\.env$/, '');
    
    // Load from .env file using XSUAA env loader (reads XSUAA_* variables)
    const xsuaaConfig = await loadXsuaaEnvFile(destination, this.directory, this.log);
    if (!xsuaaConfig) {
      return null;
    }

    return xsuaaConfig;
  }

  /**
   * Convert IConfig to internal format for ENV file storage
   * @param config IConfig to convert
   * @returns Internal format (XsuaaSessionData)
   */
  protected convertToInternalFormat(config: IConfig): Record<string, unknown> {
    const obj = config as Record<string, unknown>;
    // Convert IConfig format (serviceUrl, authorizationToken) to internal format (mcpUrl, jwtToken)
    return {
      jwtToken: (obj.authorizationToken || obj.jwtToken) as string,
      mcpUrl: (obj.serviceUrl || obj.mcpUrl) as string | undefined,
      refreshToken: obj.refreshToken as string | undefined,
      uaaUrl: obj.uaaUrl as string | undefined,
      uaaClientId: obj.uaaClientId as string | undefined,
      uaaClientSecret: obj.uaaClientSecret as string | undefined,
    };
  }

  /**
   * Save session to ENV file
   * @param filePath Path to session file
   * @param config Internal format (XsuaaSessionData) for ENV file
   */
  protected async saveToFile(filePath: string, config: Record<string, unknown>): Promise<void> {
    // Type guard - ensure it's XSUAA config (no sapUrl, no abapUrl)
    if (!config || typeof config !== 'object') {
      throw new Error('XsuaaSessionStore can only store XSUAA sessions');
    }
    
    // Reject ABAP sessions (has sapUrl)
    if ('sapUrl' in config) {
      throw new Error('XsuaaSessionStore can only store XSUAA sessions');
    }
    
    // Reject BTP sessions with abapUrl (that's for ABAP store)
    if ('abapUrl' in config) {
      throw new Error('XsuaaSessionStore can only store XSUAA sessions');
    }
    
    // Validate required fields
    // Allow empty string for jwtToken (can be set later via setConnectionConfig)
    if (config.jwtToken === undefined || config.jwtToken === null) {
      throw new Error('XSUAA session config missing required field: jwtToken');
    }

    // Extract destination from file path
    const fileName = path.basename(filePath);
    const destination = fileName.replace(/\.env$/, '');
    const savePath = path.dirname(filePath);

    // Save using XSUAA token storage
    const xsuaaData = config as unknown as XsuaaSessionData;
    await saveXsuaaTokenToEnv(destination, savePath, xsuaaData, this.log);
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
    this.log?.info(`Session saved for ${destination}: token(${tokenLength} chars), hasRefreshToken(${hasRefreshToken}), serviceUrl(${obj.serviceUrl || obj.mcpUrl ? String(obj.serviceUrl || obj.mcpUrl).substring(0, 40) + '...' : 'none'})`);
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
    this.log?.info(`Session loaded for ${destination}: token(${tokenLength} chars), hasRefreshToken(${hasRefreshToken}), serviceUrl(${connConfig?.serviceUrl ? connConfig.serviceUrl.substring(0, 40) + '...' : 'none'})`);
    return {
      ...(authConfig || {}),
      ...(connConfig || {}),
    };
  }

  /**
   * Load raw session data (internal representation)
   * Used internally for getAuthorizationConfig, getConnectionConfig, setAuthorizationConfig and setConnectionConfig
   */
  private async loadRawSession(destination: string): Promise<XsuaaSessionData | null> {
    const fileName = `${destination}.env`;
    const sessionPath = path.join(this.directory, fileName);
    
    if (!fs.existsSync(sessionPath)) {
      return null;
    }
    
    try {
      const raw = await this.loadFromFile(sessionPath);
      if (!raw || !isXsuaaSessionConfig(raw)) {
        return null;
      }
      return raw;
    } catch (error) {
      return null;
    }
  }

  async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
    const sessionConfig = await this.loadRawSession(destination);
    if (!sessionConfig) {
      this.log?.debug(`Connection config not found for ${destination}`);
      return null;
    }

    // Return null if jwtToken is undefined or null (but allow empty string)
    if (sessionConfig.jwtToken === undefined || sessionConfig.jwtToken === null) {
      this.log?.warn(`Connection config for ${destination} missing required field: jwtToken`);
      return null;
    }

    this.log?.debug(`Connection config loaded for ${destination}: token(${sessionConfig.jwtToken.length} chars), serviceUrl(${sessionConfig.mcpUrl ? sessionConfig.mcpUrl.substring(0, 40) + '...' : 'none'})`);
    return {
      serviceUrl: sessionConfig.mcpUrl, // May be undefined for XSUAA
      authorizationToken: sessionConfig.jwtToken,
    };
  }

  async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void> {
    const current = await this.loadRawSession(destination);
    
    if (!current) {
      // Session doesn't exist - create new one
      // For XSUAA, mcpUrl is optional - use from config, defaultServiceUrl, or undefined
      const serviceUrl = config.serviceUrl || this.defaultServiceUrl;
      this.log?.debug(`Creating new session for ${destination} via setConnectionConfig: mcpUrl(${serviceUrl ? serviceUrl.substring(0, 40) + '...' : 'none'}), token(${config.authorizationToken?.length || 0} chars)`);
      
      const newSession: XsuaaSessionData = {
        mcpUrl: serviceUrl,
        jwtToken: config.authorizationToken || '',
      };
      await this.saveSession(destination, newSession);
      this.log?.info(`Session created for ${destination}: mcpUrl(${serviceUrl ? serviceUrl.substring(0, 40) + '...' : 'none'}), token(${config.authorizationToken?.length || 0} chars)`);
      return;
    }

    // Update connection fields
    const updated: XsuaaSessionData = {
      ...current,
      mcpUrl: config.serviceUrl !== undefined ? config.serviceUrl : current.mcpUrl,
      jwtToken: config.authorizationToken !== undefined ? config.authorizationToken : current.jwtToken,
    };
    
    await this.saveSession(destination, updated);
  }

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

  async setAuthorizationConfig(destination: string, config: IAuthorizationConfig): Promise<void> {
    const current = await this.loadRawSession(destination);
    
    if (!current) {
      // Session doesn't exist - create new one
      // For XSUAA, mcpUrl is optional - use defaultServiceUrl if available
      const serviceUrl = this.defaultServiceUrl;
      this.log?.debug(`Creating new session for ${destination} via setAuthorizationConfig: mcpUrl(${serviceUrl ? serviceUrl.substring(0, 40) + '...' : 'none'})`);
      
      const newSession: XsuaaSessionData = {
        mcpUrl: serviceUrl, // Use defaultServiceUrl if available, otherwise undefined
        jwtToken: '', // Will be set when connection config is set
        uaaUrl: config.uaaUrl,
        uaaClientId: config.uaaClientId,
        uaaClientSecret: config.uaaClientSecret,
        refreshToken: config.refreshToken,
      };
      await this.saveSession(destination, newSession);
      return;
    }

    // Update authorization fields
    const updated: XsuaaSessionData = {
      ...current,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || current.refreshToken,
    };
    await this.saveSession(destination, updated);
  }
}

/**
 * Type guard for XsuaaSessionConfig
 */
function isXsuaaSessionConfig(config: unknown): config is XsuaaSessionData {
  if (!config || typeof config !== 'object') return false;
  const obj = config as Record<string, unknown>;
  return 'jwtToken' in obj && !('sapUrl' in obj) && !('abapUrl' in obj);
}

