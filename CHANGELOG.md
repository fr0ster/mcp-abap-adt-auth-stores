# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0]

The auth chain's new contract majors, Node.js 22 or later, and a stricter
compiler. No store answers, writes or refuses anything differently from 3.3.0.

### Migration (for a 3.x consumer)

- **Be on the new contracts.** 4.0.0 depends on
  `@mcp-abap-adt/interfaces-auth` `^7.5.0`, `@mcp-abap-adt/interfaces-auth-sap`
  `^3.3.0` and `@mcp-abap-adt/interfaces-auth-broker` `^1.3.0`. A consumer
  must be on the same majors — `@mcp-abap-adt/interfaces-auth` 7,
  `@mcp-abap-adt/auth-providers` 6, and the `@mcp-abap-adt/auth-broker`
  release built on them — so that one copy of each contract package is
  installed; a consumer still on `interfaces-auth` 3 / `auth-providers` 5 stays
  on auth-stores 3.
- **Run on Node.js 22, 24 or 26** (see *Changed*).
- **Clearing a refresh token is `refreshToken: ''`.** Unchanged behaviour,
  now stated and pinned: a session write with `refreshToken: ''` removes the
  stored refresh token — also beside a new access token; `refreshToken`
  omitted or `undefined` keeps the one stored. A consumer that obtains a new
  access token without a refresh token, and must not keep using the stored
  one, writes `''`.

### Changed

- **Breaking: the contract packages' new majors.**
  `@mcp-abap-adt/interfaces-auth` `^3.0.0` → `^7.5.0`,
  `@mcp-abap-adt/interfaces-auth-sap` `^2.0.0` → `^3.3.0`,
  `@mcp-abap-adt/interfaces-auth-broker` `^1.2.0` → `^1.3.0`. The compiler
  reports nothing against them: no source change. `IConnectionConfig` still
  declares its optional fields `?: T`, so the `asContract` bridge stays.
- **Breaking: Node.js 22, 24 or 26.** `engines` is `^22 || ^24 || ^26`, the
  versions SAP BTP, Cloud Foundry supports; Node 18 and 20, past their end of
  life, are no longer supported. CI runs on all three.

- **A stricter compiler, the same behaviour.** `tsconfig.json` adds
  `noImplicitReturns`, `noFallthroughCasesInSwitch`, `noImplicitOverride`,
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, for the source
  and the tests alike. No answer, file or error changes: every object a store
  hands out or writes keeps exactly its 3.3.0 own keys — a key present with
  the value `undefined` included (the key stores' `getConnectionConfig` answers
  `sapClient: undefined` for a key without a client, as before) — pinned by a
  test of each object kind.
- **Optional fields that take or hold `undefined` now say so** in the
  declarations: `ParseError.filePath` and `.cause`, `StorageError.cause`,
  `ServiceKeyStoreOptions.grantType` and `.log`,
  `EnvDestinationStoreOptions.fallback`, `.variables` and `.log`, and
  `SecretSessionStore`'s options and protected `log` are `?: T | undefined`.
  Widened only: a consumer compiling with `exactOptionalPropertyTypes` may now
  pass `{ log: undefined }`, which the stores always accepted; reading one of
  these fields was already `T | undefined`.
- **The tests are type-checked.** `npm run test:check` covers `src/__tests__`;
  the build compiles `tsconfig.build.json`, which leaves the tests out of
  `dist`. `npm run lint:check` fails on a warning, and `noExplicitAny` is an
  error outside the tests. CI runs `test:check` and `lint:check` after the
  build.
- **The release workflow** runs on Node.js 22 (it ran on 18) and fails when
  the pushed tag differs from `package.json`'s version.

### Documented

- **`refreshToken: ''` is the operation that clears the stored refresh
  token**, in every session store (`AbapSessionStore`, `XsuaaSessionStore`,
  `EnvFileSessionStore`, `SafeAbapSessionStore`, `SafeXsuaaSessionStore`); a
  test per store pins `''` against omitted and `undefined`. README and the
  store docs say so.

## [3.3.0] - 2026-10-05

Client certificates: an XSUAA x509 service key, and a certificate destination
in an `.env` file, answer `IServiceKeyStore.getClientCertificate`
(`@mcp-abap-adt/interfaces-auth-broker` 1.2.0). Every 3.2.0 answer of
`XsuaaServiceKeyStore` is kept — a key with a secret answers its secret client,
also when it carries a certificate too; a file without the certificate
variables and a variables map written for 3.2.0 answer as before.

### Added

- **`XsuaaServiceKeyStore.getClientCertificate(destination)`.** A key — bare or
  in a `credentials` wrapper — carrying `url`, `clientid`, `certificate`, `key`
  and `certurl` (what XSUAA issues for `{"credential-type": "x509"}`) answers
  `{ uaaUrl, clientId, certificate, key, certUrl }`, the PEM as given (CRLF and
  chains untouched). Both shapes are read: without a `clientsecret` (as our
  BTP trial issued it), `getAuthorizationConfig` answers `null`, so no consumer
  reads the missing secret as a public client; with one (a shape SAP
  documents for x509 credentials), the key offers both clients —
  `getAuthorizationConfig` and `getServiceKey` answer the secret client exactly
  as in 3.2.0, and such a key now **also** answers `getClientCertificate`. The
  consumer chooses which to use; `credential-type` is not read. A key with no
  `certificate` and no `key` answers `null`. A key carrying part of a
  certificate client only (one of `certificate` / `key`, or no `certurl`) is
  refused by `getClientCertificate` with a `ClientCertificateError`
  (`incomplete`), naming the missing fields; its other answers are 3.2.0's. No log line or refusal carries a value of the key.
  The loaders (`loadServiceKey`, `loadXSUAAServiceKey`) and
  `XsuaaServiceKeyParser` do not read x509 keys — they answer as in 3.2.0
  (`null`, or no supported format), so no direct consumer reads a missing
  `clientsecret` as a public client. `AbapServiceKeyStore` is unchanged.
- **`EnvDestinationStore.getClientCertificate(destination)`** and three means
  of its own, the exported `CertificateField`: `uaaClientCertPath`,
  `uaaClientKeyPath`, `uaaCertUrl` — two paths and a URL, never PEM. Variables:
  `SAP_UAA_CLIENT_CERT_PATH`, `SAP_UAA_CLIENT_KEY_PATH`, `SAP_UAA_CERT_URL`
  (`ABAP_DESTINATION_VARS`); `XSUAA_UAA_CLIENT_CERT_PATH`,
  `XSUAA_UAA_CLIENT_KEY_PATH`, `XSUAA_UAA_CERT_URL` (`XSUAA_DESTINATION_VARS`).
  Which variables are set decides, no file read to decide: none → as before;
  all three and no client secret variable → a certificate client
  (`getAuthorizationConfig` `null`; `getClientCertificate` reads the two
  files, with the file's own UAA URL and client id); some but not all, or any
  with the client secret variable → both methods throw. The fallback's
  certificate is asked only when the file states no client — no client secret,
  no client id, none of the three. `setDestination` writes them; writing a
  certificate client removes the client secret variable, writing a secret
  client removes the three. The three keys are optional in
  `DestinationVariables`: a custom map without them supports no certificate
  destination (`null`; a certificate write refused with `InvalidConfigError`),
  and a secret write leaves an unmapped certificate line in the file as it is.
- **`ClientCertificateError`** (code `INVALID_CONFIG`; `reason`: `incomplete`,
  `mixed` or `unreadable`; `variables`: env keys or service key fields) and
  its `ClientCertificateProblem` type. Fixed words naming the destination and
  those names — never a value, a path, a file's content or a certificate.

### Security

- **A malformed service key file no longer leaks what it holds.**
  `AbapServiceKeyStore` and `XsuaaServiceKeyStore` passed a load failure on
  as it came, and Node's `JSON.parse` quotes the input in its message (Node 26:
  `Unexpected token 'M', "{"key":MIIPRIVATE"... is not valid JSON`) — so a
  broken key file put client-secret or private-key bytes into the thrown error
  and the error log. Every method of both stores now refuses a file it cannot
  read or parse with a `ParseError` in fixed words naming the destination and
  the kind of key file (`… the XSUAA service key file of "<destination>"
  cannot be read as JSON`), with no `filePath` and no `cause`; a key the ABAP
  parser refuses likewise (`Failed to parse service key for destination
  "<destination>": not an ABAP service key …`). `getConnectionConfig` of
  `AbapServiceKeyStore` threw a plain `Error` with the parser's message; it
  throws that `ParseError` now. `JsonFileHandler`, the loaders and the parsers
  are unchanged.

### Changed

- `@mcp-abap-adt/interfaces-auth-broker` `^1.2.0` (`IClientCertificate`, the
  optional `IServiceKeyStore.getClientCertificate`).

## [3.2.0] - 2026-10-02

### Changed

- **`EnvDestinationStore` answers a client whenever `uaaClientId` is stated.**
  It answered one only when `uaaUrl`, `uaaClientId` and `uaaClientSecret` were
  all stated, deciding for the consumer whether a client was complete enough
  for a grant. An OIDC client has an issuer (`oidcIssuerUrl`), not a UAA URL,
  and a public client has no secret: both were answered as no client at all.
  Now a field not stated is answered as `''` — not stated — and whoever builds
  the grant decides whether it needs it (`@mcp-abap-adt/auth-broker` 4 counts
  `''` as missing and names the field). A destination without a client id —
  or with an id written as `''`, which 3.1.0 answered when the other two were
  stated — answers no client: a client without an id is none. A 3.x public-client file without the
  `SAP_UAA_CLIENT_SECRET` line is a public client as it is.

## [3.1.0] - 2026-10-02

Two additions the auth-broker 4 needs, both optional: a SAP service key store
answers the grant whoever builds it states, and a session store keeps what its
credential is bound to.

### Added

- **`AbapServiceKeyStore(dir, { grantType?, log? })` and
  `XsuaaServiceKeyStore(dir, { grantType?, log? })`.** A SAP service key cannot
  state which grant a destination uses; whoever builds the store states it, and
  `getConnectionConfig` / `getServiceKey` answer it for every destination with
  a key. Without the option no grant is answered, as in 3.0.0 — nothing is
  inferred. The 3.0.0 form `(dir, log)` keeps working: an object with a
  logger's methods (`console` included) is the logger. A string or other
  non-object, an option the store does not take, a grant it does not know, or
  a logger lacking one of `debug`, `info`, `warn`, `error` (as the option or in
  the 3.0.0 position) is a `TypeError` at construction, naming what was wrong
  and never a value.
  There is **no `serviceUrl` option**: the resource URL is means of the
  destination, stated in an `EnvDestinationStore` with the key store as its
  fallback (an XSUAA key's own `url` is read as before).
  `ServiceKeyStoreOptions` is exported.
- **The session stores keep `issuedFor` and `issuedBy`** (`IConnectionConfig`,
  `@mcp-abap-adt/interfaces-auth-broker` 1.1.0) — the URI of the resource the
  credential was obtained for, and of who issued it to which client — beside
  the credential, as given (neither canonicalised nor judged):
  `AbapSessionStore` and `EnvFileSessionStore` under `SAP_ISSUED_FOR` /
  `SAP_ISSUED_BY`, `XsuaaSessionStore` under `XSUAA_ISSUED_FOR` /
  `XSUAA_ISSUED_BY` (`ABAP_SESSION_VARS.ISSUED_FOR` / `ISSUED_BY`, likewise
  `XSUAA_SESSION_VARS`), `SafeAbapSessionStore` and `SafeXsuaaSessionStore` as
  fields. `saveSession` and `setConnectionConfig` accept them; `loadSession`
  and `getConnectionConfig` answer them while a credential is held. They follow
  the credential: a credential written takes the binding its write gives, and
  one left out (absent or `''`) is cleared; with no credential written, a field
  given sets it, `''` clears it, absent keeps it; with no credential held,
  neither is kept. A non-string is an `InvalidConfigError` naming the field.
  Key stores never answer them; `EnvDestinationStore.setDestination` refuses
  them like any secret field.
- **Files written before 3.1.0** (no binding key) answer, while they hold a
  credential, the binding their writers left beside it — composed, not
  canonicalised: `issuedFor` from `SAP_URL`, with `sap-client=<SAP_CLIENT>`
  when a client is stated; `issuedBy`, for a token only, from `SAP_UAA_URL`
  with `client_id=<SAP_UAA_CLIENT_ID>` when both are stated (the XSUAA store:
  `XSUAA_MCP_URL` + `XSUAA_CLIENT`, `XSUAA_UAA_URL` + `XSUAA_UAA_CLIENT_ID`).
  The parameter is appended with `?`, or `&` after an existing query, its value
  percent-encoded. A binding key present in the file — empty included — is
  read instead of its legacy source.

### Changed

- **A file store writes `*_ISSUED_FOR` and `*_ISSUED_BY` with every
  credential, empty when the write gives none**, and removes them with the
  credential. A session file written by 3.1.0 therefore has two more lines,
  and its binding no longer follows the means keys of a shared file. Through
  the API nothing else changes for a caller that passes neither the options
  nor the fields — except that `loadSession` / `getConnectionConfig` of a file
  written before 3.1.0 now also answer the binding composed above, and the
  refusal of a means write lists the two fields among those a session holds.
- `@mcp-abap-adt/interfaces-auth-broker` `^1.1.0`.

### Remaining risk

A session written before 3.1.0 into a file shared with `EnvDestinationStore`
answers a binding composed from the **current** `SAP_URL` / `SAP_UAA_*`. If
those were edited — by hand or through `setDestination` — before the first
3.1.0 write of the session, or a 3.0.0 store rewrote the token after the means
had moved, the binding answered is one nobody checked. The first credential
3.1.0 writes ends it.

## [3.0.0] - 2026-10-01

The stores are split by the role of the data. A key store (`IServiceKeyStore`)
answers the **means** — what is used to obtain a session secret: the client,
`authType`, `grantType`, a user and password, the SNC, OIDC and SAML settings,
`serviceUrl`, `sapClient`, `language`. A session store (`ISessionStore`) holds
the **secret** that authorizes within a session — `authorizationToken` or
`sessionCookies`, their `expiresAt`, `refreshToken` — and nothing else.

### Breaking

- **Contracts from `@mcp-abap-adt/interfaces-auth-broker` ^1.0.0.** The store
  contracts (`ISessionStore`, `IServiceKeyStore`, `IConfig`,
  `IConnectionConfig`) moved there out of `interfaces-auth-sap`;
  `IAuthorizationConfig` stays in `@mcp-abap-adt/interfaces-auth-sap`, now
  `^2.0.0`.
- **Session stores refuse means.** `saveSession` and `setConnectionConfig` of
  `AbapSessionStore`, `SafeAbapSessionStore`, `XsuaaSessionStore`,
  `SafeXsuaaSessionStore` and `EnvFileSessionStore` take
  `authorizationToken`, `sessionCookies`, `expiresAt` and `refreshToken`
  alone. A write carrying any other field — `serviceUrl`, `authType`,
  `grantType`, `username`, `password`, the `snc*`, `oidc*` and `saml*`
  fields, `sapClient`, `language`, `uaaUrl` / `uaaClientId` /
  `uaaClientSecret`, or a field no store knows — is refused with a
  `RefusedFieldsError` naming the fields (never a value) and writes nothing.
  Refused rather than dropped, so a caller still on the 2.x roles learns of
  it instead of losing what it wrote. A field given as `undefined` is not
  carried.
- **Session stores answer the secret alone.** `loadSession` answers the four
  secret fields (or `null` when there are none); `getConnectionConfig` the
  token or cookies and `expiresAt`. No `serviceUrl`, `authType`, user,
  password, SNC field, client, `sapClient` or `language` is answered, not even
  from a 2.x file that holds them.
- **A session holds no client.** `setAuthorizationConfig` always refuses;
  `getAuthorizationConfig` answers `null`. The refresh token is written
  through `saveSession` and answered by `loadSession`.
- **A session needs no `serviceUrl`.** 2.0.0 required one for every ABAP
  session (a file without `SAP_URL` read as no session, and a write without a
  URL threw `TypeError: Cannot read properties of undefined (reading
  'includes')` in the env writer — measured on 2.0.0 while writing this
  release's tests). The constructors lose `defaultServiceUrl`:
  `AbapSessionStore(directory, log?)`, `SafeAbapSessionStore(log?)`,
  `XsuaaSessionStore(directory, log?)` (was `(directory, defaultServiceUrl,
  log?)`), `SafeXsuaaSessionStore(log?)` (was `(defaultServiceUrl, log?)`).
  A string where the logger goes — a JavaScript caller still passing
  `defaultServiceUrl` — throws a `TypeError` at construction saying so,
  instead of failing later with `this.log?.debug is not a function`.
- **One secret kind at a time.** Writing a token clears stored cookies and
  writing cookies clears the token; `expiresAt` is written and cleared with
  its credential; `''` clears, and clearing the kind not held changes
  nothing; `expiresAt` must be a non-negative whole number of epoch
  milliseconds, what the file stores read back. The session no longer states an `authType`
  (2.0.0's `SAP_AUTH_TYPE` and credential types are means now); the 2.0.0
  refusal of "two credentials and no `authType`" becomes the refusal of a
  token and cookies in one write.
- **The XSUAA stores hold a token**: they refuse cookies, and still refuse a
  session without a token (2.x accepted an empty one).
- **`EnvFileSessionStore`** is a session store over one file like the others:
  `getAuthType()` is removed (the type is means — read it with
  `EnvDestinationStore`), and so are `save()` and `clear()` (the in-memory
  layer is gone; writes reach the file at once). `getToken`, `setToken`,
  `getRefreshToken` and `setRefreshToken` stay.
- **Service key stores** (`AbapServiceKeyStore`, `XsuaaServiceKeyStore`)
  answer `authType: 'jwt'` from `getConnectionConfig` and `getServiceKey` —
  the key holds an OAuth client and nothing else — and **no `grantType`**: a
  SAP service key cannot state which grant a destination uses. They stop
  answering `authorizationToken: ''`: a token is secret.

### Added

- **`EnvDestinationStore`** — an `IServiceKeyStore` over
  `<directory>/<destination>.env` for a destination's means: every means
  field of `IConnectionConfig` and the client, under the 2.x session key names
  plus `SAP_GRANT_TYPE`, `SAP_OIDC_*` and `SAP_SAML_*`
  (`ABAP_DESTINATION_VARS`), or the `XSUAA_*` equivalents
  (`XSUAA_DESTINATION_VARS`, the URL under `XSUAA_MCP_URL`). A 2.x session
  file is a readable destination as it is; nothing is inferred (a file without
  `SAP_AUTH_TYPE` states no type). `uaaClientSecret: ''` is a public client,
  written as an empty value and answered as `''`. An optional `fallback`
  `IServiceKeyStore` fills, field by field, what the file leaves out — a SAP
  service key supplies the client and URL, the file the grant. It answers no
  secret, from the file or the fallback. `setDestination` (outside the
  read-only contract) sets the given fields, removes `null` ones and leaves
  the rest; it refuses secret or unknown fields (`RefusedFieldsError`) and a
  malformed value — an unknown `authType` or `grantType`, say — naming the
  field (`InvalidConfigError`). `deleteDestination` removes the means keys.
  Its directory is a constructor parameter with no default.
  `EnvDestinationStore.forFile(path, options)` reads and writes one given
  file — a hand-written `--env` file, whatever its name (`.env.dev`) — for
  every destination name, as `EnvFileSessionStore` does.
- **`expiresAt`** is kept with the token or cookies (`SAP_EXPIRES_AT`,
  `XSUAA_EXPIRES_AT`, epoch milliseconds).
- `RefusedFieldsError` (code `INVALID_CONFIG`, `fields`); the key tables
  `ABAP_SESSION_VARS`, `XSUAA_SESSION_VARS`, `ABAP_DESTINATION_VARS`,
  `XSUAA_DESTINATION_VARS`; the types `DestinationMeans`,
  `DestinationVariables`, `EnvDestinationStoreOptions`, `MeansField`.

### Changed

- **A file store touches only its own keys.** A session write sets or removes
  the secret keys and leaves every other line — the means of a 2.x file, the
  keys `EnvDestinationStore` writes, unknown keys, comments, blank lines —
  byte for byte. 2.x rewrote the whole file: it wrote `SAP_URL` and
  `SAP_AUTH_TYPE`, cleared the other types' credential keys, dropped comments,
  and the XSUAA writer deleted the 1.x `SAP_URL`, `SAP_JWT_TOKEN`,
  `SAP_REFRESH_TOKEN` and `SAP_UAA_*` keys. So `EnvDestinationStore` and a
  session store may share one directory — each keeps the other's keys, in
  either order — and a 2.x file stays a complete 2.x file.
- `deleteSession` of a file store removes the secret keys, and the file only
  when no key is left — the means in a shared file stay.
- **Keys are found where dotenv finds them.** A write locates each key with
  dotenv's own line pattern — `KEY=value`, `export KEY=value`, `KEY: value`,
  a quoted value spanning lines, duplicates — and keeps every other byte, CRLF
  line ends included. The result is parsed back before it replaces the file;
  a key that would not read as intended refuses the write (`StorageError`
  naming the file and the key) and leaves the file alone. The stores write
  one key per line.
- Values that need quoting are written in quotes dotenv reads back unchanged
  (single quotes first, then backticks, then double quotes). A value with a
  line break, or containing `'`, `` ` `` and `"` together, is refused naming
  its key.
- **File mode.** A new file is created `0600`; an existing one is narrowed to
  its owner's bits on every rewrite (`mode & 0o600` — a 2.x `0644` file
  becomes `0600`), never widened.
- **Concurrent writers lose nothing.** Writes for one destination run one
  after another within a store instance. Every writer of a `.env` file — a
  session store's secret, `EnvDestinationStore`'s means, `deleteSession`,
  `deleteDestination` — holds an advisory lock (`<file>.lock`, created
  exclusively) from its read to its rename, waiting up to 10 s for a live
  holder and taking over a lock older than 30 s; it writes through a
  temporary file of its own (`<file>.<pid>.<random>.tmp`, created
  exclusively, removed on failure). 2.x used one fixed `<file>.tmp`: two
  writers of a shared file could empty each other's copy and lose a key set
  for good (found in review, reproduced with two processes).
- **Destination names** containing `/`, `\` or `..` are refused
  (`InvalidConfigError`) by `AbapSessionStore`, `XsuaaSessionStore` and
  `EnvDestinationStore`, for reads and writes: they reached outside the
  directory.
- A malformed `SAP_EXPIRES_AT` / `XSUAA_EXPIRES_AT` is reported by reads and
  replaced by the next write instead of blocking every write.

### Removed

- The internal 2.x credential modules (`abapCredential`, `envLoader`,
  `tokenStorage`, `xsuaaEnvLoader`, `xsuaaTokenStorage`) — none was exported.

### Migration (for a 2.x consumer)

- **Write means through a key store, read them from one.** Whatever wrote the
  URL, the type, a user and password, the SNC settings or the client into a
  session store (`setConnectionConfig`, `setAuthorizationConfig`,
  `saveSession`) now gets a `RefusedFieldsError`. Write them with
  `EnvDestinationStore#setDestination` instead, and read them with its
  `getConnectionConfig` / `getAuthorizationConfig` (or from a SAP service key
  store). Write only the secret to the session store.
- **auth-broker 3.x** writes means into the session (`persist`) and reads them
  from it first: it does not work with 3.0.0 session stores. Stay on
  auth-stores 2.x with broker 3.x; auth-broker 4.0.0 reads the means from the
  key store and writes the secret alone.
- **CLIs (`mcp-auth`, `mcp-sso`, `generate-env-from-service-key` of
  auth-broker 3.x)** write the client into the session: they need 2.x, or the
  4.0 CLI (`@mcp-abap-adt/auth-broker-cli`), which writes means through
  `EnvDestinationStore`.
- **Existing session files need no move.** Point an `EnvDestinationStore` at
  the sessions directory: it reads the means keys of each 2.x file, and the
  session store its secret keys. A `basic` or `snc` file is complete as it
  is; a `jwt` or `saml` file states no grant (2.x never wrote one) — add
  `SAP_GRANT_TYPE` (by hand, or `setDestination(name, { grantType })`).
- **A service key alone states no grant.** Compose
  `new EnvDestinationStore(dir, { fallback: new AbapServiceKeyStore(keysDir) })`
  and write the grant to the destination file.
- **Constructors:** drop `defaultServiceUrl` (`new XsuaaSessionStore(dir,
  url, log)` → `new XsuaaSessionStore(dir, log)`; `new
  SafeXsuaaSessionStore(url, log)` → `new SafeXsuaaSessionStore(log)`). The
  URL is means: state it in the key store.
- **Imports:** take `ISessionStore`, `IServiceKeyStore`, `IConfig`,
  `IConnectionConfig` from `@mcp-abap-adt/interfaces-auth-broker`,
  `IAuthorizationConfig` from `@mcp-abap-adt/interfaces-auth-sap` ^2.0.0.
- **`EnvFileSessionStore#getAuthType()`** is gone: read `authType` from
  `EnvDestinationStore.forFile(samePath).getConnectionConfig(name)`.
- **A 3.x public-client file** (written by `mcp-sso`, which wrote
  `__public__` and then stripped the line) has no `SAP_UAA_CLIENT_SECRET`, so
  `EnvDestinationStore` answers no client for it. Add the empty line
  `SAP_UAA_CLIENT_SECRET=` (or `setDestination(name, { uaaClientSecret: '' })`),
  or run the 4.0 CLI command again.
- **A 1.x file without `SAP_AUTH_TYPE`** states no type; with a service key
  fallback it takes the key's `authType: 'jwt'` beside the file's user and
  password. State `SAP_AUTH_TYPE` (and `SAP_GRANT_TYPE` for a token
  destination) in such files.

### Migration of the known consumers

Each of these is on auth-stores 1.x/2.x with auth-broker 3.x today and stays
there until it moves to auth-broker 4.0 (whose own range is `^3.0.0`); none
can take 3.0.0 alone. What each must change when it moves:

- **`mcp-abap-adt` (the server)**, `src/lib/auth/brokerFactory.ts`:
  - `sessionStore.getAuthType()` (`:649`, the `--env` path) is gone: build
    `EnvDestinationStore.forFile(envFilePath)` as the key store beside
    `EnvFileSessionStore(envFilePath)`, and read the type from it.
  - Seeding sessions from service keys through `setConnectionConfig` /
    `setAuthorizationConfig` (`:519-562`) is refused: write `authType` and
    `grantType` (and nothing else the key already answers) through an
    `EnvDestinationStore` with the service key store as its fallback.
  - `new BtpSessionStore(sessionsDir, '', storeLogger)` (`:425`) and
    `new SafeBtpSessionStore('', storeLogger)` (`:445`) throw the
    constructor `TypeError`: drop the `''`.
- **`mcp-abap-adt-proxy`**: `new XsuaaSessionStore(firstSessionPath, '')` and
  `new SafeXsuaaSessionStore('')` (`src/lib/stores.ts:181-182`) throw the
  constructor `TypeError`. Its `TargetUrlSessionStore`
  (`src/proxy/targetUrlSessionStore.ts`) passes the broker's 3.x writes —
  which carry `serviceUrl` and the client — through to the inner store, which
  now refuses them. It stays on auth-stores 2.x (or 1.x) with broker 3.x until
  it migrates; then the target URL is means a key store answers.
- **`mcp-calm-server`**: `createSessionStore` (`src/server/auth/buildBroker.ts:70`)
  calls `new XsuaaSessionStore(directory, '', logger)` — the constructor
  `TypeError`. `buildLegacyShimStore` (`src/server/auth/legacyEnvShim.ts:17-18`)
  writes the client into a `SafeXsuaaSessionStore` with
  `setAuthorizationConfig`, which 3.0.0 refuses. 3.0.0 ships no in-memory key
  store (decision D6: the file store only), so such a shim needs a small
  `IServiceKeyStore` of calm's own that answers the three `CALM_UAA_*` values
  (or an `EnvDestinationStore` over a file it writes).

## [2.0.0] - 2026-09-30

### Breaking

- **Contracts move to `@mcp-abap-adt/interfaces-auth` ^3.0.0 and
  `@mcp-abap-adt/interfaces-auth-sap` ^1.1.0.** Types from interfaces-auth 2.x
  and interfaces-auth-sap 1.0.x no longer mix with this package: a consumer on
  the new contracts must not end up with a second copy of the old ones.
  **Migration:** bump both contract packages to the versions above alongside
  this one. Nothing in the stores' own API was removed. Session files written
  by 1.x keep working; files written by 2.0.0 carry `SAP_AUTH_TYPE`, which a
  1.x reader ignores.

### Added

- **`authType` is kept explicitly.** `AbapSessionStore` writes
  `SAP_AUTH_TYPE` (`basic`, `jwt`, `saml` or `snc`) on every save that carries
  a credential — the declared `authType`, or the type the credential implies —
  and reads it back; `SafeAbapSessionStore` records the type the same way. A
  save with neither a type nor a credential (a refresh token alone) leaves the
  credential and `SAP_AUTH_TYPE` as they are. When `SAP_AUTH_TYPE` is present
  it wins over inference; a file without it is inferred as before (cookies:
  `saml`; username and password with an empty token: `basic`; token: `jwt`).
- **SNC sessions.** Both ABAP session stores write and read `sncPartnerName`,
  `sncQop`, `sncLib` and `sncMyName` (`SAP_SNC_PARTNERNAME`, `SAP_SNC_QOP`,
  `SAP_SNC_LIB`, `SAP_SNC_MYNAME`, in `ABAP_CONNECTION_VARS`).
  `getConnectionConfig` answers an `snc` session with `sncPartnerName`
  (required) and the optional three, no token or password; `loadSession`
  returns them too. An `snc` write clears the other modes' credentials, and
  they clear the SNC keys. **SNC is never inferred**: there are no SNC sessions
  from before 2.0.0, so a session is `snc` only when `authType: 'snc'` is
  declared; `sncPartnerName` without it is not a credential.
- **One rule for `setConnectionConfig` in both ABAP session stores.** A call
  of the session's current type (declared, or carrying only that type's
  fields) updates field by field — `{ password }` keeps the username,
  `{ sncQop }` keeps the partner name, and a field given as `''` clears it
  (`{ authorizationToken: '' }` clears the token); a call of another type replaces the
  credential and drops the other types' fields; a call with no credential
  (a language, a client) leaves it as it was.

### Changed

- **A save or update carrying more than one credential and no `authType` is
  refused.** A session holds one credential; the stores no longer guess which
  one a config with, say, a token and a username and password meant (1.x
  `AbapSessionStore.saveSession` stored `basic` and dropped the token, while
  `SafeAbapSessionStore` answered `jwt`). Declare `authType`, and the store
  takes that type's fields. Reading a file without `SAP_AUTH_TYPE` is inferred
  as in 1.x.

### Fixed

- **`AbapSessionStore.setConnectionConfig` keeps `username`, `password` and
  `authType`.** 1.2.4 ignored a username and password given to it: a new
  session was written without them (`getConnectionConfig` answered `null`),
  and an existing jwt session stayed jwt. A basic session could not be created
  or updated through the contract. (A call that carries no credential kept the
  token, the basic credentials and the cookies in 1.2.4 as it does now.)
- **`SafeAbapSessionStore.saveSession` accepts a basic, SAML or SNC session
  without a token** — it threw without one — and keeps `sessionCookies`, which
  it dropped. `loadSession` returns `username`, `password`, `authType` and the
  SNC fields.
- **`SafeAbapSessionStore` holds one credential per session.** A write of
  another type kept the previous type's fields — cookies set on a jwt session
  left the token beside them in 1.2.4, and `loadSession` returned both — and
  an update could never clear a token (`authorizationToken: ''` kept the old
  one). The other types' fields now go, and an empty token clears it.
- **A jwt session saved as basic no longer keeps its token.**
  `AbapSessionStore` cleared `SAP_JWT_TOKEN` on a basic write only when the
  write itself carried a token: in 1.2.4 a jwt file saved with a username and
  password kept `SAP_JWT_TOKEN` and still read back as jwt. Every write of one
  type now clears the other types' keys.

### Documentation

- README: `EnvFileSessionStore` supports basic and JWT only (not SAML) and
  writes `SAP_JWT_TOKEN` / `SAP_REFRESH_TOKEN` back to its file (it is not
  read-only); the dependencies are named with their versions; the session
  stores use `envLoader` / `tokenStorage`, not `EnvFileHandler`; the
  `SAP_AUTH_TYPE` and `SAP_SNC_*` keys and the snc session shape are
  documented; the logger import names `interfaces-utils`.
- `AbapSessionStore` and `XsuaaSessionStore` header comments no longer claim
  search paths: no store uses `resolveSearchPaths`.

## [1.2.4] - 2026-09-27

### Fixed

- **An unreadable session file is an error, not an absent session.**
  `AbapSessionStore` and `XsuaaSessionStore` caught every failure of the env
  loader and answered `null`, so a session file the process may not read
  looked like no session at all: auth-broker then asked for a new login or
  reported a missing field, and neither the file nor its error was named.
  `loadSession`, `getConnectionConfig`, `getAuthorizationConfig` and the
  writes that read the file first now raise a `StorageError`
  (`code: STORAGE_ERROR`, `operation: 'read'`) naming the destination, with
  the loader's error as `cause`. A missing file is still `null` — and only a
  missing one: the loaders no longer check with `fs.existsSync`, which
  answered false for a file in a directory the process may not enter, so an
  untraversable sessions folder read as "no session" too. They read the file
  and answer `null` for `ENOENT` alone (found in review). A file that reads but is not a
  session (no `SAP_URL`, no token) is still treated as none. auth-broker
  3.0.1 passes a `STORAGE_ERROR` on to its caller; before it, the broker
  swallowed store errors too. Measured: a mode-000 session file answered
  `null` on 1.2.3 and raises on this release, for both stores.

## [1.2.3] - 2026-09-26

### Fixed

- **An XSUAA session without a client secret keeps its refresh token.**
  `XsuaaSessionStore.loadSession` and `SafeXsuaaSessionStore.loadSession` took
  the authorization fields from `getAuthorizationConfig`, which answers only a
  complete config — URL, client ID and secret — and `null` otherwise. A
  session holding a refresh token but no secret therefore loaded without its
  refresh token, and the next expiry meant a new login. auth-broker 3.0.0 is
  that case: it keeps the client secret in the service key and writes only the
  tokens to the session. Measured on 1.2.2: the refresh token was on disk and
  `loadSession` returned none. `loadSession` now reads `uaaUrl`,
  `uaaClientId`, `uaaClientSecret` and `refreshToken` from the session each on
  its own, as the ABAP stores always did. `getAuthorizationConfig` is
  unchanged: all three fields or `null`.

## [1.2.2] - 2026-09-26

### Security

- **No token reaches a log line.** `formatToken` returned a token of 50
  characters or fewer whole, and a longer one's first and last 25 characters.
  UAA and XSUAA refresh tokens are opaque and about 34 characters, so
  `AbapSessionStore`, `XsuaaSessionStore`, their `Safe*` variants and the env
  token storage logged the refresh token in full, at `info`, on every session
  save and load, and 50 characters of every access token. A log line now
  carries only `<redacted, N chars>`. Measured: an XSUAA login on the trial
  returns a 34-character refresh token. **Anyone who shipped logs from an
  earlier version at `info` or `debug` should treat the refresh tokens in
  them as exposed and revoke them.** The same leak was closed in
  auth-providers 4.1.2 and in auth-broker.

## [1.2.1] - 2026-09-26

### Changed

- **`@mcp-abap-adt/interfaces-auth` `^2.0.1` and `-auth-sap` `^1.0.1`.** The
  one break in `interfaces-auth` 2 is `AssertionContext.expectedInResponseTo`
  becoming optional, which only an `IAssertionValidator` implementer sees; no
  file here names it. `-auth-sap` 1.0.1 is the release that accepts `-auth` 2 —
  with 1.0.0 an install carried a second, private copy of `-auth` 1.x under it.
- **`dotenv` `^18.0.4`.** 18.0.0 removed `.env.vault`, preloading and the
  console tips, and added a CLI; this package calls `dotenv.parse` alone, which
  none of that touches. No new transitive dependencies.
- Development: `js-yaml` `^5.4.2`, which ships its own declarations, so
  `@types/js-yaml` is dropped. `typescript` stays on 5 — `ts-jest` 29 accepts
  `<7` only.

## [1.2.0] - 2026-09-24

### Changed

- **The contracts come from the packages that declare them, not from the deleted
  facade.** `@mcp-abap-adt/interfaces@^5.0.0` is replaced by
  `@mcp-abap-adt/interfaces-auth-sap@^1.0.0`,
  `@mcp-abap-adt/interfaces-auth@^1.2.0` and
  `@mcp-abap-adt/interfaces-utils@^1.1.0`, and 21 files were repointed.

  Which name went where was resolved from each installed package's
  `dist/index.d.ts`, not from a list written by hand:

  | from | names |
  |---|---|
  | `interfaces-auth-sap` | `IServiceKeyStore`, `ISessionStore`, `IConfig`, `IConnectionConfig`, `IAuthorizationConfig` — a store of credentials for an SAP or BTP system |
  | `interfaces-auth` | `STORE_ERROR_CODES`, `StoreErrorCode` — the failure vocabulary, which means the same off SAP |
  | `interfaces-utils` | `ILogger` |

  **Why now.** `@mcp-abap-adt/interfaces` is deleted as of its 52.0.0; npm still
  serves 51.0.0, so nothing was broken, but no contract change reaches this
  package until it moves. This package was pinned at facade major 5 while the
  facade passed 51 — not churn but a freeze, because one step forward cost it
  every other package's history. Of the 8 names it imports, **none is an ADT
  contract**, which is what the split was for.

- **`@mcp-abap-adt/logger@^0.4.0`** (was `^0.1.4`). 0.1.4 declares the facade, so
  it put a copy of the deleted package in this tree however clean the direct
  dependencies were. Checked after installing: **no `@mcp-abap-adt/interfaces`
  anywhere in `node_modules`**, and no `"link": true` in the lockfile.

- Documentation: the README described the interfaces as coming from the facade in
  three places and imported `STORE_ERROR_CODES` from it in an example. It now
  names each contract package, and says the facade is deleted rather than
  deprecated — the distinction matters to a reader deciding what to install.

## [1.1.0] - 2026-09-03

### Licence

- **This package is now `LGPL-3.0-only`.** It was MIT up to and including 1.0.4, and
  those versions stay MIT — a licence change is not retroactive, and anyone
  already using 1.0.4 under MIT keeps that grant for 1.0.4.

  The library licence of the GNU family, chosen for what it does *not* ask:
  linking it into your own program — importing it, as every consumer of an npm
  package does — does not put your program under the LGPL. What it asks is that
  changes to this library stay free and that your users can substitute their own
  build of it.

  Both texts ship in the package: `LICENSE` is the LGPL, `COPYING` is the GPL it
  is written on top of. The LGPL is a set of additional permissions over the GPL,
  so it cannot be read without both.

  Copyright © 2025–2026 Oleksii Kyslytsia.


## [1.0.4] - 2026-03-14

### Changed
- **Dependencies**: Updated `@mcp-abap-adt/interfaces` to `^5.0.0`, `dotenv` to `^17.3.1`, `@biomejs/biome` to `^2.4.7`, `@types/node` to `^25.5.0`, `jest` to `^30.3.0`.
- Added `jest-util` as dev dependency (required by `ts-jest@29` with `jest@30`).

## [1.0.3] - 2026-03-14

### Fixed
- **EnvFileSessionStore**: Auto-detect JWT auth type when `SAP_JWT_TOKEN` is present in `.env` file, even without explicit `SAP_AUTH_TYPE=jwt`. Previously defaulted to `basic`, causing "Basic authentication requires SAP_CLIENT" errors for cloud systems using `--env-path`.

## [1.0.2] - 2026-02-12

### Fixed
- Service key JSON loading now tolerates `cf service-key` output (leading text) and unwraps `credentials` wrapper for XSUAA keys.
- Added XSUAA service key parsing tests for both direct JSON and `credentials`-wrapped formats.

## [1.0.0] - 2026-02-10

### Added
- ABAP session stores now support SAML session cookies (stored as base64 in env files).
- Exports: `SamlSessionStore` and `SafeSamlSessionStore` aliases for ABAP stores.
- Tests for SAML cookie storage and connection config handling.

### Fixed
- Persist SAML session cookies in file-backed and in-memory ABAP session stores.

## [1.0.1] - 2026-02-10

### Added
- GitHub Actions release workflow.

## [0.2.10] - 2025-12-25

### Changed
- **Logging Improvements**: Enhanced logging for better debugging and readability
  - **Token Formatting**: Tokens are now logged in truncated format (start...end) instead of just length
    - Example: `token(2263 chars, eyJ0eXAiOiJKV1QiLCJqaWQiO...Q5ti7aYmEzItIDuLp7axNYo6w)`
    - Applied to all stores: `AbapSessionStore`, `XsuaaSessionStore`, `SafeAbapSessionStore`, `SafeXsuaaSessionStore`
    - Applied to storage functions: `tokenStorage.ts`, `xsuaaTokenStorage.ts`
  - **Structured Logging**: Replaced `console.log/info/warn/error` with `DefaultLogger` from `@mcp-abap-adt/logger`
    - Proper formatting with icons and level prefixes (ℹ️, 🐛, ⚠️, ❌)
    - Respects `LOG_LEVEL` or `AUTH_LOG_LEVEL` environment variable
    - Consistent logging format across all packages
  - **Environment Variable Names**: Added short names for debug flags (backward compatible)
    - `DEBUG_STORES=true` (short) or `DEBUG_AUTH_STORES=true` (long)
    - Both names are supported for backward compatibility

### Added
- **Formatting Utilities**: Added `formatting.ts` utility module
  - `formatToken()` - Formats tokens as `start...end` for secure logging
  - `formatExpirationDate()` - Formats timestamps to readable date/time format (ready for future use)
- **Logger Package Dependency**: Added `@mcp-abap-adt/logger` to devDependencies
  - Required for `DefaultLogger` and `getLogLevel()` utilities
  - Added `pino` and `pino-pretty` to devDependencies to support PinoLogger initialization

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
