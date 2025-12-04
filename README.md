# @mcp-abap-adt/auth-stores

Stores for MCP ABAP ADT auth-broker - BTP, ABAP, and XSUAA implementations.

This package provides file-based and in-memory stores for service keys and sessions used by the `@mcp-abap-adt/auth-broker` package.

## Installation

```bash
npm install @mcp-abap-adt/auth-stores
```

## Overview

This package implements the `IServiceKeyStore` and `ISessionStore` interfaces from `@mcp-abap-adt/auth-broker`:

- **Service Key Stores**: Read service key JSON files from a specified directory
- **Session Stores**: Read/write session data from/to `.env` files or in-memory storage
- **File Handlers**: Utility classes for working with JSON and ENV files

## Responsibilities and Design Principles

### Core Development Principle

**Interface-Only Communication**: This package follows a fundamental development principle: **all interactions with external dependencies happen ONLY through interfaces**. The code knows **NOTHING beyond what is defined in the interfaces**.

This means:
- Does not know about concrete implementation classes from other packages
- Does not know about internal data structures or methods not defined in interfaces
- Does not make assumptions about implementation behavior beyond interface contracts
- Does not access properties or methods not explicitly defined in interfaces

This principle ensures:
- **Loose coupling**: Stores are decoupled from concrete implementations in other packages
- **Flexibility**: New implementations can be added without modifying stores
- **Testability**: Easy to mock dependencies for testing
- **Maintainability**: Changes to implementations don't affect stores

### Package Responsibilities

This package is responsible for:

1. **Implementing storage interfaces**: Provides concrete implementations of `IServiceKeyStore` and `ISessionStore` interfaces defined in `@mcp-abap-adt/auth-broker`
2. **File I/O operations**: Handles reading and writing service key JSON files and session `.env` files
3. **Data format conversion**: Converts between interface types (`IConfig`, `IConnectionConfig`, `IAuthorizationConfig`) and internal storage formats
4. **Platform-specific handling**: Provides different store implementations for ABAP, BTP, and XSUAA with their specific data formats

#### What This Package Does

- **Implements interfaces**: Provides concrete implementations of `IServiceKeyStore` and `ISessionStore`
- **Handles file operations**: Reads/writes JSON and `.env` files using atomic operations
- **Manages data formats**: Converts between interface types and internal storage formats (e.g., `AbapSessionData`, `BtpBaseSessionData`)
- **Provides utilities**: File handlers (`JsonFileHandler`, `EnvFileHandler`) for safe file operations

#### What This Package Does NOT Do

- **Does NOT implement authentication logic**: Token acquisition and OAuth2 flows are handled by `@mcp-abap-adt/auth-providers`
- **Does NOT orchestrate authentication**: Token lifecycle management is handled by `@mcp-abap-adt/auth-broker`
- **Does NOT know about token validation**: Token validation logic is not part of this package
- **Does NOT interact with external services**: All HTTP requests and OAuth flows are handled by other packages

### External Dependencies

This package interacts with external packages **ONLY through interfaces**:

- **`@mcp-abap-adt/auth-broker`**: Uses interfaces (`IServiceKeyStore`, `ISessionStore`, `IConfig`, `IConnectionConfig`, `IAuthorizationConfig`) - does not know about `AuthBroker` implementation
- **No direct dependencies on other packages**: All interactions happen through well-defined interfaces

## Store Types

### Service Key Stores

Service key stores read JSON files containing UAA credentials and connection information:

- **`BtpServiceKeyStore`** - Reads XSUAA service keys for base BTP (direct XSUAA format)
- **`AbapServiceKeyStore`** - Reads ABAP service keys (with nested `uaa` object)
- **`XsuaaServiceKeyStore`** - Reads XSUAA service keys (alias for BtpServiceKeyStore)

### Session Stores

Session stores manage authentication tokens and configuration:

**File-based stores** (persist to `.env` files):
- **`BtpSessionStore`** - Stores base BTP sessions using `XSUAA_*` environment variables
- **`AbapSessionStore`** - Stores ABAP sessions using `SAP_*` environment variables
- **`XsuaaSessionStore`** - Stores XSUAA sessions using `XSUAA_*` environment variables

**In-memory stores** (non-persistent, secure):
- **`SafeBtpSessionStore`** - In-memory store for base BTP sessions
- **`SafeAbapSessionStore`** - In-memory store for ABAP sessions
- **`SafeXsuaaSessionStore`** - In-memory store for XSUAA sessions

## Usage

### BTP Stores (base BTP without sapUrl)

```typescript
import { BtpServiceKeyStore, BtpSessionStore, SafeBtpSessionStore } from '@mcp-abap-adt/auth-stores';

// Service key store - reads {destination}.json files from directory
const serviceKeyStore = new BtpServiceKeyStore('/path/to/service-keys');

// File-based session store - reads/writes {destination}.env files
const sessionStore = new BtpSessionStore('/path/to/sessions');

// In-memory session store (non-persistent)
const safeSessionStore = new SafeBtpSessionStore();
```

### ABAP Stores (with sapUrl)

```typescript
import { AbapServiceKeyStore, AbapSessionStore, SafeAbapSessionStore } from '@mcp-abap-adt/auth-stores';

// Service key store - reads ABAP service keys with nested uaa object
const serviceKeyStore = new AbapServiceKeyStore('/path/to/service-keys');

// File-based session store - stores ABAP sessions with SAP_* env vars
const sessionStore = new AbapSessionStore('/path/to/sessions');

// In-memory session store
const safeSessionStore = new SafeAbapSessionStore();
```

### XSUAA Stores

```typescript
import { XsuaaServiceKeyStore, XsuaaSessionStore, SafeXsuaaSessionStore } from '@mcp-abap-adt/auth-stores';

// Service key store - reads XSUAA service keys
const serviceKeyStore = new XsuaaServiceKeyStore('/path/to/service-keys');

// File-based session store - stores XSUAA sessions
const sessionStore = new XsuaaSessionStore('/path/to/sessions');

// In-memory session store
const safeSessionStore = new SafeXsuaaSessionStore();
```

### Directory Configuration

All stores accept a single directory path in the constructor:

```typescript
// Single directory path
const store = new BtpServiceKeyStore('/path/to/service-keys');

// Directory will be created automatically if it doesn't exist when saving files
const sessionStore = new AbapSessionStore('/path/to/sessions');
await sessionStore.saveSession('TRIAL', config); // Creates directory if needed
```

### Service Key Format

**ABAP Service Key** (with nested `uaa` object):
```json
{
  "uaa": {
    "url": "https://...authentication...hana.ondemand.com",
    "clientid": "...",
    "clientsecret": "..."
  },
  "abap": {
    "url": "https://...abap...hana.ondemand.com",
    "client": "001"
  }
}
```

**XSUAA Service Key** (direct format):
```json
{
  "url": "https://...authentication...hana.ondemand.com",
  "clientid": "...",
  "clientsecret": "...",
  "apiurl": "https://...api...hana.ondemand.com"
}
```

## File Handlers

Utility classes for working with files:

### JsonFileHandler

```typescript
import { JsonFileHandler } from '@mcp-abap-adt/auth-stores';

// Load JSON file
const data = await JsonFileHandler.load('TRIAL.json', '/path/to/directory');

// Save JSON file (atomic write)
await JsonFileHandler.save('/path/to/file.json', { key: 'value' });
```

### EnvFileHandler

```typescript
import { EnvFileHandler } from '@mcp-abap-adt/auth-stores';

// Load .env file
const vars = await EnvFileHandler.load('TRIAL.env', '/path/to/directory');

// Save .env file (atomic write, preserves existing variables)
await EnvFileHandler.save('/path/to/file.env', {
  KEY1: 'value1',
  KEY2: 'value2'
}, true); // preserveExisting = true
```

## Utilities

### Constants

```typescript
import {
  ABAP_AUTHORIZATION_VARS,
  ABAP_CONNECTION_VARS,
  BTP_AUTHORIZATION_VARS,
  BTP_CONNECTION_VARS,
  XSUAA_AUTHORIZATION_VARS,
  XSUAA_CONNECTION_VARS
} from '@mcp-abap-adt/auth-stores';
```

### Service Key Loaders

```typescript
import { loadServiceKey, loadXSUAAServiceKey } from '@mcp-abap-adt/auth-stores';

// Load ABAP service key (auto-detects format)
const abapKey = await loadServiceKey('TRIAL', '/path/to/service-keys');

// Load XSUAA service key
const xsuaaKey = await loadXSUAAServiceKey('mcp', '/path/to/service-keys');
```

## Testing

The package includes both unit tests (with mocked file system) and integration tests (with real files).

### Unit Tests

Unit tests use Jest with mocked file system operations:

```bash
npm test
```

### Integration Tests

Integration tests work with real files from `tests/test-config.yaml`:

1. Copy `tests/test-config.yaml.template` to `tests/test-config.yaml`
2. Fill in real paths and destinations
3. Run tests - integration tests will use real files if configured

```yaml
auth_broker:
  paths:
    service_keys_dir: ~/.config/mcp-abap-adt/service-keys/
    sessions_dir: ~/.config/mcp-abap-adt/sessions/
  abap:
    destination: "TRIAL"
  xsuaa:
    btp_destination: "mcp"
    mcp_url: "https://..."
```

Integration tests will skip if `test-config.yaml` is not configured or contains placeholder values.

## Architecture

### File Operations

- **Service Key Stores** use `JsonFileHandler` to read JSON files
- **Session Stores** use `EnvFileHandler` to read/write `.env` files
- All file writes are atomic (write to temp file, then rename)

### Store Implementation

- All stores implement `IServiceKeyStore` or `ISessionStore` interfaces from `@mcp-abap-adt/auth-broker`
- Stores accept a single directory path in constructor
- File-based stores automatically create directories when saving
- In-memory stores (`Safe*SessionStore`) don't persist data to disk

## Dependencies

- `@mcp-abap-adt/auth-broker` (^0.1.6) - Interface definitions
- `dotenv` - Environment variable parsing

## License

MIT
