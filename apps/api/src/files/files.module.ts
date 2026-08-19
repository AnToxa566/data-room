import { Module } from '@nestjs/common';

import { StorageModule } from '../storage/storage.module.js';
import { AccessControlModule } from '../access-control/access-control.module.js';

import { FilesService } from './files.service.js';
import { FilesController } from './files.controller.js';
import { PendingSweepService } from './pending-sweep.service.js';

@Module({
  imports: [AccessControlModule, StorageModule],
  controllers: [FilesController],
  providers: [FilesService, PendingSweepService],
})
export class FilesModule {}
