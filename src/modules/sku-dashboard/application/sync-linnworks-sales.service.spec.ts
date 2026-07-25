import { ILinnworksClient } from '../ports/outbound/linnworks-client.port';
import {
  ISkuRepository,
  UpsertSalesMetricInput,
} from '../ports/outbound/sku-repository.port';
import { classifyFulfillmentType } from '../domain/models/product.domain';
import { SyncLinnworksSalesService } from './sync-linnworks-sales.service';

describe('classifyFulfillmentType', () => {
  it('returns FBA when SubSource contains FBA', () => {
    expect(classifyFulfillmentType('USFBA', 'AMAZON')).toBe('FBA');
    expect(classifyFulfillmentType('CAFBA', 'AMAZON')).toBe('FBA');
    expect(classifyFulfillmentType('FBA', 'AMAZON')).toBe('FBA');
  });

  it('returns MFN when SubSource contains FBM or MFN', () => {
    expect(classifyFulfillmentType('USFBM', 'AMAZON')).toBe('MFN');
    expect(classifyFulfillmentType('CAFBM', 'AMAZON')).toBe('MFN');
    expect(classifyFulfillmentType('MFN', 'AMAZON')).toBe('MFN');
  });

  it('returns ALL when SubSource has no fulfillment indicators', () => {
    expect(classifyFulfillmentType('AMAZON', 'AMAZON')).toBe('ALL');
    expect(classifyFulfillmentType('Amazon.com', 'AMAZON')).toBe('ALL');
    expect(classifyFulfillmentType(null, 'AMAZON')).toBe('ALL');
    expect(classifyFulfillmentType(undefined, 'AMAZON')).toBe('ALL');
  });

  it('checks Source as fallback', () => {
    expect(classifyFulfillmentType(null, 'AMAZON_FBA')).toBe('FBA');
    expect(classifyFulfillmentType(null, 'AMAZON_FBM')).toBe('MFN');
  });
});

describe('SyncLinnworksSalesService', () => {
  it('chunks processed-order searches into 90-day windows and stores rolling metrics', async () => {
    const searchedRanges: Array<{ from: Date; to: Date; pageNum: number }> = [];
    const metrics: UpsertSalesMetricInput[] = [];
    const now = new Date();
    const orderId = '00000000-0000-0000-0000-000000000001';

    const linnworksClient: ILinnworksClient = {
      getStockItemsFull: jest.fn(),
      getChannelSkus: jest.fn(),
      searchProcessedOrdersPaged: jest.fn(async (input) => {
        searchedRanges.push(input);

        return {
          PageNumber: input.pageNum,
          EntriesPerPage: 200,
          TotalEntries: input.pageNum === 1 ? 1 : 0,
          TotalPages: 1,
          Data:
            searchedRanges.length === 1
              ? [
                  {
                    pkOrderID: orderId,
                    dProcessedOn: now.toISOString(),
                    Source: 'AMAZON',
                    cCountry: 'US',
                    cCurrency: 'USD',
                  },
                ]
              : [],
        };
      }),
      getOrderItemsByOrderIds: jest.fn(async () => [
        {
          fkOrderID: orderId,
          SKU: 'SKU-1',
          Quantity: 2,
          PricePerUnit: 10,
        },
      ]),
    };

    const skuRepository = {
      replaceSalesMetrics: jest.fn(async (input: UpsertSalesMetricInput[]) => {
        metrics.push(...input);
        return input.length;
      }),
    } as unknown as ISkuRepository;

    const service = new SyncLinnworksSalesService(
      linnworksClient,
      skuRepository,
    );
    const result = await service.execute(365);

    expect(searchedRanges.length).toBeGreaterThan(1);
    expect(
      searchedRanges.every(
        (range) =>
          range.to.getTime() - range.from.getTime() <= 90 * 24 * 60 * 60 * 1000,
      ),
    ).toBe(true);
    expect(result.orderItems).toBe(1);
    expect(metrics).toHaveLength(4);
    expect(metrics.map((metric) => metric.unitsSold)).toEqual([2, 2, 2, 2]);
    expect(metrics.map((metric) => metric.revenue)).toEqual([20, 20, 20, 20]);
  });
});
