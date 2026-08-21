import { Controller } from '@nestjs/common';

import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';

import { SharesService } from './shares.service.js';

/** Implements `contract.shares` via `@ts-rest/nest`'s `TsRestHandler` — see
 * FoldersController for the identical pattern. Every route here requires a session: no
 * `@Public()`, so the global `JwtAuthGuard` covers all of them — share management is
 * always an authenticated, OWNER-only action (see SharesService). */
@Controller()
export class SharesController {
  constructor(private readonly sharesService: SharesService) {}

  @TsRestHandler(contract.shares)
  handler(@CurrentUser() user: AuthenticatedUser) {
    return tsRestHandler(contract.shares, {
      create: async ({ body }) => ({
        status: 201,
        body: await this.sharesService.create(user.id, body),
      }),
      list: async ({ query }) => ({
        status: 200,
        body: await this.sharesService.list(user.id, query),
      }),
      revoke: async ({ params }) => ({
        status: 200,
        body: await this.sharesService.revoke(user.id, params.id),
      }),
    });
  }
}
