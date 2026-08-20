export type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
export type StockLocationType =
  | 'FBA'
  | 'FBM'
  | 'WAREHOUSE'
  | 'THIRD_PARTY'
  | 'UNKNOWN';
export type SalesFulfillmentType = 'FBA' | 'MFN' | 'UNKNOWN';
export type SalesChannelType =
  | 'AMAZON'
  | 'EBAY'
  | 'WALMART'
  | 'SHOPIFY'
  | 'ETSY'
  | 'WEBSITE'
  | 'OTHER';

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
  material: string | null;
  thickness: string | null;
  packQty: number | null;
  dimensions: {
    length: number | null;
    width: number | null;
    height: number | null;
  };
  imageUrl: string | null;
  productUrl: string | null;
  lastSyncedAt: Date | null;
}

export interface ProductStockDomainModel {
  sourceLocationId: string | null;
  country: string | null;
  locationType: StockLocationType;
  warehouse: string | null;
  quantity: number;
  reserved: number;
  inbound: number;
  available: number;
}

export interface ProductChannelDomainModel {
  channel: SalesChannelType;
  country: string | null;
  asin: string | null;
  listingId: string | null;
  source: string | null;
  subSource: string | null;
  sourceRowId: string | null;
  externalReferenceId: string | null;
  ignoreSync: boolean;
  price: number | null;
  currency: string;
  isActive: boolean;
}

export interface ProductSalesMetricDomainModel {
  channel: SalesChannelType;
  country: string | null;
  fulfillmentType: SalesFulfillmentType;
  source: string | null;
  subSource: string | null;
  periodStart: Date;
  periodEnd: Date;
  unitsSold: number;
  revenue: number;
  velocity: number | null;
  currency: string;
}

export interface SkuMetricsDomainModel {
  sku: string;
  product: ProductDomainModel;
  stock: ProductStockDomainModel[];
  channels: ProductChannelDomainModel[];
  salesMetrics: ProductSalesMetricDomainModel[];
}
