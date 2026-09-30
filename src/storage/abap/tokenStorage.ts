/**
 * Token storage - saves tokens to .env files for ABAP
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';
import {
  ABAP_AUTHORIZATION_VARS,
  ABAP_CONNECTION_VARS,
} from '../../utils/constants';
import { formatToken } from '../../utils/formatting';
import {
  type AbapAuthType,
  credentialOf,
  inferAuthType,
  MODE_FIELDS,
} from './abapCredential';

/** The env keys of each type's credential, in MODE_FIELDS order. */
const CREDENTIAL_KEYS: Record<AbapAuthType, readonly string[]> = {
  jwt: [ABAP_CONNECTION_VARS.AUTHORIZATION_TOKEN],
  basic: [ABAP_CONNECTION_VARS.USERNAME, ABAP_CONNECTION_VARS.PASSWORD],
  saml: [ABAP_CONNECTION_VARS.SESSION_COOKIES_B64],
  snc: [
    ABAP_CONNECTION_VARS.SNC_PARTNER_NAME,
    ABAP_CONNECTION_VARS.SNC_QOP,
    ABAP_CONNECTION_VARS.SNC_LIB,
    ABAP_CONNECTION_VARS.SNC_MY_NAME,
  ],
};

// Internal type for ABAP environment configuration (same as in envLoader.ts)
interface EnvConfig {
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

  // The credential: the declared type, or the one the credential implies
  // (inferAuthType — SNC is never inferred). A write of one type clears the
  // other types' keys and records the type in SAP_AUTH_TYPE. A write with no
  // type and no credential (a refresh token, a client) leaves the credential
  // keys and SAP_AUTH_TYPE as they are.
  const authType = inferAuthType(config);
  if (authType) {
    const credential = credentialOf(config, authType);
    for (const mode of Object.keys(CREDENTIAL_KEYS) as AbapAuthType[]) {
      const keys = CREDENTIAL_KEYS[mode];
      if (mode === authType) {
        // A write is the whole credential of its type: what is not given goes
        MODE_FIELDS[mode].forEach((field, i) => {
          const value = credential[field];
          if (value) {
            existingVars.set(
              keys[i],
              mode === 'saml'
                ? Buffer.from(value, 'utf8').toString('base64')
                : value,
            );
          } else {
            existingVars.delete(keys[i]);
          }
        });
      } else {
        for (const key of keys) existingVars.delete(key);
      }
    }
    // An empty SAP_JWT_TOKEN is what 1.x wrote beside a credential that is not
    // a token; a 1.x reader then does not take a stale token for the session.
    if (!credential.jwtToken) {
      existingVars.set(ABAP_CONNECTION_VARS.AUTHORIZATION_TOKEN, '');
    }
    existingVars.set(ABAP_CONNECTION_VARS.AUTH_TYPE, authType);
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
  const authInfo =
    authType === 'basic'
      ? `basic auth (username: ${config.username})`
      : authType === 'snc'
        ? 'SNC'
        : authType === 'saml'
          ? 'SAML session cookies'
          : authType === 'jwt'
            ? `JWT token(${tokenLength} chars${formattedToken ? `, ${formattedToken}` : ''})`
            : 'credential unchanged';
  log?.info(
    `Token saved to ${envFilePath}: ${authInfo}, sapUrl(${config.sapUrl ? `${config.sapUrl.substring(0, 50)}...` : 'none'}), variables(${envLines.length})`,
  );
}
