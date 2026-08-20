import { IAppConfig } from '../../../../../common/domain/interfaces/app-config.interface';
import { LinnworksClient } from './linnworks-client';

const config: IAppConfig = {
  jwt_access_secret: 'secret',
  jwt_refresh_secret: 'secret',
  redis_cache_key_prefix: 'test',
  rate_limit_enabled: true,
  linnworks_application_id: 'app-id',
  linnworks_application_secret: 'app-secret',
  linnworks_token: 'install-token',
  linnworks_auth_url:
    'https://api.linnworks.net/api/Auth/AuthorizeByApplication',
  linnworks_default_server: 'https://us-ext.linnworks.net',
  linnworks_token_ttl_minutes: 30,
  linnworks_catalog_page_size: 200,
  linnworks_orders_page_size: 200,
  linnworks_channel_batch_size: 100,
  linnworks_order_items_batch_size: 50,
  linnworks_timeout_ms: 1000,
  linnworks_retry_attempts: 0,
  linnworks_retry_base_delay_ms: 1,
  linnworks_rate_limit_per_minute: 150,
  linnworks_daily_sync_cron: '0 3 * * *',
  linnworks_location_map: {},
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

const textResponse = (status: number, body: string): Response =>
  ({
    ok: false,
    status,
    text: async () => body,
  }) as Response;

describe('LinnworksClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('caches AuthorizeByApplication session and uses the returned server', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'session-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse([]));

    const client = new LinnworksClient(config);

    await client.getStockItemsFull(1);
    await client.getStockItemsFull(2);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][0]).toBe(config.linnworks_auth_url);
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://assigned-ext.linnworks.net/api/Stock/GetStockItemsFull',
    );
    expect(fetchMock.mock.calls[2][0]).toBe(
      'https://assigned-ext.linnworks.net/api/Stock/GetStockItemsFull',
    );
  });

  it('uses AccessToken when Token is not present in the auth response', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          AccessToken: 'access-token',
          Server: 'https://assigned-ext.linnworks.net',
          TTL: 30,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const client = new LinnworksClient(config);

    await client.getStockItemsFull(1);

    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'access-token',
      }),
    });
  });

  it('requests processed orders from v2 with the continuation token', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'session-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          NextSearchToken: null,
          OpenOrders: [],
          ProcessedOrders: [],
          TotalOrders: 0,
        }),
      );

    const client = new LinnworksClient(config);
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-02T00:00:00.000Z');

    await client.getProcessedOrders({
      from,
      to,
      nextSearchToken: 'next-page',
    });

    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://assigned-api.linnworks.net/v2/orders?fromDate=2026-01-01T00%3A00%3A00.000Z&toDate=2026-01-02T00%3A00%3A00.000Z&includeProcessed=true&entriesPerPage=200&searchToken=next-page',
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'GET',
      headers: expect.objectContaining({
        Authorization: 'session-token',
      }),
    });
  });

  it('reauthorizes once when a cached session is rejected', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'old-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(textResponse(401, 'expired'))
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'new-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(jsonResponse([]));

    const client = new LinnworksClient(config);

    await client.getStockItemsFull(1);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'new-token',
      }),
    });
  });

  it('retains nested channel-sku response wrappers', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'session-token',
          Server: 'https://assigned-ext.linnworks.net',
          Ttl: 30,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse([
          {
            StockItemId: 'stock-1',
            ChannelSkus: [
              {
                ChannelSKURowId: 'row-1',
                Source: 'AMAZON',
                SubSource: 'Amazon US',
                ChannelReferenceId: 'B012345678',
                IgnoreSync: true,
              },
            ],
          },
        ]),
      );

    const client = new LinnworksClient(config);
    await expect(client.getChannelSkus(['stock-1'])).resolves.toEqual([
      {
        StockItemId: 'stock-1',
        ChannelSkus: [
          expect.objectContaining({
            ChannelReferenceId: 'B012345678',
            IgnoreSync: true,
          }),
        ],
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
