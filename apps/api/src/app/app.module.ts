import { Module } from '@nestjs/common';

import { PrismaModule } from '@dataroom/database';

import { AuthModule } from '../auth/auth.module.js';
import { AppConfigModule } from '../config/config.module.js';

// Each domain area (data-rooms, folders, files, shares) gets its own feature module,
// contract-first, per ARCHITECTURE.md §6. Auth is the first.
@Module({
  imports: [AppConfigModule, PrismaModule, AuthModule],
})
export class AppModule {}
