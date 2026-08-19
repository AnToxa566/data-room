import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';

import {
  Profile,
  Strategy,
  VerifyCallback,
} from 'passport-google-oauth20';

import type { Env } from '../../config/env.schema.js';
import type { GoogleProfile } from '../types.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService<Env, true>) {
    super({
      clientID: configService.get('GOOGLE_CLIENT_ID', { infer: true }),
      clientSecret: configService.get('GOOGLE_CLIENT_SECRET', { infer: true }),
      callbackURL: configService.get('GOOGLE_CALLBACK_URL', { infer: true }),
      scope: ['profile', 'email'],
      // The library's own `state` handling stores the nonce in `req.session`, which
      // this app deliberately doesn't have (single stateless JWT cookie — no server-
      // side session store, see ARCHITECTURE.md's decision log). `state` CSRF
      // protection is still enabled and validated — GoogleAuthGuard implements it with
      // a short-lived signed cookie instead of a session, which also happens to be
      // correct for a multi-instance Cloud Run deployment where the initiating and
      // callback requests may land on different instances.
      state: false,
    });
  }

  /**
   * Thin adapter only: normalizes the raw passport profile into `GoogleProfile` and
   * hands it to the callback controller via `req.user`. No DB access, no verified-email
   * decision here — that belongs to `AuthService.loginWithGoogleProfile`, which is unit-
   * testable independent of passport and is what e2e tests exercise directly by
   * overriding `GoogleAuthGuard` rather than mocking this class.
   */
  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const primaryEmail = profile.emails?.[0];
    if (!primaryEmail?.value) {
      done(new Error('Google profile did not include an email address'));
      return;
    }

    const rawJson = profile._json as { email_verified?: boolean } | undefined;
    const emailVerified =
      (primaryEmail as { verified?: boolean }).verified === true ||
      rawJson?.email_verified === true;

    const googleProfile: GoogleProfile = {
      googleId: profile.id,
      email: primaryEmail.value,
      emailVerified,
      name: profile.displayName || null,
      avatarUrl: profile.photos?.[0]?.value || null,
    };

    done(null, googleProfile);
  }
}
