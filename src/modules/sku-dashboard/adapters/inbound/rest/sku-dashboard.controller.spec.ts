import { SkuDashboardController } from './sku-dashboard.controller';

describe('SkuDashboardController', () => {
  it('returns SKU details from the read model without live Linnworks refresh', async () => {
    const metrics = {
      sku: 'SKU-1',
      product: {},
      stock: [],
      channels: [],
      salesMetrics: [],
    };
    const getSkuMetricsService = {
      execute: jest.fn(async () => metrics),
    };

    const controller = new SkuDashboardController(
      getSkuMetricsService as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(controller.search({ sku: 'SKU-1' })).resolves.toEqual({
      message: 'SKU metrics retrieved successfully',
      data: metrics,
    });
    expect(getSkuMetricsService.execute).toHaveBeenCalledWith('SKU-1');
  });
});
