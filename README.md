# @mcp-abap-adt/auth-stores

Stores for MCP ABAP ADT auth-broker - BTP, ABAP, and XSUAA implementations.

## Installation

```bash
npm install @mcp-abap-adt/auth-stores
```

## Usage

### BTP Stores (base BTP without sapUrl)

```typescript
import { BtpServiceKeyStore, BtpSessionStore, SafeBtpSessionStore } from '@mcp-abap-adt/auth-stores';

const serviceKeyStore = new BtpServiceKeyStore(['/path/to/service-keys']);
const sessionStore = new BtpSessionStore(['/path/to/sessions']);
// or in-memory
const safeSessionStore = new SafeBtpSessionStore();
```

### ABAP Stores (with sapUrl)

```typescript
import { AbapServiceKeyStore, AbapSessionStore, SafeAbapSessionStore } from '@mcp-abap-adt/auth-stores';

const serviceKeyStore = new AbapServiceKeyStore(['/path/to/service-keys']);
const sessionStore = new AbapSessionStore(['/path/to/sessions']);
// or in-memory
const safeSessionStore = new SafeAbapSessionStore();
```

### XSUAA Stores

```typescript
import { XsuaaServiceKeyStore, XsuaaSessionStore, SafeXsuaaSessionStore } from '@mcp-abap-adt/auth-stores';

const serviceKeyStore = new XsuaaServiceKeyStore(['/path/to/service-keys']);
const sessionStore = new XsuaaSessionStore(['/path/to/sessions']);
// or in-memory
const safeSessionStore = new SafeXsuaaSessionStore();
```

## Store Types

### Service Key Stores
- `BtpServiceKeyStore` - Reads XSUAA service keys for base BTP
- `AbapServiceKeyStore` - Reads ABAP service keys (with nested uaa object)
- `XsuaaServiceKeyStore` - Reads XSUAA service keys

### Session Stores
- `BtpSessionStore` - File-based store for base BTP sessions (uses XSUAA_* env vars)
- `AbapSessionStore` - File-based store for ABAP sessions (uses SAP_* env vars)
- `XsuaaSessionStore` - File-based store for XSUAA sessions (uses XSUAA_* env vars)
- `SafeBtpSessionStore` - In-memory store for base BTP sessions
- `SafeAbapSessionStore` - In-memory store for ABAP sessions
- `SafeXsuaaSessionStore` - In-memory store for XSUAA sessions

## Abstract Classes

For creating custom store implementations:

- `AbstractServiceKeyStore` - Base class for service key stores
- `AbstractJsonSessionStore` - Base class for file-based session stores
- `AbstractSafeSessionStore` - Base class for in-memory session stores

## License

MIT

