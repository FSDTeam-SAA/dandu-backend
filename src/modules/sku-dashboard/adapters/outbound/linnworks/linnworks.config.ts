import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LinnworksConfig {
  readonly applicationId: string;
  readonly applicationSecret: string;
  readonly installationToken: string;
  readonly initialSessionToken?: string;
  readonly initialServer: string;
  readonly rateLimitPerMinute: number;
  readonly retryAttempts: number;
  readonly retryBaseDelayMs: number;

  constructor(config: ConfigService) {
    this.applicationId = config.getOrThrow<string>('LINNWORKS_APPLICATION_ID');
    this.applicationSecret = config.getOrThrow<string>('LINNWORKS_APPLICATION_SECRET');
    this.installationToken =
      config.get<string>('LINNWORKS_INSTALLATION_TOKEN') ??
      config.get<string>('LINNWORKS_AUTH_TOKEN') ??
      config.getOrThrow<string>('LINNWORKS_INSTALLATION_ID');
    this.initialSessionToken = config.get<string>('LINNWORKS_SESSION_TOKEN');
    this.initialServer = config.get<string>('LINNWORKS_API_SERVER') ?? 'https://api.linnworks.net';
    this.rateLimitPerMinute = parseInt(
      config.get<string>('LINNWORKS_RATE_LIMIT_PER_MINUTE') ?? '120',
      10,
    );
    this.retryAttempts = parseInt(
      config.get<string>('LINNWORKS_RETRY_ATTEMPTS') ?? '3',
      10,
    );
    this.retryBaseDelayMs = parseInt(
      config.get<string>('LINNWORKS_RETRY_BASE_DELAY_MS') ?? '1000',
      10,
    );
  }
}
