# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.9] - 2025-12-22

### Changed
- **Migrated to Biome**: Replaced ESLint/Prettier with Biome for linting and formatting
  - Added `@biomejs/biome` as dev dependency (^2.3.10)
  - Added `biome.json` configuration file with recommended rules
  - Added npm scripts: `lint`, `lint:check`, `format`
  - Updated `build` script to include Biome check before TypeScript compilation
  - All code now follows Biome formatting and linting rules
  - Updated Node.js imports to use `node:` protocol (fs, path, os)

### Fixed
- **Type Safety Improvements**: Replaced `any` types with `unknown` for better type safety
  - Parser methods (`canParse`, `parse`): Changed parameter types from `any` to `unknown` with proper type guards
  - `AbapSessionStore`: Replaced `as any` casts with proper type intersections (`IConfig & Record<string, unknown>`)
  - All parsers now use proper type guards to safely access object properties
- **Code Quality**: Improved code organization
  - Organized imports automatically
  - Fixed code formatting issues
  - Improved type safety in session store operations

## [0.2.8] - 2025-12-21

### Added
- **EnvFileSessionStore**: File persistence for JWT tokens
  - `save()` method writes `SAP_JWT_TOKEN` and `SAP_REFRESH_TOKEN` back to the .env file
  - `setToken()`, `setRefreshToken()`, `setConnectionConfig()`, `setAuthorizationConfig()`, `saveSession()` now automatically persist JWT changes to file
  - Enables token refresh flow to update the .env file with new tokens

### Changed
- **EnvFileSessionStore**: No longer "read-only" for JWT auth
  - Basic auth credentials remain read-only (not written back)
  - JWT tokens are persisted on update

## [0.2.7] - 2025-12-21

### Fixed
- **EnvFileSessionStore**: Fixed JWT token refresh flow
  - `getAuthorizationConfig()` now returns `refreshToken` for token refresh
  - `setAuthorizationConfig()` now persists `refreshToken` in memory for subsequent refresh cycles

### Changed
- **Removed duplicate BTP stores**: Removed `src/stores/btp/` folder (was duplicate of xsuaa)
  - `BtpSessionStore`, `SafeBtpSessionStore`, `BtpServiceKeyStore` are now aliases to XSUAA equivalents
  - Existing code using Btp* classes will continue to work (backward compatible)

## [0.2.6] - 2025-12-21

### Added
- **EnvFileSessionStore**: New session store that reads from a specific `.env` file path
  - Use case: `mcp-abap-adt --env /path/to/.env` CLI option
  - Supports both basic auth (SAP_USERNAME/SAP_PASSWORD) and JWT auth (SAP_JWT_TOKEN)
  - `getAuthType()` method to determine auth type from the file
  - Read-only for file content; token updates stored in memory only
  - Automatic detection of auth type based on file content

## [0.2.5] - 2025-12-19

### Fixed
- **Version Correction**: This release corrects the version numbering issue. The typed error classes and service key store updates that were documented in 0.2.4 were released after 0.2.4 was already published. This version properly documents those changes.

## [0.2.4] - 2025-12-19

### Added
- **Typed Error Classes**: Added typed error classes for better error handling in auth-broker
  - `StoreError` - Base error class with error code
  - `FileNotFoundError` - File not found errors (includes filePath)
  - `ParseError` - JSON/YAML parsing errors (includes filePath and cause)
  - `InvalidConfigError` - Missing required config fields (includes missingFields array)
  - `StorageError` - File write/permission errors (includes operation and cause)

### Changed
- **Service Key Stores**: Now throw typed errors instead of generic Error
  - `FileNotFoundError` when service key file not found (returns null)
  - `ParseError` when JSON parsing fails or format is invalid
  - `InvalidConfigError` when required UAA fields are missing (returns null)
- **Dependency**: Updated `@mcp-abap-adt/interfaces` to `^0.2.3` for STORE_ERROR_CODES

## [0.2.3] - 2025-12-16

### Changed
- Dependency bump: `@mcp-abap-adt/interfaces` to `^0.1.17` for basic auth support

### Added
- **Basic Authentication Support for On-Premise Systems**: Added support for basic auth (username/password) in addition to JWT tokens
  - **envLoader.ts**: Now loads `SAP_USERNAME` and `SAP_PASSWORD` from `.env` files
    - Automatically detects auth type: if username/password present and no JWT token, uses basic auth
    - If JWT token present, uses JWT auth
  - **AbapSessionStore.getConnectionConfig()**: Returns basic auth config when username/password are present
    - Returns `IConnectionConfig` with `username`, `password`, and `authType: 'basic'` for on-premise systems
    - Returns `IConnectionConfig` with `authorizationToken` and `authType: 'jwt'` for cloud systems
  - **tokenStorage.ts**: Now saves `SAP_USERNAME` and `SAP_PASSWORD` to `.env` files
    - Handles both JWT and basic auth configurations
    - Clears username/password when JWT auth is used, and vice versa
  - **constants.ts**: Added `USERNAME: 'SAP_USERNAME'` and `PASSWORD: 'SAP_PASSWORD'` to `ABAP_CONNECTION_VARS`
  - This enables on-premise systems to use `--mcp` parameter with basic auth instead of requiring JWT tokens

## [0.2.2] - 2025-12-13

### Changed
- Dependency bump: `@mcp-abap-adt/interfaces` to `^0.1.16` for alignment with latest interfaces docs

## [0.2.1] - 2025-12-12

### Changed

- **Import Organization**: Reorganized imports across storage modules for consistency
  - Moved `ILogger` type import after standard library imports (`fs`, `path`, `dotenv`)
  - Affected files: `envLoader.ts`, `tokenStorage.ts`, `xsuaaEnvLoader.ts`, `xsuaaTokenStorage.ts`

### Fixed

- **testLogger.ts**: Removed unused `ILogger` import

## [0.2.0] - 2025-12-08

### Breaking Changes

- **XsuaaSessionStore Constructor**: `defaultServiceUrl` is now a **required** parameter (second parameter)
  - **Before**: `new XsuaaSessionStore(directory, log?, defaultServiceUrl?)`
  - **After**: `new XsuaaSessionStore(directory, defaultServiceUrl, log?)`
  - **Reason**: `serviceUrl` cannot be obtained from XSUAA service keys, so it must be provided via constructor
  - **Migration**: Update all `XsuaaSessionStore` instantiations to provide `defaultServiceUrl` as second parameter

- **SafeXsuaaSessionStore Constructor**: `defaultServiceUrl` is now a **required** parameter (first parameter)
  - **Before**: `new SafeXsuaaSessionStore(log?, defaultServiceUrl?)`
  - **After**: `new SafeXsuaaSessionStore(defaultServiceUrl, log?)`
  - **Migration**: Update all `SafeXsuaaSessionStore` instantiations to provide `defaultServiceUrl` as first parameter

- **BtpSessionStore Constructor**: `defaultServiceUrl` is now a **required** parameter (second parameter)
  - **Before**: `new BtpSessionStore(directory, log?, defaultServiceUrl?)`
  - **After**: `new BtpSessionStore(directory, defaultServiceUrl, log?)`
  - **Reason**: `serviceUrl` cannot be obtained from BTP service keys, so it must be provided via constructor
  - **Migration**: Update all `BtpSessionStore` instantiations to provide `defaultServiceUrl` as second parameter

- **SafeBtpSessionStore Constructor**: `defaultServiceUrl` is now a **required** parameter (first parameter)
  - **Before**: `new SafeBtpSessionStore(log?, defaultServiceUrl?)`
  - **After**: `new SafeBtpSessionStore(defaultServiceUrl, log?)`
  - **Migration**: Update all `SafeBtpSessionStore` instantiations to provide `defaultServiceUrl` as first parameter

### Changed

- **AbapSessionStore Constructor**: `defaultServiceUrl` remains **optional** (third parameter)
  - **Reason**: `serviceUrl` can be obtained from ABAP service keys, so it's optional
  - **Signature**: `new AbapSessionStore(directory, log?, defaultServiceUrl?)`
  - No migration needed for `AbapSessionStore`

- **SafeAbapSessionStore Constructor**: `defaultServiceUrl` remains **optional** (second parameter)
  - **Signature**: `new SafeAbapSessionStore(log?, defaultServiceUrl?)`
  - No migration needed for `SafeAbapSessionStore`

- **Session Creation Logic**: Updated to use `defaultServiceUrl` when creating new sessions
  - When `setConnectionConfig` or `setAuthorizationConfig` creates a new session, `defaultServiceUrl` is used if `config.serviceUrl` is not provided
  - For XSUAA/BTP stores: `defaultServiceUrl` is always used (required parameter)
  - For ABAP stores: `defaultServiceUrl` is used only if provided and `config.serviceUrl` is not provided

- **Session Update Logic**: Fixed to not use `defaultServiceUrl` when updating existing sessions
  - When updating an existing session, only `config.serviceUrl` is used if explicitly provided
  - `defaultServiceUrl` is never used to modify `mcpUrl`/`serviceUrl` during updates

### Added

- **Comprehensive Logging**: Added detailed logging throughout all session stores using `ILogger` with optional chaining
  - All critical operations now log via `logger?.info()`, `logger?.debug()`, `logger?.warn()`, `logger?.error()`
  - Logging covers: session creation, updates, deletions, loading, validation errors, file operations
  - Logging provides critical information for analysis: serviceUrl, token lengths, UAA parameters, operation results
  - Logging is optional - stores work without logger (no-op when logger is not provided)

### Fixed

- **loadEnvFile**: Fixed validation to allow empty string for `jwtToken`
  - **Before**: Rejected empty string `''` as invalid (treated as falsy)
  - **After**: Only rejects `undefined` or `null` - empty string is valid
  - **Reason**: Sessions created via `setAuthorizationConfig` may have empty `jwtToken` initially (set later via `setConnectionConfig`)
  - This fix allows loading sessions with empty tokens, which is valid for authorization-only sessions

### Migration Guide

#### XsuaaSessionStore and SafeXsuaaSessionStore

**Before:**
```typescript
const store = new XsuaaSessionStore('/path/to/sessions', logger, 'https://default.mcp.com');
const safeStore = new SafeXsuaaSessionStore(logger, 'https://default.mcp.com');
```

**After:**
```typescript
const store = new XsuaaSessionStore('/path/to/sessions', 'https://default.mcp.com', logger);
const safeStore = new SafeXsuaaSessionStore('https://default.mcp.com', logger);
```

#### BtpSessionStore and SafeBtpSessionStore

**Before:**
```typescript
const store = new BtpSessionStore('/path/to/sessions', logger, 'https://default.mcp.com');
const safeStore = new SafeBtpSessionStore(logger, 'https://default.mcp.com');
```

**After:**
```typescript
const store = new BtpSessionStore('/path/to/sessions', 'https://default.mcp.com', logger);
const safeStore = new SafeBtpSessionStore('https://default.mcp.com', logger);
```

#### AbapSessionStore and SafeAbapSessionStore

No changes needed - `defaultServiceUrl` remains optional:
```typescript
const store = new AbapSessionStore('/path/to/sessions', logger, 'https://default.sap.com'); // Optional
const safeStore = new SafeAbapSessionStore(logger, 'https://default.sap.com'); // Optional
```

## [0.1.7] - 2025-12-08

### Added
- **Broker Usage Tests**: Added comprehensive test suites for broker usage scenarios
  - Tests verify stores work correctly when used as in `AuthBroker` (without `saveSession`)
  - Tests cover `setConnectionConfig` and `setAuthorizationConfig` on empty stores
  - Tests verify session creation and updates in broker flow scenarios
  - Test files: `*SessionStore.broker.test.ts` for all store types

### Changed
- **Session Store Initialization**: File-based session stores now automatically create directory in constructor
  - `AbapSessionStore`, `BtpSessionStore`, `XsuaaSessionStore` create directory if it doesn't exist
  - Stores are ready to use immediately after construction
  - Directory creation is logged at debug level
- **Session Creation Logic**: Session stores now automatically create sessions when calling `setConnectionConfig` or `setAuthorizationConfig`
  - No need to call `saveSession` first - stores handle session creation internally
  - `setConnectionConfig` creates new session if none exists (requires `serviceUrl` for ABAP)
  - `setAuthorizationConfig` creates new session if none exists (for BTP/XSUAA, `mcpUrl` is optional)
  - For ABAP: `setAuthorizationConfig` requires existing `serviceUrl` (from `setConnectionConfig` or throws error)
  - This matches how `AuthBroker` uses stores - stores are now fully ready after construction
- **Token Validation**: Updated validation to allow empty string for `jwtToken` in BTP/XSUAA stores
  - Empty token is allowed (can be set later via `setConnectionConfig`)
  - Only `undefined` or `null` tokens are rejected
  - This enables creating sessions with authorization config first, then adding connection config

### Fixed
- **getConnectionConfig**: Fixed to allow empty string tokens (not just non-empty strings)
  - Returns `null` only if token is `undefined` or `null`
  - Empty string tokens are valid (can be set later)
- **setConnectionConfig Updates**: Fixed to preserve existing token when updating connection config
  - Only updates `jwtToken` if `authorizationToken` is provided in config
  - Preserves existing token if `authorizationToken` is `undefined`
- **Safe Session Stores**: Fixed session creation in `setConnectionConfig` and `setAuthorizationConfig`
  - Now saves directly to Map (internal format) instead of calling `saveSession` with wrong format
  - This fixes issues where `mcpUrl`/`serviceUrl` was not being saved correctly
- **loadXsuaaEnvFile**: Fixed to allow empty string for `jwtToken` (can be set later)
  - Only rejects `undefined` or `null` tokens
  - Empty string tokens are valid and can be set later via `setConnectionConfig`
- **testLogger**: Fixed to not output by default in test environment
  - Now requires explicit enable via `DEBUG_AUTH_STORES=true` or `DEBUG=true`
  - No longer enables logging automatically when `NODE_ENV === 'test'`

## [0.1.6] - 2025-12-08

### Added
- **Comprehensive Logging System**: Added optional logging support throughout the package
  - All stores, parsers, and storage functions now accept optional `ILogger` parameter
  - Logging shows detailed information: file paths, file sizes, parsed data structure, operation results
  - Logging works by default in test environment (`NODE_ENV === 'test'`)
  - Controlled via environment variables: `DEBUG_AUTH_STORES`, `LOG_LEVEL`
- **Test Logger Helper**: Added `createTestLogger` helper for tests
  - Respects `DEBUG_AUTH_STORES`, `DEBUG`, and `LOG_LEVEL` environment variables
  - Formats messages and meta into single-line output
  - Shows stack traces for debug and error levels
- **Logging in Parsers**: Added logging to `AbapServiceKeyParser` and `XsuaaServiceKeyParser`
  - Logs parsing operations, validation checks, and results
  - Shows structure of parsed data (keys, fields, validation results)
- **Logging in Storage**: Added logging to all storage functions
  - `loadEnvFile`, `saveTokenToEnv` (ABAP)
  - `loadXsuaaEnvFile`, `saveXsuaaTokenToEnv` (XSUAA)
  - Logs file operations: reading, writing, file sizes, preserved variables

### Changed
- **Store Constructors**: All stores now accept optional `log?: ILogger` parameter
  - `AbapServiceKeyStore`, `BtpServiceKeyStore`, `XsuaaServiceKeyStore`
  - `AbapSessionStore`, `BtpSessionStore`, `XsuaaSessionStore`
  - `SafeAbapSessionStore`, `SafeBtpSessionStore`, `SafeXsuaaSessionStore`
- **Parser Constructors**: Parsers now accept optional `log?: ILogger` parameter
  - `AbapServiceKeyParser`, `XsuaaServiceKeyParser`
- **Storage Functions**: Storage functions now accept optional `log?: ILogger` parameter
  - All storage functions pass logger through to enable detailed logging
- **Logging Format**: All log messages are concise, single-line strings with embedded key data
  - Example: `Reading service key file: /path/to/file.json`
  - Example: `File read successfully, size: 121 bytes, keys: uaa`
  - Example: `Session saved: token(2263 chars), hasRefreshToken(true), sapUrl(https://...)`

## [0.1.5] - 2025-12-07

### Changed
- **Dependency Updates**: Updated dependencies to latest versions
  - `@mcp-abap-adt/interfaces`: `^0.1.0` → `^0.1.3` (includes new header constants and session ID header constants)

## [0.1.4] - 2025-12-05

### Added
- **npm Configuration**: Added `.npmrc` file with `prefer-online=true` to ensure packages are installed from npmjs.com registry instead of local file system dependencies

## [0.1.3] - 2025-12-04

### Added
- **Interfaces Package Integration**: Migrated to use `@mcp-abap-adt/interfaces` package for all interface definitions
  - All interfaces now imported from shared package
  - Dependency on `@mcp-abap-adt/interfaces@^0.1.0` added
  - Removed dependency on `@mcp-abap-adt/auth-broker` (interfaces now come from shared package)

### Changed
- **Interface Imports**: All store implementations now import interfaces from `@mcp-abap-adt/interfaces` instead of `@mcp-abap-adt/auth-broker`
  - `IServiceKeyStore`, `ISessionStore`, `IAuthorizationConfig`, `IConnectionConfig`, `IConfig` now imported from shared package
  - Backward compatibility maintained - interfaces remain the same, only import source changed

### Documentation
- **Responsibilities and Design Principles**: Added comprehensive documentation section explaining package responsibilities and design principles

## [0.1.2] - 2025-12-04

### Changed
- **Architecture Refactoring** - Simplified store architecture
  - Removed abstract base classes (`AbstractServiceKeyStore`, `AbstractEnvSessionStore`, `AbstractSafeSessionStore`)
  - Stores now accept a single directory path instead of search paths array
  - Created `JsonFileHandler` and `EnvFileHandler` utility classes for file operations
  - All stores implement interfaces directly without inheritance

### Added
- **File Handlers**:
  - `JsonFileHandler` - Utility class for reading/writing JSON files
  - `EnvFileHandler` - Utility class for reading/writing `.env` files
- **Integration Tests**:
  - Integration tests for all stores using real files from `test-config.yaml`
  - Test configuration helpers (`configHelpers.ts`) matching auth-providers format
  - YAML-based test configuration (`tests/test-config.yaml.template`)

### Fixed
- **XSUAA Service Key Parser** - Fixed UAA URL extraction for OAuth2 authorization
  - Now uses `url` field (not `apiurl`) for authorization endpoint
  - `apiurl` is for API calls, but OAuth2 authorization requires base `url`
  - This fixes browser authentication for BTP/ABAP connections using XSUAA service keys

## [0.1.1] - 2025-12-04

### Changed
- **Architecture Refactoring** - Simplified store architecture
  - Removed abstract base classes (`AbstractServiceKeyStore`, `AbstractEnvSessionStore`, `AbstractSafeSessionStore`)
  - Stores now accept a single directory path instead of search paths array
  - Created `JsonFileHandler` and `EnvFileHandler` utility classes for file operations
  - All stores implement interfaces directly without inheritance

### Added
- **File Handlers**:
  - `JsonFileHandler` - Utility class for reading/writing JSON files
  - `EnvFileHandler` - Utility class for reading/writing `.env` files
- **Integration Tests**:
  - Integration tests for all stores using real files from `test-config.yaml`
  - Test configuration helpers (`configHelpers.ts`) matching auth-providers format
  - YAML-based test configuration (`tests/test-config.yaml.template`)

### Fixed
- **XSUAA Service Key Parser** - Fixed UAA URL extraction for OAuth2 authorization
  - Now uses `url` field (not `apiurl`) for authorization endpoint
  - `apiurl` is for API calls, but OAuth2 authorization requires base `url`
  - This fixes browser authentication for BTP/ABAP connections using XSUAA service keys

## [0.1.0] - 2025-12-04

### Added
- Initial release of unified stores package
- **BTP Stores**:
  - `BtpServiceKeyStore` - Reads XSUAA service keys for base BTP connections
  - `BtpSessionStore` - File-based store for base BTP sessions (uses `XSUAA_*` env vars)
  - `SafeBtpSessionStore` - In-memory store for base BTP sessions
- **ABAP Stores**:
  - `AbapServiceKeyStore` - Reads ABAP service keys with nested `uaa` object
  - `AbapSessionStore` - File-based store for ABAP sessions (uses `SAP_*` env vars)
  - `SafeAbapSessionStore` - In-memory store for ABAP sessions
- **XSUAA Stores**:
  - `XsuaaServiceKeyStore` - Reads XSUAA service keys (direct format)
  - `XsuaaSessionStore` - File-based store for XSUAA sessions (uses `XSUAA_*` env vars)
  - `SafeXsuaaSessionStore` - In-memory store for XSUAA sessions
- **Abstract Base Classes**:
  - `AbstractServiceKeyStore` - Base class for service key stores with file I/O
  - `AbstractEnvSessionStore` - Base class for file-based session stores (works with .env files)
  - `AbstractSafeSessionStore` - Base class for in-memory session stores
- **Utilities**:
  - `pathResolver` - Resolve search paths and find files in multiple directories
  - `constants` - Environment variable name constants for ABAP, BTP, and XSUAA
  - Service key loaders for ABAP and XSUAA formats
- **Testing**:
  - Unit tests for parsers (AbapServiceKeyParser, XsuaaServiceKeyParser)
  - Unit tests for service key stores with mocked file system
  - Jest configuration with TypeScript support

### Changed
- Merged `@mcp-abap-adt/auth-stores-btp` and `@mcp-abap-adt/auth-stores-xsuaa` into single unified package
- Eliminated code duplication in abstract classes and utility functions
- Unified constants for all store types (ABAP, BTP, XSUAA)
- Consistent API across all store implementations

### Dependencies
- `@mcp-abap-adt/auth-broker` ^0.1.6 - Interface definitions (`IServiceKeyStore`, `ISessionStore`, `IAuthorizationConfig`, `IConnectionConfig`, `IConfig`)
- `dotenv` ^17.2.1 - Environment variable parsing for `.env` files
