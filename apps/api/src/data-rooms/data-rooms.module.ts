import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';
import { StorageModule } from '../storage/storage.module.js';

import { DataRoomsController } from './data-rooms.controller.js';
import { DataRoomsService } from './data-rooms.service.js';

@Module({
  imports: [AccessControlModule, StorageModule],
  controllers: [DataRoomsController],
  providers: [DataRoomsService],
})
export class DataRoomsModule {}
