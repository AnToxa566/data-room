import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { StorageModule } from '../storage/storage.module.js';

import { FoldersController } from './folders.controller.js';
import { FoldersService } from './folders.service.js';

@Module({
  imports: [AccessControlModule, StorageModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
