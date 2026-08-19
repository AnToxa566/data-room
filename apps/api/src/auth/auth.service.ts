import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '@dataroom/database';
import type { User as PrismaUser } from '@dataroom/database';

import { UnverifiedEmailException } from './exceptions/unverified-email.exception.js';
import type { GoogleProfile, JwtPayload } from './types.js';

export interface GoogleLoginResult {
  user: PrismaUser;
  token: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * The whole login flow: reject unverified emails outright (a security boundary, not
   * just a data-quality check — see below), upsert the user, resolve pending share
   * invitations, and sign a session token. Called from the callback controller with the
   * profile `GoogleStrategy.validate()` produced; independent of passport, so this is
   * what both unit tests and the e2e suite exercise directly.
   */
  async loginWithGoogleProfile(profile: GoogleProfile): Promise<GoogleLoginResult> {
    if (!profile.emailVerified) {
      // Rejected before any database write — an unverified email would otherwise let
      // anyone claim shares addressed to someone else's inbox. No user row, no share
      // resolution, nothing to roll back.
      throw new UnverifiedEmailException();
    }

    const user = await this.upsertGoogleUserAndResolvePendingShares(profile);
    const token = this.signSessionToken(user);

    return { user, token };
  }

  private async upsertGoogleUserAndResolvePendingShares(
    profile: GoogleProfile,
  ): Promise<PrismaUser> {
    const email = profile.email.toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { googleId: profile.googleId } });
      if (!user) {
        // Falls back to an existing account matched by email — e.g. a user record that
        // predates this account ever signing in with Google.
        user = await tx.user.findUnique({ where: { email } });
      }

      user = user
        ? await tx.user.update({
            where: { id: user.id },
            data: {
              googleId: profile.googleId,
              email,
              name: profile.name ?? user.name,
              avatarUrl: profile.avatarUrl ?? user.avatarUrl,
            },
          })
        : await tx.user.create({
            data: {
              googleId: profile.googleId,
              email,
              name: profile.name,
              avatarUrl: profile.avatarUrl,
            },
          });

      // Every successful login, not just the first — a share can be created for this
      // email at any point after the account already exists. Safe to re-run: the
      // `granteeUserId IS NULL` guard means an already-resolved share never matches
      // again. Case-insensitive on `granteeEmail` because that column is written by the
      // (out-of-scope, future) share-creation endpoint and this login flow can't
      // guarantee it was already lowercased there — see AGENTS.md.
      await tx.share.updateMany({
        where: {
          granteeEmail: { equals: email, mode: 'insensitive' },
          granteeUserId: null,
          revokedAt: null,
        },
        data: { granteeUserId: user.id },
      });

      return user;
    });
  }

  private signSessionToken(user: PrismaUser): string {
    const payload: JwtPayload = { sub: user.id, email: user.email };
    return this.jwtService.sign(payload);
  }
}
