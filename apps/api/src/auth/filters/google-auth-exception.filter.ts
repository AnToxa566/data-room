import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Response } from 'express';

import type { Env } from '../../config/env.schema.js';

import { UnverifiedEmailException } from '../exceptions/unverified-email.exception.js';

/**
 * Scoped to `GET /auth/google/callback` only (via `@UseFilters` on that handler).
 *
 * Every failure on that route — denied consent, an invalid OAuth `state`, an unverified
 * email, a Google API error, anything — ends the same way: a 302 to the SPA with a
 * generic `error` query param. Never a rendered API error page, never the underlying
 * exception's message or stack, which could leak provider internals to the client. The
 * real cause is logged server-side for diagnosis.
 */
@Catch()
export class GoogleAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GoogleAuthExceptionFilter.name);

  constructor(private readonly configService: ConfigService<Env, true>) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const webAppUrl = this.configService.get('WEB_APP_URL', { infer: true });

    const reason =
      exception instanceof UnverifiedEmailException ? 'unverified_email' : 'oauth_failed';

    if (reason === 'oauth_failed') {
      this.logger.warn(`Google OAuth callback failed: ${describe(exception)}`);
    }

    response.redirect(`${webAppUrl}?error=${reason}`);
  }
}

function describe(exception: unknown): string {
  if (exception instanceof Error) {
    return exception.stack ?? exception.message;
  }
  return String(exception);
}
