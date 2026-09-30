/**
 * Safe ABAP Session Store - in-memory session storage for ABAP connections (with sapUrl)
 *
 * Stores full ABAP configuration (with sapUrl) in memory only.
 * Does not persist to disk - suitable for secure environments.
 */

import type {
  IAuthorizationConfig,
  IConfig,
  IConnectionConfig,
  ISessionStore,
} from '@mcp-abap-adt/interfaces-auth-sap';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import { formatToken } from '../../utils/formatting';

// Internal type for ABAP session storage (extends base BTP with sapUrl)
interface AbapSessionData {
  sapUrl: string;
  sapClient?: string;
  jwtToken?: string; // Optional for basic auth
  sessionCookies?: string; // SAML session cookies (decoded)
  username?: string; // For basic auth (on-premise)
  password?: string; // For basic auth (on-premise)
  authType?: 'basic' | 'jwt' | 'saml' | 'snc'; // Authentication type
  refreshToken?: string;
  uaaUrl?: string;
  uaaClientId?: string;
  uaaClientSecret?: string;
  language?: string;
  sncPartnerName?: string; // SNC logon
  sncQop?: string;
  sncLib?: string;
  sncMyName?: string;
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
      throw new Error(
        'SafeAbapSessionStore can only store ABAP sessions (with sapUrl)',
      );
    }
    const obj = config as Record<string, unknown>;
    // Accept IConfig format (has serviceUrl) or internal format (has sapUrl)
    const serviceUrl = obj.serviceUrl || obj.sapUrl;
    if (!serviceUrl) {
      this.log?.error(
        `Validation failed: missing required field serviceUrl or sapUrl`,
      );
      throw new Error(
        'ABAP session config missing required field: serviceUrl or sapUrl',
      );
    }
    // A session holds one credential: a token, a user and password, SAML
    // cookies, or an SNC partner name
    const hasCredential = !!(
      obj.authorizationToken ||
      obj.jwtToken ||
      (obj.username && obj.password) ||
      obj.sessionCookies ||
      obj.sncPartnerName
    );
    if (!hasCredential) {
      this.log?.error(
        `Validation failed: missing a credential (token, username and password, sessionCookies or sncPartnerName)`,
      );
      throw new Error(
        'ABAP session config missing required field: authorizationToken or jwtToken (or username and password, sessionCookies, sncPartnerName)',
      );
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
      jwtToken: (obj.authorizationToken || obj.jwtToken) as string | undefined,
      username: obj.username as string | undefined,
      password: obj.password as string | undefined,
      sessionCookies: obj.sessionCookies as string | undefined,
      authType: inferAuthType(obj),
      sncPartnerName: obj.sncPartnerName as string | undefined,
      sncQop: obj.sncQop as string | undefined,
      sncLib: obj.sncLib as string | undefined,
      sncMyName: obj.sncMyName as string | undefined,
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
    if (rawSession.sessionCookies !== undefined) {
      result.sessionCookies = rawSession.sessionCookies;
    }
    if (rawSession.username) {
      result.username = rawSession.username;
    }
    if (rawSession.password) {
      result.password = rawSession.password;
    }
    if (rawSession.authType) {
      result.authType = rawSession.authType;
    }
    if (rawSession.sncPartnerName) {
      result.sncPartnerName = rawSession.sncPartnerName;
    }
    if (rawSession.sncQop) {
      result.sncQop = rawSession.sncQop;
    }
    if (rawSession.sncLib) {
      result.sncLib = rawSession.sncLib;
    }
    if (rawSession.sncMyName) {
      result.sncMyName = rawSession.sncMyName;
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
    this.log?.info(
      `Session loaded for ${destination}: token(${tokenLength} chars), hasRefreshToken(${hasRefreshToken}), sapUrl(${rawSession.sapUrl ? `${rawSession.sapUrl.substring(0, 40)}...` : 'none'})`,
    );
    return result;
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
      `Session saved for ${destination}: token(${tokenLength} chars${formattedToken ? `, ${formattedToken}` : ''}), refreshToken(${formattedRefreshToken || 'none'}), sapUrl(${obj.serviceUrl || obj.sapUrl ? `${String(obj.serviceUrl || obj.sapUrl).substring(0, 40)}...` : 'none'})`,
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
      this.log?.debug(`Connection config not found for ${destination}`);
      return null;
    }

    if (!sessionConfig.sapUrl) {
      this.log?.warn(
        `Connection config for ${destination} missing required field: sapUrl`,
      );
      return null;
    }

    // The declared type wins; a session without one is inferred as it always was
    const type =
      sessionConfig.authType ??
      (sessionConfig.sessionCookies
        ? 'saml'
        : !sessionConfig.jwtToken &&
            sessionConfig.username &&
            sessionConfig.password
          ? 'basic'
          : !sessionConfig.jwtToken && sessionConfig.sncPartnerName
            ? 'snc'
            : 'jwt');

    // SNC auth: partner name, no token or password
    if (type === 'snc') {
      if (!sessionConfig.sncPartnerName) {
        this.log?.warn(
          `Connection config for ${destination} missing required field for SNC auth: sncPartnerName`,
        );
        return null;
      }

      this.log?.debug(
        `Connection config loaded for ${destination} (SNC auth): partner(${sessionConfig.sncPartnerName}), sapUrl(${sessionConfig.sapUrl.substring(0, 40)}...)`,
      );
      return {
        serviceUrl: sessionConfig.sapUrl,
        authType: 'snc',
        sncPartnerName: sessionConfig.sncPartnerName,
        ...(sessionConfig.sncQop && { sncQop: sessionConfig.sncQop }),
        ...(sessionConfig.sncLib && { sncLib: sessionConfig.sncLib }),
        ...(sessionConfig.sncMyName && { sncMyName: sessionConfig.sncMyName }),
        sapClient: sessionConfig.sapClient,
        language: sessionConfig.language,
      };
    }

    // SAML auth: session cookies
    if (type === 'saml') {
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
    if (type === 'basic') {
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

  async setConnectionConfig(
    destination: string,
    config: IConnectionConfig,
  ): Promise<void> {
    const current = this.loadRawSession(destination);

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

      const newSession: AbapSessionData = {
        sapUrl: serviceUrl,
        jwtToken: config.authorizationToken,
        sessionCookies: config.sessionCookies,
        username: config.username,
        password: config.password,
        authType: inferAuthType(config as Record<string, unknown>),
        sncPartnerName: config.sncPartnerName,
        sncQop: config.sncQop,
        sncLib: config.sncLib,
        sncMyName: config.sncMyName,
        sapClient: config.sapClient,
        language: config.language,
      };
      // Save directly to Map (internal format)
      this.sessions.set(destination, newSession);
      this.log?.info(
        `Session created for ${destination}: serviceUrl(${serviceUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
      );
      return;
    }

    this.log?.debug(
      `Updating connection config for existing session ${destination}: serviceUrl(${config.serviceUrl ? `${config.serviceUrl.substring(0, 40)}...` : 'unchanged'}), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
    );
    const updated: AbapSessionData = {
      ...current,
      sapUrl: config.serviceUrl || current.sapUrl,
      jwtToken: config.authorizationToken || current.jwtToken || '',
      sessionCookies:
        config.sessionCookies !== undefined
          ? config.sessionCookies
          : current.sessionCookies,
      username:
        config.username !== undefined ? config.username : current.username,
      password:
        config.password !== undefined ? config.password : current.password,
      authType:
        config.authType !== undefined ? config.authType : current.authType,
      sncPartnerName:
        config.sncPartnerName !== undefined
          ? config.sncPartnerName
          : current.sncPartnerName,
      sncQop: config.sncQop !== undefined ? config.sncQop : current.sncQop,
      sncLib: config.sncLib !== undefined ? config.sncLib : current.sncLib,
      sncMyName:
        config.sncMyName !== undefined ? config.sncMyName : current.sncMyName,
      sapClient:
        config.sapClient !== undefined ? config.sapClient : current.sapClient,
      language:
        config.language !== undefined ? config.language : current.language,
    };
    // Save directly to Map (internal format)
    this.sessions.set(destination, updated);
    this.log?.info(
      `Connection config updated for ${destination}: serviceUrl(${updated.sapUrl.substring(0, 40)}...), token(${config.authorizationToken?.length || 0} chars${formatToken(config.authorizationToken) ? `, ${formatToken(config.authorizationToken)}` : ''})`,
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
      // Session doesn't exist - try to get serviceUrl from connection config or use defaultServiceUrl
      // For ABAP, we need sapUrl to create session
      const connConfig = await this.getConnectionConfig(destination);
      const sapUrl = connConfig?.serviceUrl || this.defaultServiceUrl;

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
      this.log?.info(
        `New session created for ${destination} via setAuthorizationConfig: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`,
      );
      return;
    }

    this.log?.debug(
      `Updating authorization config for existing session ${destination}: uaaUrl(${config.uaaUrl.substring(0, 30)}...), hasRefreshToken(${!!config.refreshToken})`,
    );
    const updated: AbapSessionData = {
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

/** The declared authType wins; without one it is what the credentials imply. */
function inferAuthType(
  obj: Record<string, unknown>,
): AbapSessionData['authType'] {
  if (obj.authType) return obj.authType as AbapSessionData['authType'];
  if (obj.sessionCookies) return 'saml';
  if (obj.username && obj.password) return 'basic';
  if (obj.sncPartnerName) return 'snc';
  return 'jwt';
}
