import { LinnworksLocationConfig } from '../../../common/domain/interfaces/app-config.interface';
import { StockLocationType } from '../domain/models/product.domain';

export interface LinnworksLocation {
  StockLocationId?: string;
  LocationName?: string;
  LocationTag?: string;
  IsFulfillmentCenter?: boolean;
  IsWarehouseManaged?: boolean;
}

export interface ResolvedLinnworksLocation {
  country: string | null;
  locationType: StockLocationType;
}

const LOCATION_TYPES = new Set<StockLocationType>([
  'FBA',
  'FBM',
  'WAREHOUSE',
  'THIRD_PARTY',
  'UNKNOWN',
]);

const normalizeCountry = (value?: string): string | null => {
  const normalized = value?.trim().toUpperCase();
  if (!normalized) return null;
  if (['US', 'USA', 'UNITED STATES'].includes(normalized)) return 'US';
  if (['CA', 'CAN', 'CANADA'].includes(normalized)) return 'CA';
  return normalized;
};

export const resolveLinnworksLocation = (
  location: LinnworksLocation | undefined,
  configuredLocations: Record<string, LinnworksLocationConfig>,
): ResolvedLinnworksLocation => {
  const configured = location?.StockLocationId
    ? configuredLocations[location.StockLocationId]
    : undefined;
  const configuredType =
    configured?.locationType?.toUpperCase() as StockLocationType;
  if (configured && configuredType && LOCATION_TYPES.has(configuredType)) {
    return {
      country: normalizeCountry(configured.country),
      locationType: configuredType,
    };
  }

  const name = (location?.LocationName || location?.LocationTag || '')
    .trim()
    .toUpperCase();
  if (name === 'DEFAULT') return { country: 'US', locationType: 'WAREHOUSE' };
  if (name === 'WHOLESALE')
    return { country: 'US', locationType: 'THIRD_PARTY' };
  if (name.includes('CANADA') && name.includes('FBA')) {
    return { country: 'CA', locationType: 'FBA' };
  }
  if (
    (name.includes('USA') || name.includes('UNITED STATES')) &&
    name.includes('FBA')
  ) {
    return { country: 'US', locationType: 'FBA' };
  }
  if (location?.IsFulfillmentCenter)
    return { country: null, locationType: 'FBA' };
  if (location?.IsWarehouseManaged)
    return { country: null, locationType: 'WAREHOUSE' };
  return { country: null, locationType: 'UNKNOWN' };
};
