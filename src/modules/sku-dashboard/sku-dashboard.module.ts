<<<<<<< HEAD

=======
import { BullModule } from '@nestjs/bullmq';
>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

// Controllers
import { SkuDashboardController } from './adapters/inbound/rest/sku-dashboard.controller';
import { ImportController } from './adapters/inbound/rest/import.controller';
<<<<<<< HEAD

// Application services
=======
import { LinnworksSyncProcessor } from './adapters/inbound/queue/linnworks-sync.processor';
import { LinnworksSyncQueue } from './adapters/inbound/queue/linnworks-sync.queue';
import { LinnworksClient } from './adapters/outbound/linnworks/linnworks-client';
import {
  ILinnworksClient,
  LINNWORKS_CLIENT_TOKEN,
} from './ports/outbound/linnworks-client.port';
>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
import { CsvParserService } from './application/csv-parser.service';
import { BrowseSkusService } from './application/browse-skus.service';
import { GetDashboardMetricsService } from './application/get-dashboard-metrics.service';
import { GetSkuMetricsService } from './application/get-sku-metrics.service';
import { GetInventoryAlertsService } from './application/get-inventory-alerts.service';
import { ImportReportService } from './application/import-report.service';
<<<<<<< HEAD
import { BrowseSkusService } from './application/browse-skus.service';
import { GetDashboardMetricsService } from './application/get-dashboard-metrics.service';
import { GetInventoryAlertsService } from './application/get-inventory-alerts.service';
import { UpdateProductService } from './application/update-product.service';
import { LinnworksSyncService } from './application/linnworks-sync.service';
import { LinnworksInventoryRefreshService } from './application/linnworks-inventory-refresh.service';
import { LinnworksHistoricalSalesIngestionService } from './application/linnworks-historical-sales-ingestion.service';
import { SyncSchedulerService } from './application/sync-scheduler.service';

// Ports
=======
import { RunLinnworksDailySyncService } from './application/run-linnworks-daily-sync.service';
import { SyncLinnworksCatalogService } from './application/sync-linnworks-catalog.service';
import { SyncLinnworksSalesService } from './application/sync-linnworks-sales.service';
>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
import {
  SKU_REPOSITORY_TOKEN,
  ISkuRepository,
} from './ports/outbound/sku-repository.port';

// Adapters
import { PrismaSkuDashboardRepository } from './adapters/outbound/persistence/prisma-sku-dashboard.repository';
<<<<<<< HEAD
import { LinnworksConfig } from './adapters/outbound/linnworks/linnworks.config';
import { LinnworksApiClient } from './adapters/outbound/linnworks/linnworks-api.client';

@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [SkuDashboardController, ImportController],
  providers: [
    // -------------------------------------------------------------------------
    // Infrastructure
    // -------------------------------------------------------------------------
=======
import { UpdateProductService } from './application/update-product.service';

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({
      name: 'linnworks-sync',
    }),
  ],
  controllers: [SkuDashboardController, ImportController],
  providers: [
    CsvParserService,
    LinnworksClient,
    LinnworksSyncQueue,
    LinnworksSyncProcessor,
>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
    PrismaSkuDashboardRepository,
    {
      provide: LINNWORKS_CLIENT_TOKEN,
      useExisting: LinnworksClient,
    },
    {
      provide: SKU_REPOSITORY_TOKEN,
      useExisting: PrismaSkuDashboardRepository,
    },
    LinnworksConfig,
    {
      provide: LinnworksApiClient,
      useFactory: (config: LinnworksConfig) => new LinnworksApiClient(config),
      inject: [LinnworksConfig],
    },

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
      provide: BrowseSkusService,
      useFactory: (skuRepository: ISkuRepository) =>
        new BrowseSkusService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetDashboardMetricsService,
      useFactory: (skuRepository: ISkuRepository) =>
        new GetDashboardMetricsService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
    },
    {
      provide: GetInventoryAlertsService,
      useFactory: (skuRepository: ISkuRepository) =>
        new GetInventoryAlertsService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
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
    {
<<<<<<< HEAD
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
    SyncSchedulerService,
=======
      provide: UpdateProductService,
      useFactory: (skuRepository: ISkuRepository) =>
        new UpdateProductService(skuRepository),
      inject: [SKU_REPOSITORY_TOKEN],
    },
>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
  ],
})
export class SkuDashboardModule {}
