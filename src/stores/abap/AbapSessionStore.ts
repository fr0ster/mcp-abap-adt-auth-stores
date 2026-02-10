/**
 * ABAP Session Store - extends base BTP store with sapUrl support
 *
 * Reads/writes session data from/to {destination}.env files in search paths.
 * Stores full ABAP configuration: SAP URL (sapUrl), JWT token, refresh token, UAA config, SAP client, language.
 * This extends base BTP store by adding sapUrl requirement.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  IAuthorizationConfig,
  IConfig,
  IConnectionConfig,
  ILogger,
  ISessionStore,
} from '@mcp-abap-adt/interfaces';
import { loadEnvFile } from '../../storage/abap/envLoader';
import { saveTokenToEnv } from '../../storage/abap/tokenStorage';
import { formatToken } from '../../utils/formatting';

// Internal type for ABAP session storage (extends base BTP with sapUrl)
interface AbapSessionData {
  sapUrl: string;
  sapClient?: string;
  jwtToken?: string; // Optional for basic auth
  sessionCookies?: string; // SAML session cookies (decoded)
  username?: string; // For basic auth (on-premise)
  password?: string; // For basic auth (on-premise)
  authType?: 'basic' | 'jwt' | 'saml'; // Authentication type
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
    const result: Record<string, unknown> = {
      sapUrl: (obj.serviceUrl || obj.sapUrl) as string,
      refreshToken: obj.refreshToken as string | undefined,
      uaaUrl: obj.uaaUrl as string | undefined,
      uaaClientId: obj.uaaClientId as string | undefined,
      uaaClientSecret: obj.uaaClientSecret as string | undefined,
      sapClient: obj.sapClient as string | undefined,
      language: obj.language as string | undefined,
    };

    // Handle authentication: SAML cookies, basic auth, or JWT auth
    if (obj.sessionCookies) {
      result.sessionCookies = obj.sessionCookies as string;
      result.authType = 'saml';
      result.jwtToken = '';
    } else if (obj.username && obj.password) {
      // Basic auth
      result.username = obj.username as string;
      result.password = obj.password as string;
      result.authType = 'basic';
      result.jwtToken = obj.authorizationToken || obj.jwtToken || '';
    } else {
      // JWT auth
      result.jwtToken = (obj.authorizationToken ||
        obj.jwtToken ||
        '') as string;
      result.authType = 'jwt';
    }

    return result;
  }

  /**
   * Save session to ENV file
   * @param filePath Path to session file
   * @param config Internal format (AbapSessionData) for ENV file
   */
  private async saveToFile(
    filePath: string,
    config: Record<string, unknown>,
  ): Promise<void> {
    // Type guard - ensure it's EnvConfig (has sapUrl)
    if (!config || typeof config !== 'object' || !('sapUrl' in config)) {
      this.log?.error(
        `Invalid config format for AbapSessionStore: missing sapUrl`,
      );
      throw new Error(
        'AbapSessionStore can only store ABAP sessions (with sapUrl)',
      );
    }

    // Extract destination from file path
    const fileName = path.basename(filePath);
    const destination = fileName.replace(/\.env$/, '');
    const savePath = path.dirname(filePath);

    // Convert to format expected by saveTokenToEnv
    const abapConfig = config as unknown as AbapSessionData;
    await saveTokenToEnv(
      destination,
      savePath,
      {
        sapUrl: abapConfig.sapUrl,
        jwtToken: abapConfig.jwtToken,
        username: abapConfig.username,
        password: abapConfig.password,
        authType: abapConfig.authType,
        refreshToken: abapConfig.refreshToken,
        uaaUrl: abapConfig.uaaUrl,
        uaaClientId: abapConfig.uaaClientId,
        uaaClientSecret: abapConfig.uaaClientSecret,
        sapClient: abapConfig.sapClient,
        language: abapConfig.language,
      },
      this.log,
    );
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
    const token = obj.authorizationToken || obj.jwtToken;
    const tokenLength = token ? String(token).length : 0;
    const formattedToken = formatToken(String(token || ''));
    const formattedRefreshToken = formatToken(
      typeof obj.refreshToken === 'string' ? obj.refreshToken : undefined,
    );
    const hasRefreshToken = !!obj.refreshToken;
    this.log?.info(
      `Session saved for ${destination}: token(${tokenLength} chars${formattedToken ? `, ${formattedToken}` : ''}), refreshToken(${formattedRefreshToken || 'none'}), sapUrl(${obj.serviceUrl || obj.sapUrl ? `${String(obj.serviceUrl || obj.sapUrl).substring(0, 40)}...` : 'none'})`,
    );
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
      this.log?.debug(`Deleting session for destination: ${destination}`);
      fs.unlinkSync(filePath);
      this.log?.info(`Session deleted for destination: ${destination}`);
    } else {
      this.log?.debug(`Session file not found for deletion: ${destination}`);
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
    const rawSession = await this.loadRawSession(destination);

    if (!rawSession) {
      this.log?.debug(`Session not found for destination: ${destination}`);
      return null;
    }

    // Convert internal format to IConfig format
    // Use Record to allow additional fields (username, password, authType) for basic auth
    const result: IConfig & Record<string, unknown> = {};

    // Connection config fields
    if (rawSession.sapUrl) {
      result.serviceUrl = rawSession.sapUrl;
    }
    if (rawSession.jwtToken !== undefined) {
      result.authorizationToken = rawSession.jwtToken;
    }
    if (rawSession.sessionCookies !== undefined) {
      result.sessionCookies = rawSession.sessionCookies;
    }
    // Basic auth fields (if present)
    if (rawSession.username) {
      result.username = rawSession.username;
    }
    if (rawSession.password) {
      result.password = rawSession.password;
    }
    if (rawSession.authType) {
      result.authType = rawSession.authType;
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
    const formattedToken = formatToken(rawSession.jwtToken);
    const formattedRefreshToken = formatToken(rawSession.refreshToken);
    const hasRefreshToken = !!rawSession.refreshToken;
    this.log?.info(
      `Session loaded for ${destination}: token(${tokenLength} chars${formattedToken ? `, ${formattedToken}` : ''}), refreshToken(${formattedRefreshToken || 'none'}), sapUrl(${rawSession.sapUrl ? `${rawSession.sapUrl.substring(0, 40)}...` : 'none'})`,
    );
    return result;
  }

  /**
   * Load raw session data (internal representation)
   * Used internally for setAuthorizationConfig and setConnectionConfig
   */
  private async loadRawSession(
    destination: string,
  ): Promise<AbapSessionData | null> {
    const fileName = `${destination}.env`;
    const sessionPath = path.join(this.directory, fileName);

    if (!sessionPath) {
      return null;
    }

    try {
      const raw = await this.loadFromFile(sessionPath);
      if (!raw || !isEnvConfig(raw)) {
        this.log?.debug(
          `Invalid session format for ${destination}: missing required field (sapUrl)`,
        );
        return null;
      }
      return raw;
    } catch (error) {
      this.log?.error(
        `Error loading session for ${destination}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Get authorization configuration with actual values (not file paths)
   * Returns values needed for obtaining and refreshing tokens
   * @param destination Destination name
   * @returns AuthorizationConfig with actual values or null if not found
   */
  async getAuthorizationConfig(
    destination: string,
  ): Promise<IAuthorizationConfig | null> {
    const sessionConfig = await this.loadRawSession(destination);
    if (!sessionConfig) {
      this.log?.debug(`Authorization config not found for ${destination}`);
      return null;
    }

    if (
      !sessionConfig.uaaUrl ||
      !sessionConfig.uaaClientId ||
      !sessionConfig.uaaClientSecret
    ) {
      this.log?.warn(
        `Authorization config for ${destination} missing required UAA fields`,
      );
      return null;
    }

    this.log?.debug(
      `Authorization config loaded for ${destination}: uaaUrl(${sessionConfig.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!sessionConfig.refreshToken})`,
    );
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
  async getConnectionConfig(
    destination: string,
  ): Promise<IConnectionConfig | null> {
    const sessionConfig = await this.loadRawSession(destination);
    if (!sessionConfig) {
      this.log?.debug(`Connection config not found for ${destination}`);
      return null;
    }

    if (!sessionConfig.sapUrl) {
      this.log?.warn(
        `Connection config for ${destination} missing required field: sapUrl`,
      );
      return null;
    }

    // SAML auth: session cookies
    if (sessionConfig.authType === 'saml' || sessionConfig.sessionCookies) {
      if (!sessionConfig.sessionCookies) {
        this.log?.warn(
          `Connection config for ${destination} missing required field for SAML auth: sessionCookies`,
        );
        return null;
      }

      this.log?.debug(
        `Connection config loaded for ${destination} (SAML auth): cookies(${sessionConfig.sessionCookies.length} chars), sapUrl(${sessionConfig.sapUrl.substring(0, 40)}...)`,
      );
      return {
        serviceUrl: sessionConfig.sapUrl,
        sessionCookies: sessionConfig.sessionCookies,
        authType: 'saml',
        sapClient: sessionConfig.sapClient,
        language: sessionConfig.language,
      };
    }

    // Check for basic auth: if username/password present and no jwtToken, use basic auth
    const isBasicAuth =
      sessionConfig.authType === 'basic' ||
      (!sessionConfig.jwtToken &&
        sessionConfig.username &&
        sessionConfig.password);

    if (isBasicAuth) {
      if (!sessionConfig.username || !sessionConfig.password) {
        this.log?.warn(
          `Connection config for ${destination} missing required fields for basic auth: username(${!!sessionConfig.username}), password(${!!sessionConfig.password})`,
        );
        return null;
      }

      this.log?.debug(
        `Connection config loaded for ${destination} (basic auth): username(${sessionConfig.username}), sapUrl(${sessionConfig.sapUrl.substring(0, 40)}...)`,
      );
      return {
        serviceUrl: sessionConfig.sapUrl,
        username: sessionConfig.username,
        password: sessionConfig.password,
        authType: 'basic',
        sapClient: sessionConfig.sapClient,
        language: sessionConfig.language,
      };
    }

    // JWT auth: check jwtToken
    if (!sessionConfig.jwtToken) {
      this.log?.warn(
        `Connection config for ${destination} missing required field for JWT auth: jwtToken`,
      );
      return null;
    }

    this.log?.debug(
      `Connection config loaded for ${destination} (JWT auth): token(${sessionConfig.jwtToken.length} chars${formatToken(sessionConfig.jwtToken) ? `, ${formatToken(sessionConfig.jwtToken)}` : ''}), sapUrl(${sessionConfig.sapUrl.substring(0, 40)}...)`,
    );
    return {
      serviceUrl: sessionConfig.sapUrl,
      authorizationToken: sessionConfig.jwtToken,
      authType: 'jwt',
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
  async setAuthorizationConfig(
    destination: string,
    config: IAuthorizationConfig,
  ): Promise<void> {
    const current = await this.loadRawSession(destination);

    if (!current) {
      // Session doesn't exist - try to get serviceUrl from existing session file or use defaultServiceUrl
      // For ABAP, we need sapUrl to create session
      let sapUrl = this.defaultServiceUrl;
      let existingAuthToken = '';
      let existingUsername: string | undefined;
      let existingPassword: string | undefined;
      let existingAuthType: 'basic' | 'jwt' | 'saml' | undefined;

      // Try to load existing session file to get serviceUrl and auth info
      try {
        const existingSession = await this.loadSession(destination);
        if (existingSession?.serviceUrl) {
          sapUrl = existingSession.serviceUrl;
          existingAuthToken = existingSession.authorizationToken || '';
          const sessionWithBasicAuth = existingSession as IConfig &
            Record<string, unknown>;
          existingUsername =
            typeof sessionWithBasicAuth.username === 'string'
              ? sessionWithBasicAuth.username
              : undefined;
          existingPassword =
            typeof sessionWithBasicAuth.password === 'string'
              ? sessionWithBasicAuth.password
              : undefined;
          existingAuthType =
            typeof sessionWithBasicAuth.authType === 'string'
              ? sessionWithBasicAuth.authType
              : undefined;
        }
      } catch {
        // Ignore errors when loading session - will use defaultServiceUrl
      }

      if (!sapUrl) {
        this.log?.error(
          `Cannot set authorization config for ${destination}: session does not exist and serviceUrl is required. Missing defaultServiceUrl in constructor.`,
        );
        throw new Error(
          `Cannot set authorization config for destination "${destination}": session does not exist and serviceUrl is required for ABAP sessions. Call setConnectionConfig first or provide defaultServiceUrl in constructor.`,
        );
      }

      this.log?.debug(
        `Creating new session for ${destination} via setAuthorizationConfig: sapUrl(${sapUrl.substring(0, 40)}...)`,
      );

      const newSession: IConfig = {
        serviceUrl: sapUrl,
        authorizationToken: existingAuthToken,
        username: existingUsername,
        password: existingPassword,
        authType: existingAuthType,
        uaaUrl: config.uaaUrl,
        uaaClientId: config.uaaClientId,
        uaaClientSecret: config.uaaClientSecret,
        refreshToken: config.refreshToken,
      };
      await this.saveSession(destination, newSession);
      this.log?.info(
        `New session created for ${destination} via setAuthorizationConfig: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`,
      );
      return;
    }

    // Update authorization fields - convert internal format to IConfig
    this.log?.debug(
      `Updating authorization config for existing session ${destination}: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`,
    );
    const updated: IConfig = {
      serviceUrl: current.sapUrl,
      authorizationToken: current.jwtToken,
      sapClient: current.sapClient,
      language: current.language,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || current.refreshToken,
    };
    await this.saveSession(destination, updated);
    this.log?.info(
      `Authorization config updated for ${destination}: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`,
    );
  }

  /**
   * Set connection configuration
   * Updates values needed for connecting to services
   * Creates new session if it doesn't exist
   * @param destination Destination name
   * @param config IConnectionConfig with values to set
   */
  async setConnectionConfig(
    destination: string,
    config: IConnectionConfig,
  ): Promise<void> {
    const current = await this.loadRawSession(destination);

    if (!current) {
      // Session doesn't exist - create new one
      // For ABAP, serviceUrl is required - use from config, defaultServiceUrl, or throw error
      const serviceUrl = config.serviceUrl || this.defaultServiceUrl;

      if (!serviceUrl) {
        this.log?.error(
          `Cannot create session for ${destination}: serviceUrl is required. Missing in config and defaultServiceUrl in constructor.`,
        );
        throw new Error(
          `Cannot create session for destination "${destination}": serviceUrl is required for ABAP sessions. Provide it in config or constructor.`,
        );
      }

      this.log?.debug(
        `Creating new session for ${destination} via setConnectionConfig: serviceUrl(${serviceUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
      );

      const newSession: IConfig = {
        serviceUrl: serviceUrl,
        authorizationToken: config.authorizationToken || '',
        sessionCookies: config.sessionCookies,
        sapClient: config.sapClient,
        language: config.language,
      };
      await this.saveSession(destination, newSession);
      this.log?.info(
        `Session created for ${destination}: serviceUrl(${serviceUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
      );
      return;
    }

    // Update connection fields - convert internal format to IConfig
    this.log?.debug(
      `Updating connection config for existing session ${destination}: serviceUrl(${config.serviceUrl ? `${config.serviceUrl.substring(0, 40)}...` : 'unchanged'}), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
    );
    const updated: IConfig = {
      serviceUrl: config.serviceUrl || current.sapUrl,
      authorizationToken: config.authorizationToken,
      sessionCookies:
        config.sessionCookies !== undefined
          ? config.sessionCookies
          : current.sessionCookies,
      sapClient:
        config.sapClient !== undefined ? config.sapClient : current.sapClient,
      language:
        config.language !== undefined ? config.language : current.language,
      uaaUrl: current.uaaUrl,
      uaaClientId: current.uaaClientId,
      uaaClientSecret: current.uaaClientSecret,
      refreshToken: current.refreshToken,
    };

    await this.saveSession(destination, updated);
    const finalServiceUrl = updated.serviceUrl || current.sapUrl;
    this.log?.info(
      `Connection config updated for ${destination}: serviceUrl(${finalServiceUrl ? `${finalServiceUrl.substring(0, 40)}...` : 'none'}), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
    );
  }
}

/**
 * Type guard for EnvConfig (ABAP session with sapUrl)
 */
function isEnvConfig(config: unknown): config is AbapSessionData {
  if (!config || typeof config !== 'object') return false;
  const obj = config as Record<string, unknown>;
  // Must have sapUrl (authentication fields are optional - can be set later)
  return 'sapUrl' in obj;
}
