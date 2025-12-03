# @mcp-abap-adt/auth-stores

Stores for MCP ABAP ADT auth-broker - BTP, ABAP, and XSUAA implementations.

This package provides file-based and in-memory stores for service keys and sessions used by the `@mcp-abap-adt/auth-broker` package.

## Installation

```bash
npm install @mcp-abap-adt/auth-stores
```

## Overview

This package implements the `IServiceKeyStore` and `ISessionStore` interfaces from `@mcp-abap-adt/auth-broker`:

- **Service Key Stores**: Read service key JSON files from configured search paths
- **Session Stores**: Read/write session data from/to `.env` files or in-memory storage
- **Abstract Classes**: Base classes for creating custom store implementations

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

// Service key store - reads {destination}.json files
const serviceKeyStore = new BtpServiceKeyStore(['/path/to/service-keys']);

// File-based session store - reads/writes {destination}.env files
const sessionStore = new BtpSessionStore(['/path/to/sessions']);

// In-memory session store (non-persistent)
const safeSessionStore = new SafeBtpSessionStore();
```

### ABAP Stores (with sapUrl)

```typescript
import { AbapServiceKeyStore, AbapSessionStore, SafeAbapSessionStore } from '@mcp-abap-adt/auth-stores';

// Service key store - reads ABAP service keys with nested uaa object
const serviceKeyStore = new AbapServiceKeyStore(['/path/to/service-keys']);

// File-based session store - stores ABAP sessions with SAP_* env vars
const sessionStore = new AbapSessionStore(['/path/to/sessions']);

// In-memory session store
const safeSessionStore = new SafeAbapSessionStore();
```

### XSUAA Stores

```typescript
import { XsuaaServiceKeyStore, XsuaaSessionStore, SafeXsuaaSessionStore } from '@mcp-abap-adt/auth-stores';

// Service key store - reads XSUAA service keys
const serviceKeyStore = new XsuaaServiceKeyStore(['/path/to/service-keys']);

// File-based session store - stores XSUAA sessions
const sessionStore = new XsuaaSessionStore(['/path/to/sessions']);

// In-memory session store
const safeSessionStore = new SafeXsuaaSessionStore();
```

### Search Paths

Search paths are resolved in priority order:

1. **Constructor parameter** (highest priority)
2. **`AUTH_BROKER_PATH` environment variable** (colon/semicolon-separated paths)
3. **Current working directory** (lowest priority, only if no other paths specified)

```typescript
// Single path
const store = new BtpServiceKeyStore('/path/to/keys');

// Multiple paths
const store = new BtpServiceKeyStore(['/path1', '/path2', '/path3']);

// Use environment variable
process.env.AUTH_BROKER_PATH = '/path1:/path2:/path3';
const store = new BtpServiceKeyStore(); // Uses AUTH_BROKER_PATH
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

### Abstract Classes

For creating custom store implementations:

- **`AbstractServiceKeyStore`** - Base class for service key stores
  - Handles file I/O operations
  - Subclasses implement format-specific parsing logic

- **`AbstractJsonSessionStore`** - Base class for file-based session stores
  - Handles `.env` file read/write operations
  - Subclasses implement format-specific serialization

- **`AbstractSafeSessionStore`** - Base class for in-memory session stores
  - Provides secure, non-persistent storage
  - Subclasses implement format-specific data structures

## Utilities

### Path Resolver

```typescript
import { resolveSearchPaths, findFileInPaths } from '@mcp-abap-adt/auth-stores';

// Resolve search paths from constructor, env var, or cwd
const paths = resolveSearchPaths(['/custom/path']);

// Find file in multiple search paths
const filePath = findFileInPaths('TRIAL.json', paths);
```

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

// Load ABAP service key
const abapKey = await loadServiceKey('TRIAL', ['/path/to/keys']);

// Load XSUAA service key
const xsuaaKey = await loadXSUAAServiceKey('mcp', ['/path/to/keys']);
```

## Testing

Tests use Jest and include unit tests with mocked file system operations.

```bash
npm test
```

## Dependencies

- `@mcp-abap-adt/auth-broker` (^0.1.6) - Interface definitions
- `dotenv` - Environment variable parsing

## License

MIT
