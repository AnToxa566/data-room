import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';

import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '@dataroom/database';
import { SESSION_COOKIE_NAME } from '../constants.js';
import type { AuthenticatedUser, JwtPayload } from '../types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    super({
      // The session lives in an httpOnly cookie, never an Authorization header — see
      // ARCHITECTURE.md's decision log. `cookie-parser` (registered in main.ts) is what
      // populates `req.cookies`.
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => (req?.cookies?.[SESSION_COOKIE_NAME] as string | undefined) ?? null,
      ]),
      ignoreExpiration: false,
      secretOrKey: configService.get('JWT_SECRET', { infer: true }),
    });
  }

  /**
   * Runs only once the token's signature and expiry have already checked out — a
   * tampered or expired token never reaches this method, passport-jwt rejects it first.
   * Looks the user up fresh on every request (payload carries only `sub`/`email`, no
   * roles or permissions — those are always resolved from the database, per request).
   * A missing user (deleted after the token was issued) is also an authentication
   * failure, not a 404 — there is no session to be "not found" for.
   */
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }
}
