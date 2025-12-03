/**
 * XSUAA Session Store - stores XSUAA session data (same as base BTP, without sapUrl)
 * 
 * This is an alias for BtpSessionStore for backward compatibility.
 * Stores to {destination}.env files with XSUAA_* variables.
 */

import type { IAuthorizationConfig, IConnectionConfig, ISessionStore } from '@mcp-abap-adt/auth-broker';
import type { IConfig } from '@mcp-abap-adt/auth-broker';
import { AbstractJsonSessionStore } from '../abstract/AbstractJsonSessionStore';
import { findFileInPaths } from '../../utils/pathResolver';
import { loadXsuaaEnvFile } from '../../storage/xsuaa/xsuaaEnvLoader';
import { saveXsuaaTokenToEnv } from '../../storage/xsuaa/xsuaaTokenStorage';
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
export class XsuaaSessionStore extends AbstractJsonSessionStore implements ISessionStore {
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
    // Type guard - ensure it's XSUAA config (no sapUrl, no abapUrl)
    if (!config || typeof config !== 'object') {
      throw new Error('XsuaaSessionStore can only store XsuaaSessionConfig');
    }
    
    // Reject ABAP sessions (has sapUrl)
    if ('sapUrl' in config) {
      throw new Error('XsuaaSessionStore can only store XsuaaSessionConfig');
    }
    
    // Reject BTP sessions with abapUrl (that's for ABAP store)
    if ('abapUrl' in config) {
      throw new Error('XsuaaSessionStore can only store XsuaaSessionConfig');
    }
    
    // Ensure it has jwtToken (required)
    if (!('jwtToken' in config)) {
      throw new Error('XsuaaSessionStore can only store XsuaaSessionConfig');
    }

    // Validate required fields
    const xsuaaConfig = config as { jwtToken?: string };
    if (!xsuaaConfig.jwtToken) {
      throw new Error('XSUAA session config missing required field: jwtToken');
    }
    // mcpUrl is optional - it's not part of authentication, only needed for making requests

    // Extract destination from file path
    const fileName = path.basename(filePath);
    const destination = fileName.replace(/\.env$/, '');
    const savePath = path.dirname(filePath);

    // Convert to XSUAA format and save
    const xsuaaData = config as XsuaaSessionData;
    await saveXsuaaTokenToEnv(destination, savePath, xsuaaData);
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
  private async loadRawSession(destination: string): Promise<XsuaaSessionData | null> {
    const fileName = this.getFileName(destination);
    const sessionPath = findFileInPaths(fileName, this.searchPaths);
    
    if (!sessionPath) {
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
      return null;
    }

    if (!sessionConfig.jwtToken) {
      return null;
    }

    return {
      serviceUrl: sessionConfig.mcpUrl, // May be undefined for XSUAA
      authorizationToken: sessionConfig.jwtToken,
    };
  }

  async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void> {
    const current = await this.loadRawSession(destination);
    if (!current) {
      throw new Error(`No session found for destination "${destination}"`);
    }

    // Update connection fields
    const updated: XsuaaSessionData = {
      ...current,
      mcpUrl: config.serviceUrl !== undefined ? config.serviceUrl : current.mcpUrl,
      jwtToken: config.authorizationToken,
    };
    
    await this.saveSession(destination, updated);
  }

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

  async setAuthorizationConfig(destination: string, config: IAuthorizationConfig): Promise<void> {
    const current = await this.loadRawSession(destination);
    if (!current) {
      throw new Error(`No session found for destination "${destination}"`);
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

