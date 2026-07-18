import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { APP_CONFIG_TOKEN } from '../../../../../common/domain/interfaces/app-config.interface';
import type { IAppConfig } from '../../../../../common/domain/interfaces/app-config.interface';

export interface LinnworksSyncJob {
  type: 'daily' | 'manual' | 'inventory-refresh';
}

@Injectable()
export class LinnworksSyncQueue implements OnModuleInit {
  constructor(
    @InjectQueue('linnworks-sync')
    private readonly queue: Queue<LinnworksSyncJob>,
    @Inject(APP_CONFIG_TOKEN)
    private readonly config: IAppConfig,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.removeLegacyRepeatableJobs();

    await this.queue.add(
      'scheduled-sync',
      { type: 'daily' },
      {
        jobId: 'linnworks-scheduled-sync',
        repeat: { pattern: this.config.linnworks_daily_sync_cron },
        removeOnComplete: 10,
        removeOnFail: 100,
      },
    );

    await this.queue.add(
      'scheduled-inventory-refresh',
      { type: 'inventory-refresh' },
      {
        jobId: 'linnworks-scheduled-inventory-refresh',
        repeat: { pattern: this.config.linnworks_inventory_refresh_cron },
        removeOnComplete: 10,
        removeOnFail: 100,
      },
    );
  }

  async enqueueManualSync(): Promise<string | undefined> {
    const job = await this.queue.add(
      'manual-sync',
      { type: 'manual' },
      {
        attempts: 1,
        removeOnComplete: 10,
        removeOnFail: 100,
      },
    );

    return job.id;
  }

  async enqueueInventoryRefresh(): Promise<string | undefined> {
    const job = await this.queue.add(
      'inventory-refresh',
      { type: 'inventory-refresh' },
      {
        attempts: 1,
        removeOnComplete: 10,
        removeOnFail: 100,
      },
    );

    return job.id;
  }

  private async removeLegacyRepeatableJobs(): Promise<void> {
    const repeatableJobs = await this.queue.getRepeatableJobs();
    await Promise.all(
      repeatableJobs
        .filter((job) => job.id === 'linnworks-daily-sync' || job.name === 'daily-sync')
        .map((job) => this.queue.removeRepeatableByKey(job.key)),
    );
  }
}
