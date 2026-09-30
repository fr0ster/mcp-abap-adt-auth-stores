# @mcp-abap-adt/auth-stores
[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://stand-with-ukraine.pp.ua)

Stores for MCP ABAP ADT auth-broker - BTP, ABAP, and XSUAA implementations.

This package provides file-based and in-memory stores for service keys and sessions used by the `@mcp-abap-adt/auth-broker` package.

## Installation

```bash
npm install @mcp-abap-adt/auth-stores
```

## Overview

This package implements the `IServiceKeyStore` and `ISessionStore` interfaces from `@mcp-abap-adt/interfaces-auth-sap`:

- **Service Key Stores**: Read service key JSON files from a specified directory
- **Session Stores**: Read/write session data from/to `.env` files or in-memory storage
- **File Handlers**: Utility classes for working with JSON and ENV files (exported for consumers; the session stores do their own file I/O through `envLoader` / `tokenStorage`)

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

1. **Implementing storage interfaces**: Provides concrete implementations of `IServiceKeyStore` and `ISessionStore` interfaces defined in `@mcp-abap-adt/interfaces-auth-sap`
2. **File I/O operations**: Handles reading and writing service key JSON files and session `.env` files
3. **Data format conversion**: Converts between interface types (`IConfig`, `IConnectionConfig`, `IAuthorizationConfig`) and internal storage formats
4. **Platform-specific handling**: Provides different store implementations for ABAP, BTP, and XSUAA with their specific data formats

#### What This Package Does

- **Implements interfaces**: Provides concrete implementations of `IServiceKeyStore` and `ISessionStore`
- **Handles file operations**: Reads/writes JSON and `.env` files using atomic operations
- **Manages data formats**: Converts between interface types and internal storage formats (e.g., `AbapSessionData`, `BtpBaseSessionData`)
- **Provides utilities**: File handlers (`JsonFileHandler`, `EnvFileHandler`) for safe file operations. The session stores do not use `EnvFileHandler`: `AbapSessionStore` and `XsuaaSessionStore` read and write through their own loaders and token storage (`envLoader`/`tokenStorage`), `EnvFileSessionStore` parses its own file

#### What This Package Does NOT Do

- **Does NOT implement authentication logic**: Token acquisition and OAuth2 flows are handled by `@mcp-abap-adt/auth-providers`
- **Does NOT orchestrate authentication**: Token lifecycle management is handled by `@mcp-abap-adt/auth-broker`
- **Does NOT know about token validation**: Token validation logic is not part of this package
- **Does NOT interact with external services**: All HTTP requests and OAuth flows are handled by other packages

### External Dependencies

This package interacts with external packages **ONLY through interfaces**:

- **`@mcp-abap-adt/interfaces-auth-sap`** (`^1.1.0`): `IServiceKeyStore`, `ISessionStore`, `IConfig`, `IConnectionConfig`, `IAuthorizationConfig` — what a store is, for an SAP or BTP system. 1.1.0 adds `authType: 'snc'` and the `snc*` fields
- **`@mcp-abap-adt/interfaces-auth`** (`^3.0.0`): `STORE_ERROR_CODES` and `StoreErrorCode` — the failure vocabulary, which means the same off SAP
- **`@mcp-abap-adt/interfaces-utils`** (`^1.1.0`): `ILogger`
- **`dotenv`** (`^18.0.4`): parses `.env` files
- **Not `@mcp-abap-adt/interfaces`**: that facade is **deleted** as of its 52.0.0. npm still serves 51.0.0 to anyone pinned to it, with every symbol re-exported and deprecated, and nothing further ships there — a consumer takes the package that declares the name
- **No direct dependencies on other implementation packages**: all interactions happen through those contracts

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
- **`AbapSessionStore`** - Stores ABAP sessions using `SAP_*` environment variables: basic, JWT, SAML cookies or SNC, with the type kept explicitly in `SAP_AUTH_TYPE`
- **`XsuaaSessionStore`** - Stores XSUAA sessions using `XSUAA_*` environment variables

**In-memory stores** (non-persistent, secure):
- **`SafeBtpSessionStore`** - In-memory store for base BTP sessions
- **`SafeAbapSessionStore`** - In-memory store for ABAP sessions
- **`SafeXsuaaSessionStore`** - In-memory store for XSUAA sessions

**File-based single-file stores**:
- **`EnvFileSessionStore`** - A specific `.env` file path (e.g., `--env /path/to/.env`); basic and JWT only (no SAML, no SNC)

## Usage

### BTP Stores (base BTP without sapUrl)

```typescript
import { BtpServiceKeyStore, BtpSessionStore, SafeBtpSessionStore } from '@mcp-abap-adt/auth-stores';

// Service key store - reads {destination}.json files from directory
const serviceKeyStore = new BtpServiceKeyStore('/path/to/service-keys');

// File-based session store - reads/writes {destination}.env files
// defaultServiceUrl is REQUIRED (cannot be obtained from service key)
const sessionStore = new BtpSessionStore('/path/to/sessions', 'https://default.mcp.com', logger);

// In-memory session store (non-persistent)
// defaultServiceUrl is REQUIRED (cannot be obtained from service key)
const safeSessionStore = new SafeBtpSessionStore('https://default.mcp.com', logger);
```

### ABAP Stores (with sapUrl)

```typescript
import {
  AbapServiceKeyStore,
  AbapSessionStore,
  SafeAbapSessionStore,
  SamlSessionStore,
  SafeSamlSessionStore,
} from '@mcp-abap-adt/auth-stores';

// Service key store - reads ABAP service keys with nested uaa object
const serviceKeyStore = new AbapServiceKeyStore('/path/to/service-keys');

// File-based session store - stores ABAP sessions with SAP_* env vars
const sessionStore = new AbapSessionStore('/path/to/sessions');

// In-memory session store
const safeSessionStore = new SafeAbapSessionStore();

// A session holds one credential: basic, jwt, saml or snc, through the contract
await sessionStore.setConnectionConfig('DEV', {
  serviceUrl: 'https://dev.example.com',
  authType: 'basic',
  username: 'DEVELOPER',
  password: '...',
});
await sessionStore.setConnectionConfig('DEV_SNC', {
  serviceUrl: 'https://dev.example.com',
  authType: 'snc',
  sncPartnerName: 'p:CN=DEV, O=ORG, C=DE',
});

// SAML aliases (same behavior as ABAP stores)
const samlSessionStore = new SamlSessionStore('/path/to/sessions');
const safeSamlSessionStore = new SafeSamlSessionStore();
```

### XSUAA Stores

```typescript
import { XsuaaServiceKeyStore, XsuaaSessionStore, SafeXsuaaSessionStore } from '@mcp-abap-adt/auth-stores';

// Service key store - reads XSUAA service keys
const serviceKeyStore = new XsuaaServiceKeyStore('/path/to/service-keys');

// File-based session store - stores XSUAA sessions
// defaultServiceUrl is REQUIRED (cannot be obtained from service key)
const sessionStore = new XsuaaSessionStore('/path/to/sessions', 'https://default.mcp.com', logger);

// In-memory session store
// defaultServiceUrl is REQUIRED (cannot be obtained from service key)
const safeSessionStore = new SafeXsuaaSessionStore('https://default.mcp.com', logger);
```

### EnvFileSessionStore (Single File)

`EnvFileSessionStore` reads connection configuration from a specific `.env` file path rather than a directory. This is useful for the `--env` CLI option.

```typescript
import { EnvFileSessionStore } from '@mcp-abap-adt/auth-stores';

// Create store pointing to specific .env file
const store = new EnvFileSessionStore('/path/to/.env', logger);

// Check the auth type from the file
const authType = store.getAuthType(); // 'basic' | 'jwt' | null

// Load session (works like other session stores)
const config = await store.loadSession('default');
console.log(config?.serviceUrl, config?.authType);

// For basic auth
console.log(config?.username, config?.password);

// For JWT auth
console.log(config?.authorizationToken, config?.refreshToken);
```

**Env file format:**
```bash
# Connection
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100

# Auth type: 'basic' or 'jwt' (defaults to 'basic'; a SAP_JWT_TOKEN implies 'jwt')
SAP_AUTH_TYPE=basic

# Basic auth credentials
SAP_USERNAME=your-username
SAP_PASSWORD=your-password

# OR JWT auth
# SAP_AUTH_TYPE=jwt
# SAP_JWT_TOKEN=your-jwt-token
# SAP_REFRESH_TOKEN=your-refresh-token
# SAP_UAA_URL=https://uaa.example.com
# SAP_UAA_CLIENT_ID=client-id
# SAP_UAA_CLIENT_SECRET=client-secret
```

**Important**: `EnvFileSessionStore` supports basic and JWT only — SAML and SNC sessions are for `AbapSessionStore` / `SafeAbapSessionStore`. It is not read-only: it writes `SAP_JWT_TOKEN` and `SAP_REFRESH_TOKEN` back to its file when the token is refreshed or set (`save()`).

### AbapSessionStore env format

`AbapSessionStore` keeps one `{destination}.env` per destination in its directory. The authentication type is written explicitly:

```bash
SAP_URL=https://your-sap-system.com
SAP_CLIENT=100
SAP_LANGUAGE=EN

# basic | jwt | saml | snc — written on every save that has an authType
SAP_AUTH_TYPE=snc

# snc: a partner name, no token or password
SAP_SNC_PARTNERNAME=p:CN=SID, O=ORG, C=DE
SAP_SNC_QOP=9
SAP_SNC_LIB=/usr/sap/sapcrypto/libsapcrypto.so
SAP_SNC_MYNAME=p:CN=ME, O=ORG, C=DE

# basic: SAP_USERNAME / SAP_PASSWORD
# jwt:   SAP_JWT_TOKEN / SAP_REFRESH_TOKEN / SAP_UAA_URL / SAP_UAA_CLIENT_ID / SAP_UAA_CLIENT_SECRET
# saml:  SAP_SESSION_COOKIES_B64 (base64-encoded cookie string)
```

- `SAP_AUTH_TYPE` wins when present. A file without it (written before 2.0.0) is inferred as before: cookies mean `saml`; a username and password with an empty token mean `basic`; a token means `jwt`. An unknown value is ignored and the type inferred.
- Writing a session in one mode clears the credentials of the others, including the SNC keys when it is not `snc`.
- `SAP_SNC_PARTNERNAME` is required for an `snc` session; the other three are optional.

**The snc session shape** — what `getConnectionConfig` returns, and what `loadSession` includes:

```typescript
{
  serviceUrl: 'https://your-sap-system.com',
  authType: 'snc',
  sncPartnerName: 'p:CN=SID, O=ORG, C=DE',
  sncQop: '9',            // only when stored
  sncLib: '/usr/sap/...', // only when stored
  sncMyName: 'p:CN=ME',   // only when stored
  sapClient: '100',
  language: 'EN',
}
```

`SafeAbapSessionStore` holds the same shapes in memory and accepts a session without a token when it is basic (username and password), SAML (`sessionCookies`) or SNC (`sncPartnerName`).

### Directory Configuration

All stores accept a single directory path in the constructor:

```typescript
// Single directory path
const store = new BtpServiceKeyStore('/path/to/service-keys');

// File-based session stores automatically create directory in constructor if it doesn't exist
const sessionStore = new AbapSessionStore('/path/to/sessions'); // Directory created automatically
```

**Note**: File-based session stores (`AbapSessionStore`, `BtpSessionStore`, `XsuaaSessionStore`) automatically create the directory in the constructor if it doesn't exist. Stores are ready to use immediately after construction.

### Default Service URL Configuration

**For XSUAA and BTP stores**: `defaultServiceUrl` is **required** in the constructor because `serviceUrl` cannot be obtained from service keys:
- `XsuaaSessionStore(directory, defaultServiceUrl, log?)` - `defaultServiceUrl` is required
- `SafeXsuaaSessionStore(defaultServiceUrl, log?)` - `defaultServiceUrl` is required
- `BtpSessionStore(directory, defaultServiceUrl, log?)` - `defaultServiceUrl` is required
- `SafeBtpSessionStore(defaultServiceUrl, log?)` - `defaultServiceUrl` is required

**For ABAP stores**: `defaultServiceUrl` is **optional** because `serviceUrl` can be obtained from ABAP service keys:
- `AbapSessionStore(directory, log?, defaultServiceUrl?)` - `defaultServiceUrl` is optional
- `SafeAbapSessionStore(log?, defaultServiceUrl?)` - `defaultServiceUrl` is optional

The `defaultServiceUrl` is used when creating new sessions via `setConnectionConfig` or `setAuthorizationConfig` if `config.serviceUrl` is not provided. It is never used to modify existing sessions.

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

This package provides utility classes for safe file operations:

### Error Handling

All service key stores throw typed errors for better error handling:

```typescript
import { 
  BtpServiceKeyStore,
  FileNotFoundError,
  ParseError,
  InvalidConfigError 
} from '@mcp-abap-adt/auth-stores';
import { STORE_ERROR_CODES } from '@mcp-abap-adt/interfaces-auth';

const serviceKeyStore = new BtpServiceKeyStore('/path/to/keys');

try {
  const authConfig = await serviceKeyStore.getAuthorizationConfig('TRIAL');
  console.log('Auth config loaded:', authConfig);
} catch (error: any) {
  if (error.code === STORE_ERROR_CODES.FILE_NOT_FOUND) {
    // File not found - returns null instead of throwing
    console.error('Service key file not found:', error.filePath);
  } else if (error.code === STORE_ERROR_CODES.PARSE_ERROR) {
    // JSON parsing failed or invalid format
    console.error('Failed to parse service key:', error.filePath);
    console.error('Cause:', error.cause);
  } else if (error.code === STORE_ERROR_CODES.INVALID_CONFIG) {
    // Required UAA fields missing - returns null instead of throwing
    console.error('Invalid config:', error.missingFields);
  } else if (error.code === STORE_ERROR_CODES.STORAGE_ERROR) {
    // File write/permission error
    console.error('Storage operation failed:', error.operation);
    console.error('Cause:', error.cause);
  } else {
    // Generic error
    console.error('Unexpected error:', error.message);
  }
}
```

**Error Types:**
- **`FileNotFoundError`** - Service key file not found (includes `filePath`)
- **`ParseError`** - JSON parsing failed or invalid format (includes `filePath` and `cause`)
- **`InvalidConfigError`** - Required configuration fields missing (includes `missingFields` array)
- **`StorageError`** - File write or permission error (includes `operation` and `cause`)

**Note**: Most errors result in `null` return values rather than exceptions. Only fatal errors (like JSON parsing failures) throw exceptions.

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

## Debug Logging

Stores support optional logging through the `ILogger` interface. To enable detailed logging:

### Using Logger in Code

```typescript
import { AbapServiceKeyStore } from '@mcp-abap-adt/auth-stores';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';

// Create logger (or use your own implementation)
const logger: ILogger = {
  debug: (msg) => console.debug(msg),
  info: (msg) => console.info(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
};

// Pass logger to store constructor
const store = new AbapServiceKeyStore('/path/to/service-keys', logger);
const sessionStore = new AbapSessionStore('/path/to/sessions', logger);
```

### Using Test Logger in Tests

For tests, use the `createTestLogger` helper which respects environment variables:

```typescript
import { createTestLogger } from './__tests__/helpers/testLogger';

// Logger will output only if DEBUG_AUTH_STORES=true is set
const logger = createTestLogger('MY-TEST');
const store = new AbapServiceKeyStore('/path/to/service-keys', logger);
```

### Environment Variables

To enable logging in tests or when using `createTestLogger`:

```bash
# Enable logging for auth stores (short name)
DEBUG_STORES=true npm test

# Or use long name (backward compatibility)
DEBUG_AUTH_STORES=true npm test

# Or enable via general DEBUG variable
DEBUG=true npm test

# Or include in DEBUG list
DEBUG=stores npm test
# Or
DEBUG=auth-stores npm test

# Set log level (debug, info, warn, error)
LOG_LEVEL=debug npm test
```

**Note**: Logging requires explicit enable via environment variables. Both `DEBUG_STORES` (short) and `DEBUG_AUTH_STORES` (long) are supported for backward compatibility.

Logging shows:
- **File operations**: Which files are read/written, file sizes, file paths
- **Parsing operations**: Structure of parsed data, validation results, keys found
- **Storage operations**: What data is saved/loaded, token lengths, refresh token presence, URLs
- **Token formatting**: Tokens are logged in truncated format (start...end) for security and readability
- **Errors**: Detailed error information with context

**Logging Features**:
- **Token Formatting**: Tokens are logged in truncated format (start...end) for security
- **Structured Logging**: Uses `DefaultLogger` from `@mcp-abap-adt/logger` for proper formatting with icons and level prefixes
- **Log Levels**: Controlled via `LOG_LEVEL` or `AUTH_LOG_LEVEL` environment variable (error, warn, info, debug)

Example output with `DEBUG_STORES=true LOG_LEVEL=debug`:
```
[INFO] ℹ️ [TEST-STORE] Reading service key file: /path/to/TRIAL.json
[DEBUG] 🐛 [TEST-STORE] File read successfully, size: 121 bytes, keys: uaa
[DEBUG] 🐛 [TEST-STORE] Parsed service key structure: hasUaa(true), uaaKeys(url, clientid, clientsecret)
[INFO] ℹ️ [TEST-STORE] Authorization config loaded from /path/to/TRIAL.json: uaaUrl(https://...authentication...), clientId(test-client...)
[DEBUG] 🐛 [TEST-STORE] Reading env file: /path/to/TRIAL.env
[DEBUG] 🐛 [TEST-STORE] Env file read successfully, size: 245 bytes
[INFO] ℹ️ [TEST-STORE] Session loaded for TRIAL: token(2263 chars, eyJ0eXAiOiJKV1QiLCJqaWQiO...Q5ti7aYmEzItIDuLp7axNYo6w), refreshToken(fcc971e1cf1548629216a96b0680eb85-r), sapUrl(https://...abap...)
```

**Note**: Logging only works when a logger is explicitly provided. Stores will not output anything to console if no logger is passed.

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

- All stores implement `IServiceKeyStore` or `ISessionStore` interfaces from `@mcp-abap-adt/interfaces`
- Stores accept a single directory path in constructor
- File-based session stores automatically create directories in constructor if they don't exist
- Session stores automatically create sessions when calling `setConnectionConfig` or `setAuthorizationConfig` (no need to call `saveSession` first)
- In-memory stores (`Safe*SessionStore`) don't persist data to disk

### Session Store Behavior

Session stores are designed to work seamlessly with `AuthBroker`:

- **Ready after construction**: File-based stores create directory automatically, stores are ready to use immediately
- **Automatic session creation**: Calling `setConnectionConfig` or `setAuthorizationConfig` on an empty store creates a new session
- **ABAP stores**: Require `serviceUrl` when creating new session (from config or `defaultServiceUrl` parameter)
- **BTP/XSUAA stores**: Require `defaultServiceUrl` in constructor (cannot be obtained from service key), used when creating new sessions if `config.serviceUrl` is not provided
- **Token updates**: `setConnectionConfig` updates token if provided, preserves existing token if not provided
- **Session updates**: When updating existing sessions, only `config.serviceUrl` is used if explicitly provided; `defaultServiceUrl` is never used to modify existing sessions

## Dependencies

- `@mcp-abap-adt/interfaces` (^0.1.4) - Interface definitions (`IServiceKeyStore`, `ISessionStore`, `IConfig`, `IConnectionConfig`, `IAuthorizationConfig`, `ILogger`)
- `dotenv` - Environment variable parsing

## License

**GNU Lesser General Public License v3.0 only** (`LGPL-3.0-only`).
Earlier published versions were MIT and stay MIT — a licence change is not
retroactive.

Copyright © 2025–2026 Oleksii Kyslytsia

This library is free software: you can redistribute it and/or modify it under the
terms of the GNU Lesser General Public License as published by the Free Software
Foundation, version 3.

It is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR
PURPOSE. See the GNU Lesser General Public License for more details.

Both texts ship with the package and both are needed: [`LICENSE`](LICENSE) is the
LGPL, [`COPYING`](COPYING) is the GPL it is written on top of, since the LGPL is a
set of additional permissions over the GPL and cannot be read alone.

**What this means if you depend on this package.** Linking it into your own
program — importing it, as every consumer of an npm package does — does not put
your program under the LGPL. What the licence asks is that changes *to this
library* stay free, and that your users can replace it with their own build.

