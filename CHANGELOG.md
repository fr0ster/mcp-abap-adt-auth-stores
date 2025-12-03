# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2024-12-04

### Added
- Initial release
- BTP stores (BtpServiceKeyStore, BtpSessionStore, SafeBtpSessionStore)
- ABAP stores (AbapServiceKeyStore, AbapSessionStore, SafeAbapSessionStore)
- XSUAA stores (XsuaaServiceKeyStore, XsuaaSessionStore, SafeXsuaaSessionStore)
- Abstract base classes for extending
- Utility functions (pathResolver, constants)
- Service key loaders

### Changed
- Merged `@mcp-abap-adt/auth-stores-btp` and `@mcp-abap-adt/auth-stores-xsuaa` into single package
- Eliminated code duplication in abstract classes and utilities

