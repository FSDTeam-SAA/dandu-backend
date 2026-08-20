import { resolveLinnworksToken } from './app.config';

describe('resolveLinnworksToken', () => {
  it('prefers the permanent installation token when it is present', () => {
    expect(
      resolveLinnworksToken({
        LINNWORKS_INSTALLATION_TOKEN: 'installation-token',
        LINNWORKS_TOKEN: 'primary-token',
        LINNWORKS_AUTH_TOKEN: 'fallback-token',
        LINNWORKS_INSTALLATION_ID: 'installation-id',
      }),
    ).toBe('installation-token');
  });

  it('retains token aliases as backwards-compatible fallbacks', () => {
    expect(
      resolveLinnworksToken({
        LINNWORKS_AUTH_TOKEN: 'auth-token',
        LINNWORKS_INSTALLATION_ID: 'installation-id',
      }),
    ).toBe('auth-token');

    expect(
      resolveLinnworksToken({
        LINNWORKS_INSTALLATION_ID: 'installation-id',
      }),
    ).toBe('installation-id');
  });

  it('returns an empty string when no supported variable is set', () => {
    expect(resolveLinnworksToken({})).toBe('');
  });
});
