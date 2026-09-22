import { Controller, Get, Req, Res, UseFilters, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { Env } from '../config/env.schema.js';
import { AuthService } from './auth.service.js';
import { Public } from './decorators/public.decorator.js';
import { GoogleAuthExceptionFilter } from './filters/google-auth-exception.filter.js';
import { GoogleAuthGuard } from './guards/google-auth.guard.js';
import {
  hasSessionCookieOptions,
  oauthReturnToCookieOptions,
  sessionCookieMaxAgeMs,
  sessionCookieOptions,
} from './cookie.util.js';
import { HAS_SESSION_COOKIE_NAME, OAUTH_RETURN_TO_COOKIE_NAME, SESSION_COOKIE_NAME } from './constants.js';
import { parseReturnTo } from './return-to.util.js';
import type { GoogleProfile } from './types.js';

/**
 * Plain Nest controller — not a ts-rest contract. Both routes are full-page browser
 * redirects, a response shape ts-rest doesn't model. See libs/contracts/src/lib/auth.ts.
 */
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService<Env, true>,
  ) {}

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {
    // GoogleAuthGuard's canActivate redirects to Google's consent screen before this
    // body ever runs.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  @UseFilters(GoogleAuthExceptionFilter)
  async googleCallback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const profile = req.user as GoogleProfile;
    const { token } = await this.authService.loginWithGoogleProfile(profile);

    const maxAge = sessionCookieMaxAgeMs(this.configService);
    res.cookie(SESSION_COOKIE_NAME, token, {
      ...sessionCookieOptions(this.configService),
      maxAge,
    });
    // Same maxAge as the session cookie itself, so both expire in the browser at the
    // same instant — see HAS_SESSION_COOKIE_NAME's own comment for why this cookie exists.
    res.cookie(HAS_SESSION_COOKIE_NAME, '1', {
      ...hasSessionCookieOptions(this.configService),
      maxAge,
    });

    const returnTo = parseReturnTo(req.cookies?.[OAUTH_RETURN_TO_COOKIE_NAME] as string | undefined);
    res.clearCookie(OAUTH_RETURN_TO_COOKIE_NAME, oauthReturnToCookieOptions(this.configService));

    const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true });
    res.redirect(returnTo ? `${webAppUrl}${returnTo}` : webAppUrl);
  }
}
