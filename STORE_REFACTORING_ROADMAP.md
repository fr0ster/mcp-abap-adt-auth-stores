# Store Refactoring Roadmap

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

#### 5. **BtpSessionStore** (base store)
- 🔧 **Solution**: Similar - add `defaultServiceUrl?: string` for consistency

#### 6. **SafeBtpSessionStore** (in-memory version)
- 🔧 **Solution**: Similar - add `defaultServiceUrl?: string`

## Detailed Implementation Plan

### Phase 1: Update Constructors

#### 1.1. AbapSessionStore
```typescript
constructor(
  directory: string, 
  log?: ILogger,
  defaultServiceUrl?: string  // NEW PARAMETER
)
```

#### 1.2. XsuaaSessionStore
```typescript
constructor(
  directory: string, 
  log?: ILogger,
  defaultServiceUrl?: string  // NEW PARAMETER
)
```

#### 1.3. BtpSessionStore
```typescript
constructor(
  directory: string, 
  log?: ILogger,
  defaultServiceUrl?: string  // NEW PARAMETER
)
```

#### 1.4. Safe Versions (SafeAbapSessionStore, SafeXsuaaSessionStore, SafeBtpSessionStore)
```typescript
constructor(
  log?: ILogger,
  defaultServiceUrl?: string  // NEW PARAMETER
)
```

### Phase 2: Update Session Creation Logic

#### 2.1. setConnectionConfig() - all stores
**Logic**:
```typescript
async setConnectionConfig(destination: string, config: IConnectionConfig): Promise<void> {
  const current = await this.loadRawSession(destination);
  
  if (!current) {
    // Session doesn't exist - create new one
    const serviceUrl = config.serviceUrl || this.defaultServiceUrl;
    
    // For AbapSessionStore: serviceUrl is required
    if (!serviceUrl) {
      throw new Error(`Cannot create session for destination "${destination}": serviceUrl is required. Provide it in config or constructor.`);
    }
    
    const newSession: SessionData = {
      sapUrl: serviceUrl,  // or mcpUrl for XSUAA
      jwtToken: config.authorizationToken || '',
      // ... other fields
    };
    await this.saveSession(destination, newSession);
    return;
  }
  
  // Update existing session
  // ...
}
```

#### 2.2. setAuthorizationConfig() - all stores
**Logic**:
```typescript
async setAuthorizationConfig(destination: string, config: IAuthorizationConfig): Promise<void> {
  const current = await this.loadRawSession(destination);
  
  if (!current) {
    // Session doesn't exist - try to get serviceUrl from connection config or use defaultServiceUrl
    const connConfig = await this.getConnectionConfig(destination);
    const serviceUrl = connConfig?.serviceUrl || this.defaultServiceUrl;
    
    // For AbapSessionStore: serviceUrl is required
    if (!serviceUrl) {
      throw new Error(`Cannot set authorization config for destination "${destination}": session does not exist and serviceUrl is required. Call setConnectionConfig first or provide defaultServiceUrl in constructor.`);
    }
    
    const newSession: SessionData = {
      sapUrl: serviceUrl,  // or mcpUrl for XSUAA
      jwtToken: connConfig?.authorizationToken || '',
      uaaUrl: config.uaaUrl,
      uaaClientId: config.uaaClientId,
      uaaClientSecret: config.uaaClientSecret,
      refreshToken: config.refreshToken,
    };
    await this.saveSession(destination, newSession);
    return;
  }
  
  // Update existing session
  // ...
}
```

### Phase 3: Update Validation

#### 3.1. AbapSessionStore
- In `setConnectionConfig()`: if both `config.serviceUrl` and `defaultServiceUrl` are `undefined` → error
- In `setAuthorizationConfig()`: if session doesn't exist and `defaultServiceUrl` is `undefined` → error

#### 3.2. XsuaaSessionStore
- `serviceUrl` is optional, but if `defaultServiceUrl` is provided, use it

### Phase 4: Update Tests

#### 4.1. Unit Tests
- Tests for creating session with `defaultServiceUrl`
- Tests for creating session without `defaultServiceUrl` (should work as before)
- Tests for errors when `serviceUrl` is required but not provided

#### 4.2. Integration Tests
- Tests with AuthBroker for XSUAA stores with `defaultServiceUrl`
- Tests for AbapSessionStore with `defaultServiceUrl`

### Phase 5: Update Documentation

#### 5.1. README
- Document new `defaultServiceUrl` parameter
- Usage examples for XSUAA stores

#### 5.2. CHANGELOG
- Add entry about breaking change (if needed)
- Or minor change, if parameter is optional

## Implementation Order

1. ✅ **Analysis** (completed)
2. ✅ **Phase 1**: Update constructors (completed)
3. ✅ **Phase 2**: Update session creation logic (completed)
4. ✅ **Phase 3**: Update validation (completed)
5. ⏳ **Phase 4**: Update tests (pending)
6. ⏳ **Phase 5**: Update documentation (pending)

## Implementation Summary

### Completed Changes

All stores have been updated with `defaultServiceUrl` parameter:

1. **AbapSessionStore** ✅
   - Added `defaultServiceUrl?: string` parameter to constructor
   - Updated `setConnectionConfig()` to use `defaultServiceUrl` when `config.serviceUrl` is not provided
   - Updated `setAuthorizationConfig()` to use `defaultServiceUrl` when creating new session
   - Validation: throws error if both `config.serviceUrl` and `defaultServiceUrl` are undefined

2. **SafeAbapSessionStore** ✅
   - Same changes as `AbapSessionStore`

3. **XsuaaSessionStore** ✅
   - Added `defaultServiceUrl?: string` parameter to constructor
   - Updated `setConnectionConfig()` to use `defaultServiceUrl` when `config.serviceUrl` is not provided
   - Updated `setAuthorizationConfig()` to use `defaultServiceUrl` when creating new session
   - `serviceUrl` remains optional (no validation error)

4. **SafeXsuaaSessionStore** ✅
   - Same changes as `XsuaaSessionStore`

5. **BtpSessionStore** ✅
   - Added `defaultServiceUrl?: string` parameter to constructor
   - Updated `setConnectionConfig()` to use `defaultServiceUrl` when `config.serviceUrl` is not provided
   - Updated `setAuthorizationConfig()` to use `defaultServiceUrl` when creating new session
   - `serviceUrl` remains optional (no validation error)

6. **SafeBtpSessionStore** ✅
   - Same changes as `BtpSessionStore`

### Key Implementation Details

- **defaultServiceUrl is only used when creating new sessions**, not when updating existing ones
- For **AbapSessionStore**: `serviceUrl` is required - if not in config and no `defaultServiceUrl`, throws error
- For **XSUAA/BTP stores**: `serviceUrl` is optional - `defaultServiceUrl` is used if provided, otherwise `undefined`
- All changes are **backward compatible** - `defaultServiceUrl` is optional parameter

## Questions for Clarification

1. **Should `defaultServiceUrl` be required for XSUAA stores?**
   - Option A: Optional (can create session without `serviceUrl`)
   - Option B: Required (if used with ABAP)

2. **Should `defaultServiceUrl` be stored in the session?**
   - Option A: No, use only during creation
   - Option B: Yes, store as part of the session

3. **Should AuthBroker be updated to pass `defaultServiceUrl`?**
   - Option A: No, AuthBroker doesn't know about `defaultServiceUrl`
   - Option B: Yes, AuthBroker should know about `defaultServiceUrl` and pass it

4. **Is this a breaking change?**
   - Option A: No, parameter is optional
   - Option B: Yes, if session creation behavior changes

## Usage Examples

### Example 1: XSUAA store with defaultServiceUrl
```typescript
const store = new XsuaaSessionStore(
  './destinations',
  logger,
  'https://my-sap-system.abap.cloud.sap'  // defaultServiceUrl
);

// When creating session, if serviceUrl is not in config, use defaultServiceUrl from constructor
await store.setConnectionConfig('TRIAL', {
  authorizationToken: 'jwt-token-here'
  // serviceUrl not provided, will use from constructor
});
```

### Example 2: AbapSessionStore with defaultServiceUrl
```typescript
const store = new AbapSessionStore(
  './destinations',
  logger,
  'https://my-sap-system.abap.cloud.sap'  // defaultServiceUrl
);

// When creating session via setAuthorizationConfig
await store.setAuthorizationConfig('TRIAL', {
  uaaUrl: 'https://uaa.example.com',
  uaaClientId: 'client-id',
  uaaClientSecret: 'client-secret',
  refreshToken: 'refresh-token'
  // serviceUrl will be taken from defaultServiceUrl
});
```
