import { Module } from '@nestjs/common';

import { AccessControlModule } from '../access-control/access-control.module.js';

import { SharesController } from './shares.controller.js';
import { SharesService } from './shares.service.js';

@Module({
  imports: [AccessControlModule],
  controllers: [SharesController],
  providers: [SharesService],
})
export class SharesModule {}
