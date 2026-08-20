import { resolveLinnworksLocation } from './linnworks-location-policy';

describe('resolveLinnworksLocation', () => {
  it('uses stable location IDs before the name fallback policy', () => {
    expect(
      resolveLinnworksLocation(
        { StockLocationId: 'location-ca', LocationName: 'Default' },
        { 'location-ca': { country: 'CA', locationType: 'FBA' } },
      ),
    ).toEqual({ country: 'CA', locationType: 'FBA' });
  });

  it.each([
    [{ LocationName: 'Default' }, { country: 'US', locationType: 'WAREHOUSE' }],
    [
      { LocationName: 'Wholesale' },
      { country: 'US', locationType: 'THIRD_PARTY' },
    ],
    [
      { LocationName: '1stVideo Canada FBA' },
      { country: 'CA', locationType: 'FBA' },
    ],
  ])('uses the explicit initial policy for %o', (location, expected) => {
    expect(resolveLinnworksLocation(location, {})).toEqual(expected);
  });

  it('does not guess an unmapped location country or type', () => {
    expect(resolveLinnworksLocation({ LocationName: 'Overflow' }, {})).toEqual({
      country: null,
      locationType: 'UNKNOWN',
    });
  });
});
