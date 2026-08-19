/**
 * Thrown by `AuthService.loginWithGoogleProfile` when Google reports the account's
 * email as unverified. Caught by `GoogleAuthExceptionFilter`, which redirects to the SPA
 * with a distinct `?error=unverified_email` — distinguished from other failures only so
 * the SPA can show a specific message; the client never sees anything more than that.
 */
export class UnverifiedEmailException extends Error {
  constructor() {
    super('Google account email is not verified');
    this.name = 'UnverifiedEmailException';
  }
}
