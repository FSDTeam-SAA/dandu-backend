import { ILinnworksClient } from '../ports/outbound/linnworks-client.port';
import {
  ISkuRepository,
  UpsertSalesMetricInput,
} from '../ports/outbound/sku-repository.port';
import { SyncLinnworksSalesService } from './sync-linnworks-sales.service';

describe('SyncLinnworksSalesService', () => {
  it('uses v2 embedded items, continuation tokens, source country, and mapped fulfillment', async () => {
    const metrics: UpsertSalesMetricInput[] = [];
    const now = new Date();
    const getProcessedOrders = jest
      .fn()
      .mockResolvedValueOnce({
        NextSearchToken: 'page-2',
        ProcessedOrders: [
          {
            ProcessedOn: now.toISOString(),
            FulfilmentLocationId: 'ca-fba',
            GeneralInfo: { Source: 'AMAZON', SubSource: 'Amazon Canada' },
            TotalsInfo: { Currency: 'CAD' },
            Items: [{ SKU: 'SKU-1', Quantity: 2, PricePerUnit: 10 }],
          },
        ],
      })
      .mockResolvedValueOnce({
        NextSearchToken: null,
        ProcessedOrders: [
          {
            ProcessedOn: now.toISOString(),
            GeneralInfo: { Source: 'AMAZON FBA', SubSource: 'Amazon US' },
            Items: [
              { SKU: 'SKU-1', Quantity: 1, PricePerUnit: 5 },
              {
                SKU: 'service',
                Quantity: 1,
                PricePerUnit: 99,
                IsService: true,
              },
            ],
          },
        ],
      });
    const linnworksClient: ILinnworksClient = {
      getStockItemsFull: jest.fn(),
      getChannelSkus: jest.fn(),
      getProcessedOrders,
    };
    const skuRepository = {
      replaceSalesMetrics: jest.fn(async (input: UpsertSalesMetricInput[]) => {
        metrics.push(...input);
        return input.length;
      }),
    } as unknown as ISkuRepository;

    const result = await new SyncLinnworksSalesService(
      linnworksClient,
      skuRepository,
      { 'ca-fba': { country: 'CA', locationType: 'FBA' } },
    ).execute(365);

    expect(getProcessedOrders).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      orders: 2,
      orderItems: 3,
      skippedItems: 1,
      pages: 2,
    });
    expect(metrics).toHaveLength(8);
    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          country: 'CA',
          fulfillmentType: 'FBA',
          revenue: 20,
          currency: 'CAD',
        }),
        expect.objectContaining({
          country: 'US',
          fulfillmentType: 'FBA',
          revenue: 5,
        }),
      ]),
    );
  });

  it('fails safely when the v2 page is malformed instead of treating it as an empty final page', async () => {
    const linnworksClient: ILinnworksClient = {
      getStockItemsFull: jest.fn(),
      getChannelSkus: jest.fn(),
      getProcessedOrders: jest.fn(async () => ({ NextSearchToken: null })),
    };
    const skuRepository = {
      replaceSalesMetrics: jest.fn(),
    } as unknown as ISkuRepository;

    await expect(
      new SyncLinnworksSalesService(linnworksClient, skuRepository).execute(30),
    ).rejects.toThrow('malformed');
  });
});
