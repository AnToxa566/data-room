/** Name of the httpOnly cookie carrying the session JWT. */
export const SESSION_COOKIE_NAME = 'session';

/** Name of the short-lived cookie carrying the OAuth `state` CSRF nonce. Scoped to the
 * Google login handshake only — see GoogleAuthGuard. */
export const OAUTH_STATE_COOKIE_NAME = 'oauth_state';

/** How long the state nonce cookie lives — long enough to sit on Google's consent
 * screen, short enough not to linger as attack surface afterward. */
export const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;
