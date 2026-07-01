import { Prisma } from '@prisma/client';
import {
  SkuMetricsDomainModel,
  StockLocationType,
} from '../../../../domain/models/product.domain';

type ProductWithMetrics = Prisma.ProductGetPayload<{
  include: {
    stock: true;
    channels: true;
    salesMetrics: true;
  };
}>;

const decimalToNumber = (value: Prisma.Decimal | null): number | null =>
  value === null ? null : value.toNumber();

const toResponseLocationType = (value: string): StockLocationType =>
  (value === 'FBM' ? 'MFN' : value) as StockLocationType;

export class SkuDashboardMapper {
  static toDomain(product: ProductWithMetrics): SkuMetricsDomainModel {
    return {
      sku: product.sku,
      product: {
        id: product.id,
        sku: product.sku,
        title: product.title,
        brand: product.brand,
        category: product.category,
        status: product.status,
        cost: decimalToNumber(product.cost),
        currency: product.currency,
        weight: decimalToNumber(product.weight),
        length: decimalToNumber(product.length),
        width: decimalToNumber(product.width),
        height: decimalToNumber(product.height),
        dimensions: {
          length: decimalToNumber(product.length),
          width: decimalToNumber(product.width),
          height: decimalToNumber(product.height),
        },
        imageUrl: product.imageUrl,
        productUrl: product.productUrl,
        material: product.material,
        thickness: product.thickness,
        packQty: product.packQty,
        lastSyncedAt: product.lastSyncedAt,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt,
      },
      stock: product.stock.map((stock) => ({
        id: stock.id,
        productId: stock.productId,
        country: stock.country,
        locationType: toResponseLocationType(stock.locationType),
        warehouse: stock.warehouse,
        quantity: stock.quantity,
        reserved: stock.reserved,
        inbound: stock.inbound,
        available: stock.available,
        updatedAt: stock.updatedAt,
      })),
      channels: product.channels.map((channel) => ({
        id: channel.id,
        productId: channel.productId,
        channel: channel.channel,
        country: channel.country || null,
        asin: channel.asin || null,
        listingId: channel.listingId || null,
        price: decimalToNumber(channel.price),
        currency: channel.currency,
        isActive: channel.isActive,
        updatedAt: channel.updatedAt,
      })),
      salesMetrics: product.salesMetrics.map((metric) => ({
        id: metric.id,
        productId: metric.productId,
        productChannelId: metric.productChannelId,
        channel: metric.channel,
        country: metric.country,
        periodStart: metric.periodStart,
        periodEnd: metric.periodEnd,
        unitsSold: metric.unitsSold,
        revenue: metric.revenue.toNumber(),
        velocity: decimalToNumber(metric.velocity),
        currency: metric.currency,
        createdAt: metric.createdAt,
        updatedAt: metric.updatedAt,
      })),
    };
  }
}
