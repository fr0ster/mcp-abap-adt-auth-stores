/**
 * Base BTP Session Store - stores BTP session data without sapUrl (XSUAA-like)
 * 
 * This is the base implementation for BTP stores without sapUrl requirement.
 * Stores to {destination}.env files with XSUAA_* variables.
 */

import type { IAuthorizationConfig, IConnectionConfig, ISessionStore } from '@mcp-abap-adt/auth-broker';
import type { IConfig } from '@mcp-abap-adt/auth-broker';
import { AbstractJsonSessionStore } from '../abstract/AbstractJsonSessionStore';
import { findFileInPaths } from '../../utils/pathResolver';
import { loadXsuaaEnvFile } from '../../storage/xsuaa/xsuaaEnvLoader';
import { saveXsuaaTokenToEnv } from '../../storage/xsuaa/xsuaaTokenStorage';
import * as path from 'path';

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
 * Base BTP Session Store implementation (without sapUrl)
 * 
 * Stores session data in {destination}.env files using XSUAA_* variables.
 * Search paths priority:
 * 1. Constructor parameter (highest)
 * 2. AUTH_BROKER_PATH environment variable
 * 3. Current working directory (lowest)
 */
export class BtpSessionStore extends AbstractJsonSessionStore implements ISessionStore {
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
   * @returns Parsed BtpBaseSessionData or null if invalid
   */
  protected async loadFromFile(filePath: string): Promise<unknown | null> {
    // Extract destination from file path
    const fileName = path.basename(filePath);
    const destination = fileName.replace(/\.env$/, '');
    
    // Load from .env file using XSUAA env loader (reads XSUAA_* variables)
    const xsuaaConfig = await loadXsuaaEnvFile(destination, this.searchPaths);
    if (!xsuaaConfig) {
      return null;
    }

    return xsuaaConfig;
  }

  /**
   * Save session to file
   * @param filePath Path to session file
   * @param config Session configuration to save
   */
  protected async saveToFile(filePath: string, config: unknown): Promise<void> {
    // Type guard - ensure it's base BTP config (no sapUrl, no abapUrl)
    if (!config || typeof config !== 'object') {
      throw new Error('BtpSessionStore can only store base BTP sessions (without sapUrl)');
    }
    
    // Reject ABAP sessions (has sapUrl)
    if ('sapUrl' in config) {
      throw new Error('BtpSessionStore can only store base BTP sessions (without sapUrl)');
    }
    
    // Reject BTP sessions with abapUrl (that's for ABAP store)
    if ('abapUrl' in config) {
      throw new Error('BtpSessionStore can only store base BTP sessions (without abapUrl)');
    }
    
    // Ensure it has jwtToken (required)
    if (!('jwtToken' in config)) {
      throw new Error('BtpSessionStore can only store base BTP sessions');
    }

    // Validate required fields
    const btpConfig = config as { jwtToken?: string };
    if (!btpConfig.jwtToken) {
      throw new Error('Base BTP session config missing required field: jwtToken');
    }
    // mcpUrl is optional - it's not part of authentication, only needed for making requests

    // Extract destination from file path
    const fileName = path.basename(filePath);
    const destination = fileName.replace(/\.env$/, '');
    const savePath = path.dirname(filePath);

    // Save using XSUAA token storage (writes XSUAA_* variables)
    await saveXsuaaTokenToEnv(destination, savePath, config as BtpBaseSessionData);
  }

  /**
   * Load session configuration for destination
   * Returns optional composition of IAuthorizationConfig and IConnectionConfig
   * @param destination Destination name
   * @returns IConfig with actual values or null if not found
   */
  async loadSession(destination: string): Promise<IConfig | null> {
    const authConfig = await this.getAuthorizationConfig(destination);
    const connConfig = await this.getConnectionConfig(destination);
    
    // Return null if both are null, otherwise return composition (even if one is null)
    if (!authConfig && !connConfig) {
      return null;
    }
    
    return {
      ...(authConfig || {}),
      ...(connConfig || {}),
    };
  }

  /**
   * Load raw session data (internal representation)
   * Used internally for getAuthorizationConfig, getConnectionConfig, setAuthorizationConfig and setConnectionConfig
   */
  private async loadRawSession(destination: string): Promise<BtpBaseSessionData | null> {
    const fileName = this.getFileName(destination);
    const sessionPath = findFileInPaths(fileName, this.searchPaths);
    
    if (!sessionPath) {
      return null;
    }
    
    try {
      const raw = await this.loadFromFile(sessionPath);
      if (!raw || !isBtpBaseSessionConfig(raw)) {
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

  /**
   * Get connection configuration with actual values (not file paths)
   * Returns values needed for connecting to services
   * @param destination Destination name
   * @returns ConnectionConfig with actual values or null if not found
   * Note: For base BTP, serviceUrl may be undefined (not part of authentication)
   */
  async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
    const sessionConfig = await this.loadRawSession(destination);
    if (!sessionConfig) {
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

  /**
   * Set authorization configuration
   * Updates values needed for obtaining and refreshing tokens
   * @param destination Destination name
   * @param config IAuthorizationConfig with values to set
   */
  async setAuthorizationConfig(destination: string, config: IAuthorizationConfig): Promise<void> {
    const current = await this.loadRawSession(destination);
    if (!current) {
      throw new Error(`No session found for destination "${destination}"`);
    }

    // Update authorization fields
    const updated: BtpBaseSessionData = {
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
   * @param destination Destination name
   * @param config IConnectionConfig with values to set
   */
  async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void> {
    const current = await this.loadRawSession(destination);
    if (!current) {
      throw new Error(`No session found for destination "${destination}"`);
    }

    // Update connection fields
    const updated: BtpBaseSessionData = {
      ...current,
      mcpUrl: config.serviceUrl !== undefined ? config.serviceUrl : current.mcpUrl,
      jwtToken: config.authorizationToken,
    };
    
    await this.saveSession(destination, updated);
  }
}

/**
 * Type guard for BtpBaseSessionConfig
 */
function isBtpBaseSessionConfig(config: unknown): config is BtpBaseSessionData {
  if (!config || typeof config !== 'object') return false;
  const obj = config as Record<string, unknown>;
  return 'jwtToken' in obj && !('sapUrl' in obj) && !('abapUrl' in obj);
}

