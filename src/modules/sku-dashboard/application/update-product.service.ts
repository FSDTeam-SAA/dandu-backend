<<<<<<< HEAD
import AppError from '../../../common/errors/app.error';
import { ISkuRepository, UpsertProductInput } from '../ports/outbound/sku-repository.port';

export class UpdateProductService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(sku: string, fields: Partial<UpsertProductInput>): Promise<void> {
    const normalized = sku.trim();
    if (!normalized) throw AppError.badRequest('SKU is required');

    // Verify product exists first
    const existing = await this.skuRepository.findMetricsBySku(normalized);
    if (!existing) throw AppError.notFound(`SKU not found: ${normalized}`);

    await this.skuRepository.updateProduct(normalized, fields);
  }
}
=======
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  SKU_REPOSITORY_TOKEN,
} from '../ports/outbound/sku-repository.port';
import type { ISkuRepository } from '../ports/outbound/sku-repository.port';
import { UpdateProductDto } from '../dto/update-product.dto';

@Injectable()
export class UpdateProductService {
  constructor(
    @Inject(SKU_REPOSITORY_TOKEN)
    private readonly skuRepository: ISkuRepository,
  ) {}

  async execute(sku: string, dto: UpdateProductDto): Promise<void> {
    const existing = await this.skuRepository.findMetricsBySku(sku);
    if (!existing) {
      throw new NotFoundException(`Product with SKU ${sku} not found`);
    }

    await this.skuRepository.updateProduct(sku, dto);
  }
}
>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
