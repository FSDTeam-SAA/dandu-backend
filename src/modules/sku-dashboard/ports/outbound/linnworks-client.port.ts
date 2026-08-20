export interface LinnworksStockItem {
  StockItemId?: string;
  ItemNumber?: string;
  ItemTitle?: string;
  PurchasePrice?: number;
  RetailPrice?: number;
  Weight?: number;
  Height?: number;
  Width?: number;
  Depth?: number;
  Images?: Array<{
    Source?: string;
    FullSource?: string;
    IsMain?: boolean;
  }>;
  CategoryName?: string;
  ItemExtendedProperties?: Array<{
    ProperyName?: string;
    PropertyName?: string;
    PropertyValue?: string | number | null;
  }>;
  StockLevels?: Array<{
    StockLevel?: number;
    InOrderBook?: number;
    InOrders?: number;
    Due?: number;
    Available?: number;
    Location?: {
      StockLocationId?: string;
      LocationName?: string;
      LocationTag?: string;
      IsFulfillmentCenter?: boolean;
      IsWarehouseManaged?: boolean;
    };
  }>;
  ItemChannelPrices?: Array<{
    Source?: string;
    SubSource?: string;
    Price?: number;
  }>;
}

export interface LinnworksChannelSku {
  ChannelSKURowId?: string;
  Source?: string;
  SubSource?: string;
  SKU?: string;
  ChannelReferenceId?: string;
  IgnoreSync?: boolean;
}

export interface LinnworksChannelSkuBatch {
  StockItemId?: string;
  ChannelSkus?: LinnworksChannelSku[];
}

export interface LinnworksV2OrderItem {
  SKU?: string;
  ItemNumber?: string;
  Quantity?: number;
  PricePerUnit?: number;
  IsService?: boolean;
  IsUnlinked?: boolean;
}

export interface LinnworksV2Order {
  FulfilmentLocationId?: string;
  ProcessedOn?: string;
  GeneralInfo?: {
    Source?: string;
    SubSource?: string;
    Currency?: string;
  };
  TotalsInfo?: {
    Currency?: string;
  };
  Items?: LinnworksV2OrderItem[];
}

export interface LinnworksV2OrdersPage {
  NextSearchToken?: string | null;
  OpenOrders?: LinnworksV2Order[];
  ProcessedOrders?: LinnworksV2Order[];
  TotalOrders?: number;
}

export interface ILinnworksClient {
  getStockItemsFull(pageNumber: number): Promise<LinnworksStockItem[]>;
  getChannelSkus(
    inventoryItemIds: string[],
  ): Promise<LinnworksChannelSkuBatch[]>;
  getProcessedOrders(input: {
    from: Date;
    to: Date;
    nextSearchToken?: string | null;
  }): Promise<LinnworksV2OrdersPage>;
}

export const LINNWORKS_CLIENT_TOKEN = Symbol('ILinnworksClient');
