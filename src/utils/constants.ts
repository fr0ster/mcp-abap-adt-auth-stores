/**
 * Constants for environment variable names
 * Used by stores to know which variables to read/write from .env files
 */

/**
 * Environment variable names for XSUAA connections - Authorization
 * These are used for obtaining and refreshing tokens (reduced scope)
 */
export const XSUAA_AUTHORIZATION_VARS = {
  /** UAA URL for token refresh */
  UAA_URL: 'XSUAA_UAA_URL',
  /** UAA client ID */
  UAA_CLIENT_ID: 'XSUAA_UAA_CLIENT_ID',
  /** UAA client secret */
  UAA_CLIENT_SECRET: 'XSUAA_UAA_CLIENT_SECRET',
  /** Refresh token for token renewal */
  REFRESH_TOKEN: 'XSUAA_REFRESH_TOKEN',
} as const;

/**
 * Environment variable names for XSUAA connections - Connection
 * These are used for connecting to XSUAA services (reduced scope)
 * Note: SERVICE_URL is undefined for XSUAA (not part of authentication, URL comes from elsewhere)
 */
export const XSUAA_CONNECTION_VARS = {
  /** Authorization token (JWT token for Authorization: Bearer header) */
  AUTHORIZATION_TOKEN: 'XSUAA_JWT_TOKEN',
} as const;

/**
 * Environment variable names for ABAP connections - Authorization
 * These are used for obtaining and refreshing tokens
 */
export const ABAP_AUTHORIZATION_VARS = {
  /** UAA URL for token refresh */
  UAA_URL: 'SAP_UAA_URL',
  /** UAA client ID */
  UAA_CLIENT_ID: 'SAP_UAA_CLIENT_ID',
  /** UAA client secret */
  UAA_CLIENT_SECRET: 'SAP_UAA_CLIENT_SECRET',
  /** Refresh token for token renewal */
  REFRESH_TOKEN: 'SAP_REFRESH_TOKEN',
} as const;

/**
 * Environment variable names for ABAP connections - Connection
 * These are used for connecting to ABAP systems
 */
export const ABAP_CONNECTION_VARS = {
  /** Service URL (SAP system URL) */
  SERVICE_URL: 'SAP_URL',
  /** Authorization token (JWT token) */
  AUTHORIZATION_TOKEN: 'SAP_JWT_TOKEN',
  /** Username for basic authentication (on-premise systems) */
  USERNAME: 'SAP_USERNAME',
  /** Password for basic authentication (on-premise systems) */
  PASSWORD: 'SAP_PASSWORD',
  /** SAP client number (optional) */
  SAP_CLIENT: 'SAP_CLIENT',
  /** Language (optional) */
  SAP_LANGUAGE: 'SAP_LANGUAGE',
} as const;

/**
 * Environment variable names for BTP connections - Authorization
 * These are used for obtaining and refreshing tokens (full scope for ABAP)
 */
export const BTP_AUTHORIZATION_VARS = {
  /** UAA URL for token refresh (from service key) */
  UAA_URL: 'BTP_UAA_URL',
  /** UAA client ID (from service key) */
  UAA_CLIENT_ID: 'BTP_UAA_CLIENT_ID',
  /** UAA client secret (from service key) */
  UAA_CLIENT_SECRET: 'BTP_UAA_CLIENT_SECRET',
  /** Refresh token for token renewal */
  REFRESH_TOKEN: 'BTP_REFRESH_TOKEN',
} as const;

/**
 * Environment variable names for BTP connections - Connection
 * These are used for connecting to ABAP systems via BTP authentication (full scope)
 */
export const BTP_CONNECTION_VARS = {
  /** Service URL (ABAP system URL, required - from service key or YAML) */
  SERVICE_URL: 'BTP_ABAP_URL',
  /** Authorization token (JWT token for Authorization: Bearer header) */
  AUTHORIZATION_TOKEN: 'BTP_JWT_TOKEN',
  /** SAP client number (optional) */
  SAP_CLIENT: 'BTP_SAP_CLIENT',
  /** Language (optional) */
  SAP_LANGUAGE: 'BTP_LANGUAGE',
} as const;

