import { LinnworksLocationConfig } from '../../../common/domain/interfaces/app-config.interface';
import { ILinnworksClient } from '../ports/outbound/linnworks-client.port';
import {
  ISkuRepository,
  UpsertChannelInput,
  UpsertProductInput,
  UpsertStockInput,
} from '../ports/outbound/sku-repository.port';
import { SyncLinnworksCatalogService } from './sync-linnworks-catalog.service';

describe('SyncLinnworksCatalogService', () => {
  it('preserves nested listings and attaches channel prices by source and subsource', async () => {
    const products: UpsertProductInput[] = [];
    const stock: UpsertStockInput[] = [];
    const channels: UpsertChannelInput[] = [];
    const locations: Record<string, LinnworksLocationConfig> = {
      'default-location': { country: 'US', locationType: 'WAREHOUSE' },
    };
    const linnworksClient: ILinnworksClient = {
      getStockItemsFull: jest.fn(async (page) =>
        page === 1
          ? [
              {
                StockItemId: 'stock-1',
                ItemNumber: 'SKU-1',
                ItemTitle: 'Sample product',
                CategoryName: 'Accessories',
                ItemExtendedProperties: [
                  { ProperyName: 'Brand', PropertyValue: 'Dandu' },
                ],
                StockLevels: [
                  {
                    StockLevel: 4,
                    Available: 0,
                    Location: {
                      StockLocationId: 'default-location',
                      LocationName: 'Default',
                    },
                  },
                ],
                ItemChannelPrices: [
                  { Source: 'AMAZON', SubSource: 'Amazon US', Price: 19.95 },
                ],
              },
            ]
          : [],
      ),
      getChannelSkus: jest.fn(async () => [
        {
          StockItemId: 'stock-1',
          ChannelSkus: [
            {
              ChannelSKURowId: 'amazon-row',
              Source: 'AMAZON',
              SubSource: 'Amazon US',
              ChannelReferenceId: 'B012345678',
            },
            {
              ChannelSKURowId: 'website-row',
              Source: 'BIGCOMMERCE',
              SubSource: 'DistinctAndUnique',
              ChannelReferenceId: 'catalog:product:42',
            },
            {
              ChannelSKURowId: 'etsy-row',
              Source: 'ETSY',
              SubSource: 'Etsy US',
              ChannelReferenceId: 'etsy-42',
              IgnoreSync: true,
            },
          ],
        },
      ]),
      getProcessedOrders: jest.fn(),
    };
    const skuRepository = {
      upsertProducts: jest.fn(async (input: UpsertProductInput[]) => {
        products.push(...input);
        return input.length;
      }),
      upsertStock: jest.fn(async (input: UpsertStockInput[]) => {
        stock.push(...input);
        return input.length;
      }),
      upsertChannels: jest.fn(async (input: UpsertChannelInput[]) => {
        channels.push(...input);
        return input.length;
      }),
    } as unknown as ISkuRepository;

    await new SyncLinnworksCatalogService(
      linnworksClient,
      skuRepository,
      locations,
    ).execute();

    expect(products[0]).toMatchObject({
      category: 'Accessories',
      brand: 'Dandu',
    });
    expect(stock[0]).toMatchObject({
      sourceLocationId: 'default-location',
      country: 'US',
      locationType: 'WAREHOUSE',
      available: 0,
    });
    expect(channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          channel: 'AMAZON',
          asin: 'B012345678',
          price: 19.95,
          sourceRowId: 'amazon-row',
        }),
        expect.objectContaining({
          channel: 'WEBSITE',
          listingId: 'catalog:product:42',
        }),
        expect.objectContaining({
          channel: 'ETSY',
          externalReferenceId: 'etsy-42',
          ignoreSync: true,
        }),
      ]),
    );
  });
});
