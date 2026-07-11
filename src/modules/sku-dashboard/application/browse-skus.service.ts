<<<<<<< HEAD
import { ISkuRepository, SkuBrowseFilters, SkuBrowsePage } from '../ports/outbound/sku-repository.port';

export class BrowseSkusService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(filters: SkuBrowseFilters): Promise<SkuBrowsePage> {
    return this.skuRepository.browseSkus({
      q:           filters.q?.trim() || undefined,
      stockStatus: filters.stockStatus ?? 'ALL',
      channel:     filters.channel ?? 'ALL',
      cursor:      filters.cursor,
      limit:       filters.limit ?? 20,
    });
  }
}
=======
import { BrowseSkusQuery, ISkuRepository } from '../ports/outbound/sku-repository.port';

export class BrowseSkusService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(query: Omit<BrowseSkusQuery, 'limit'> & { limit?: number }) {
    return this.skuRepository.browseSkus({
      ...query,
      stockStatus: query.stockStatus || 'ALL',
      channel: query.channel || 'ALL',
      limit: query.limit || 20,
    });
  }
}

>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
