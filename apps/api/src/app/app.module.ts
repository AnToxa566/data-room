import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';

import { PrismaModule } from '@dataroom/database';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { AppConfigModule } from '../config/config.module.js';
import { DataRoomsModule } from '../data-rooms/data-rooms.module.js';
import { FilesModule } from '../files/files.module.js';
import { FoldersModule } from '../folders/folders.module.js';
import { HealthModule } from '../health/health.module.js';
import { SharesModule } from '../shares/shares.module.js';
import { StorageModule } from '../storage/storage.module.js';

// Each domain area (data-rooms, folders, files, shares) gets its own feature module,
// contract-first, per ARCHITECTURE.md §6. Auth is the first; data-rooms and folders are
// iteration 3; files and storage are iteration 4; shares is iteration 5 (see AGENTS.md).
// AccessControlService is the single authorization point every feature module routes
// through — SharesModule is no exception, share management itself requires OWNER access
// to the target resource (see SharesService).
//
// `ScheduleModule.forRoot()` registers the `SchedulerRegistry` PendingSweepService (in
// FilesModule) uses to run its abandoned-upload sweep — see AGENTS.md's iteration 4
// instructions and pending-sweep.service.ts.
@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    ScheduleModule.forRoot(),
    AuthModule,
    AccessControlModule,
    StorageModule,
    DataRoomsModule,
    FoldersModule,
    FilesModule,
    SharesModule,
    HealthModule,
  ],
})
export class AppModule {}
