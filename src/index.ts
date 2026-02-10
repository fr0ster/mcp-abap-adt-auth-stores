/**
 * @mcp-abap-adt/auth-stores
 * Stores for MCP ABAP ADT auth-broker
 *
 * Provides ABAP and XSUAA store implementations
 */

// Error classes
export {
  FileNotFoundError,
  InvalidConfigError,
  ParseError,
  StorageError,
  StoreError,
} from './errors/StoreErrors';
// Loaders
export { loadServiceKey } from './loaders/abap/serviceKeyLoader';
export { loadXSUAAServiceKey } from './loaders/xsuaa/xsuaaServiceKeyLoader';
export { AbapServiceKeyStore } from './stores/abap/AbapServiceKeyStore';
// ABAP stores (with sapUrl)
export {
  AbapSessionStore,
  AbapSessionStore as SamlSessionStore,
} from './stores/abap/AbapSessionStore';
export {
  SafeAbapSessionStore,
  SafeAbapSessionStore as SafeSamlSessionStore,
} from './stores/abap/SafeAbapSessionStore';
// Env file stores (for --env=path scenarios)
export { EnvFileSessionStore } from './stores/env/EnvFileSessionStore';
export {
  SafeXsuaaSessionStore,
  SafeXsuaaSessionStore as SafeBtpSessionStore,
} from './stores/xsuaa/SafeXsuaaSessionStore';
export {
  XsuaaServiceKeyStore,
  XsuaaServiceKeyStore as BtpServiceKeyStore,
} from './stores/xsuaa/XsuaaServiceKeyStore';
// XSUAA stores
// BTP stores - aliases for XSUAA (backward compatibility)
export {
  XsuaaSessionStore,
  XsuaaSessionStore as BtpSessionStore,
} from './stores/xsuaa/XsuaaSessionStore';
export {
  ABAP_AUTHORIZATION_VARS,
  ABAP_CONNECTION_VARS,
  BTP_AUTHORIZATION_VARS,
  BTP_CONNECTION_VARS,
  XSUAA_AUTHORIZATION_VARS,
  XSUAA_CONNECTION_VARS,
} from './utils/constants';
export { EnvFileHandler } from './utils/EnvFileHandler';
export { JsonFileHandler } from './utils/JsonFileHandler';
// Utils
export { findFileInPaths, resolveSearchPaths } from './utils/pathResolver';
