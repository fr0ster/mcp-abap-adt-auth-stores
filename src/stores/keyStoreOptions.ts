/**
 * What a SAP service key store takes from whoever builds it (auth-stores 3.1.0).
 *
 * A SAP service key holds an OAuth client and the system's URL; it cannot state
 * which grant a destination uses. Whoever builds the store states it, and the
 * store answers it — nothing is inferred.
 */

import type { DestinationGrant } from '@mcp-abap-adt/interfaces-auth-broker';
import type { ILogger } from '@mcp-abap-adt/interfaces-utils';

/** Every grant `IConnectionConfig.grantType` may name. */
export const DESTINATION_GRANTS: readonly DestinationGrant[] = [
  'authorization_code',
  'client_credentials',
  'passcode',
  'oidc_authorization_code',
  'device_code',
  'password',
  'token_exchange',
  'saml2_pure',
  'saml2_bearer',
  'none',
];

export interface ServiceKeyStoreOptions {
  /**
   * The grant this store's destinations use: answered by
   * `getConnectionConfig` and `getServiceKey` for every destination that has a
   * key. Absent, no grant is answered (3.0.0).
   */
  grantType?: DestinationGrant | undefined;
  log?: ILogger | undefined;
}

const OPTION_NAMES = ['grantType', 'log'] as const;
const LOGGER_METHODS = ['debug', 'info', 'warn', 'error'] as const;

/**
 * The options from a constructor's second argument: the 3.0.0 logger, or an
 * options object. Anything else is refused naming what was wrong — never a
 * value.
 */
export function readServiceKeyStoreOptions(
  owner: string,
  arg: unknown,
): ServiceKeyStoreOptions {
  if (arg === undefined || arg === null) return {};
  if (typeof arg !== 'object') {
    throw new TypeError(
      `${owner}: got a ${typeof arg} where the options go ({ grantType?, log? }, or the logger). The resource URL is means: state it in an EnvDestinationStore, with this store as its fallback.`,
    );
  }
  const obj = arg as Record<string, unknown>;
  // A logger — console included, which also has a `log` method — has these.
  // One with only some of them is refused now, not at its first log call.
  if (LOGGER_METHODS.some((m) => typeof obj[m] === 'function')) {
    assertLogger(owner, obj, 'the logger');
    return { log: arg as ILogger };
  }
  const unknown = Object.keys(obj)
    .filter(
      (k) =>
        !(OPTION_NAMES as readonly string[]).includes(k) &&
        obj[k] !== undefined,
    )
    .sort();
  if (unknown.length > 0) {
    throw new TypeError(
      `${owner}: unknown option${unknown.length > 1 ? 's' : ''} ${unknown.join(', ')}; it takes ${OPTION_NAMES.join(', ')}.${unknown.includes('serviceUrl') ? ' The resource URL is means: state it in an EnvDestinationStore, with this store as its fallback.' : ''}`,
    );
  }
  if (
    obj.grantType !== undefined &&
    !(DESTINATION_GRANTS as readonly unknown[]).includes(obj.grantType)
  ) {
    throw new TypeError(
      `${owner}: grantType must be one of ${DESTINATION_GRANTS.join(', ')}`,
    );
  }
  if (
    obj.log !== undefined &&
    obj.log !== null &&
    typeof obj.log !== 'object'
  ) {
    throw new TypeError(
      `${owner}: the log option is a ${typeof obj.log}; it takes a logger`,
    );
  }
  if (obj.log !== undefined && obj.log !== null) {
    assertLogger(owner, obj.log as Record<string, unknown>, 'the log option');
  }
  return {
    grantType: obj.grantType as DestinationGrant | undefined,
    log: (obj.log ?? undefined) as ILogger | undefined,
  };
}

/** A logger has every ILogger method as a function; names what it lacks. */
function assertLogger(
  owner: string,
  candidate: Record<string, unknown>,
  what: string,
): void {
  const lacking = LOGGER_METHODS.filter(
    (m) => typeof candidate[m] !== 'function',
  );
  if (lacking.length > 0) {
    throw new TypeError(
      `${owner}: ${what} lacks ${lacking.join(', ')}; a logger has ${LOGGER_METHODS.join(', ')}`,
    );
  }
}
