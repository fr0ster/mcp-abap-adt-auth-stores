/**
 * Env File Session Store - reads session from a specific .env file
 * 
 * This store reads connection configuration from a .env file at a specified path.
 * Unlike other stores that work with directories, this one works with a single file.
 * 
 * Use case: `mcp-abap-adt --env=/path/to/.env`
 * 
 * The store is READ-ONLY for connection config (writes only update in-memory state).
 * For token refresh scenarios (JWT), the in-memory state is used.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ISessionStore, IConnectionConfig, IAuthorizationConfig, IConfig, ILogger } from '@mcp-abap-adt/interfaces';

/**
 * Internal session data structure
 */
interface EnvSessionData {
  serviceUrl: string;
  sapClient?: string;
  authType: 'basic' | 'jwt';
  // Basic auth
  username?: string;
  password?: string;
  // JWT auth
  jwtToken?: string;
  refreshToken?: string;
  // UAA (for token refresh)
  uaaUrl?: string;
  uaaClientId?: string;
  uaaClientSecret?: string;
}

/**
 * Session store that reads from a specific .env file
 */
export class EnvFileSessionStore implements ISessionStore {
  private envFilePath: string;
  private log?: ILogger;
  private loadedData: EnvSessionData | null = null;
  private inMemoryUpdates: Map<string, EnvSessionData> = new Map();

  /**
   * Create a new EnvFileSessionStore
   * @param envFilePath Absolute path to the .env file
   * @param log Optional logger
   */
  constructor(envFilePath: string, log?: ILogger) {
    this.envFilePath = path.resolve(envFilePath);
    this.log = log;
  }

  /**
   * Get the auth type from the loaded .env file
   */
  getAuthType(): 'basic' | 'jwt' | null {
    if (!this.loadedData) {
      this.loadEnvFile();
    }
    return this.loadedData?.authType || null;
  }

  /**
   * Parse .env file content into key-value pairs
   */
  private parseEnvContent(content: string): Record<string, string> {
    const envVars: Record<string, string> = {};

    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.substring(0, eqIndex).trim();
      let value = trimmed.substring(eqIndex + 1);

      // Remove inline comments (but be careful with URLs containing #)
      // Only remove # comments that are preceded by whitespace
      const commentMatch = value.match(/\s+#/);
      if (commentMatch) {
        value = value.substring(0, commentMatch.index).trim();
      } else {
        value = value.trim();
      }

      // Remove surrounding quotes
      value = value.replace(/^["']+|["']+$/g, '').trim();

      if (key) {
        envVars[key] = value;
      }
    }

    return envVars;
  }

  /**
   * Load and parse the .env file
   */
  private loadEnvFile(): EnvSessionData | null {
    if (this.loadedData) {
      return this.loadedData;
    }

    if (!fs.existsSync(this.envFilePath)) {
      this.log?.error(`EnvFileSessionStore: .env file not found: ${this.envFilePath}`);
      return null;
    }

    try {
      const content = fs.readFileSync(this.envFilePath, 'utf8');
      const envVars = this.parseEnvContent(content);

      // Validate required fields
      if (!envVars.SAP_URL) {
        this.log?.error(`EnvFileSessionStore: .env file missing SAP_URL`);
        return null;
      }

      const authType = (envVars.SAP_AUTH_TYPE || 'basic') as 'basic' | 'jwt';

      const data: EnvSessionData = {
        serviceUrl: envVars.SAP_URL,
        sapClient: envVars.SAP_CLIENT,
        authType,
      };

      if (authType === 'basic') {
        if (!envVars.SAP_USERNAME || !envVars.SAP_PASSWORD) {
          this.log?.error(`EnvFileSessionStore: .env file missing SAP_USERNAME or SAP_PASSWORD for basic auth`);
          return null;
        }
        data.username = envVars.SAP_USERNAME;
        data.password = envVars.SAP_PASSWORD;
      } else if (authType === 'jwt') {
        if (!envVars.SAP_JWT_TOKEN) {
          this.log?.error(`EnvFileSessionStore: .env file missing SAP_JWT_TOKEN for JWT auth`);
          return null;
        }
        data.jwtToken = envVars.SAP_JWT_TOKEN;
        data.refreshToken = envVars.SAP_REFRESH_TOKEN;
        data.uaaUrl = envVars.SAP_UAA_URL;
        data.uaaClientId = envVars.SAP_UAA_CLIENT_ID;
        data.uaaClientSecret = envVars.SAP_UAA_CLIENT_SECRET;
      }

      this.loadedData = data;
      this.log?.debug(`EnvFileSessionStore: loaded .env file`, { 
        serviceUrl: data.serviceUrl, 
        authType: data.authType 
      });

      return data;
    } catch (error) {
      this.log?.error(`EnvFileSessionStore: failed to read .env file`, { 
        error: error instanceof Error ? error.message : String(error) 
      });
      return null;
    }
  }

  /**
   * Convert internal format to IConfig
   */
  private toIConfig(data: EnvSessionData): IConfig {
    const config: IConfig = {
      serviceUrl: data.serviceUrl,
      sapClient: data.sapClient,
      authType: data.authType,
    };

    if (data.authType === 'basic') {
      config.username = data.username;
      config.password = data.password;
    } else if (data.authType === 'jwt') {
      config.authorizationToken = data.jwtToken;
      config.refreshToken = data.refreshToken;
      config.uaaUrl = data.uaaUrl;
      config.uaaClientId = data.uaaClientId;
      config.uaaClientSecret = data.uaaClientSecret;
    }

    return config;
  }

  // ============================================================================
  // ISessionStore implementation
  // ============================================================================

  async loadSession(destination: string): Promise<IConfig | null> {
    // Check in-memory updates first (for token refresh)
    const updated = this.inMemoryUpdates.get(destination);
    if (updated) {
      return this.toIConfig(updated);
    }

    // Load from .env file
    const data = this.loadEnvFile();
    if (!data) return null;

    return this.toIConfig(data);
  }

  async saveSession(destination: string, config: IConfig): Promise<void> {
    // Save to in-memory only (don't overwrite .env file)
    const data: EnvSessionData = {
      serviceUrl: config.serviceUrl || this.loadedData?.serviceUrl || '',
      sapClient: config.sapClient || this.loadedData?.sapClient,
      authType: (config.authType as 'basic' | 'jwt') || this.loadedData?.authType || 'basic',
      username: config.username,
      password: config.password,
      jwtToken: config.authorizationToken,
      refreshToken: config.refreshToken,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
    };

    this.inMemoryUpdates.set(destination, data);
    this.log?.debug(`EnvFileSessionStore: saved session to memory`, { destination });
  }

  async getConnectionConfig(destination: string): Promise<IConnectionConfig | null> {
    // Check in-memory updates first
    const updated = this.inMemoryUpdates.get(destination);
    if (updated) {
      return {
        serviceUrl: updated.serviceUrl,
        sapClient: updated.sapClient,
        authType: updated.authType,
        username: updated.username,
        password: updated.password,
        authorizationToken: updated.jwtToken,
      };
    }

    const data = this.loadEnvFile();
    if (!data) return null;

    return {
      serviceUrl: data.serviceUrl,
      sapClient: data.sapClient,
      authType: data.authType,
      username: data.username,
      password: data.password,
      authorizationToken: data.jwtToken,
    };
  }

  async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void> {
    // Store in memory (merge with existing data)
    const existing = this.inMemoryUpdates.get(destination) || this.loadEnvFile() || {} as EnvSessionData;
    
    const data: EnvSessionData = {
      ...existing,
      serviceUrl: config.serviceUrl || existing.serviceUrl,
      sapClient: config.sapClient || existing.sapClient,
      authType: (config.authType as 'basic' | 'jwt') || existing.authType || 'basic',
      username: config.username || existing.username,
      password: config.password || existing.password,
      jwtToken: config.authorizationToken || existing.jwtToken,
    };

    this.inMemoryUpdates.set(destination, data);
    this.log?.debug(`EnvFileSessionStore: set connection config`, { destination, serviceUrl: data.serviceUrl });
  }

  async getAuthorizationConfig(destination: string): Promise<IAuthorizationConfig | null> {
    // Check in-memory updates first
    const updated = this.inMemoryUpdates.get(destination);
    if (updated && updated.authType === 'jwt') {
      return {
        uaaUrl: updated.uaaUrl || '',
        uaaClientId: updated.uaaClientId || '',
        uaaClientSecret: updated.uaaClientSecret || '',
        refreshToken: updated.refreshToken,
      };
    }

    const data = this.loadEnvFile();
    if (!data || data.authType !== 'jwt') return null;

    return {
      uaaUrl: data.uaaUrl || '',
      uaaClientId: data.uaaClientId || '',
      uaaClientSecret: data.uaaClientSecret || '',
      refreshToken: data.refreshToken,
    };
  }

  async setAuthorizationConfig(destination: string, config: IAuthorizationConfig): Promise<void> {
    const existing = this.inMemoryUpdates.get(destination) || this.loadEnvFile() || {} as EnvSessionData;
    
    const data: EnvSessionData = {
      ...existing,
      serviceUrl: existing.serviceUrl || '',
      authType: existing.authType || 'jwt',
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || existing.refreshToken,
    };

    this.inMemoryUpdates.set(destination, data);
    this.log?.debug(`EnvFileSessionStore: set authorization config`, { destination });
  }

  async getToken(destination: string): Promise<string | undefined> {
    // Check in-memory updates first (refreshed token)
    const updated = this.inMemoryUpdates.get(destination);
    if (updated?.jwtToken) {
      return updated.jwtToken;
    }

    const data = this.loadEnvFile();
    return data?.jwtToken;
  }

  async setToken(destination: string, token: string): Promise<void> {
    const existing = this.inMemoryUpdates.get(destination) || this.loadEnvFile() || {} as EnvSessionData;
    
    const data: EnvSessionData = {
      ...existing,
      serviceUrl: existing.serviceUrl || '',
      authType: 'jwt',
      jwtToken: token,
    };

    this.inMemoryUpdates.set(destination, data);
    this.log?.debug(`EnvFileSessionStore: set token`, { destination });
  }

  async getRefreshToken(destination: string): Promise<string | undefined> {
    const updated = this.inMemoryUpdates.get(destination);
    if (updated?.refreshToken) {
      return updated.refreshToken;
    }

    const data = this.loadEnvFile();
    return data?.refreshToken;
  }

  async setRefreshToken(destination: string, refreshToken: string): Promise<void> {
    const existing = this.inMemoryUpdates.get(destination) || this.loadEnvFile() || {} as EnvSessionData;
    
    const data: EnvSessionData = {
      ...existing,
      serviceUrl: existing.serviceUrl || '',
      authType: 'jwt',
      refreshToken,
    };

    this.inMemoryUpdates.set(destination, data);
    this.log?.debug(`EnvFileSessionStore: set refresh token`, { destination });
  }

  /**
   * Clear in-memory updates (useful for testing)
   */
  clear(): void {
    this.inMemoryUpdates.clear();
    this.loadedData = null;
  }
}
