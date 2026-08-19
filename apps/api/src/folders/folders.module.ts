import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';

import { FoldersController } from './folders.controller.js';
import { FoldersService } from './folders.service.js';

@Module({
  imports: [AccessControlModule],
  controllers: [FoldersController],
  providers: [FoldersService],
})
export class FoldersModule {}
