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
