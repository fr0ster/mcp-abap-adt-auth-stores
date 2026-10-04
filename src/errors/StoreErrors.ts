/**
 * Store error codes and typed error classes
 */

import type { StoreErrorCode } from '@mcp-abap-adt/interfaces-auth';
import { STORE_ERROR_CODES } from '@mcp-abap-adt/interfaces-auth';

/**
 * Base error class for all store errors
 */
export class StoreError extends Error {
  public readonly code: StoreErrorCode;

  constructor(message: string, code: StoreErrorCode) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
    Object.setPrototypeOf(this, StoreError.prototype);
  }
}

/**
 * Error thrown when a file is not found
 */
export class FileNotFoundError extends StoreError {
  public readonly filePath: string;

  constructor(filePath: string, message?: string) {
    super(
      message || `File not found: ${filePath}`,
      STORE_ERROR_CODES.FILE_NOT_FOUND,
    );
    this.name = 'FileNotFoundError';
    this.filePath = filePath;
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}

/**
 * Error thrown when a file cannot be parsed (invalid JSON, YAML, etc.)
 */
export class ParseError extends StoreError {
  public readonly filePath?: string;
  public readonly cause?: Error;

  constructor(message: string, filePath?: string, cause?: Error) {
    super(message, STORE_ERROR_CODES.PARSE_ERROR);
    this.name = 'ParseError';
    this.filePath = filePath;
    this.cause = cause;
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

/**
 * Error thrown when required configuration fields are missing
 */
export class InvalidConfigError extends StoreError {
  public readonly missingFields: string[];

  constructor(message: string, missingFields: string[] = []) {
    super(message, STORE_ERROR_CODES.INVALID_CONFIG);
    this.name = 'InvalidConfigError';
    this.missingFields = missingFields;
    Object.setPrototypeOf(this, InvalidConfigError.prototype);
  }
}

/**
 * Error thrown when storage operations fail (file write, permission denied, etc.)
 */
export class StorageError extends StoreError {
  public readonly operation: string;
  public readonly cause?: Error;

  constructor(operation: string, message: string, cause?: Error) {
    super(message, STORE_ERROR_CODES.STORAGE_ERROR);
    this.name = 'StorageError';
    this.operation = operation;
    this.cause = cause;
    Object.setPrototypeOf(this, StorageError.prototype);
  }
}

/**
 * Error thrown when a write carries fields the store does not hold.
 *
 * The session stores hold the session secret alone and refuse means (the URL,
 * the type and grant, a user and password, the SNC, OIDC and SAML settings,
 * the client, `sapClient`, `language`); the destination store holds means alone
 * and refuses the secret. The message and `fields` name the fields — never a
 * value: many of them are secrets.
 */
export class RefusedFieldsError extends StoreError {
  public readonly fields: string[];

  constructor(message: string, fields: string[]) {
    super(message, STORE_ERROR_CODES.INVALID_CONFIG);
    this.name = 'RefusedFieldsError';
    this.fields = fields;
    Object.setPrototypeOf(this, RefusedFieldsError.prototype);
  }
}

/** Why a destination's client certificate is refused. */
export type ClientCertificateProblem = 'incomplete' | 'mixed' | 'unreadable';

/**
 * Error thrown when a destination's client certificate cannot be answered:
 * some but not all of its variables are set (`incomplete`), they are set
 * together with a client secret (`mixed`), or a file they name cannot be read
 * (`unreadable`) — `EnvDestinationStore`. `XsuaaServiceKeyStore` (3.3.0)
 * raises it for a service key carrying part of a certificate client only —
 * not all of `url`, `clientid`, `certificate`, `key` and `certurl`
 * (`incomplete`). A key with a secret and a whole certificate offers both
 * and is no error.
 *
 * The message is fixed words naming the destination and the variables — never
 * a value, a path, a file's content or an underlying error: a path may name
 * the user, and the files hold a certificate and its private key.
 */
export class ClientCertificateError extends StoreError {
  public readonly reason: ClientCertificateProblem;
  /**
   * What the refusal is about, never values: env key names
   * (`EnvDestinationStore`), or a service key's field names
   * (`XsuaaServiceKeyStore`).
   */
  public readonly variables: string[];

  constructor(
    message: string,
    reason: ClientCertificateProblem,
    variables: string[],
  ) {
    super(message, STORE_ERROR_CODES.INVALID_CONFIG);
    this.name = 'ClientCertificateError';
    this.reason = reason;
    this.variables = variables;
    Object.setPrototypeOf(this, ClientCertificateError.prototype);
  }
}
