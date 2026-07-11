<<<<<<< HEAD
import { ISkuRepository, DashboardMetricsOutput } from '../ports/outbound/sku-repository.port';

const PERIOD_DAYS: Record<string, number> = {
  '7D':   7,
  '30D':  30,
  '90D':  90,
  '365D': 365,
};

export class GetDashboardMetricsService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(period: string = '30D'): Promise<DashboardMetricsOutput> {
    const days = PERIOD_DAYS[period] ?? 30;
    return this.skuRepository.getDashboardMetrics(days);
  }
}
=======
import { ISkuRepository } from '../ports/outbound/sku-repository.port';

const PERIOD_DAYS = {
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '365D': 365,
} as const;

export class GetDashboardMetricsService {
  constructor(private readonly skuRepository: ISkuRepository) {}

  async execute(period: keyof typeof PERIOD_DAYS = '30D') {
    return this.skuRepository.getDashboardMetrics(PERIOD_DAYS[period]);
  }
}

>>>>>>> 51b0f3bade6c3722e18a2a14391dbca089dc3a9f
