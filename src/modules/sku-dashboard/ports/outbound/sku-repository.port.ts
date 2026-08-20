import {
  ProductStatus,
  SalesFulfillmentType,
  SalesChannelType,
  SkuMetricsDomainModel,
  StockLocationType,
} from '../../domain/models/product.domain';

export type SkuStockStatusFilter =
  | 'ALL'
  | 'IN_STOCK'
  | 'LOW_STOCK'
  | 'OUT_OF_STOCK';

export interface BrowseSkusQuery {
  q?: string;
  stockStatus?: SkuStockStatusFilter;
  channel?: SalesChannelType | 'ALL';
  cursor?: string;
  limit: number;
}

export interface BrowseSkusResult {
  items: SkuMetricsDomainModel[];
  nextCursor: string | null;
  total: number;
}

export interface DashboardMetricsResult {
  salesVelocity: { channel: string; fba: number; mfn: number }[];
  stockDistribution: { name: string; value: number; fill: string }[];
  revenueTrend: { month: string; revenue: number }[];
}

export interface InventoryAlertResult {
  sku: string;
  title: string;
  type: 'DEAD_STOCK' | 'AGED_STOCK' | 'CRITICAL_LOW' | 'OUT_OF_STOCK';
  detail: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface UpsertProductInput {
  sku: string;
  title: string;
  brand?: string | null;
  category?: string | null;
  status?: ProductStatus;
  cost?: number | null;
  currency?: string;
  weight?: number | null;
  length?: number | null;
  width?: number | null;
  height?: number | null;
  material?: string | null;
  thickness?: string | null;
  packQty?: number | null;
  imageUrl?: string | null;
  productUrl?: string | null;
  lastSyncedAt?: Date;
}

export interface UpsertStockInput {
  sku: string;
  sourceLocationId: string;
  country: string | null;
  locationType: StockLocationType;
  warehouse?: string | null;
  quantity: number;
  reserved: number;
  inbound: number;
  available: number;
}

export interface UpsertChannelInput {
  sku: string;
  channel: SalesChannelType;
  country?: string | null;
  asin?: string | null;
  listingId?: string | null;
  source?: string | null;
  subSource?: string | null;
  sourceRowId?: string | null;
  externalReferenceId?: string | null;
  ignoreSync?: boolean;
  syncKey: string;
  price?: number | null;
  currency?: string;
  isActive?: boolean;
}

export interface UpsertSalesMetricInput {
  sku: string;
  channel: SalesChannelType;
  country?: string | null;
  fulfillmentType: SalesFulfillmentType;
  source?: string | null;
  subSource?: string | null;
  syncKey: string;
  periodStart: Date;
  periodEnd: Date;
  unitsSold: number;
  revenue: number;
  currency?: string;
}

export interface SyncLogInput {
  provider: string;
  status: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'FAILED';
  processedRows?: number;
  failedRows?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ISkuRepository {
  findMetricsBySku(sku: string): Promise<SkuMetricsDomainModel | null>;
  browseSkus(query: BrowseSkusQuery): Promise<BrowseSkusResult>;
  getDashboardMetrics(periodDays: number): Promise<DashboardMetricsResult>;
  getInventoryAlerts(): Promise<InventoryAlertResult[]>;
  upsertProducts(products: UpsertProductInput[]): Promise<number>;
  upsertStock(stock: UpsertStockInput[], syncedSkus: string[]): Promise<number>;
  upsertChannels(
    channels: UpsertChannelInput[],
    syncedSkus: string[],
  ): Promise<number>;
  replaceSalesMetrics(metrics: UpsertSalesMetricInput[]): Promise<number>;
  createSyncLog(input: SyncLogInput): Promise<string>;
  updateSyncLog(id: string, input: SyncLogInput): Promise<void>;
  updateProduct(
    sku: string,
    data: Pick<UpsertProductInput, 'material' | 'thickness' | 'packQty'>,
  ): Promise<void>;
}

export const SKU_REPOSITORY_TOKEN = Symbol('ISkuRepository');
