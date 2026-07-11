<<<<<<< HEAD
import { ISkuRepository, InventoryAlertOutput } from '../ports/outbound/sku-repository.port';

export class GetInventoryAlertsService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(): Promise<InventoryAlertOutput[]> {
    return this.skuRepository.getInventoryAlerts();
  }
}
=======
import { ISkuRepository } from '../ports/outbound/sku-repository.port';

export class GetInventoryAlertsService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute() {
    return this.skuRepository.getInventoryAlerts();
  }
}

>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
