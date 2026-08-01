import {
  LinnworksApiClient,
  LinnworksChannelListing,
  LinnworksSalesMetric,
  LinnworksStockItem,
  LinnworksStockLevel,
} from '../adapters/outbound/linnworks/linnworks-api.client';
import { normalizeSku } from '../domain/models/product.domain';
import {
  ISkuRepository,
  UpsertChannelInput,
  UpsertProductInput,
  UpsertStockInput,
} from '../ports/outbound/sku-repository.port';
import {
  extractCountryFromLocation,
  extractCountryFromSubSource,
  findChannelPrice,
  findFbaPrice,
  findMfnPrice,
  mapChannelSource,
  mapLocationType,
  normalizeCountry,
  parseNullableNumber,
  readExtendedProperty,
} from './linnworks-sync.service';

export class RefreshLinnworksSkuService {
  constructor(
    private readonly linnworksClient: LinnworksApiClient,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(sku: string): Promise<boolean> {
    const normalizedSku = normalizeSku(sku.trim());
    if (!normalizedSku) return false;

    const item = await this.linnworksClient.getStockItemBySku(normalizedSku);
    if (!item?.ItemNumber || !item.StockItemId) {
      return false;
    }

    await this.skuRepository.upsertProduct(
      this.toProductInput(item, normalizedSku),
    );

    const embeddedStockLevels = (item.StockLevels ?? []).map((level) => ({
      ...level,
      StockItemId: level.StockItemId ?? item.StockItemId,
    }));
    const stockLevels =
      embeddedStockLevels.length > 0
        ? embeddedStockLevels
        : await this.linnworksClient
            .getStockLevelsBulk([item.StockItemId])
            .catch(() => this.linnworksClient.getStockLevels([item.StockItemId]));

    for (const stockInput of this.toStockInputs(
      item,
      stockLevels,
      normalizedSku,
    )) {
      await this.skuRepository.upsertStock(stockInput);
    }

    const listings = await this.linnworksClient
      .getAllChannelListings([item.StockItemId])
      .catch(() => {
        return [] as LinnworksChannelListing[];
      });

    for (const channelInput of this.toChannelInputs(
      item,
      listings,
      normalizedSku,
    )) {
      await this.skuRepository.upsertChannel(channelInput);
    }

    const salesMetrics = await this.linnworksClient
      .getSalesMetrics([7, 30, 90, 365])
      .then((metrics) => this.toSalesMetricInputs(metrics, normalizedSku));
    await this.skuRepository.replaceSalesMetricsForSku(
      normalizedSku,
      salesMetrics,
    );

    return true;
  }

  private toProductInput(
    item: LinnworksStockItem,
    sku: string,
  ): UpsertProductInput {
    const mainImage = item.Images?.find((img) => img.IsMain) ?? item.Images?.[0];

    return {
      sku,
      title: item.ItemTitle ?? item.ItemNumber,
      brand: null,
      category: item.CategoryName ?? null,
      cost: item.PurchasePrice ?? null,
      currency: 'USD',
      weight: item.Weight ?? null,
      length: item.Depth ?? null,
      width: item.Width ?? null,
      height: item.Height ?? null,
      imageUrl: mainImage?.Source ?? null,
      material: readExtendedProperty(item, [
        'Material',
        'MaterialType',
        'ProductMaterial',
      ]),
      thickness: readExtendedProperty(item, [
        'Thickness',
        'ProductThickness',
        'ThicknessGauge',
      ]),
      packQty: parseNullableNumber(
        readExtendedProperty(item, [
          'PackQty',
          'Pack Qty',
          'PackQuantity',
          'QuantityPerPack',
        ]),
      ),
    };
  }

  private toStockInputs(
    item: LinnworksStockItem,
    stockLevels: LinnworksStockLevel[],
    sku: string,
  ): UpsertStockInput[] {
    return stockLevels
      .filter((level) => level.StockItemId === item.StockItemId)
      .map((level) => ({
        sku,
        country: extractCountryFromLocation(level.Location),
        locationType: mapLocationType(level.Location),
        warehouse: level.Location.LocationName,
        quantity: level.StockLevel,
        reserved: level.InOrders ?? level.InOrderBook ?? 0,
        inbound: level.Due,
        available: level.Available,
      }));
  }

  private toChannelInputs(
    item: LinnworksStockItem,
    listings: LinnworksChannelListing[],
    sku: string,
  ): UpsertChannelInput[] {
    return listings
      .filter((listing) => listing.StockItemId === item.StockItemId)
      .map((listing) => {
        const channelPrice = findChannelPrice(
          item.ItemChannelPrices,
          listing.Source,
          listing.SubSource,
        );
        const fbaPrice = findFbaPrice(item.ItemChannelPrices, listing.Source);
        const mfnPrice = findMfnPrice(item.ItemChannelPrices, listing.Source);

        return {
          sku,
          channel: mapChannelSource(listing.Source, listing.SubSource),
          country: extractCountryFromSubSource(listing.SubSource),
          asin: listing.ChannelReferenceId ?? null,
          listingId: listing.ListingId ?? listing.ChannelSKURowId ?? null,
          price: listing.Price ?? channelPrice ?? item.RetailPrice ?? null,
          fbaPrice: fbaPrice ?? undefined,
          mfnPrice: mfnPrice ?? undefined,
          currency: 'USD',
          isActive: true,
        };
      });
  }

  private toSalesMetricInputs(
    metrics: LinnworksSalesMetric[],
    sku: string,
  ) {
    const normalizedSku = sku.toUpperCase();

    return metrics
      .filter(
        (metric) => normalizeSku(metric.sku).toUpperCase() === normalizedSku,
      )
      .map((metric) => ({
        sku,
        channel: mapChannelSource(metric.channelSource, metric.subSource),
        country:
          extractCountryFromSubSource(metric.subSource) ??
          normalizeCountry(metric.country),
        fulfillmentType: (metric.fulfillmentType as any) ?? 'ALL',
        periodStart: metric.periodStart,
        periodEnd: metric.periodEnd,
        unitsSold: metric.unitsSold,
        revenue: metric.revenue,
        currency: metric.currency ?? 'USD',
      }));
  }
}
