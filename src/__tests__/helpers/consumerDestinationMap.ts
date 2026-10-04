/**
 * A consumer's code written against 3.2.0, compiled as-is by
 * `destinationTypes.test.ts`: a map typed `Record<MeansField, string>` with
 * exactly the keys `MeansField` had then, used as `DestinationVariables`.
 * Widening `MeansField` makes this file fail to compile.
 */
import type {
  CertificateField,
  DestinationMeans,
  DestinationVariables,
  MeansField,
} from '../../index';

/** A consumer's own map, written against 3.2.0: every key it had, no more. */
export const CONSUMER_MAP: Record<MeansField, string> = {
  serviceUrl: 'MY_URL',
  authType: 'MY_AUTH_TYPE',
  grantType: 'MY_GRANT_TYPE',
  username: 'MY_USERNAME',
  password: 'MY_PASSWORD',
  sapClient: 'MY_CLIENT',
  language: 'MY_LANGUAGE',
  sncPartnerName: 'MY_SNC_PARTNERNAME',
  sncQop: 'MY_SNC_QOP',
  sncLib: 'MY_SNC_LIB',
  sncMyName: 'MY_SNC_MYNAME',
  oidcIssuerUrl: 'MY_OIDC_ISSUER_URL',
  oidcAuthorizationEndpoint: 'MY_OIDC_AUTHORIZATION_ENDPOINT',
  oidcTokenEndpoint: 'MY_OIDC_TOKEN_ENDPOINT',
  oidcDeviceAuthorizationEndpoint: 'MY_OIDC_DEVICE_AUTHORIZATION_ENDPOINT',
  oidcScopes: 'MY_OIDC_SCOPES',
  oidcSubjectToken: 'MY_OIDC_SUBJECT_TOKEN',
  oidcSubjectTokenType: 'MY_OIDC_SUBJECT_TOKEN_TYPE',
  oidcAudience: 'MY_OIDC_AUDIENCE',
  oidcActorToken: 'MY_OIDC_ACTOR_TOKEN',
  oidcActorTokenType: 'MY_OIDC_ACTOR_TOKEN_TYPE',
  samlIdpSsoUrl: 'MY_SAML_IDP_SSO_URL',
  samlIdpEntityId: 'MY_SAML_IDP_ENTITY_ID',
  samlIdpCertificates: 'MY_SAML_IDP_CERTIFICATES_B64',
  samlSpEntityId: 'MY_SAML_SP_ENTITY_ID',
  samlAcsUrl: 'MY_SAML_ACS_URL',
  samlRelayState: 'MY_SAML_RELAY_STATE',
  samlIdpInitiated: 'MY_SAML_IDP_INITIATED',
  samlClockSkewMs: 'MY_SAML_CLOCK_SKEW_MS',
  samlTokenUrl: 'MY_SAML_TOKEN_URL',
  uaaUrl: 'MY_UAA_URL',
  uaaClientId: 'MY_UAA_CLIENT_ID',
  uaaClientSecret: 'MY_UAA_CLIENT_SECRET',
};

// assignable as it was in 3.2.0
export const AS_VARIABLES: DestinationVariables = CONSUMER_MAP;

// the certificate fields: their own type, optional in a map, means to write
export const CERTIFICATE_FIELDS: CertificateField[] = [
  'uaaClientCertPath',
  'uaaClientKeyPath',
  'uaaCertUrl',
];
export const WITH_CERTIFICATE: DestinationVariables = {
  ...CONSUMER_MAP,
  uaaClientCertPath: 'MY_CERT_PATH',
};
export const CERTIFICATE_WRITE: DestinationMeans = {
  uaaCertUrl: 'https://cert.example',
};
