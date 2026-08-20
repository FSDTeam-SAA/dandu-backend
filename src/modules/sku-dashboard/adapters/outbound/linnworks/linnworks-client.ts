import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG_TOKEN } from '../../../../../common/domain/interfaces/app-config.interface';
import type { IAppConfig } from '../../../../../common/domain/interfaces/app-config.interface';
import {
  ILinnworksClient,
  LinnworksChannelSkuBatch,
  LinnworksStockItem,
  LinnworksV2OrdersPage,
} from '../../../ports/outbound/linnworks-client.port';

interface AuthSession {
  token: string;
  server: string;
  expiresAt: number;
}

interface AuthResponse {
  Token?: string;
  token?: string;
  AccessToken?: string;
  accessToken?: string;
  Server?: string;
  server?: string;
  Ttl?: number;
  TTL?: number;
  ttl?: number;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

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
  ): Promise<LinnworksChannelSkuBatch[]> {
    if (inventoryItemIds.length === 0) return [];

    return this.request<LinnworksChannelSkuBatch[]>(
      '/api/Inventory/BatchGetInventoryItemChannelSKUs',
      {
        inventoryItemIds,
      },
    );
  }

  async getProcessedOrders(input: {
    from: Date;
    to: Date;
    nextSearchToken?: string | null;
  }): Promise<LinnworksV2OrdersPage> {
    const params = new URLSearchParams({
      fromDate: input.from.toISOString(),
      toDate: input.to.toISOString(),
      includeProcessed: 'true',
      entriesPerPage: String(
        Math.min(this.config.linnworks_orders_page_size, 200),
      ),
    });
    if (input.nextSearchToken) params.set('searchToken', input.nextSearchToken);

    return this.requestV2<LinnworksV2OrdersPage>(
      `/v2/orders?${params.toString()}`,
    );
  }

  private async request<T>(
    path: string,
    body: unknown,
    options: { emptyValue?: T } = {},
  ): Promise<T> {
    let session = await this.authorize();
    let url = `${session.server.replace(/\/$/, '')}${path}`;
    let refreshedAfterUnauthorized = false;

    for (
      let attempt = 0;
      attempt <= this.config.linnworks_retry_attempts;
      attempt += 1
    ) {
      await this.waitForRateLimitSlot();

      try {
        const response = await this.fetchJson(url, body, {
          Authorization: session.token,
        });

        if (response.ok) return (await response.json()) as T;

        if (
          [401, 403].includes(response.status) &&
          !refreshedAfterUnauthorized
        ) {
          this.session = null;
          session = await this.authorize();
          url = `${session.server.replace(/\/$/, '')}${path}`;
          refreshedAfterUnauthorized = true;
          attempt -= 1;
          continue;
        }

        const text = await this.readResponseText(response);

        if (![429, 500, 502, 503, 504].includes(response.status)) {
          if (response.status === 400 && text.includes('No items found')) {
            return options.emptyValue ?? ([] as unknown as T);
          }
          throw new Error(
            `Linnworks request failed: ${response.status} - ${text}`,
          );
        }

        if (attempt === this.config.linnworks_retry_attempts) {
          throw new Error(
            `Linnworks request failed after retries: ${response.status} - ${text}`,
          );
        }
      } catch (error) {
        if (attempt === this.config.linnworks_retry_attempts) throw error;
      }

      await sleep(this.config.linnworks_retry_base_delay_ms * 2 ** attempt);
    }

    throw new Error('Linnworks request failed');
  }

  private async requestV2<T>(path: string): Promise<T> {
    let session = await this.authorize();
    let url = `${this.toV2Server(session.server)}${path}`;
    let refreshedAfterUnauthorized = false;

    for (
      let attempt = 0;
      attempt <= this.config.linnworks_retry_attempts;
      attempt += 1
    ) {
      await this.waitForRateLimitSlot();

      try {
        const response = await this.fetchGet(url, {
          Authorization: session.token,
        });
        if (response.ok) return (await response.json()) as T;

        if (
          [401, 403].includes(response.status) &&
          !refreshedAfterUnauthorized
        ) {
          this.session = null;
          session = await this.authorize();
          url = `${this.toV2Server(session.server)}${path}`;
          refreshedAfterUnauthorized = true;
          attempt -= 1;
          continue;
        }

        const text = await this.readResponseText(response);
        if (![429, 500, 502, 503, 504].includes(response.status)) {
          throw new Error(
            `Linnworks v2 request failed: ${response.status} - ${text}`,
          );
        }
        if (attempt === this.config.linnworks_retry_attempts) {
          throw new Error(
            `Linnworks v2 request failed after retries: ${response.status} - ${text}`,
          );
        }
      } catch (error) {
        if (attempt === this.config.linnworks_retry_attempts) throw error;
      }

      await sleep(this.config.linnworks_retry_base_delay_ms * 2 ** attempt);
    }

    throw new Error('Linnworks v2 request failed');
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
    const token =
      auth.Token || auth.token || auth.AccessToken || auth.accessToken;
    const server =
      auth.Server || auth.server || this.config.linnworks_default_server;
    const ttlMinutes =
      auth.Ttl ||
      auth.TTL ||
      auth.ttl ||
      this.config.linnworks_token_ttl_minutes;

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

    const requestHeaders: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      ...headers,
    };

    try {
      return await fetch(url, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchGet(
    url: string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.linnworks_timeout_ms,
    );

    try {
      return await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json', ...headers },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private toV2Server(server: string): string {
    const url = new URL(server);
    url.hostname = url.hostname.replace(/-ext\./, '-api.');
    return url.toString().replace(/\/$/, '');
  }

  private async readResponseText(response: Response): Promise<string> {
    const text = await response.text();

    try {
      const parsed: unknown = JSON.parse(text);
      if (!isRecord(parsed)) return text;

      const message =
        parsed.Message ||
        parsed.message ||
        parsed.MessageDetail ||
        parsed.messageDetail ||
        parsed.Error ||
        parsed.error;

      return typeof message === 'string' ? message : text;
    } catch {
      return text;
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
