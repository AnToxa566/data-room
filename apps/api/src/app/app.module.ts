import { Module } from '@nestjs/common';
import { PrismaModule } from '@dataroom/database';

// Infrastructure only for this iteration — no feature modules yet. Each domain area
// (data-rooms, folders, files, shares, auth) gets its own module, contract-first, per
// ARCHITECTURE.md §6.
@Module({
  imports: [PrismaModule],
})
export class AppModule {}
