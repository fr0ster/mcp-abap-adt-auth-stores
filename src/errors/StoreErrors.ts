/**
 * Store error codes and typed error classes
 */

import { STORE_ERROR_CODES, type StoreErrorCode } from '@mcp-abap-adt/interfaces';

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
      STORE_ERROR_CODES.FILE_NOT_FOUND
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
