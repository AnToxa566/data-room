import { Controller, UseGuards } from '@nestjs/common';

import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { OptionalCurrentUser } from '../auth/decorators/optional-current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard.js';
import type { AuthenticatedUser } from '../auth/types.js';

import { FilesService } from './files.service.js';

/**
 * Implements `contract.files` via `@ts-rest/nest`'s `TsRestHandler` — split across two
 * handler methods, not one, because `get`/`downloadUrl` support an anonymous caller (a
 * public-link visitor, see ARCHITECTURE.md §4) and the rest don't. See FoldersController
 * for the identical pattern and rationale.
 */
@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @TsRestHandler({
    createUploadUrl: contract.files.createUploadUrl,
    complete: contract.files.complete,
    update: contract.files.update,
    delete: contract.files.delete,
  })
  mutate(@CurrentUser() user: AuthenticatedUser) {
    return tsRestHandler(
      {
        createUploadUrl: contract.files.createUploadUrl,
        complete: contract.files.complete,
        update: contract.files.update,
        delete: contract.files.delete,
      },
      {
        createUploadUrl: async ({ body }) => ({
          status: 201,
          body: await this.filesService.createUploadUrl(user.id, body),
        }),
        complete: async ({ params }) => ({
          status: 200,
          body: await this.filesService.complete(user.id, params.id),
        }),
        update: async ({ params, body }) => ({
          status: 200,
          body: await this.filesService.update(user.id, params.id, body),
        }),
        delete: async ({ params }) => {
          await this.filesService.delete(user.id, params.id);
          return { status: 204, body: undefined };
        },
      },
    );
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @TsRestHandler(contract.files.get)
  get(@OptionalCurrentUser() user: AuthenticatedUser | null) {
    return tsRestHandler(contract.files.get, async ({ params }) => ({
      status: 200,
      body: await this.filesService.get(user?.id ?? null, params.id),
    }));
  }

  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @TsRestHandler(contract.files.downloadUrl)
  downloadUrl(@OptionalCurrentUser() user: AuthenticatedUser | null) {
    return tsRestHandler(contract.files.downloadUrl, async ({ params }) => ({
      status: 200,
      body: await this.filesService.downloadUrl(user?.id ?? null, params.id),
    }));
  }
}
