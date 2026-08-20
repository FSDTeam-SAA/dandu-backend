import { ISkuRepository } from '../ports/outbound/sku-repository.port';
import {
  CatalogSyncResult,
  SyncLinnworksCatalogService,
} from './sync-linnworks-catalog.service';
import {
  SalesSyncResult,
  SyncLinnworksSalesService,
} from './sync-linnworks-sales.service';

export interface LinnworksSyncResult {
  status: 'COMPLETED' | 'PARTIAL_SUCCESS' | 'FAILED';
  updatedSkus: number;
  updatedStock: number;
  updatedListings: number;
  syncedAt: string;
  durationMs: number;
  catalog?: CatalogSyncResult;
  sales?: SalesSyncResult;
  phaseErrors: Array<{ phase: 'CATALOG' | 'SALES'; message: string }>;
}

export class RunLinnworksDailySyncService {
  constructor(
    private readonly catalogSync: SyncLinnworksCatalogService,
    private readonly salesSync: SyncLinnworksSalesService,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(): Promise<LinnworksSyncResult> {
    const startedAt = Date.now();
    const logId = await this.skuRepository.createSyncLog({
      provider: 'LINNWORKS',
      status: 'PARTIAL_SUCCESS',
      metadata: { state: 'RUNNING' },
    });

    let catalog: CatalogSyncResult;
    try {
      catalog = await this.catalogSync.execute();
    } catch {
      const durationMs = Date.now() - startedAt;
      await this.skuRepository.updateSyncLog(logId, {
        provider: 'LINNWORKS',
        status: 'FAILED',
        failedRows: 1,
        errorMessage: 'Catalog sync failed',
        metadata: { durationMs, failedPhase: 'CATALOG' },
      });
      return {
        status: 'FAILED',
        updatedSkus: 0,
        updatedStock: 0,
        updatedListings: 0,
        syncedAt: new Date().toISOString(),
        durationMs,
        phaseErrors: [{ phase: 'CATALOG', message: 'Catalog sync failed' }],
      };
    }

    try {
      const sales = await this.salesSync.execute(365);
      const durationMs = Date.now() - startedAt;
      await this.skuRepository.updateSyncLog(logId, {
        provider: 'LINNWORKS',
        status: 'SUCCESS',
        processedRows: catalog.products + catalog.stockRows + sales.orderItems,
        metadata: { catalog, sales, durationMs },
      });
      return {
        status: 'COMPLETED',
        updatedSkus: catalog.products,
        updatedStock: catalog.stockRows,
        updatedListings: catalog.channels,
        syncedAt: new Date().toISOString(),
        durationMs,
        catalog,
        sales,
        phaseErrors: [],
      };
    } catch {
      const durationMs = Date.now() - startedAt;
      await this.skuRepository.updateSyncLog(logId, {
        provider: 'LINNWORKS',
        status: 'PARTIAL_SUCCESS',
        processedRows: catalog.products + catalog.stockRows,
        failedRows: 1,
        errorMessage: 'Sales sync failed after catalog sync completed',
        metadata: { catalog, durationMs, failedPhase: 'SALES' },
      });
      return {
        status: 'PARTIAL_SUCCESS',
        updatedSkus: catalog.products,
        updatedStock: catalog.stockRows,
        updatedListings: catalog.channels,
        syncedAt: new Date().toISOString(),
        durationMs,
        catalog,
        phaseErrors: [{ phase: 'SALES', message: 'Sales sync failed' }],
      };
    }
  }
}
