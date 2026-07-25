import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG_TOKEN } from '../../../../../common/domain/interfaces/app-config.interface';
import type { IAppConfig } from '../../../../../common/domain/interfaces/app-config.interface';
import { normalizeSku } from '../../../domain/models/product.domain';
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
  private readonly logger = new Logger(LinnworksClient.name);
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
      {
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        dateType: 'PROCESSED',
        searchField: '',
        exactMatch: false,
        searchTerm: '',
        pageNum: input.pageNum,
        numEntriesPerPage: Math.min(
          this.config.linnworks_orders_page_size,
          200,
        ),
      },
      {
        emptyValue: {
          PageNumber: input.pageNum,
          EntriesPerPage: Math.min(this.config.linnworks_orders_page_size, 200),
          TotalEntries: 0,
          TotalPages: 0,
          Data: [],
        },
      },
    );
  }

  async getOrderItemsByOrderIds(
    orderIds: string[],
  ): Promise<LinnworksOrderItem[]> {
    if (orderIds.length === 0) return [];

    const BATCH = 150;
    const allItems: LinnworksOrderItem[] = [];

    for (let i = 0; i < orderIds.length; i += BATCH) {
      const batchIds = orderIds.slice(i, i + BATCH);
      const result = await this.request<unknown>(
        '/api/Orders/GetOrders',
        {
          ordersIds: batchIds,
          loadItems: true,
          loadAdditionalInfo: false,
        },
        {
          emptyValue: [] as unknown as LinnworksOrderItem[],
        },
      );

      const batchItems = this.normalizeOrderItems(result, batchIds);
      if (batchItems.length === 0) {
        this.logger.warn(
          `GetOrders returned no parsed line items for ${batchIds.length} orders`,
        );
      }
      allItems.push(...batchItems);
    }

    return allItems;
  }

  private normalizeOrderItems(
    response: unknown,
    orderIds: string[],
  ): LinnworksOrderItem[] {
    const items: LinnworksOrderItem[] = [];
    const requestedOrderIds = new Set(orderIds.map((id) => id.toLowerCase()));

    const readFirstString = (
      obj: Record<string, unknown>,
      keys: string[],
    ): string | undefined => {
      for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'string' && value.trim() !== '') return value;
      }
      return undefined;
    };

    const readFirstNumber = (
      obj: Record<string, unknown>,
      keys: string[],
    ): number | undefined => {
      for (const key of keys) {
        const value = obj[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '') {
          const parsed = Number(value);
          if (Number.isFinite(parsed)) return parsed;
        }
      }
      return undefined;
    };

    const pushItem = (
      orderId: string | undefined,
      item: Record<string, unknown>,
    ) => {
      const resolvedOrderId =
        orderId ??
        readFirstString(item, [
          'pkOrderID',
          'pkOrderId',
          'fkOrderId',
          'OrderId',
          'orderId',
          'id',
        ]);
      if (!resolvedOrderId) return;

      const sku = normalizeSku(
        readFirstString(item, [
          'SKU',
          'Sku',
          'sku',
          'ItemNumber',
          'itemNumber',
          'ItemSku',
          'itemSku',
        ]) ?? '',
      );
      const quantity = readFirstNumber(item, [
        'Quantity',
        'quantity',
        'Qty',
        'qty',
        'nQty',
      ]);
      if (!sku || !quantity || quantity <= 0) return;

      items.push({
        fkOrderID: resolvedOrderId,
        OrderId: resolvedOrderId,
        SKU: sku,
        ItemNumber: normalizeSku(
          readFirstString(item, ['ItemNumber', 'itemNumber']) ?? sku,
        ),
        Quantity: quantity,
        PricePerUnit: readFirstNumber(item, [
          'PricePerUnit',
          'pricePerUnit',
          'Price',
          'price',
          'UnitPrice',
          'unitPrice',
        ]),
        Cost: readFirstNumber(item, ['Cost', 'cost']),
      });
    };

    const visit = (value: unknown, inheritedOrderId?: string) => {
      if (!value) return;

      if (Array.isArray(value)) {
        for (const item of value) visit(item, inheritedOrderId);
        return;
      }

      if (typeof value !== 'object') return;
      const obj = value as Record<string, unknown>;
      const objOrderId =
        readFirstString(obj, [
          'pkOrderID',
          'pkOrderId',
          'pkOrderid',
          'fkOrderId',
          'OrderId',
          'orderId',
          'OrderIdGuid',
          'id',
        ]) ?? inheritedOrderId;

      const nestedItems =
        obj.Items ??
        obj.items ??
        obj.OrderItems ??
        obj.orderItems ??
        obj.OrderLines ??
        obj.orderLines ??
        obj.lines ??
        obj.Lines;
      if (Array.isArray(nestedItems)) {
        for (const item of nestedItems) {
          if (item && typeof item === 'object')
            pushItem(objOrderId, item as Record<string, unknown>);
        }
        return;
      }

      const directSku = readFirstString(obj, [
        'SKU',
        'Sku',
        'sku',
        'ItemNumber',
        'itemNumber',
        'ItemSku',
        'itemSku',
      ]);
      const directQuantity = readFirstNumber(obj, [
        'Quantity',
        'quantity',
        'Qty',
        'qty',
        'nQty',
      ]);
      if (directSku && directQuantity && directQuantity > 0) {
        pushItem(objOrderId, obj);
        return;
      }

      for (const [key, child] of Object.entries(obj)) {
        const nextOrderId = requestedOrderIds.has(key.toLowerCase())
          ? key
          : objOrderId;
        if (child && typeof child === 'object') {
          visit(child, nextOrderId);
        }
      }
    };

    visit(response);
    return items;
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
