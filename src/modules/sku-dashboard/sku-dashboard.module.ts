import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

// Controllers
import { SkuDashboardController } from './adapters/inbound/rest/sku-dashboard.controller';
import { ImportController } from './adapters/inbound/rest/import.controller';

// Queue adapters
import { LinnworksSyncProcessor } from './adapters/inbound/queue/linnworks-sync.processor';
import { LinnworksSyncQueue } from './adapters/inbound/queue/linnworks-sync.queue';

// Linnworks clients
import { LinnworksClient } from './adapters/outbound/linnworks/linnworks-client';
import {
  ILinnworksClient,
  LINNWORKS_CLIENT_TOKEN,
} from './ports/outbound/linnworks-client.port';

// Application services
import { CsvParserService } from './application/csv-parser.service';
import { BrowseSkusService } from './application/browse-skus.service';
import { GetDashboardMetricsService } from './application/get-dashboard-metrics.service';
import { GetSkuMetricsService } from './application/get-sku-metrics.service';
import { GetInventoryAlertsService } from './application/get-inventory-alerts.service';
import { ImportReportService } from './application/import-report.service';
import { UpdateProductService } from './application/update-product.service';
import { LinnworksSyncService } from './application/linnworks-sync.service';
import { LinnworksInventoryRefreshService } from './application/linnworks-inventory-refresh.service';
import { LinnworksHistoricalSalesIngestionService } from './application/linnworks-historical-sales-ingestion.service';
import { RunLinnworksDailySyncService } from './application/run-linnworks-daily-sync.service';
import { SyncLinnworksCatalogService } from './application/sync-linnworks-catalog.service';
import { SyncLinnworksSalesService } from './application/sync-linnworks-sales.service';

// Ports
import {
  SKU_REPOSITORY_TOKEN,
  ISkuRepository,
} from './ports/outbound/sku-repository.port';

// Adapters
import { PrismaSkuDashboardRepository } from './adapters/outbound/persistence/prisma-sku-dashboard.repository';
import { LinnworksConfig } from './adapters/outbound/linnworks/linnworks.config';
import { LinnworksApiClient } from './adapters/outbound/linnworks/linnworks-api.client';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    BullModule.registerQueue({
      name: 'linnworks-sync',
    }),
  ],
  controllers: [SkuDashboardController, ImportController],
  providers: [
    // -------------------------------------------------------------------------
    // Infrastructure
    // -------------------------------------------------------------------------
    PrismaSkuDashboardRepository,
    {
      provide: LINNWORKS_CLIENT_TOKEN,
      useExisting: LinnworksClient,
    },
    {
      provide: SKU_REPOSITORY_TOKEN,
      useExisting: PrismaSkuDashboardRepository,
    },
    LinnworksClient,
    LinnworksConfig,
    {
      provide: LinnworksApiClient,
      useFactory: (config: LinnworksConfig) => new LinnworksApiClient(config),
      inject: [LinnworksConfig],
    },

    // -------------------------------------------------------------------------
    // Queue adapters
    // -------------------------------------------------------------------------
    LinnworksSyncQueue,
    LinnworksSyncProcessor,

    // -------------------------------------------------------------------------
    // Application services
    // -------------------------------------------------------------------------
    CsvParserService,

    {
      provide: GetSkuMetricsService,
      useFactory: (repo: ISkuRepository) => new GetSkuMetricsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: BrowseSkusService,
      useFactory: (repo: ISkuRepository) => new BrowseSkusService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetDashboardMetricsService,
      useFactory: (repo: ISkuRepository) => new GetDashboardMetricsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetInventoryAlertsService,
      useFactory: (repo: ISkuRepository) => new GetInventoryAlertsService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: UpdateProductService,
      useFactory: (repo: ISkuRepository) => new UpdateProductService(repo),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: LinnworksSyncService,
      useFactory: (client: LinnworksApiClient, repo: ISkuRepository) =>
        new LinnworksSyncService(client, repo),
      inject: [LinnworksApiClient, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: LinnworksInventoryRefreshService,
      useFactory: (client: LinnworksApiClient, repo: ISkuRepository) =>
        new LinnworksInventoryRefreshService(client, repo),
      inject: [LinnworksApiClient, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: LinnworksHistoricalSalesIngestionService,
      useFactory: (client: LinnworksApiClient, repo: ISkuRepository) =>
        new LinnworksHistoricalSalesIngestionService(client, repo),
      inject: [LinnworksApiClient, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: SyncLinnworksCatalogService,
      useFactory: (
        linnworksClient: ILinnworksClient,
        skuRepository: ISkuRepository,
      ) => new SyncLinnworksCatalogService(linnworksClient, skuRepository),
      inject: [LINNWORKS_CLIENT_TOKEN, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: SyncLinnworksSalesService,
      useFactory: (
        linnworksClient: ILinnworksClient,
        skuRepository: ISkuRepository,
      ) => new SyncLinnworksSalesService(linnworksClient, skuRepository),
      inject: [LINNWORKS_CLIENT_TOKEN, SKU_REPOSITORY_TOKEN],
    },
    {
      provide: RunLinnworksDailySyncService,
      useFactory: (
        catalogSync: SyncLinnworksCatalogService,
        salesSync: SyncLinnworksSalesService,
        skuRepository: ISkuRepository,
      ) => new RunLinnworksDailySyncService(catalogSync, salesSync, skuRepository),
      inject: [
        SyncLinnworksCatalogService,
        SyncLinnworksSalesService,
        SKU_REPOSITORY_TOKEN,
      ],
    },
    {
      provide: ImportReportService,
      useFactory: (csvParser: CsvParserService, repo: ISkuRepository) =>
        new ImportReportService(csvParser, repo),
      inject: [CsvParserService, SKU_REPOSITORY_TOKEN],
    },
  ],
})
export class SkuDashboardModule {}
