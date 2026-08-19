import { Module } from '@nestjs/common';

import { PrismaModule } from '@dataroom/database';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AppConfigModule } from '../config/config.module.js';
import { DataRoomsModule } from '../data-rooms/data-rooms.module.js';
import { FoldersModule } from '../folders/folders.module.js';

// Each domain area (data-rooms, folders, files, shares) gets its own feature module,
// contract-first, per ARCHITECTURE.md §6. Auth is the first; data-rooms and folders are
// iteration 3 (see AGENTS.md). AccessControlService is the single authorization point
// every later feature module routes through.
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    AuthModule,
    AccessControlModule,
    DataRoomsModule,
    FoldersModule,
  ],
})
export class AppModule {}
