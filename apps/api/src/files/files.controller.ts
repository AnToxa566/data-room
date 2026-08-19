import { Controller } from '@nestjs/common';

import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';

import { contract } from '@dataroom/contracts';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from '../auth/types.js';

import { FilesService } from './files.service.js';

/** Implements `contract.files` via `@ts-rest/nest`'s `TsRestHandler` — see
 * FoldersController and DataRoomsController for the identical pattern. */
@Controller()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @TsRestHandler(contract.files)
  handler(@CurrentUser() user: AuthenticatedUser) {
    return tsRestHandler(contract.files, {
      createUploadUrl: async ({ body }) => ({
        status: 201,
        body: await this.filesService.createUploadUrl(user.id, body),
      }),
      complete: async ({ params }) => ({
        status: 200,
        body: await this.filesService.complete(user.id, params.id),
      }),
      get: async ({ params }) => ({
        status: 200,
        body: await this.filesService.get(user.id, params.id),
      }),
      downloadUrl: async ({ params }) => ({
        status: 200,
        body: await this.filesService.downloadUrl(user.id, params.id),
      }),
      update: async ({ params, body }) => ({
        status: 200,
        body: await this.filesService.update(user.id, params.id, body),
      }),
      delete: async ({ params }) => {
        await this.filesService.delete(user.id, params.id);
        return { status: 204, body: undefined };
      },
    });
  }
}
