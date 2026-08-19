import { Module } from '@nestjs/common';

import { AccessControlService } from './access-control.service.js';

/**
 * Not `@Global()` — unlike `PrismaModule`, this is an ordinary feature module. Every
 * module that needs authorization (`DataRoomsModule`, `FoldersModule`, and every module
 * after them) imports it explicitly, so "this module makes access decisions" is visible
 * in its own `imports` array rather than ambient.
 */
@Module({
  providers: [AccessControlService],
  exports: [AccessControlService],
})
export class AccessControlModule {}
