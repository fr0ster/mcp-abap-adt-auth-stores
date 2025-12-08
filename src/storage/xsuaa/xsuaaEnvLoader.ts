/**
 * XSUAA Environment file loader - loads .env files with XSUAA_* variables for XSUAA
 */

import type { ILogger } from '@mcp-abap-adt/interfaces';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { XSUAA_AUTHORIZATION_VARS, XSUAA_CONNECTION_VARS } from '../../utils/constants';

// Internal type for XSUAA session storage
interface XsuaaSessionConfig {
  mcpUrl?: string;
  jwtToken: string;
  refreshToken?: string;
  uaaUrl?: string;
  uaaClientId?: string;
  uaaClientSecret?: string;
}

/**
 * Load XSUAA environment configuration from {destination}.env file
 * Reads XSUAA_* variables instead of SAP_* variables
 * @param destination Destination name
 * @param directory Directory where the file is located
 * @param log Optional logger for logging operations
 * @returns XsuaaSessionConfig object or null if file not found
 */
export async function loadXsuaaEnvFile(destination: string, directory: string, log?: ILogger): Promise<XsuaaSessionConfig | null> {
  const fileName = `${destination}.env`;
  const envFilePath = path.join(directory, fileName);
  log?.debug(`Reading XSUAA env file: ${envFilePath}`);

  if (!fs.existsSync(envFilePath)) {
    log?.debug(`XSUAA env file not found: ${envFilePath}`);
    return null;
  }

  try {
    // Read and parse .env file
    const envContent = fs.readFileSync(envFilePath, 'utf8');
    log?.debug(`XSUAA env file read successfully, size: ${envContent.length} bytes`);
    const parsed = dotenv.parse(envContent);
    log?.debug(`Parsed XSUAA env variables: ${Object.keys(parsed).filter(k => k.startsWith('XSUAA_')).join(', ')}`);

    // Extract required fields (XSUAA_* variables)
    const jwtToken = parsed[XSUAA_CONNECTION_VARS.AUTHORIZATION_TOKEN];

    log?.debug(`Extracted fields: hasJwtToken(${jwtToken !== undefined && jwtToken !== null})`);

    // Allow empty string for jwtToken (can be set later via setConnectionConfig)
    // Only reject if jwtToken is undefined or null
    if (jwtToken === undefined || jwtToken === null) {
      log?.warn(`XSUAA env file missing required field: jwtToken`);
      return null;
    }

    const config: XsuaaSessionConfig = {
      jwtToken: jwtToken.trim(),
    };

    // mcpUrl can be loaded from .env file as additional variable (not part of CONNECTION_VARS, but can be stored)
    // URL comes from elsewhere (YAML config, parameter, or request header), but can be stored in .env
    if (parsed['XSUAA_MCP_URL']) {
      config.mcpUrl = parsed['XSUAA_MCP_URL'].trim();
    }

    if (parsed[XSUAA_AUTHORIZATION_VARS.REFRESH_TOKEN]) {
      config.refreshToken = parsed[XSUAA_AUTHORIZATION_VARS.REFRESH_TOKEN].trim();
    }

    if (parsed[XSUAA_AUTHORIZATION_VARS.UAA_URL]) {
      config.uaaUrl = parsed[XSUAA_AUTHORIZATION_VARS.UAA_URL].trim();
    }

    if (parsed[XSUAA_AUTHORIZATION_VARS.UAA_CLIENT_ID]) {
      config.uaaClientId = parsed[XSUAA_AUTHORIZATION_VARS.UAA_CLIENT_ID].trim();
    }

    if (parsed[XSUAA_AUTHORIZATION_VARS.UAA_CLIENT_SECRET]) {
      config.uaaClientSecret = parsed[XSUAA_AUTHORIZATION_VARS.UAA_CLIENT_SECRET].trim();
    }

    log?.info(`XSUAA env config loaded from ${envFilePath}: token(${config.jwtToken.length} chars), hasRefreshToken(${!!config.refreshToken}), hasUaaUrl(${!!config.uaaUrl}), mcpUrl(${config.mcpUrl ? config.mcpUrl.substring(0, 50) + '...' : 'none'})`);
    return config;
  } catch (error) {
    log?.error(`Failed to load XSUAA env file from ${envFilePath}: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(
      `Failed to load XSUAA environment file for destination "${destination}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

