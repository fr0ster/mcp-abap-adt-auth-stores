/**
 * Environment file loader - loads .env files by destination name for ABAP
 */


import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { ABAP_AUTHORIZATION_VARS, ABAP_CONNECTION_VARS } from '../../utils/constants';
import type { ILogger } from '@mcp-abap-adt/interfaces';

// Internal type for ABAP environment configuration
interface EnvConfig {
  sapUrl: string;
  sapClient?: string;
  jwtToken?: string; // Optional for basic auth
  username?: string; // For basic auth (on-premise)
  password?: string; // For basic auth (on-premise)
  authType?: 'basic' | 'jwt'; // Authentication type
  refreshToken?: string;
  uaaUrl?: string;
  uaaClientId?: string;
  uaaClientSecret?: string;
  language?: string;
}

/**
 * Load environment configuration from {destination}.env file
 * @param destination Destination name
 * @param directory Directory where the file is located
 * @param log Optional logger for logging operations
 * @returns EnvConfig object or null if file not found
 */
export async function loadEnvFile(destination: string, directory: string, log?: ILogger): Promise<EnvConfig | null> {
  const fileName = `${destination}.env`;
  const envFilePath = path.join(directory, fileName);
  log?.debug(`Reading env file: ${envFilePath}`);

  if (!fs.existsSync(envFilePath)) {
    log?.debug(`Env file not found: ${envFilePath}`);
    return null;
  }

  try {
    // Read and parse .env file
    const envContent = fs.readFileSync(envFilePath, 'utf8');
    log?.debug(`Env file read successfully, size: ${envContent.length} bytes`);
    const parsed = dotenv.parse(envContent);
    log?.debug(`Parsed env variables: ${Object.keys(parsed).join(', ')}`);

    // Extract required fields
    const sapUrl = parsed[ABAP_CONNECTION_VARS.SERVICE_URL];
    const jwtToken = parsed[ABAP_CONNECTION_VARS.AUTHORIZATION_TOKEN];
    const username = parsed[ABAP_CONNECTION_VARS.USERNAME];
    const password = parsed[ABAP_CONNECTION_VARS.PASSWORD];

    log?.debug(`Extracted fields: hasSapUrl(${!!sapUrl}), hasJwtToken(${jwtToken !== undefined && jwtToken !== null}), hasUsername(${!!username}), hasPassword(${!!password})`);

    // sapUrl is always required
    if (!sapUrl) {
      log?.warn(`Env file missing required field: sapUrl`);
      return null;
    }

    // Determine auth type: if username/password present and no jwtToken, use basic auth
    // If jwtToken present, use JWT auth
    // If neither is present, it's OK - auth can be set later (e.g., via setAuthorizationConfig)
    const isBasicAuth = !!(username && password) && (!jwtToken || jwtToken.trim() === '');
    const isJwtAuth = !!(jwtToken && jwtToken.trim() !== '');
    const hasNoAuth = !isBasicAuth && !isJwtAuth;

    const config: EnvConfig = {
      sapUrl: sapUrl.trim(),
    };

    // Set authentication fields based on type
    if (isBasicAuth) {
      config.username = username.trim();
      config.password = password.trim();
      config.authType = 'basic';
    } else if (isJwtAuth) {
      config.jwtToken = jwtToken.trim();
      config.authType = 'jwt';
    } else {
      // No auth yet - will be set later (e.g., via setAuthorizationConfig)
      config.jwtToken = jwtToken || '';
      config.authType = undefined;
    }

    // Optional fields
    if (parsed[ABAP_CONNECTION_VARS.SAP_CLIENT]) {
      config.sapClient = parsed[ABAP_CONNECTION_VARS.SAP_CLIENT].trim();
    }

    if (parsed[ABAP_AUTHORIZATION_VARS.REFRESH_TOKEN]) {
      config.refreshToken = parsed[ABAP_AUTHORIZATION_VARS.REFRESH_TOKEN].trim();
    }

    if (parsed[ABAP_AUTHORIZATION_VARS.UAA_URL]) {
      config.uaaUrl = parsed[ABAP_AUTHORIZATION_VARS.UAA_URL].trim();
    }

    if (parsed[ABAP_AUTHORIZATION_VARS.UAA_CLIENT_ID]) {
      config.uaaClientId = parsed[ABAP_AUTHORIZATION_VARS.UAA_CLIENT_ID].trim();
    }

    if (parsed[ABAP_AUTHORIZATION_VARS.UAA_CLIENT_SECRET]) {
      config.uaaClientSecret = parsed[ABAP_AUTHORIZATION_VARS.UAA_CLIENT_SECRET].trim();
    }

    if (parsed[ABAP_CONNECTION_VARS.SAP_LANGUAGE]) {
      config.language = parsed[ABAP_CONNECTION_VARS.SAP_LANGUAGE].trim();
    }

    const tokenLength = config.jwtToken?.length || 0;
    const authInfo = config.authType === 'basic' 
      ? `basic auth (username: ${config.username})` 
      : `JWT token(${tokenLength} chars)`;
    log?.info(`Env config loaded from ${envFilePath}: sapUrl(${config.sapUrl.substring(0, 50)}...), ${authInfo}, hasRefreshToken(${!!config.refreshToken}), hasUaaUrl(${!!config.uaaUrl})`);
    return config;
  } catch (error) {
    log?.error(`Failed to load env file from ${envFilePath}: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(
      `Failed to load environment file for destination "${destination}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

