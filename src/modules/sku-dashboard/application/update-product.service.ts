import { EntityNotFoundException } from '../../../common/domain/exceptions/domain.exception';
import type {
  ISkuRepository,
  UpsertProductInput,
} from '../ports/outbound/sku-repository.port';

export type ManualProductUpdate = Pick<
  UpsertProductInput,
  'material' | 'thickness' | 'packQty'
>;

export class UpdateProductService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(sku: string, data: ManualProductUpdate): Promise<void> {
    const existing = await this.skuRepository.findMetricsBySku(sku);
    if (!existing) throw new EntityNotFoundException('Product', sku);
    await this.skuRepository.updateProduct(sku, data);
  }
}
