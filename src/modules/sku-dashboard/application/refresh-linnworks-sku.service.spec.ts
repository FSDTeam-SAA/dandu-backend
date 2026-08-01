import { LinnworksApiClient } from '../adapters/outbound/linnworks/linnworks-api.client';
import {
  ISkuRepository,
  UpsertChannelInput,
  UpsertProductInput,
  UpsertSalesMetricInput,
  UpsertStockInput,
} from '../ports/outbound/sku-repository.port';
import { RefreshLinnworksSkuService } from './refresh-linnworks-sku.service';

describe('RefreshLinnworksSkuService', () => {
  it('refreshes product, stock, and channel data for an exact SKU from Linnworks', async () => {
    const products: UpsertProductInput[] = [];
    const stockRows: UpsertStockInput[] = [];
    const channels: UpsertChannelInput[] = [];
    const salesMetrics: UpsertSalesMetricInput[] = [];

    const linnworksClient = {
      getStockItemBySku: jest.fn(async () => ({
        StockItemId: 'stock-item-1',
        ItemNumber: 'sku-1',
        ItemTitle: 'Linnworks Product',
        CategoryName: 'Category',
        PurchasePrice: 12.5,
        RetailPrice: 25,
        Weight: 4,
        Width: 5,
        Depth: 6,
        Height: 7,
        Images: [{ Source: 'https://example.com/image.jpg', IsMain: true }],
        StockLevels: [
          {
            StockItemId: 'stock-item-1',
            Location: {
              LocationId: 'location-1',
              LocationName: 'US FBA',
              IsFulfillmentCenter: true,
              CountryName: 'United States',
            },
            Available: 8,
            InOrders: 2,
            Due: 3,
            StockLevel: 10,
            Minimum: 0,
          },
        ],
        ItemChannelPrices: [
          { Source: 'AMAZON', SubSource: 'Amazon.com', Price: 29.99 },
        ],
        ItemExtendedProperties: [
          { PropertyName: 'Material', PropertyValue: 'Steel' },
          { PropertyName: 'PackQty', PropertyValue: '4' },
        ],
      })),
      getStockLevelsBulk: jest.fn(),
      getStockLevels: jest.fn(),
      getAllChannelListings: jest.fn(async () => [
        {
          StockItemId: 'stock-item-1',
          SKU: 'SKU-1',
          Source: 'AMAZON',
          SubSource: 'Amazon.com',
          ChannelReferenceId: 'B012345678',
          ListingId: 'listing-1',
          IsMultiVariation: false,
        },
      ]),
      getSalesMetrics: jest.fn(async () => [
        {
          sku: 'SKU-1',
          channelSource: 'AMAZON',
          subSource: 'USFBA',
          country: 'United States',
          fulfillmentType: 'FBA',
          periodStart: new Date('2026-07-25T00:00:00.000Z'),
          periodEnd: new Date('2026-08-01T00:00:00.000Z'),
          unitsSold: 3,
          revenue: 89.97,
          currency: 'USD',
        },
        {
          sku: 'OTHER-SKU',
          channelSource: 'EBAY',
          subSource: 'EBAY',
          country: 'United States',
          fulfillmentType: 'MFN',
          periodStart: new Date('2026-07-25T00:00:00.000Z'),
          periodEnd: new Date('2026-08-01T00:00:00.000Z'),
          unitsSold: 9,
          revenue: 100,
          currency: 'USD',
        },
      ]),
    } as unknown as LinnworksApiClient;

    const skuRepository = {
      upsertProduct: jest.fn(async (input: UpsertProductInput) => {
        products.push(input);
        return { id: 'product-1' };
      }),
      upsertStock: jest.fn(async (input: UpsertStockInput) => {
        stockRows.push(input);
      }),
      upsertChannel: jest.fn(async (input: UpsertChannelInput) => {
        channels.push(input);
      }),
      replaceSalesMetricsForSku: jest.fn(
        async (_sku: string, input: UpsertSalesMetricInput[]) => {
          salesMetrics.push(...input);
          return input.length;
        },
      ),
    } as unknown as ISkuRepository;

    const service = new RefreshLinnworksSkuService(
      linnworksClient,
      skuRepository,
    );

    await expect(service.execute('SKU-1')).resolves.toBe(true);

    expect(linnworksClient.getStockItemBySku).toHaveBeenCalledWith('SKU-1');
    expect(products).toMatchObject([
      {
        sku: 'SKU-1',
        title: 'Linnworks Product',
        category: 'Category',
        cost: 12.5,
        imageUrl: 'https://example.com/image.jpg',
        material: 'Steel',
        packQty: 4,
      },
    ]);
    expect(stockRows).toMatchObject([
      {
        sku: 'SKU-1',
        country: 'US',
        locationType: 'FBA',
        warehouse: 'US FBA',
        quantity: 10,
        reserved: 2,
        inbound: 3,
        available: 8,
      },
    ]);
    expect(channels).toMatchObject([
      {
        sku: 'SKU-1',
        channel: 'AMAZON',
        country: 'US',
        asin: 'B012345678',
        listingId: 'listing-1',
        price: 29.99,
        currency: 'USD',
        isActive: true,
      },
    ]);
    expect(linnworksClient.getSalesMetrics).toHaveBeenCalledWith([
      7, 30, 90, 365,
    ]);
    expect(skuRepository.replaceSalesMetricsForSku).toHaveBeenCalledWith(
      'SKU-1',
      expect.any(Array),
    );
    expect(salesMetrics).toMatchObject([
      {
        sku: 'SKU-1',
        channel: 'AMAZON',
        country: 'US',
        fulfillmentType: 'FBA',
        unitsSold: 3,
        revenue: 89.97,
        currency: 'USD',
      },
    ]);
  });

  it('returns false when Linnworks has no exact SKU match', async () => {
    const linnworksClient = {
      getStockItemBySku: jest.fn(async () => null),
    } as unknown as LinnworksApiClient;
    const skuRepository = {
      upsertProduct: jest.fn(),
      upsertStock: jest.fn(),
      upsertChannel: jest.fn(),
      replaceSalesMetricsForSku: jest.fn(),
    } as unknown as ISkuRepository;

    const service = new RefreshLinnworksSkuService(
      linnworksClient,
      skuRepository,
    );

    await expect(service.execute('MISSING')).resolves.toBe(false);
    expect(skuRepository.upsertProduct).not.toHaveBeenCalled();
  });
});
