import { Controller, Get, VERSION_NEUTRAL, Version } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AppService } from './app.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Health check endpoint' })
  @SkipThrottle() // Skip rate limiting for health check
  @Version(VERSION_NEUTRAL)
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({ summary: 'Liveness probe' })
  @SkipThrottle()
  @Version(VERSION_NEUTRAL)
  @Get('health')
  health() {
    return this.appService.health();
  }

  @ApiOperation({ summary: 'Readiness probe' })
  @SkipThrottle()
  @Version(VERSION_NEUTRAL)
  @Get('ready')
  ready() {
    return this.appService.ready();
  }
}
