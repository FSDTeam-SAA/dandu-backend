import { LinnworksApiClient } from './linnworks-api.client';
import { LinnworksConfig } from './linnworks.config';

const config = {
  applicationId: 'app-id',
  applicationSecret: 'app-secret',
  installationToken: 'install-token',
  initialServer: 'https://assigned-ext.linnworks.net',
  rateLimitPerMinute: 120,
  retryAttempts: 1,
  retryBaseDelayMs: 1,
} as LinnworksConfig;

const jsonResponse = (body: unknown): Response =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response;

const textResponse = (
  status: number,
  body: string,
  headers = new Headers(),
): Response =>
  ({
    ok: false,
    status,
    headers,
    text: async () => body,
  }) as Response;

describe('LinnworksApiClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries 429 responses before returning Linnworks data', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          Token: 'session-token',
          Server: 'https://assigned-ext.linnworks.net',
          TTL: 30,
        }),
      )
      .mockResolvedValueOnce(textResponse(429, 'quota exceeded'))
      .mockResolvedValueOnce(
        jsonResponse({
          Items: [
            {
              StockItemId: 'stock-item-1',
              ItemNumber: 'SKU-1',
            },
          ],
          TotalResults: 1,
        }),
      );

    const client = new LinnworksApiClient(config);

    await expect(client.getStockItemBySku('SKU-1')).resolves.toMatchObject({
      StockItemId: 'stock-item-1',
      ItemNumber: 'SKU-1',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
