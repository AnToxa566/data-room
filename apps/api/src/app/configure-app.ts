import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import helmet from 'helmet';
import cookieParser from 'cookie-parser';

import type { Env } from '../config/env.schema.js';

/**
 * Everything about the app's HTTP surface that isn't a feature module: global prefix,
 * security headers, cookie parsing, CORS, and request validation. Pulled out of
 * `main.ts` so apps/api-e2e can apply the exact same setup to an in-process
 * `TestingModule`-built app instead of re-declaring (and risking drifting from) it.
 */
export function configureApp(app: INestApplication): void {
  const configService = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  // Populates `req.cookies`, read by JwtStrategy's cookie extractor and GoogleAuthGuard's
  // OAuth-state check.
  app.use(cookieParser());

  app.enableCors({
    // Never a wildcard — invalid together with `credentials: true`, and this API is
    // cookie-authenticated cross-site in production.
    origin: configService.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
}
