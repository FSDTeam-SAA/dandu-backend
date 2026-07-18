import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import { LinnworksInventoryRefreshService } from '../../../application/linnworks-inventory-refresh.service';
import { RunLinnworksDailySyncService } from '../../../application/run-linnworks-daily-sync.service';
import { LinnworksSyncJob } from './linnworks-sync.queue';

@Processor('linnworks-sync')
export class LinnworksSyncProcessor extends WorkerHost {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
    private readonly runLinnworksDailySync: RunLinnworksDailySyncService,
    private readonly linnworksInventoryRefresh: LinnworksInventoryRefreshService,
  ) {
    super();
  }

  async process(job: Job<LinnworksSyncJob>): Promise<void> {
    this.logger.info(`Processing Linnworks sync job ${job.id}`, {
      context: 'LinnworksSyncProcessor',
      jobId: job.id,
      jobName: job.name,
    });

    if (job.data.type === 'inventory-refresh') {
      await this.linnworksInventoryRefresh.refreshInventory();
      return;
    }

    await this.runLinnworksDailySync.execute();
  }
}
