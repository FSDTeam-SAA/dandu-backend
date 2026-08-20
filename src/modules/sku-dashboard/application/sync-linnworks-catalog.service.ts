import { LinnworksLocationConfig } from '../../../common/domain/interfaces/app-config.interface';
import { SalesChannelType } from '../domain/models/product.domain';
import {
  ILinnworksClient,
  LinnworksChannelSku,
  LinnworksChannelSkuBatch,
  LinnworksStockItem,
} from '../ports/outbound/linnworks-client.port';
import {
  ISkuRepository,
  UpsertChannelInput,
  UpsertProductInput,
  UpsertStockInput,
} from '../ports/outbound/sku-repository.port';
import { resolveLinnworksLocation } from './linnworks-location-policy';

export interface CatalogSyncResult {
  products: number;
  stockRows: number;
  channels: number;
}

const MAX_CATALOG_PAGES = 1_000;
const CHANNEL_BATCH_SIZE = 100;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const sourceKey = (source?: string | null, subSource?: string | null): string =>
  `${source || ''}`.trim().toUpperCase() +
  `:${subSource || ''}`.trim().toUpperCase();

export class SyncLinnworksCatalogService {
  constructor(
    private readonly linnworksClient: ILinnworksClient,
    private readonly skuRepository: ISkuRepository,
    private readonly configuredLocations: Record<
      string,
      LinnworksLocationConfig
    > = {},
  ) {}

  async execute(): Promise<CatalogSyncResult> {
    const stockItems = await this.fetchAllStockItems();
    const channelSkuRowsByStockId = await this.fetchChannelSkuRows(stockItems);
    const products = stockItems.map((item) => this.toProduct(item));
    const stock = stockItems.flatMap((item) => this.toStockRows(item));
    const channels = stockItems.flatMap((item) =>
      this.toChannelRows(
        item,
        channelSkuRowsByStockId.get(item.StockItemId || '') || [],
      ),
    );

    const productCount = await this.skuRepository.upsertProducts(products);
    const stockCount = await this.skuRepository.upsertStock(
      stock,
      products.map((product) => product.sku),
    );
    const channelCount = await this.skuRepository.upsertChannels(
      channels,
      products.map((product) => product.sku),
    );

    return {
      products: productCount,
      stockRows: stockCount,
      channels: channelCount,
    };
  }

  private async fetchAllStockItems(): Promise<LinnworksStockItem[]> {
    const items: LinnworksStockItem[] = [];
    for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
      const pageItems = await this.linnworksClient.getStockItemsFull(page);
      if (!Array.isArray(pageItems))
        throw new Error(`Linnworks catalog page ${page} was malformed`);
      if (pageItems.length === 0) return items;
      items.push(...pageItems.filter((item) => item.ItemNumber));
    }
    throw new Error(`Linnworks catalog exceeded ${MAX_CATALOG_PAGES} pages`);
  }

  private async fetchChannelSkuRows(
    stockItems: LinnworksStockItem[],
  ): Promise<Map<string, LinnworksChannelSku[]>> {
    const ids = stockItems
      .map((item) => item.StockItemId)
      .filter((id): id is string => Boolean(id));
    const byStockId = new Map<string, LinnworksChannelSku[]>();
    for (const idBatch of chunk(ids, CHANNEL_BATCH_SIZE)) {
      const result = await this.linnworksClient.getChannelSkus(idBatch);
      if (!Array.isArray(result))
        throw new Error('Linnworks channel SKU response was malformed');
      for (const wrapper of result)
        this.addChannelSkuWrapper(byStockId, wrapper);
    }
    return byStockId;
  }

  private addChannelSkuWrapper(
    byStockId: Map<string, LinnworksChannelSku[]>,
    wrapper: LinnworksChannelSkuBatch,
  ): void {
    if (!wrapper || typeof wrapper !== 'object' || !wrapper.StockItemId) {
      throw new Error('Linnworks channel SKU wrapper was malformed');
    }
    if (!Array.isArray(wrapper.ChannelSkus)) {
      throw new Error(
        `Linnworks channel SKU rows were malformed for ${wrapper.StockItemId}`,
      );
    }
    byStockId.set(wrapper.StockItemId, wrapper.ChannelSkus);
  }

  private toProduct(item: LinnworksStockItem): UpsertProductInput {
    const mainImage =
      item.Images?.find((image) => image.IsMain) || item.Images?.[0] || null;
    return {
      sku: item.ItemNumber || '',
      title: item.ItemTitle || item.ItemNumber || 'Untitled Linnworks item',
      brand: this.property(item, 'BRAND'),
      category: item.CategoryName || null,
      status: 'ACTIVE',
      cost: item.PurchasePrice ?? null,
      currency: 'USD',
      weight: item.Weight ?? null,
      length: item.Depth ?? null,
      width: item.Width ?? null,
      height: item.Height ?? null,
      imageUrl: mainImage?.FullSource || mainImage?.Source || null,
      lastSyncedAt: new Date(),
    };
  }

  private toStockRows(item: LinnworksStockItem): UpsertStockInput[] {
    const sku = item.ItemNumber || '';
    return (item.StockLevels || []).map((level, index) => {
      const location = level.Location;
      const locationName =
        location?.LocationName || location?.LocationTag || null;
      const resolved = resolveLinnworksLocation(
        location,
        this.configuredLocations,
      );
      const reserved = level.InOrders ?? level.InOrderBook ?? 0;
      const quantity = level.StockLevel ?? 0;
      return {
        sku,
        sourceLocationId:
          location?.StockLocationId ||
          `unnamed:${item.StockItemId || sku}:${index}`,
        country: resolved.country,
        locationType: resolved.locationType,
        warehouse: locationName,
        quantity,
        reserved,
        inbound: level.Due ?? 0,
        available: level.Available ?? Math.max(0, quantity - reserved),
      };
    });
  }

  private toChannelRows(
    item: LinnworksStockItem,
    channelSkuRows: LinnworksChannelSku[],
  ): UpsertChannelInput[] {
    const sku = item.ItemNumber || '';
    const prices = new Map(
      (item.ItemChannelPrices || []).map((price) => [
        sourceKey(price.Source, price.SubSource),
        price.Price ?? item.RetailPrice ?? null,
      ]),
    );
    const rows = new Map<string, UpsertChannelInput>();

    for (const channelSku of channelSkuRows) {
      const reference = channelSku.ChannelReferenceId || channelSku.SKU || null;
      const sourceRowId = channelSku.ChannelSKURowId || null;
      const channel = this.toSalesChannel(channelSku.Source);
      const asin = channel === 'AMAZON' ? this.inferAsin(reference) : null;
      const syncKey =
        sourceRowId ||
        `reference:${sourceKey(channelSku.Source, channelSku.SubSource)}:${reference || ''}`;
      rows.set(syncKey, {
        sku,
        channel,
        country: this.inferCountry(channelSku.SubSource || channelSku.Source),
        asin,
        listingId: asin ? null : reference,
        source: channelSku.Source || null,
        subSource: channelSku.SubSource || null,
        sourceRowId,
        externalReferenceId: channelSku.ChannelReferenceId || null,
        ignoreSync: channelSku.IgnoreSync === true,
        syncKey,
        price:
          prices.get(sourceKey(channelSku.Source, channelSku.SubSource)) ??
          null,
        currency: 'USD',
        isActive: true,
      });
    }

    for (const price of item.ItemChannelPrices || []) {
      const key = sourceKey(price.Source, price.SubSource);
      if (
        Array.from(rows.values()).some(
          (row) => sourceKey(row.source, row.subSource) === key,
        )
      )
        continue;
      const syncKey = `price:${key}`;
      rows.set(syncKey, {
        sku,
        channel: this.toSalesChannel(price.Source),
        country: this.inferCountry(price.SubSource || price.Source),
        source: price.Source || null,
        subSource: price.SubSource || null,
        syncKey,
        price: price.Price ?? item.RetailPrice ?? null,
        currency: 'USD',
        isActive: true,
      });
    }
    return Array.from(rows.values());
  }

  private property(item: LinnworksStockItem, name: string): string | null {
    const property = item.ItemExtendedProperties?.find(
      (entry) =>
        (entry.ProperyName || entry.PropertyName || '').trim().toUpperCase() ===
        name,
    );
    return property?.PropertyValue == null
      ? null
      : String(property.PropertyValue);
  }

  private toSalesChannel(value?: string | null): SalesChannelType {
    const normalized = (value || '').toUpperCase();
    if (normalized.includes('AMAZON')) return 'AMAZON';
    if (normalized.includes('EBAY')) return 'EBAY';
    if (normalized.includes('WALMART')) return 'WALMART';
    if (normalized.includes('SHOPIFY')) return 'SHOPIFY';
    if (normalized.includes('ETSY')) return 'ETSY';
    if (
      normalized.includes('BIGCOMMERCE') ||
      normalized.includes('DANDU') ||
      normalized.includes('DISTINCT')
    )
      return 'WEBSITE';
    return 'OTHER';
  }

  private inferCountry(value?: string | null): string | null {
    const normalized = (value || '').toUpperCase();
    if (normalized.includes('CANADA') || /(^|\W)CA(\W|$)/.test(normalized))
      return 'CA';
    if (
      normalized.includes('UNITED STATES') ||
      /(^|\W)US(\W|$)/.test(normalized)
    )
      return 'US';
    if (normalized.includes('UK') || normalized.includes('GB')) return 'UK';
    return null;
  }

  private inferAsin(value?: string | null): string | null {
    const match = (value || '').match(/\bB0[A-Z0-9]{8}\b/i);
    return match ? match[0].toUpperCase() : null;
  }
}
