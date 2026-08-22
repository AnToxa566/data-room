/** Name of the httpOnly cookie carrying the session JWT. */
export const SESSION_COOKIE_NAME = 'session';

/** Name of the short-lived cookie carrying the OAuth `state` CSRF nonce. Scoped to the
 * Google login handshake only — see GoogleAuthGuard. */
export const OAUTH_STATE_COOKIE_NAME = 'oauth_state';

/** How long the state nonce cookie lives — long enough to sit on Google's consent
 * screen, short enough not to linger as attack surface afterward. */
export const OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

/** Name of the short-lived cookie carrying the validated post-login return path (see
 * `return-to.util.ts`). A separate cookie from `OAUTH_STATE_COOKIE_NAME` deliberately —
 * the state nonce is compared with `timingSafeEqual` as a bare value; folding a second
 * payload into it would break that comparison. Same handshake-only scope as the state
 * cookie. */
export const OAUTH_RETURN_TO_COOKIE_NAME = 'oauth_return_to';

/** Same lifetime as the state nonce — both exist only for the duration of one OAuth
 * round trip. */
export const OAUTH_RETURN_TO_TTL_MS = OAUTH_STATE_TTL_MS;
