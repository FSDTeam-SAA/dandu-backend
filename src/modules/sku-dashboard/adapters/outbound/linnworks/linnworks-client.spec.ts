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
  linnworks_auth_url: 'https://api.linnworks.net/api/Auth/AuthorizeByApplication',
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
};

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    json: async () => body,
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
});

