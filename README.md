# @mcp-abap-adt/auth-stores
[![Stand With Ukraine](https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg)](https://stand-with-ukraine.pp.ua)

Stores for MCP ABAP ADT auth-broker - BTP, ABAP, and XSUAA implementations.

This package provides file-based and in-memory stores for service keys and sessions used by the `@mcp-abap-adt/auth-broker` package.

## Installation

```bash
npm install @mcp-abap-adt/auth-stores
```

## Overview

This package implements the `IServiceKeyStore` and `ISessionStore` contracts from `@mcp-abap-adt/interfaces-auth-broker`. Since 3.0.0 the two stores are split **by the role of the data**:

| Store | Holds | Implementations here |
|---|---|---|
| `IServiceKeyStore` — the **means**: what is used to obtain a session secret | the client (`uaaUrl`, `uaaClientId`, `uaaClientSecret`); `authType`, `grantType`; basic's `username` / `password`; the `snc*`, `oidc*` and `saml*` settings; `serviceUrl`, `sapClient`, `language` | `AbapServiceKeyStore`, `XsuaaServiceKeyStore` (SAP service key JSON), `EnvDestinationStore` (`<dir>/<destination>.env`) |
| `ISessionStore` — the **secret** that authorizes within a session | `authorizationToken` or `sessionCookies`, their `expiresAt`, `refreshToken` | `AbapSessionStore`, `XsuaaSessionStore`, `EnvFileSessionStore` (files), `SafeAbapSessionStore`, `SafeXsuaaSessionStore` (memory) |

A key store never answers a secret, and a session store refuses to hold means. `basic` and `snc` destinations obtain no session secret: their session holds nothing.

- **File Handlers**: utility classes for JSON and ENV files (exported for consumers; the stores do their own file I/O)

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

1. **Implementing storage interfaces**: Provides concrete implementations of `IServiceKeyStore` (the means) and `ISessionStore` (the session secret) defined in `@mcp-abap-adt/interfaces-auth-broker`
2. **File I/O operations**: Handles reading and writing service key JSON files and session `.env` files
3. **Data format conversion**: Converts between interface types (`IConfig`, `IConnectionConfig`, `IAuthorizationConfig`) and internal storage formats
4. **Platform-specific handling**: Provides different store implementations for ABAP, BTP, and XSUAA with their specific data formats

#### What This Package Does

- **Implements interfaces**: Provides concrete implementations of `IServiceKeyStore` and `ISessionStore`
- **Handles file operations**: Reads/writes JSON and `.env` files using atomic operations
- **Manages data formats**: Converts between interface types and `.env` / JSON key names
- **Provides utilities**: File handlers (`JsonFileHandler`, `EnvFileHandler`) for safe file operations. The `.env` stores do not use `EnvFileHandler`: they read with dotenv and rewrite only their own keys of a file, keeping every other line

#### What This Package Does NOT Do

- **Does NOT implement authentication logic**: Token acquisition and OAuth2 flows are handled by `@mcp-abap-adt/auth-providers`
- **Does NOT orchestrate authentication**: Token lifecycle management is handled by `@mcp-abap-adt/auth-broker`
- **Does NOT know about token validation**: Token validation logic is not part of this package
- **Does NOT interact with external services**: All HTTP requests and OAuth flows are handled by other packages

### External Dependencies

This package interacts with external packages **ONLY through interfaces**:

- **`@mcp-abap-adt/interfaces-auth-broker`** (`^1.0.0`): `IServiceKeyStore`, `ISessionStore`, `IConfig`, `IConnectionConfig`, `DestinationGrant` — the broker's port: the destination and the stores that hold it. 1.0.0 carries `grantType`, `expiresAt` and the `oidc*` / `saml*` fields
- **`@mcp-abap-adt/interfaces-auth-sap`** (`^2.0.0`): `IAuthorizationConfig` — the UAA client
- **`@mcp-abap-adt/interfaces-auth`** (`^3.0.0`): `STORE_ERROR_CODES` and `StoreErrorCode` — the failure vocabulary, which means the same off SAP
- **`@mcp-abap-adt/interfaces-utils`** (`^1.1.0`): `ILogger`
- **`dotenv`** (`^18.0.4`): parses `.env` files
- **Not `@mcp-abap-adt/interfaces`**: that facade is **deleted** as of its 52.0.0. npm still serves 51.0.0 to anyone pinned to it, with every symbol re-exported and deprecated, and nothing further ships there — a consumer takes the package that declares the name
- **No direct dependencies on other implementation packages**: all interactions happen through those contracts

## Store Types

### Key stores — the means

- **`AbapServiceKeyStore`** — reads ABAP service keys (`{destination}.json`, nested `uaa` object)
- **`XsuaaServiceKeyStore`** (alias **`BtpServiceKeyStore`**) — reads XSUAA service keys (direct format, or `cf service-key` output with a `credentials` wrapper)
- **`EnvDestinationStore`** — a destination's means in `<directory>/<destination>.env`, with a write method of its own; optionally falls back to another key store field by field

A SAP service key holds an OAuth client and nothing else, so both service key stores answer `authType: 'jwt'` from `getConnectionConfig`. They answer **no `grantType`**: a service key cannot state which grant a destination uses (the grants a client may use are declared on the XSUAA instance, and a client permitted several serves all of them). State the grant in an `EnvDestinationStore` — on its own, or with the service key store as its fallback. They answer **no token** either (2.x answered `authorizationToken: ''`).

### Session stores — the secret

**File-based** (`.env` files):
- **`AbapSessionStore`** (alias **`SamlSessionStore`**) — `SAP_JWT_TOKEN` or `SAP_SESSION_COOKIES_B64`, `SAP_EXPIRES_AT`, `SAP_REFRESH_TOKEN`
- **`XsuaaSessionStore`** (alias **`BtpSessionStore`**) — `XSUAA_JWT_TOKEN`, `XSUAA_EXPIRES_AT`, `XSUAA_REFRESH_TOKEN`
- **`EnvFileSessionStore`** — the `SAP_*` secret keys of one given file (`--env /path/to/.env`), whatever the destination

**In-memory** (non-persistent):
- **`SafeAbapSessionStore`** (alias **`SafeSamlSessionStore`**)
- **`SafeXsuaaSessionStore`** (alias **`SafeBtpSessionStore`**)

Every session store follows the same rules:

- **The secret alone.** `saveSession` and `setConnectionConfig` take `authorizationToken`, `sessionCookies`, `expiresAt` (epoch ms) and `refreshToken`. A write carrying **any other field** — `serviceUrl`, `authType`, `grantType`, `username`, `password`, the `snc*`, `oidc*` and `saml*` fields, `sapClient`, `language`, `uaaUrl` / `uaaClientId` / `uaaClientSecret`, or a field no store knows — is refused with a `RefusedFieldsError` (code `INVALID_CONFIG`) whose message and `fields` name the fields, never a value. A field given as `undefined` is not carried.
- **No serviceUrl.** A session needs none, and none is answered.
- **No client.** `setAuthorizationConfig` always refuses (`IAuthorizationConfig` is the client, which is means); `getAuthorizationConfig` answers `null`. A refresh token is written through `saveSession`, and answered by `loadSession`.
- **One secret kind at a time.** Writing a token clears stored cookies, and writing cookies clears the token. `expiresAt` is written and cleared with its credential: a new credential written without `expiresAt` does not keep the old one's. A credential given as `''` clears it. The refresh token is kept until a write gives another (`''` clears it).
- **The XSUAA stores hold a token.** They refuse cookies, and a write that would leave the session without a token.
- **What is answered.** `loadSession`: the four secret fields present, or `null` when there are none. `getConnectionConfig`: the token or cookies and `expiresAt`, or `null`.
- **A file store touches only its own keys.** A write sets or removes the secret keys and leaves every other line of the file — keys, comments, blank lines — byte for byte. `deleteSession` removes the secret keys, and the file only when no key is left.
- Constructors: `AbapSessionStore(directory, log?)`, `XsuaaSessionStore(directory, log?)`, `EnvFileSessionStore(envFilePath, log?)`, `SafeAbapSessionStore(log?)`, `SafeXsuaaSessionStore(log?)`. File stores create their directory if it is missing.

## Usage

### Composing the two stores

The consumer — the broker's caller — decides where means and secrets live; no store picks a directory by itself.

```typescript
import {
  AbapServiceKeyStore,
  AbapSessionStore,
  EnvDestinationStore,
} from '@mcp-abap-adt/auth-stores';

// One directory: means and secret in the same <destination>.env.
// Each store touches only its own keys, so neither loses the other's.
const sessions = '/home/me/.config/mcp-abap-adt/sessions';
const keyStore = new EnvDestinationStore(sessions, {
  // a SAP service key supplies the client and URL; the .env file the grant
  fallback: new AbapServiceKeyStore('/home/me/.config/mcp-abap-adt/service-keys'),
});
const sessionStore = new AbapSessionStore(sessions);

// Or two directories: the secret apart from the means.
const meansStore = new EnvDestinationStore('/etc/mcp-abap-adt/destinations');
const secretStore = new AbapSessionStore('/var/lib/mcp-abap-adt/sessions');
```

Writing means is `EnvDestinationStore`'s own method — `IServiceKeyStore` is read-only. A given field is set, `null` removes it, a field not given stays:

```typescript
await keyStore.setDestination('TRIAL', {
  authType: 'jwt',
  grantType: 'authorization_code',
});

await keyStore.setDestination('DEV', {
  serviceUrl: 'https://dev.example.com',
  authType: 'basic',
  username: 'DEVELOPER',
  password: '...',
  sapClient: '100',
});

await keyStore.setDestination('DEV_SNC', {
  serviceUrl: 'https://dev.example.com',
  authType: 'snc',
  sncPartnerName: 'p:CN=DEV, O=ORG, C=DE',
});

// A public OIDC client: the secret is stated as ''
await keyStore.setDestination('IDP', {
  serviceUrl: 'https://h.abap.example',
  authType: 'jwt',
  grantType: 'device_code',
  uaaUrl: 'https://idp.example/realms/r',
  uaaClientId: 'public-client',
  uaaClientSecret: '',
  oidcIssuerUrl: 'https://idp.example/realms/r',
  oidcScopes: ['openid', 'offline_access'],
});

// The secret, after a login, goes to the session store
await sessionStore.saveSession('TRIAL', {
  authorizationToken: '<jwt>',
  expiresAt: Date.now() + 3_600_000,
  refreshToken: '<refresh token>',
});
```

### EnvDestinationStore

`new EnvDestinationStore(directory, { fallback?, variables?, log? })` — `directory` has no default.

- **Reads** every means field of `IConnectionConfig` (`getConnectionConfig`) and the client (`getAuthorizationConfig`: answered when `uaaUrl`, `uaaClientId` and `uaaClientSecret` are all stated; `''` is stated). `getServiceKey` answers both together.
- **Answers means only**: no token, cookies, expiry or refresh token, from the file or the fallback.
- **Infers nothing**: a file without `SAP_AUTH_TYPE` states no type; a type or grant it does not know is answered as stored, for the consumer to name.
- **Fallback**: another `IServiceKeyStore` fills, field by field, what the file leaves out. A field the file states — `''` included — wins.
- **Writes** (`setDestination`, `deleteDestination`): only its means keys. A secret field, or any field that is not means, is refused with a `RefusedFieldsError`; a malformed value (an unknown `authType` or `grantType`, a scope with whitespace, a non-boolean `samlIdpInitiated`) with an `InvalidConfigError` naming the field. A new file is created readable by its owner alone (`0600`); an existing one keeps its mode.
- **Key names**: `variables: ABAP_DESTINATION_VARS` (the default) or `XSUAA_DESTINATION_VARS`.

### Env file format

One `<destination>.env` may hold both roles. The **means** keys (read and written by `EnvDestinationStore`, `ABAP_DESTINATION_VARS`):

```bash
SAP_URL=https://your-sap-system.com
SAP_AUTH_TYPE=jwt                     # basic | jwt | saml | snc
SAP_GRANT_TYPE=authorization_code     # authorization_code | client_credentials | passcode |
                                      # oidc_authorization_code | device_code | password |
                                      # token_exchange | saml2_pure | saml2_bearer | none
SAP_CLIENT=100
SAP_LANGUAGE=EN

# basic
SAP_USERNAME=DEVELOPER
SAP_PASSWORD='...'

# snc
SAP_SNC_PARTNERNAME='p:CN=SID, O=ORG, C=DE'
SAP_SNC_QOP=9
SAP_SNC_LIB=/usr/sap/sapcrypto/libsapcrypto.so
SAP_SNC_MYNAME=p:CN=ME

# the client (an empty secret is a public client)
SAP_UAA_URL=https://uaa.example.com
SAP_UAA_CLIENT_ID=client-id
SAP_UAA_CLIENT_SECRET=client-secret

# OIDC
SAP_OIDC_ISSUER_URL=https://idp.example/realms/r
SAP_OIDC_AUTHORIZATION_ENDPOINT=...
SAP_OIDC_TOKEN_ENDPOINT=...
SAP_OIDC_DEVICE_AUTHORIZATION_ENDPOINT=...
SAP_OIDC_SCOPES='openid offline_access'   # space-separated
SAP_OIDC_SUBJECT_TOKEN=...                # token_exchange
SAP_OIDC_SUBJECT_TOKEN_TYPE=...
SAP_OIDC_AUDIENCE=...
SAP_OIDC_ACTOR_TOKEN=...
SAP_OIDC_ACTOR_TOKEN_TYPE=...

# SAML
SAP_SAML_IDP_SSO_URL=https://idp.example/sso
SAP_SAML_IDP_ENTITY_ID=https://idp.example
SAP_SAML_IDP_CERTIFICATES_B64=<base64 of cert 1>,<base64 of cert 2>   # each certificate's text, base64
SAP_SAML_SP_ENTITY_ID=https://h.abap.example
SAP_SAML_ACS_URL=https://h.abap.example/sap/saml2/sp/acs
SAP_SAML_RELAY_STATE=...
SAP_SAML_IDP_INITIATED=true               # true | false
SAP_SAML_CLOCK_SKEW_MS=30000
SAP_SAML_TOKEN_URL=https://uaa.example/oauth/token/alias/...   # saml2_bearer
```

The **secret** keys (read and written by `AbapSessionStore` and `EnvFileSessionStore`, `ABAP_SESSION_VARS`):

```bash
SAP_JWT_TOKEN=<access token>              # or:
SAP_SESSION_COOKIES_B64=<base64 of the Cookie header value>
SAP_EXPIRES_AT=1790000000000              # epoch ms
SAP_REFRESH_TOKEN=<refresh token>
```

`XSUAA_DESTINATION_VARS` and `XSUAA_SESSION_VARS` are the same with `XSUAA_`, the URL under `XSUAA_MCP_URL`. Values with spaces or special characters are written in quotes dotenv reads back unchanged; a value with a line break is refused (certificates are base64-encoded for that reason).

### 2.x session files

A file written by auth-stores 2.x (or auth-broker 3.x) holds means and secret together. 3.0.0 reads it where it is, split by key — nothing is moved:

| 2.x key (ABAP; the XSUAA stores' `XSUAA_*` keys alike) | Role in 3.0.0 | Read by |
|---|---|---|
| `SAP_JWT_TOKEN`, `SAP_SESSION_COOKIES_B64`, `SAP_REFRESH_TOKEN` (and the new `SAP_EXPIRES_AT`) | secret | the session store |
| `SAP_URL`, `SAP_AUTH_TYPE`, `SAP_USERNAME`, `SAP_PASSWORD`, `SAP_SNC_*`, `SAP_UAA_URL`, `SAP_UAA_CLIENT_ID`, `SAP_UAA_CLIENT_SECRET`, `SAP_CLIENT`, `SAP_LANGUAGE` | means | `EnvDestinationStore`, pointed at the same directory |

A session write rewrites only the secret keys, so a 2.x file stays a complete 2.x file. A 2.x `basic` or `snc` file is a complete destination as it is. A 2.x `jwt` or `saml` file states no grant — 2.x never wrote one — so add `SAP_GRANT_TYPE` (by hand, or through `setDestination`).

### BTP / XSUAA stores

```typescript
import {
  XsuaaServiceKeyStore,
  XsuaaSessionStore,
  SafeXsuaaSessionStore,
  EnvDestinationStore,
  XSUAA_DESTINATION_VARS,
} from '@mcp-abap-adt/auth-stores';

const serviceKeyStore = new XsuaaServiceKeyStore('/path/to/service-keys');
// the MCP URL and the grant are means: state them in a destination store
const keyStore = new EnvDestinationStore('/path/to/sessions', {
  variables: XSUAA_DESTINATION_VARS,
  fallback: serviceKeyStore,
});
const sessionStore = new XsuaaSessionStore('/path/to/sessions', logger);
const safeSessionStore = new SafeXsuaaSessionStore(logger);
```

### EnvFileSessionStore (single file)

`EnvFileSessionStore` holds the secret in one given file — the `--env /path/to/.env` case. The means in that file are read by an `EnvDestinationStore` over the file's directory, the destination being the file name without `.env` (`''` for a file named `.env`). A file whose name does not end in `.env` cannot be read that way.

```typescript
import * as path from 'node:path';
import { EnvDestinationStore, EnvFileSessionStore } from '@mcp-abap-adt/auth-stores';

const envPath = '/path/to/.env';
const sessionStore = new EnvFileSessionStore(envPath, logger);
const keyStore = new EnvDestinationStore(path.dirname(envPath));
const destination = path.basename(envPath).replace(/\.env$/, ''); // '' here

const means = await keyStore.getConnectionConfig(destination);
const secret = await sessionStore.loadSession(destination); // the file's secret keys
```

Besides the contract it offers `getToken`, `setToken`, `getRefreshToken`, `setRefreshToken`. 2.x's `getAuthType()` (the type is means), `save()` and `clear()` (the in-memory layer is gone: writes reach the file at once) were removed.

### Directory Configuration

Every directory is a constructor parameter; a file store reads and writes only `<directory>/<destination>.env` (or `.json`) and searches nowhere else.

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
- **`StorageError`** - File read, write or permission error (includes `operation` and `cause`); a session file that exists but cannot be read raises it — only a missing file is `null`
- **`RefusedFieldsError`** (code `INVALID_CONFIG`) - A write carried fields the store does not hold: means given to a session store, a secret given to `EnvDestinationStore` (includes `fields`; the message names fields, never values)

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
  ABAP_DESTINATION_VARS, // means keys of EnvDestinationStore (SAP_*)
  XSUAA_DESTINATION_VARS, // the same, XSUAA_*
  ABAP_SESSION_VARS, // secret keys of AbapSessionStore / EnvFileSessionStore
  XSUAA_SESSION_VARS, // secret keys of XsuaaSessionStore
  // the 2.x tables, unchanged:
  ABAP_AUTHORIZATION_VARS,
  ABAP_CONNECTION_VARS,
  BTP_AUTHORIZATION_VARS,
  BTP_CONNECTION_VARS,
  XSUAA_AUTHORIZATION_VARS,
  XSUAA_CONNECTION_VARS,
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
- **Token formatting**: Tokens are logged as `<redacted, N chars>` — never a character of the token
- **Errors**: Detailed error information with context

**Logging Features**:
- **Token Formatting**: Tokens are logged as `<redacted, N chars>`
- **Structured Logging**: Uses `DefaultLogger` from `@mcp-abap-adt/logger` for proper formatting with icons and level prefixes
- **Log Levels**: Controlled via `LOG_LEVEL` or `AUTH_LOG_LEVEL` environment variable (error, warn, info, debug)

Example output with `DEBUG_STORES=true LOG_LEVEL=debug`:
```
[INFO] ℹ️ [TEST-STORE] Reading service key file: /path/to/TRIAL.json
[DEBUG] 🐛 [TEST-STORE] File read successfully, size: 121 bytes, keys: uaa
[DEBUG] 🐛 [TEST-STORE] Parsed service key structure: hasUaa(true), uaaKeys(url, clientid, clientsecret)
[INFO] ℹ️ [TEST-STORE] Authorization config loaded from /path/to/TRIAL.json: uaaUrl(https://...authentication...), clientId(test-client...)
[DEBUG] 🐛 [TEST-STORE] Session loaded for TRIAL: token(<redacted, 2263 chars>), expiresAt, refreshToken(<redacted, 34 chars>)
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

Integration tests return at once, with a warning, if `test-config.yaml` is not configured or contains placeholder values (the template's). The session write cases write a destination of their own and remove it — they never touch the configured destination's session.

## Architecture

### File Operations

- **Service key stores** read JSON files through `JsonFileHandler`
- **`.env` stores** read with dotenv and write by rewriting only their own keys: every other line — keys of the other role, comments, blank lines — stays byte for byte, so one file may be shared by `EnvDestinationStore` and a session store
- Every write is atomic (a temporary file, then a rename); a new file is created `0600`, an existing one keeps its mode
- A file that exists but cannot be read raises a `StorageError`; only a missing file is "nothing stored"

### Store Implementation

- Key stores implement `IServiceKeyStore` and answer means only; session stores implement `ISessionStore` and hold the session secret only (both contracts from `@mcp-abap-adt/interfaces-auth-broker`)
- Every directory is a constructor parameter; no store searches other locations
- File-based session stores create their directory in the constructor if it is missing
- In-memory stores (`Safe*SessionStore`) do not persist anything to disk
- Nothing a store holds reaches a log line or an error message: tokens are logged as `<redacted, N chars>`, means by field name only

## Dependencies

- `@mcp-abap-adt/interfaces-auth-broker` (^1.0.0) - the store contracts (`IServiceKeyStore`, `ISessionStore`, `IConfig`, `IConnectionConfig`, `DestinationGrant`)
- `@mcp-abap-adt/interfaces-auth-sap` (^2.0.0) - `IAuthorizationConfig`
- `@mcp-abap-adt/interfaces-auth` (^3.0.0) - `STORE_ERROR_CODES`
- `@mcp-abap-adt/interfaces-utils` (^1.1.0) - `ILogger`
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

