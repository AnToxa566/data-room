import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';

import { FileStatus, PrismaService } from '@dataroom/database';

import type { Env } from '../config/env.schema.js';
import { StorageService } from '../storage/storage.service.js';

const SWEEP_INTERVAL_NAME = 'pending-files-sweep';

/**
 * Deletes `File` rows stuck in `PENDING` past `PENDING_TTL_MINUTES` — uploads the
 * browser abandoned (never PUT the bytes, or PUT them but never called `complete`). See
 * ARCHITECTURE.md §5.
 *
 * The interval is registered dynamically in `onModuleInit`, not via the `@Interval()`
 * decorator: its period comes from `PENDING_SWEEP_INTERVAL_MINUTES`, which isn't known
 * until `ConfigService` resolves, and a decorator argument has to be a compile-time
 * literal.
 *
 * **Best-effort on Cloud Run.** An in-process scheduler only runs while an instance is
 * alive — on scale-to-zero, a Data Room with no traffic accumulates PENDING rows
 * un-swept until the next request wakes an instance. A production deployment would
 * replace this with Cloud Scheduler hitting an authenticated sweep endpoint; not built
 * here, see README.md's "File storage" section.
 */
@Injectable()
export class PendingSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PendingSweepService.name);
  private readonly pendingTtlMinutes: number;
  private readonly intervalMinutes: number;
  // In-process reentrancy guard, not a distributed lock — see `sweep()`'s doc comment
  // for why concurrent runs (this guard aside) are still safe without one.
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly schedulerRegistry: SchedulerRegistry,
    configService: ConfigService<Env, true>,
  ) {
    this.pendingTtlMinutes = configService.get('PENDING_TTL_MINUTES', { infer: true });
    this.intervalMinutes = configService.get('PENDING_SWEEP_INTERVAL_MINUTES', {
      infer: true,
    });
  }

  onModuleInit(): void {
    const interval = setInterval(() => {
      this.sweep().catch((error) => {
        this.logger.error(
          'Pending-file sweep failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, this.intervalMinutes * 60_000);
    // Never hold the process open on this timer alone (matters for tests and graceful
    // shutdown, where nothing else is keeping the event loop alive).
    interval.unref?.();
    this.schedulerRegistry.addInterval(SWEEP_INTERVAL_NAME, interval);
  }

  onModuleDestroy(): void {
    if (this.schedulerRegistry.doesExist('interval', SWEEP_INTERVAL_NAME)) {
      this.schedulerRegistry.deleteInterval(SWEEP_INTERVAL_NAME);
    }
  }

  /**
   * Deletes every `File` row still `PENDING` past the TTL, and its blob. Safe to run
   * concurrently with itself — in this instance, `sweeping` skips an overlapping tick
   * outright; across instances (or the rare tick that isn't skipped), each row is removed
   * with a conditional `deleteMany({ where: { id } })` rather than `delete`: a row another
   * runner already removed simply matches zero rows the second time — no P2025, no
   * double-delete, and the blob delete for that row is skipped too (the runner that
   * actually deleted the row already issued it).
   */
  async sweep(): Promise<void> {
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      const cutoff = new Date(Date.now() - this.pendingTtlMinutes * 60_000);
      const stale = await this.prisma.file.findMany({
        where: { status: FileStatus.PENDING, createdAt: { lt: cutoff } },
        select: { id: true, storageKey: true },
      });
      if (stale.length === 0) {
        return;
      }

      let removed = 0;
      for (const file of stale) {
        const { count } = await this.prisma.file.deleteMany({ where: { id: file.id } });
        if (count === 0) {
          continue;
        }
        await this.storage.deleteObject(file.storageKey);
        removed++;
      }
      this.logger.log(`Pending-file sweep removed ${removed} abandoned upload(s).`);
    } finally {
      this.sweeping = false;
    }
  }
}
