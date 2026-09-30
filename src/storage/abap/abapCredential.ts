/**
 * The credential of an ABAP session, shared by AbapSessionStore,
 * SafeAbapSessionStore and the env token storage so that the same call means
 * the same thing in every store.
 *
 * A session holds one credential of one type:
 * - jwt:   jwtToken
 * - basic: username, password
 * - saml:  sessionCookies
 * - snc:   sncPartnerName, sncQop, sncLib, sncMyName
 */

export type AbapAuthType = 'basic' | 'jwt' | 'saml' | 'snc';

export interface AbapCredential {
  authType?: AbapAuthType;
  jwtToken?: string;
  username?: string;
  password?: string;
  sessionCookies?: string;
  sncPartnerName?: string;
  sncQop?: string;
  sncLib?: string;
  sncMyName?: string;
}

type CredentialField = Exclude<keyof AbapCredential, 'authType'>;

export const MODE_FIELDS: Record<AbapAuthType, readonly CredentialField[]> = {
  jwt: ['jwtToken'],
  basic: ['username', 'password'],
  saml: ['sessionCookies'],
  snc: ['sncPartnerName', 'sncQop', 'sncLib', 'sncMyName'],
};

const MODES = Object.keys(MODE_FIELDS) as AbapAuthType[];

/**
 * The declared type wins. Without one, the type is what the credential implies,
 * in the order 1.x used: cookies are saml, a token is jwt (it wins over a
 * username and password), a username and password are basic. SNC is never
 * inferred — it is new in 2.0, so there is no older session to infer it for:
 * a session is snc only when `authType: 'snc'` is declared. Nothing implied is
 * `undefined`.
 */
export function inferAuthType(c: AbapCredential): AbapAuthType | undefined {
  if (c.authType) return c.authType;
  if (c.sessionCookies) return 'saml';
  if (c.jwtToken) return 'jwt';
  if (c.username && c.password) return 'basic';
  return undefined;
}

/** Only the fields of `type`, with the type declared. */
export function credentialOf(
  c: AbapCredential,
  type: AbapAuthType,
): AbapCredential {
  const result: AbapCredential = { authType: type };
  for (const field of MODE_FIELDS[type]) result[field] = c[field];
  return result;
}

/**
 * What a session's credential becomes after an update:
 * - the update declares a type, or carries fields of the current type only, or
 *   carries a credential that implies a type (`inferAuthType`);
 * - that type equal to the current one merges field by field — a field the
 *   update leaves `undefined` keeps its current value;
 * - a different type replaces the credential, and the other types' fields go;
 * - no type at all (a language, a client) leaves the credential as it was.
 */
export function updateCredential(
  current: AbapCredential,
  update: AbapCredential,
): AbapCredential {
  const currentType = inferAuthType(current);
  const carried = MODES.filter((mode) =>
    MODE_FIELDS[mode].some((field) => !!update[field]),
  );
  const type =
    update.authType ??
    (currentType && carried.length === 1 && carried[0] === currentType
      ? currentType
      : inferAuthType(update));

  if (!type) {
    return currentType ? credentialOf(current, currentType) : {};
  }
  if (type !== currentType) {
    return credentialOf(update, type);
  }
  const merged: AbapCredential = { authType: type };
  for (const field of MODE_FIELDS[type]) {
    merged[field] =
      update[field] !== undefined ? update[field] : current[field];
  }
  return merged;
}

/** The credential fields of a config, the token under its internal name. */
export function toCredential(obj: object): AbapCredential {
  const o = obj as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return {
    authType: str(o.authType) as AbapCredential['authType'],
    // a non-empty token under either name; else an empty one, which clears
    jwtToken:
      str(o.authorizationToken) ||
      str(o.jwtToken) ||
      (str(o.authorizationToken) ?? str(o.jwtToken)),
    username: str(o.username),
    password: str(o.password),
    sessionCookies: str(o.sessionCookies),
    sncPartnerName: str(o.sncPartnerName),
    sncQop: str(o.sncQop),
    sncLib: str(o.sncLib),
    sncMyName: str(o.sncMyName),
  };
}
