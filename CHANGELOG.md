# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
