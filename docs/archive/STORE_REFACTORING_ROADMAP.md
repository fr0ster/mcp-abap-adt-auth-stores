# Store Refactoring Roadmap

**Status**: ✅ **COMPLETED** - Implementation finished in version 0.2.0 (2025-12-08)

## Problem

### Current Situation:
1. **Session Structure**:
   - **Required field**: `SAP_URL` (serviceUrl)
   - **Optional fields**:
     - `SAP_JWT_TOKEN` (jwtToken/authorizationToken)
     - `SAP_REFRESH_TOKEN` (refreshToken)
     - `SAP_UAA_URL` (uaaUrl)
     - `SAP_UAA_CLIENT_ID` (uaaClientId)
     - `SAP_UAA_CLIENT_SECRET` (uaaClientSecret)

2. **XSUAA Stores Problem**:
   - For XSUAA service keys, **cannot obtain `SAP_URL`** from the service key
   - But `AbapSessionStore` requires `sapUrl` as a required field
   - Currently, session is created via `saveSession()` or `setConnectionConfig()`, which expect `serviceUrl` in the configuration

3. **Session Creation Logic**:
   - Session is created when `saveSession()` or `setConnectionConfig()` is called
   - Data is taken from `IConfig`, which is passed from AuthBroker
   - AuthBroker tries to get `serviceUrl` from `serviceKeyStore.getConnectionConfig()`, but for XSUAA this may be `undefined`

## Solution

### General Approach:
**Everything that cannot be obtained from the service key must come from the store constructor parameters.**

### Specific Changes:

#### 1. **AbapSessionStore** (already has `sapUrl` as required)
- ✅ **Current state**: `sapUrl` is already required
- ⚠️ **Problem**: If `serviceUrl` is not in the service key, session cannot be created
- 🔧 **Solution**: 
  - Add optional parameter `defaultServiceUrl?: string` to constructor
  - When creating session via `setConnectionConfig()`, use `defaultServiceUrl` if `config.serviceUrl` is not provided
  - When creating session via `setAuthorizationConfig()`, use `defaultServiceUrl` if session doesn't exist

#### 2. **XsuaaSessionStore** (doesn't have required `sapUrl`)
- ✅ **Current state**: `mcpUrl` (serviceUrl) is optional
- ⚠️ **Problem**: If need to use with `AbapSessionStore`, then `sapUrl` must be required
- 🔧 **Solution**: 
  - Add optional parameter `defaultServiceUrl?: string` to constructor
  - When creating session, use `defaultServiceUrl` if `config.serviceUrl` is not provided
  - This will allow XSUAA stores to work with ABAP sessions

#### 3. **SafeAbapSessionStore** (in-memory version)
- 🔧 **Solution**: Similar to `AbapSessionStore` - add `defaultServiceUrl?: string`

#### 4. **SafeXsuaaSessionStore** (in-memory version)
- 🔧 **Solution**: Similar to `XsuaaSessionStore` - add `defaultServiceUrl?: string`

#### 5. **BtpSessionStore** (base BTP, same as XSUAA)
- 🔧 **Solution**: Similar to `XsuaaSessionStore` - add `defaultServiceUrl?: string`

#### 6. **SafeBtpSessionStore** (in-memory version)
- 🔧 **Solution**: Similar to `BtpSessionStore` - add `defaultServiceUrl?: string`

## Implementation Details

### Constructor Signatures

#### AbapSessionStore
```typescript
constructor(directory: string, log?: ILogger, defaultServiceUrl?: string)
```
- `defaultServiceUrl` is **optional** (can be obtained from ABAP service key)
- Used when creating new session if `config.serviceUrl` is not provided

#### SafeAbapSessionStore
```typescript
constructor(log?: ILogger, defaultServiceUrl?: string)
```
- `defaultServiceUrl` is **optional** (can be obtained from ABAP service key)
- Used when creating new session if `config.serviceUrl` is not provided

#### XsuaaSessionStore
```typescript
constructor(directory: string, defaultServiceUrl: string, log?: ILogger)
```
- `defaultServiceUrl` is **required** (cannot be obtained from XSUAA service key)
- Used when creating new session if `config.serviceUrl` is not provided

#### SafeXsuaaSessionStore
```typescript
constructor(defaultServiceUrl: string, log?: ILogger)
```
- `defaultServiceUrl` is **required** (cannot be obtained from XSUAA service key)
- Used when creating new session if `config.serviceUrl` is not provided

#### BtpSessionStore
```typescript
constructor(directory: string, defaultServiceUrl: string, log?: ILogger)
```
- `defaultServiceUrl` is **required** (cannot be obtained from BTP service key)
- Used when creating new session if `config.serviceUrl` is not provided

#### SafeBtpSessionStore
```typescript
constructor(defaultServiceUrl: string, log?: ILogger)
```
- `defaultServiceUrl` is **required** (cannot be obtained from BTP service key)
- Used when creating new session if `config.serviceUrl` is not provided

### Session Creation Logic

#### setConnectionConfig()
```typescript
async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void>
```

**For new sessions:**
1. Check if session exists
2. If not exists:
   - For ABAP: Use `config.serviceUrl || this.defaultServiceUrl` (throw error if both are missing)
   - For XSUAA/BTP: Use `config.serviceUrl || this.defaultServiceUrl` (always has defaultServiceUrl)
3. Create new session with `serviceUrl`/`mcpUrl`

**For existing sessions:**
- Update only fields provided in `config`
- Do NOT use `defaultServiceUrl` to modify existing `mcpUrl`/`serviceUrl`
- Only update if `config.serviceUrl` is explicitly provided

#### setAuthorizationConfig()
```typescript
async setAuthorizationConfig(destination: string, config: IAuthorizationConfig): Promise<void>
```

**For new sessions:**
1. Check if session exists
2. If not exists:
   - For ABAP: Try to get `serviceUrl` from existing connection config, or use `this.defaultServiceUrl` (throw error if both are missing)
   - For XSUAA/BTP: Use `this.defaultServiceUrl` (always has defaultServiceUrl)
3. Create new session with `serviceUrl`/`mcpUrl` and authorization config

**For existing sessions:**
- Update only authorization fields
- Do NOT modify `mcpUrl`/`serviceUrl` (preserve existing value)

## Implementation Status

### ✅ Completed (Version 0.2.0)

- [x] **AbapSessionStore**: Added optional `defaultServiceUrl` parameter
- [x] **SafeAbapSessionStore**: Added optional `defaultServiceUrl` parameter
- [x] **XsuaaSessionStore**: Added required `defaultServiceUrl` parameter (breaking change)
- [x] **SafeXsuaaSessionStore**: Added required `defaultServiceUrl` parameter (breaking change)
- [x] **BtpSessionStore**: Added required `defaultServiceUrl` parameter (breaking change)
- [x] **SafeBtpSessionStore**: Added required `defaultServiceUrl` parameter (breaking change)
- [x] **Session Creation Logic**: Updated to use `defaultServiceUrl` when creating new sessions
- [x] **Session Update Logic**: Fixed to not use `defaultServiceUrl` when updating existing sessions
- [x] **Comprehensive Logging**: Added detailed logging throughout all session stores
- [x] **loadEnvFile Fix**: Fixed validation to allow empty string for `jwtToken`
- [x] **Tests**: Updated all tests to reflect new constructor signatures
- [x] **Documentation**: Updated CHANGELOG and README with migration guide

## Key Principles

1. **Parameters that cannot be obtained from service key must be constructor parameters**
   - For XSUAA/BTP: `defaultServiceUrl` is **required** (cannot be obtained from service key)
   - For ABAP: `defaultServiceUrl` is **optional** (can be obtained from service key)

2. **Parameters that can be obtained from service key can be optional constructor parameters**
   - For ABAP: `defaultServiceUrl` is **optional** (can be obtained from ABAP service key)

3. **defaultServiceUrl is used only when creating new sessions**
   - Never used to modify existing sessions
   - Only used if `config.serviceUrl` is not provided

4. **Separation of concerns**
   - ABAP stores handle ABAP-specific logic (with `sapUrl`)
   - XSUAA stores handle XSUAA-specific logic (without `sapUrl`, but with `mcpUrl`)
   - BTP stores handle base BTP logic (same as XSUAA)

## Testing

All changes have been tested:
- ✅ Unit tests for all store types
- ✅ Integration tests with real files
- ✅ Broker usage tests (simulating AuthBroker flow)
- ✅ Edge cases (empty tokens, missing serviceUrl, etc.)

## Migration Notes

See CHANGELOG.md version 0.2.0 for detailed migration guide with code examples.
