/**
 * Token storage - saves tokens to .env files for ABAP
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ILogger } from '@mcp-abap-adt/interfaces';
import {
  ABAP_AUTHORIZATION_VARS,
  ABAP_CONNECTION_VARS,
} from '../../utils/constants';
import { formatToken } from '../../utils/formatting';

// Internal type for ABAP environment configuration (same as in envLoader.ts)
interface EnvConfig {
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
 * Save token to {destination}.env file
 * @param destination Destination name
 * @param savePath Path where to save the file
 * @param config Configuration to save
 * @param log Optional logger for logging operations
 */
export async function saveTokenToEnv(
  destination: string,
  savePath: string,
  config: Partial<EnvConfig> & { sapUrl: string; jwtToken?: string },
  log?: ILogger,
): Promise<void> {
  const envFilePath = path.join(savePath, `${destination}.env`);
  const tempFilePath = `${envFilePath}.tmp`;
  log?.debug(`Saving token to env file: ${envFilePath}`);
  const tokenLength = config.jwtToken?.length || 0;
  const hasBasicAuth = !!(config.username && config.password);
  const hasSamlCookies = !!config.sessionCookies;
  const formattedToken = formatToken(config.jwtToken);
  const formattedRefreshToken = formatToken(config.refreshToken);
  log?.debug(
    `Config to save: hasSapUrl(${!!config.sapUrl}), token(${tokenLength} chars${formattedToken ? `, ${formattedToken}` : ''}), hasBasicAuth(${hasBasicAuth}), hasSamlCookies(${hasSamlCookies}), refreshToken(${formattedRefreshToken || 'none'}), hasUaaUrl(${!!config.uaaUrl})`,
  );

  // Ensure directory exists
  if (!fs.existsSync(savePath)) {
    log?.debug(`Creating directory: ${savePath}`);
    fs.mkdirSync(savePath, { recursive: true });
  }

  // Read existing .env file if it exists
  let existingContent = '';
  if (fs.existsSync(envFilePath)) {
    existingContent = fs.readFileSync(envFilePath, 'utf8');
    log?.debug(
      `Reading existing env file, size: ${existingContent.length} bytes`,
    );
  } else {
    log?.debug(`Env file does not exist, creating new one`);
  }

  // Parse existing content to preserve other values
  const lines = existingContent.split('\n');
  const existingVars = new Map<string, string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (match) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/^["']|["']$/g, ''); // Remove quotes
      existingVars.set(key, value);
    }
  }

  log?.debug(`Preserved ${existingVars.size} existing variables from env file`);

  // Update with new values
  // sapUrl is required - always save it
  existingVars.set(ABAP_CONNECTION_VARS.SERVICE_URL, config.sapUrl);

  // Handle authentication: SAML cookies, JWT, or basic auth
  if (config.sessionCookies) {
    const cookiesB64 = Buffer.from(config.sessionCookies, 'utf8').toString(
      'base64',
    );
    existingVars.set(ABAP_CONNECTION_VARS.SESSION_COOKIES_B64, cookiesB64);
    existingVars.set(ABAP_CONNECTION_VARS.AUTHORIZATION_TOKEN, '');
    existingVars.delete(ABAP_CONNECTION_VARS.USERNAME);
    existingVars.delete(ABAP_CONNECTION_VARS.PASSWORD);
  } else if (config.username && config.password) {
    // Basic auth - save username/password
    existingVars.set(ABAP_CONNECTION_VARS.USERNAME, config.username);
    existingVars.set(ABAP_CONNECTION_VARS.PASSWORD, config.password);
    // Clear JWT token if basic auth is used
    if (config.jwtToken) {
      existingVars.set(ABAP_CONNECTION_VARS.AUTHORIZATION_TOKEN, '');
    }
    existingVars.delete(ABAP_CONNECTION_VARS.SESSION_COOKIES_B64);
  } else if (config.jwtToken) {
    // JWT auth - save token
    existingVars.set(ABAP_CONNECTION_VARS.AUTHORIZATION_TOKEN, config.jwtToken);
    // Clear username/password if JWT auth is used
    existingVars.delete(ABAP_CONNECTION_VARS.USERNAME);
    existingVars.delete(ABAP_CONNECTION_VARS.PASSWORD);
    existingVars.delete(ABAP_CONNECTION_VARS.SESSION_COOKIES_B64);
  }

  if (config.sapClient) {
    existingVars.set(ABAP_CONNECTION_VARS.SAP_CLIENT, config.sapClient);
  }

  if (config.language) {
    existingVars.set(ABAP_CONNECTION_VARS.SAP_LANGUAGE, config.language);
  }

  if (config.refreshToken) {
    existingVars.set(
      ABAP_AUTHORIZATION_VARS.REFRESH_TOKEN,
      config.refreshToken,
    );
  }

  if (config.uaaUrl) {
    existingVars.set(ABAP_AUTHORIZATION_VARS.UAA_URL, config.uaaUrl);
  }

  if (config.uaaClientId) {
    existingVars.set(ABAP_AUTHORIZATION_VARS.UAA_CLIENT_ID, config.uaaClientId);
  }

  if (config.uaaClientSecret) {
    existingVars.set(
      ABAP_AUTHORIZATION_VARS.UAA_CLIENT_SECRET,
      config.uaaClientSecret,
    );
  }

  // Write to temporary file first (atomic write)
  const envLines: string[] = [];
  for (const [key, value] of existingVars.entries()) {
    // Escape value if it contains spaces or special characters
    const escapedValue =
      value.includes(' ') || value.includes('=') || value.includes('#')
        ? `"${value.replace(/"/g, '\\"')}"`
        : value;
    envLines.push(`${key}=${escapedValue}`);
  }

  const envContent = `${envLines.join('\n')}\n`;

  log?.debug(
    `Writing ${envLines.length} variables to env file: ${Object.keys(config).join(', ')}`,
  );

  // Write to temp file
  fs.writeFileSync(tempFilePath, envContent, 'utf8');

  // Atomic rename
  fs.renameSync(tempFilePath, envFilePath);
  const authInfo = hasBasicAuth
    ? `basic auth (username: ${config.username})`
    : `JWT token(${tokenLength} chars${formattedToken ? `, ${formattedToken}` : ''})`;
  log?.info(
    `Token saved to ${envFilePath}: ${authInfo}, sapUrl(${config.sapUrl ? `${config.sapUrl.substring(0, 50)}...` : 'none'}), variables(${envLines.length})`,
  );
}
