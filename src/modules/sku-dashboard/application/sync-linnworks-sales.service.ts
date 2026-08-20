import { LinnworksLocationConfig } from '../../../common/domain/interfaces/app-config.interface';
import {
  SalesChannelType,
  SalesFulfillmentType,
} from '../domain/models/product.domain';
import {
  ILinnworksClient,
  LinnworksV2Order,
} from '../ports/outbound/linnworks-client.port';
import {
  ISkuRepository,
  UpsertSalesMetricInput,
} from '../ports/outbound/sku-repository.port';
import { resolveLinnworksLocation } from './linnworks-location-policy';

export interface SalesSyncResult {
  orders: number;
  orderItems: number;
  metrics: number;
  pages: number;
  skippedItems: number;
}

interface OrderContext {
  processedAt: Date;
  channel: SalesChannelType;
  country: string | null;
  fulfillmentType: SalesFulfillmentType;
  source: string | null;
  subSource: string | null;
  currency: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOWS = [7, 30, 90, 365] as const;
const MAX_ORDER_PAGES = 10_000;

export class SyncLinnworksSalesService {
  constructor(
    private readonly linnworksClient: ILinnworksClient,
    private readonly skuRepository: ISkuRepository,
    private readonly configuredLocations: Record<
      string,
      LinnworksLocationConfig
    > = {},
  ) {}

  async execute(days = 365): Promise<SalesSyncResult> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * MS_PER_DAY);
    const { orders, pages } = await this.fetchOrders(periodStart, periodEnd);
    const { metrics, orderItems, skippedItems } = this.aggregateMetrics(
      orders,
      periodEnd,
    );
    const metricCount = await this.skuRepository.replaceSalesMetrics(metrics);

    return {
      orders: orders.length,
      orderItems,
      metrics: metricCount,
      pages,
      skippedItems,
    };
  }

  private async fetchOrders(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ orders: LinnworksV2Order[]; pages: number }> {
    const orders: LinnworksV2Order[] = [];
    const seenTokens = new Set<string>();
    let nextSearchToken: string | null | undefined;

    for (let pageNumber = 1; pageNumber <= MAX_ORDER_PAGES; pageNumber += 1) {
      const page = await this.linnworksClient.getProcessedOrders({
        from: periodStart,
        to: periodEnd,
        nextSearchToken,
      });
      if (!page || !Array.isArray(page.ProcessedOrders)) {
        throw new Error(`Linnworks v2 orders page ${pageNumber} was malformed`);
      }
      orders.push(...page.ProcessedOrders);
      if (!page.NextSearchToken) return { orders, pages: pageNumber };
      if (seenTokens.has(page.NextSearchToken)) {
        throw new Error(
          'Linnworks v2 orders pagination repeated a search token',
        );
      }
      seenTokens.add(page.NextSearchToken);
      nextSearchToken = page.NextSearchToken;
    }

    throw new Error(`Linnworks v2 orders exceeded ${MAX_ORDER_PAGES} pages`);
  }

  private aggregateMetrics(
    orders: LinnworksV2Order[],
    periodEnd: Date,
  ): {
    metrics: UpsertSalesMetricInput[];
    orderItems: number;
    skippedItems: number;
  } {
    const buckets = new Map<string, UpsertSalesMetricInput>();
    let orderItems = 0;
    let skippedItems = 0;

    for (const order of orders) {
      const context = this.toOrderContext(order);
      if (!context) continue;

      for (const item of order.Items || []) {
        orderItems += 1;
        const sku = item.SKU || item.ItemNumber;
        if (!sku || item.IsService || item.IsUnlinked) {
          skippedItems += 1;
          continue;
        }
        const quantity = item.Quantity ?? 0;
        const revenue = (item.PricePerUnit ?? 0) * quantity;

        for (const days of WINDOWS) {
          const windowStart = new Date(periodEnd.getTime() - days * MS_PER_DAY);
          if (context.processedAt < windowStart) continue;
          const syncKey = [
            'sales',
            sku,
            context.channel,
            context.country || 'UNKNOWN',
            context.fulfillmentType,
            context.source || '',
            context.subSource || '',
            days,
          ].join(':');
          const existing = buckets.get(syncKey);
          if (existing) {
            existing.unitsSold += quantity;
            existing.revenue += revenue;
            continue;
          }
          buckets.set(syncKey, {
            sku,
            channel: context.channel,
            country: context.country,
            fulfillmentType: context.fulfillmentType,
            source: context.source,
            subSource: context.subSource,
            syncKey,
            periodStart: windowStart,
            periodEnd,
            unitsSold: quantity,
            revenue,
            currency: context.currency,
          });
        }
      }
    }

    return { metrics: Array.from(buckets.values()), orderItems, skippedItems };
  }

  private toOrderContext(order: LinnworksV2Order): OrderContext | null {
    const processedAt = order.ProcessedOn ? new Date(order.ProcessedOn) : null;
    if (!processedAt || Number.isNaN(processedAt.getTime())) return null;
    const source = order.GeneralInfo?.Source || null;
    const subSource = order.GeneralInfo?.SubSource || null;
    return {
      processedAt,
      channel: this.toSalesChannel(source),
      country: this.inferCountry(subSource || source),
      fulfillmentType: this.toFulfillmentType(order, source),
      source,
      subSource,
      currency:
        order.TotalsInfo?.Currency || order.GeneralInfo?.Currency || 'USD',
    };
  }

  private toFulfillmentType(
    order: LinnworksV2Order,
    source: string | null,
  ): SalesFulfillmentType {
    const resolved = resolveLinnworksLocation(
      { StockLocationId: order.FulfilmentLocationId },
      this.configuredLocations,
    );
    if (resolved.locationType === 'FBA') return 'FBA';
    if (
      resolved.locationType === 'WAREHOUSE' ||
      resolved.locationType === 'FBM'
    )
      return 'MFN';

    const normalizedSource = (source || '').toUpperCase();
    if (normalizedSource.includes('FBA')) return 'FBA';
    if (normalizedSource.includes('MFN')) return 'MFN';
    return 'UNKNOWN';
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
}
