/**
 * Safe XSUAA Session Store - in-memory session storage for XSUAA connections (same as base BTP, without sapUrl)
 *
 * Stores XSUAA configuration in memory only.
 * Does not persist to disk - suitable for secure environments.
 */

import type {
  IAuthorizationConfig,
  IConfig,
  IConnectionConfig,
  ILogger,
  ISessionStore,
} from '@mcp-abap-adt/interfaces';
import { formatToken } from '../../utils/formatting';

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
 * Safe XSUAA Session store implementation
 *
 * Stores session data in memory only (no file I/O).
 * Suitable for secure environments where tokens should not be persisted to disk.
 */
export class SafeXsuaaSessionStore implements ISessionStore {
  private sessions: Map<string, XsuaaSessionData> = new Map();
  private log?: ILogger;
  private defaultServiceUrl: string;

  /**
   * Create a new SafeXsuaaSessionStore instance
   * @param defaultServiceUrl Default service URL (required for XSUAA - cannot be obtained from service key)
   * @param log Optional logger for logging operations
   */
  constructor(defaultServiceUrl: string, log?: ILogger) {
    this.defaultServiceUrl = defaultServiceUrl;
    this.log = log;
  }

  private loadRawSession(destination: string): XsuaaSessionData | null {
    return this.sessions.get(destination) || null;
  }

  private validateSessionConfig(config: IConfig): void {
    if (!config || typeof config !== 'object') {
      throw new Error('SafeXsuaaSessionStore can only store XSUAA sessions');
    }
    const obj = config as Record<string, unknown>;

    // Reject ABAP sessions (has sapUrl)
    if ('sapUrl' in obj) {
      throw new Error('SafeXsuaaSessionStore can only store XSUAA sessions');
    }

    // Reject BTP sessions with abapUrl (that's for ABAP store)
    if ('abapUrl' in obj) {
      throw new Error('SafeXsuaaSessionStore can only store XSUAA sessions');
    }

    // Accept IConfig format (has authorizationToken) or internal format (has jwtToken)
    // Allow empty string for token (can be set later via setConnectionConfig)
    const hasToken =
      (obj.authorizationToken !== undefined &&
        obj.authorizationToken !== null) ||
      (obj.jwtToken !== undefined && obj.jwtToken !== null);
    if (!hasToken) {
      throw new Error(
        'XSUAA session config missing required field: authorizationToken or jwtToken',
      );
    }
  }

  private convertToInternalFormat(config: IConfig): XsuaaSessionData {
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid config');
    }
    const obj = config as Record<string, unknown>;
    // Convert IConfig format (serviceUrl, authorizationToken) to internal format (mcpUrl, jwtToken)
    const internal: XsuaaSessionData = {
      mcpUrl: obj.serviceUrl as string | undefined,
      jwtToken: (obj.authorizationToken || obj.jwtToken) as string,
      refreshToken: obj.refreshToken as string | undefined,
      uaaUrl: obj.uaaUrl as string | undefined,
      uaaClientId: obj.uaaClientId as string | undefined,
      uaaClientSecret: obj.uaaClientSecret as string | undefined,
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
    const formattedToken = formatToken(connConfig?.authorizationToken);
    const formattedRefreshToken = formatToken(authConfig?.refreshToken);
    const hasRefreshToken = !!authConfig?.refreshToken;
    this.log?.info(
      `Session loaded for ${destination}: token(${tokenLength} chars${formattedToken ? `, ${formattedToken}` : ''}), refreshToken(${formattedRefreshToken || 'none'}), serviceUrl(${connConfig?.serviceUrl ? `${connConfig.serviceUrl.substring(0, 40)}...` : 'none'})`,
    );
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
    const token = obj.authorizationToken || obj.jwtToken;
    const tokenLength = token ? String(token).length : 0;
    const formattedToken = formatToken(String(token || ''));
    const formattedRefreshToken = formatToken(
      typeof obj.refreshToken === 'string' ? obj.refreshToken : undefined,
    );
    const hasRefreshToken = !!obj.refreshToken;
    this.log?.info(
      `Session saved for ${destination}: token(${tokenLength} chars${formattedToken ? `, ${formattedToken}` : ''}), refreshToken(${formattedRefreshToken || 'none'}), serviceUrl(${obj.serviceUrl || obj.mcpUrl ? `${String(obj.serviceUrl || obj.mcpUrl).substring(0, 40)}...` : 'none'})`,
    );
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

  async getConnectionConfig(
    destination: string,
  ): Promise<IConnectionConfig | null> {
    const sessionConfig = this.loadRawSession(destination);
    if (!sessionConfig) {
      return null;
    }

    // Return null if jwtToken is undefined or null (but allow empty string)
    if (
      sessionConfig.jwtToken === undefined ||
      sessionConfig.jwtToken === null
    ) {
      return null;
    }

    return {
      serviceUrl: sessionConfig.mcpUrl, // May be undefined for XSUAA
      authorizationToken: sessionConfig.jwtToken,
    };
  }

  async setConnectionConfig(
    destination: string,
    config: IConnectionConfig,
  ): Promise<void> {
    const current = this.loadRawSession(destination);

    if (!current) {
      // Session doesn't exist - create new one
      // For XSUAA, use config.serviceUrl if provided, otherwise use defaultServiceUrl (required)
      const serviceUrl = config.serviceUrl || this.defaultServiceUrl;
      this.log?.debug(
        `Creating new session for ${destination} via setConnectionConfig: mcpUrl(${serviceUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
      );

      const newSession: XsuaaSessionData = {
        mcpUrl: serviceUrl,
        jwtToken: config.authorizationToken || '',
      };
      // Save directly to Map (internal format)
      this.sessions.set(destination, newSession);
      this.log?.info(
        `Session created for ${destination}: mcpUrl(${serviceUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
      );
      return;
    }

    this.log?.debug(
      `Updating connection config for existing session ${destination}: serviceUrl(${config.serviceUrl ? `${config.serviceUrl.substring(0, 40)}...` : 'unchanged'}), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
    );
    const updated: XsuaaSessionData = {
      ...current,
      mcpUrl:
        config.serviceUrl !== undefined ? config.serviceUrl : current.mcpUrl,
      jwtToken:
        config.authorizationToken !== undefined
          ? config.authorizationToken
          : current.jwtToken,
    };
    // Save directly to Map (internal format)
    this.sessions.set(destination, updated);
    this.log?.info(
      `Connection config updated for ${destination}: serviceUrl(${updated.mcpUrl ? `${updated.mcpUrl.substring(0, 40)}...` : 'none'}), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
    );
  }

  async getAuthorizationConfig(
    destination: string,
  ): Promise<IAuthorizationConfig | null> {
    const sessionConfig = this.loadRawSession(destination);
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

  async setAuthorizationConfig(
    destination: string,
    config: IAuthorizationConfig,
  ): Promise<void> {
    const current = this.loadRawSession(destination);

    if (!current) {
      // Session doesn't exist - create new one
      // For XSUAA, use defaultServiceUrl (required - cannot be obtained from service key)
      this.log?.debug(
        `Creating new session for ${destination} via setAuthorizationConfig: mcpUrl(${this.defaultServiceUrl.substring(0, 40)}...)`,
      );

      const newSession: XsuaaSessionData = {
        mcpUrl: this.defaultServiceUrl,
        jwtToken: '', // Will be set when connection config is set
        uaaUrl: config.uaaUrl,
        uaaClientId: config.uaaClientId,
        uaaClientSecret: config.uaaClientSecret,
        refreshToken: config.refreshToken,
      };
      // Save directly to Map (internal format)
      this.sessions.set(destination, newSession);
      this.log?.info(
        `New session created for ${destination} via setAuthorizationConfig: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`,
      );
      return;
    }

    this.log?.debug(
      `Updating authorization config for existing session ${destination}: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`,
    );
    const updated: XsuaaSessionData = {
      ...current,
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken || current.refreshToken,
    };
    // Save directly to Map (internal format)
    this.sessions.set(destination, updated);
    this.log?.info(
      `Authorization config updated for ${destination}: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`,
    );
  }
}
