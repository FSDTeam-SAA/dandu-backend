export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
export type StockLocationType =
  | 'FBA'
  | 'FBM'
  | 'MFN'
  | 'WAREHOUSE'
  | 'THIRD_PARTY';
export type SalesChannelType =
  | 'AMAZON'
  | 'EBAY'
  | 'WALMART'
  | 'SHOPIFY'
  | 'WEBSITE'
  | 'OTHER';
export type FulfillmentType = 'FBA' | 'MFN' | 'ALL';

/**
 * Normalize SKU by stripping FBA/FBM/MFN fulfillment suffixes.
 * e.g. "2023151DCAFBA" → "2023151D", "2023151DUSFBA" → "2023151D"
 * Handles patterns: {base}{country}{fulfillment} where country is 2-letter code
 * and fulfillment is FBA, FBM, or MFN.
 */
export function normalizeSku(sku: string): string {
  if (!sku) return sku;
  return sku.replace(/(USFBA|CAFBA|USFBM|CAFBM|FBA|FBM|MFN)$/i, '').trim();
}

/**
 * Classify fulfillment type from SubSource or Source fields.
 * SubSource for Amazon orders can contain: "USFBA", "CAFBA", "USFBM", "CAFBM",
 * "AMAZON", "Amazon.com", etc.
 */
export function classifyFulfillmentType(
  subSource?: string | null,
  source?: string | null,
): string {
  const subUpper = (subSource ?? '').toUpperCase();
  if (subUpper.includes('FBA')) return 'FBA';
  if (subUpper.includes('FBM') || subUpper.includes('MFN')) return 'MFN';

  const sourceUpper = (source ?? '').toUpperCase();
  if (sourceUpper.includes('FBA')) return 'FBA';
  if (sourceUpper.includes('FBM') || sourceUpper.includes('MFN')) return 'MFN';

  return 'ALL';
}

export interface ProductDomainModel {
  id: string;
  sku: string;
  title: string;
  brand: string | null;
  category: string | null;
  status: ProductStatus;
  cost: number | null;
  currency: string;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  dimensions: {
    length: number | null;
    width: number | null;
    height: number | null;
  };
  imageUrl: string | null;
  productUrl: string | null;
  material: string | null;
  thickness: string | null;
  packQty: number | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductStockDomainModel {
  id: string;
  productId: string;
  country: string;
  locationType: StockLocationType;
  warehouse: string | null;
  quantity: number;
  reserved: number;
  inbound: number;
  available: number;
  updatedAt: Date;
}

export interface ProductChannelDomainModel {
  id: string;
  productId: string;
  channel: SalesChannelType;
  country: string | null;
  asin: string | null;
  listingId: string | null;
  price: number | null;
  fbaPrice: number | null;
  mfnPrice: number | null;
  currency: string;
  isActive: boolean;
  updatedAt: Date;
}

export interface ProductSalesMetricDomainModel {
  id: string;
  productId: string;
  productChannelId: string | null;
  channel: SalesChannelType;
  country: string | null;
  fulfillmentType: FulfillmentType;
  periodStart: Date;
  periodEnd: Date;
  unitsSold: number;
  revenue: number;
  velocity: number | null;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SkuMetricsDomainModel {
  sku: string;
  product: ProductDomainModel;
  stock: ProductStockDomainModel[];
  channels: ProductChannelDomainModel[];
  salesMetrics: ProductSalesMetricDomainModel[];
}
