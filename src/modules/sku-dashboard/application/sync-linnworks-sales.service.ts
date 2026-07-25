import { Logger } from '@nestjs/common';
import {
  SalesChannelType,
  classifyFulfillmentType,
  normalizeSku,
} from '../domain/models/product.domain';
import {
  ILinnworksClient,
  LinnworksOrderItem,
  LinnworksProcessedOrder,
} from '../ports/outbound/linnworks-client.port';
import {
  ISkuRepository,
  UpsertSalesMetricInput,
} from '../ports/outbound/sku-repository.port';

export interface SalesSyncResult {
  orders: number;
  orderItems: number;
  metrics: number;
}

interface OrderContext {
  processedAt: Date;
  channel: SalesChannelType;
  country: string | null;
  currency: string;
  fulfillmentType: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const WINDOWS = [7, 30, 90, 365] as const;

const chunk = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export class SyncLinnworksSalesService {
  private readonly logger = new Logger(SyncLinnworksSalesService.name);

  constructor(
    private readonly linnworksClient: ILinnworksClient,
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(days = 365): Promise<SalesSyncResult> {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - days * MS_PER_DAY);
    this.logger.log(
      `Sales sync started: ${days}-day window from ${periodStart.toISOString()} to ${periodEnd.toISOString()}`,
    );

    const orders = await this.fetchOrders(periodStart, periodEnd);
    this.logger.log(`Fetched ${orders.length} processed orders`);

    const contexts = this.toOrderContexts(orders);
    const orderIds = Array.from(contexts.keys());
    this.logger.log(`Fetching order items for ${orderIds.length} orders...`);

    const orderItems: LinnworksOrderItem[] = [];

    for (const idBatch of chunk(orderIds, 50)) {
      const items = await this.linnworksClient.getOrderItemsByOrderIds(idBatch);
      if (Array.isArray(items)) orderItems.push(...items);
    }

    this.logger.log(`Fetched ${orderItems.length} order items`);

    const metrics = this.aggregateMetrics(orderItems, contexts, periodEnd);
    this.logger.log(`Aggregated ${metrics.length} sales metric buckets`);

    const metricCount = await this.skuRepository.replaceSalesMetrics(metrics);
    this.logger.log(`Stored ${metricCount} sales metrics`);

    return {
      orders: orders.length,
      orderItems: orderItems.length,
      metrics: metricCount,
    };
  }

  private async fetchOrders(
    periodStart: Date,
    periodEnd: Date,
  ): Promise<LinnworksProcessedOrder[]> {
    const orders: LinnworksProcessedOrder[] = [];

    for (
      let from = new Date(periodStart);
      from < periodEnd;
      from = new Date(
        Math.min(periodEnd.getTime(), from.getTime() + 90 * MS_PER_DAY),
      )
    ) {
      const to = new Date(
        Math.min(periodEnd.getTime(), from.getTime() + 90 * MS_PER_DAY - 1),
      );

      for (let pageNum = 1; pageNum <= 1000; pageNum += 1) {
        const page = await this.linnworksClient.searchProcessedOrdersPaged({
          from,
          to,
          pageNum,
        });
        const data = Array.isArray(page.Data) ? page.Data : [];
        orders.push(...data);

        if (page.TotalPages ? pageNum >= page.TotalPages : data.length === 0) {
          break;
        }
      }
    }

    return orders;
  }

  private toOrderContexts(
    orders: LinnworksProcessedOrder[],
  ): Map<string, OrderContext> {
    const contexts = new Map<string, OrderContext>();
    const subSourceSamples = new Map<string, number>();

    for (const order of orders) {
      if (!order.pkOrderID) continue;

      const fulfillmentType = classifyFulfillmentType(
        order.SubSource,
        order.Source,
      );

      const subSample = order.SubSource ?? '(empty)';
      subSourceSamples.set(
        subSample,
        (subSourceSamples.get(subSample) ?? 0) + 1,
      );

      contexts.set(order.pkOrderID, {
        processedAt: new Date(
          order.dProcessedOn || order.dReceivedDate || new Date().toISOString(),
        ),
        channel: this.toSalesChannel(order.Source),
        country: this.toCountryCode(order.cCountry || order.SubSource || null),
        currency: order.cCurrency || 'USD',
        fulfillmentType,
      });
    }

    const total = orders.length;
    const fba = [...contexts.values()].filter(
      (c) => c.fulfillmentType === 'FBA',
    ).length;
    const mfn = [...contexts.values()].filter(
      (c) => c.fulfillmentType === 'MFN',
    ).length;
    const all = [...contexts.values()].filter(
      (c) => c.fulfillmentType === 'ALL',
    ).length;
    this.logger.log(
      `Order fulfillment breakdown: ${total} total, ${fba} FBA, ${mfn} MFN, ${all} ALL (unclassified)`,
    );

    const topSamples = [...subSourceSamples.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ');
    this.logger.log(`Top SubSource values: ${topSamples}`);

    return contexts;
  }

  private aggregateMetrics(
    orderItems: LinnworksOrderItem[],
    contexts: Map<string, OrderContext>,
    periodEnd: Date,
  ): UpsertSalesMetricInput[] {
    const buckets = new Map<string, UpsertSalesMetricInput>();

    for (const item of orderItems) {
      const orderId = item.fkOrderID || item.OrderId;
      const context = orderId ? contexts.get(orderId) : null;
      const sku = normalizeSku(item.SKU || item.ItemNumber || '');
      if (!context || !sku) continue;

      const quantity = item.Quantity ?? item.nQty ?? 0;
      const revenue =
        item.LineTotal ?? (item.PricePerUnit ?? item.Cost ?? 0) * quantity;

      for (const days of WINDOWS) {
        const windowStart = new Date(periodEnd.getTime() - days * MS_PER_DAY);
        if (context.processedAt < windowStart) continue;

        const key = [
          sku,
          context.channel,
          context.country || '',
          context.fulfillmentType,
          days,
        ].join(':');
        const existing = buckets.get(key);

        if (existing) {
          existing.unitsSold += quantity;
          existing.revenue = (existing.revenue ?? 0) + revenue;
          continue;
        }

        buckets.set(key, {
          sku,
          channel: context.channel,
          country: context.country,
          fulfillmentType: context.fulfillmentType as any,
          periodStart: windowStart,
          periodEnd,
          unitsSold: quantity,
          revenue,
          currency: context.currency,
        });
      }
    }

    return Array.from(buckets.values());
  }

  private toSalesChannel(value?: string | null): SalesChannelType {
    const normalized = (value || '').toUpperCase();
    if (normalized.includes('AMAZON')) return 'AMAZON';
    if (normalized.includes('EBAY')) return 'EBAY';
    if (normalized.includes('WALMART')) return 'WALMART';
    if (normalized.includes('SHOPIFY')) return 'SHOPIFY';
    if (normalized.includes('DANDU') || normalized.includes('DISTINCT')) {
      return 'WEBSITE';
    }
    return 'OTHER';
  }

  private toCountryCode(value?: string | null): string | null {
    const normalized = (value || '').toUpperCase();
    if (!normalized) return null;
    if (
      [
        'US',
        'USA',
        'U.S.',
        'U.S.A.',
        'UNITED STATES',
        'UNITED STATES OF AMERICA',
      ].includes(normalized)
    )
      return 'US';
    if (['CA', 'CAN', 'CANADA'].includes(normalized)) return 'CA';
    if (
      normalized.includes('CANADA') ||
      normalized.includes('CAFBA') ||
      normalized.includes('CAFBM')
    )
      return 'CA';
    if (
      normalized.includes('UNITED STATES') ||
      normalized.includes('USFBA') ||
      normalized.includes('USFBM')
    )
      return 'US';
    return normalized;
  }
}
