import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG_TOKEN } from '../../../../../common/domain/interfaces/app-config.interface';
import type { IAppConfig } from '../../../../../common/domain/interfaces/app-config.interface';
import {
  ILinnworksClient,
  LinnworksChannelSku,
  LinnworksOrderItem,
  LinnworksPagedOrders,
  LinnworksStockItem,
} from '../../../ports/outbound/linnworks-client.port';

interface AuthSession {
  token: string;
  server: string;
  expiresAt: number;
}

interface AuthResponse {
  Token?: string;
  token?: string;
  Server?: string;
  server?: string;
  Ttl?: number;
  TTL?: number;
  ttl?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Injectable()
export class LinnworksClient implements ILinnworksClient {
  private session: AuthSession | null = null;
  private readonly requestTimestamps: number[] = [];

  constructor(
    @Inject(APP_CONFIG_TOKEN)
    private readonly config: IAppConfig,
  ) {}

  async getStockItemsFull(pageNumber: number): Promise<LinnworksStockItem[]> {
    return this.request<LinnworksStockItem[]>('/api/Stock/GetStockItemsFull', {
      keyword: '',
      loadCompositeParents: false,
      loadVariationParents: false,
      entriesPerPage: Math.min(this.config.linnworks_catalog_page_size, 200),
      pageNumber,
      dataRequirements: [
        'StockLevels',
        'Pricing',
        'ChannelPrice',
        'Images',
        'ExtendedProperties',
      ],
      searchTypes: ['SKU', 'Title'],
    });
  }

  async getChannelSkus(
    inventoryItemIds: string[],
  ): Promise<LinnworksChannelSku[]> {
    if (inventoryItemIds.length === 0) return [];

    return this.request<LinnworksChannelSku[]>(
      '/api/Inventory/BatchGetInventoryItemChannelSKUs',
      {
        inventoryItemIds,
      },
    );
  }

  async searchProcessedOrdersPaged(input: {
    from: Date;
    to: Date;
    pageNum: number;
  }): Promise<LinnworksPagedOrders> {
    return this.request<LinnworksPagedOrders>(
      '/api/ProcessedOrders/SearchProcessedOrdersPaged',
      new URLSearchParams({
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        dateType: 'PROCESSED',
        searchField: '',
        exactMatch: 'false',
        searchTerm: '',
        pageNum: input.pageNum.toString(),
        numEntriesPerPage: Math.min(this.config.linnworks_orders_page_size, 200).toString(),
      }),
    );
  }

  async getOrderItemsByOrderIds(orderIds: string[]): Promise<LinnworksOrderItem[]> {
    if (orderIds.length === 0) return [];

    return this.request<LinnworksOrderItem[]>(
      '/api/ProcessedOrders/GetOrderItemsByOrderIds',
      {
        orderIds,
      },
    );
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const session = await this.authorize();
    const url = `${session.server.replace(/\/$/, '')}${path}`;

    for (let attempt = 0; attempt <= this.config.linnworks_retry_attempts; attempt += 1) {
      await this.waitForRateLimitSlot();

      try {
        const response = await this.fetchJson(url, body, {
          Authorization: session.token,
        });

        if (response.ok) return (await response.json()) as T;

        if (![429, 500, 502, 503, 504].includes(response.status)) {
          const text = await response.text();
          if (response.status === 400 && text.includes('No items found')) {
            return [] as unknown as T;
          }
          throw new Error(`Linnworks request failed: ${response.status} - ${text}`);
        }

        if (attempt === this.config.linnworks_retry_attempts) {
          throw new Error(`Linnworks request failed after retries: ${response.status}`);
        }
      } catch (error) {
        if (attempt === this.config.linnworks_retry_attempts) throw error;
      }

      await sleep(this.config.linnworks_retry_base_delay_ms * 2 ** attempt);
    }

    throw new Error('Linnworks request failed');
  }

  private async authorize(): Promise<AuthSession> {
    const now = Date.now();

    if (this.session && this.session.expiresAt - now > 60_000) {
      return this.session;
    }

    if (
      !this.config.linnworks_application_id ||
      !this.config.linnworks_application_secret ||
      !this.config.linnworks_token
    ) {
      throw new Error('Linnworks credentials are not configured');
    }

    await this.waitForRateLimitSlot();

    const response = await this.fetchJson(this.config.linnworks_auth_url, {
      ApplicationId: this.config.linnworks_application_id,
      ApplicationSecret: this.config.linnworks_application_secret,
      Token: this.config.linnworks_token,
    });

    if (!response.ok) {
      throw new Error(`Linnworks authorization failed: ${response.status}`);
    }

    const auth = (await response.json()) as AuthResponse;
    const token = auth.Token || auth.token;
    const server = auth.Server || auth.server || this.config.linnworks_default_server;
    const ttlMinutes =
      auth.Ttl || auth.TTL || auth.ttl || this.config.linnworks_token_ttl_minutes;

    if (!token) {
      throw new Error('Linnworks authorization did not return a token');
    }

    this.session = {
      token,
      server,
      expiresAt: now + ttlMinutes * 60_000,
    };

    return this.session;
  }

  private async fetchJson(
    url: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.linnworks_timeout_ms,
    );

    const isUrlEncoded = body instanceof URLSearchParams;
    const requestHeaders: Record<string, string> = {
      accept: 'application/json',
      ...headers,
    };

    if (!isUrlEncoded) {
      requestHeaders['content-type'] = 'application/json';
    }

    try {
      return await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: isUrlEncoded ? body : JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async waitForRateLimitSlot(): Promise<void> {
    const now = Date.now();
    const windowStart = now - 60_000;

    while (
      this.requestTimestamps.length > 0 &&
      this.requestTimestamps[0] < windowStart
    ) {
      this.requestTimestamps.shift();
    }

    if (
      this.requestTimestamps.length >=
      this.config.linnworks_rate_limit_per_minute
    ) {
      const waitMs = this.requestTimestamps[0] + 60_000 - now;
      await sleep(Math.max(waitMs, 250));
      return this.waitForRateLimitSlot();
    }

    this.requestTimestamps.push(now);
  }
}
