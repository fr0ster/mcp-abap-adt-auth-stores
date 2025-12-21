/**
 * @mcp-abap-adt/auth-stores
 * Stores for MCP ABAP ADT auth-broker
 * 
 * Provides BTP, ABAP, and XSUAA store implementations
 */

// BTP stores (base BTP without sapUrl)
export { BtpSessionStore } from './stores/btp/BtpSessionStore';
export { SafeBtpSessionStore } from './stores/btp/SafeBtpSessionStore';
export { BtpServiceKeyStore } from './stores/btp/BtpServiceKeyStore';

// ABAP stores (with sapUrl, extends base BTP)
export { AbapSessionStore } from './stores/abap/AbapSessionStore';
export { SafeAbapSessionStore } from './stores/abap/SafeAbapSessionStore';
export { AbapServiceKeyStore } from './stores/abap/AbapServiceKeyStore';

// XSUAA stores
export { XsuaaSessionStore } from './stores/xsuaa/XsuaaSessionStore';
export { SafeXsuaaSessionStore } from './stores/xsuaa/SafeXsuaaSessionStore';
export { XsuaaServiceKeyStore } from './stores/xsuaa/XsuaaServiceKeyStore';

// Env file stores (for --env=path scenarios)
export { EnvFileSessionStore } from './stores/env/EnvFileSessionStore';

// Error classes
export { 
  StoreError, 
  FileNotFoundError, 
  ParseError, 
  InvalidConfigError, 
  StorageError 
} from './errors/StoreErrors';

// Utils
export { resolveSearchPaths, findFileInPaths } from './utils/pathResolver';
export { JsonFileHandler } from './utils/JsonFileHandler';
export { EnvFileHandler } from './utils/EnvFileHandler';
export { 
  ABAP_AUTHORIZATION_VARS, 
  ABAP_CONNECTION_VARS,
  BTP_AUTHORIZATION_VARS,
  BTP_CONNECTION_VARS,
  XSUAA_AUTHORIZATION_VARS,
  XSUAA_CONNECTION_VARS
} from './utils/constants';

// Loaders
export { loadServiceKey } from './loaders/abap/serviceKeyLoader';
export { loadXSUAAServiceKey } from './loaders/xsuaa/xsuaaServiceKeyLoader';

