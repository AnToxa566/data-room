import { Module } from '@nestjs/common';

import { StorageService } from './storage.service.js';

/**
 * Wraps `@google-cloud/storage` behind `StorageService` — the only place in the codebase
 * allowed to import that package. Not `@Global()`: `FilesModule` (and, transitively,
 * `FoldersModule`/`DataRoomsModule` for blob cleanup on delete) imports it explicitly,
 * same reasoning as `AccessControlModule`. See AGENTS.md's iteration 4 instructions.
 */
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
