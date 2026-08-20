import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Patch,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../../../../common/guards/auth.guard';
import { RolesGuard } from '../../../../../common/guards/roles.guard';
import { Roles } from '../../../../../common/decorators/roles.decorator';
import { userRole } from '../../../../auth/interfaces/auth.interface';
import { SkuSearchQueryDto } from '../../../dto/sku-search-query.dto';
import { GetSkuMetricsService } from '../../../application/get-sku-metrics.service';
import { SkuBrowseQueryDto } from '../../../dto/sku-browse-query.dto';
import { BrowseSkusService } from '../../../application/browse-skus.service';
import { DashboardQueryDto } from '../../../dto/dashboard-query.dto';
import { GetDashboardMetricsService } from '../../../application/get-dashboard-metrics.service';
import { GetInventoryAlertsService } from '../../../application/get-inventory-alerts.service';
import { RunLinnworksDailySyncService } from '../../../application/run-linnworks-daily-sync.service';
import { SyncLinnworksSalesService } from '../../../application/sync-linnworks-sales.service';
import { LinnworksSyncQueue } from '../queue/linnworks-sync.queue';
import { UpdateProductService } from '../../../application/update-product.service';
import { UpdateProductDto } from '../../../dto/update-product.dto';

@ApiTags('SKU Dashboard')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('sku-dashboard')
export class SkuDashboardController {
  constructor(
    private readonly getSkuMetricsService: GetSkuMetricsService,
    private readonly browseSkusService: BrowseSkusService,
    private readonly getDashboardMetricsService: GetDashboardMetricsService,
    private readonly getInventoryAlertsService: GetInventoryAlertsService,
    private readonly runLinnworksDailySyncService: RunLinnworksDailySyncService,
    private readonly syncLinnworksSalesService: SyncLinnworksSalesService,
    private readonly linnworksSyncQueue: LinnworksSyncQueue,
    private readonly updateProductService: UpdateProductService,
  ) {}

  @Get('search')
  @ApiOperation({ summary: 'Search SKU dashboard metrics' })
  @ApiResponse({
    status: 200,
    description: 'SKU metrics retrieved successfully',
  })
  async search(@Query() query: SkuSearchQueryDto) {
    const result = await this.getSkuMetricsService.execute(query.sku);

    return {
      message: 'SKU metrics retrieved successfully',
      data: result,
    };
  }

  @Post('sync/linnworks/historical-sales')
  @UseGuards(RolesGuard)
  @Roles(userRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Backfill Linnworks sales history' })
  async syncHistoricalSales(@Body() body: { historyDays?: unknown }) {
    const historyDays =
      typeof body?.historyDays === 'number' &&
      Number.isInteger(body.historyDays) &&
      body.historyDays > 0
        ? Math.min(body.historyDays, 365)
        : 365;
    const startedAt = Date.now();
    const toDate = new Date();
    const fromDate = new Date(
      toDate.getTime() - historyDays * 24 * 60 * 60 * 1000,
    );
    const result = await this.syncLinnworksSalesService.execute(historyDays);

    return {
      message: 'Linnworks historical sales sync completed',
      data: {
        status: 'COMPLETED',
        fromDate: fromDate.toISOString(),
        toDate: toDate.toISOString(),
        chunkDays: historyDays,
        chunksProcessed: 1,
        pagesProcessed: result.pages,
        ordersProcessed: result.orders,
        itemRowsProcessed: result.orderItems,
        metricsUpdated: result.metrics,
        skippedItemRows: result.skippedItems,
        failedRows: 0,
        clearedMetrics: 0,
        syncedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      },
    };
  }

  @Get('browse')
  @ApiOperation({ summary: 'Browse SKU dashboard metrics' })
  async browse(@Query() query: SkuBrowseQueryDto) {
    const result = await this.browseSkusService.execute(query);

    return {
      message: 'SKU metrics retrieved successfully',
      data: result,
    };
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get SKU dashboard aggregates' })
  async dashboard(@Query() query: DashboardQueryDto) {
    const result = await this.getDashboardMetricsService.execute(query.period);

    return {
      message: 'Dashboard metrics retrieved successfully',
      data: result,
    };
  }

  @Get('alerts')
  @ApiOperation({ summary: 'Get inventory alerts' })
  async alerts() {
    const result = await this.getInventoryAlertsService.execute();

    return {
      message: 'Inventory alerts retrieved successfully',
      data: result,
    };
  }

  @Post('sync/linnworks')
  @UseGuards(RolesGuard)
  @Roles(userRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Run Linnworks sync now' })
  async syncLinnworks(@Body('queued') queued?: boolean) {
    if (queued) {
      const jobId = await this.linnworksSyncQueue.enqueueManualSync();

      return {
        message: 'Linnworks sync queued',
        data: { jobId },
      };
    }

    const result = await this.runLinnworksDailySyncService.execute();

    return {
      message: 'Linnworks sync finished',
      data: result,
    };
  }

  @Patch('product/:sku')
  @UseGuards(RolesGuard)
  @Roles(userRole.ADMIN)
  @ApiOperation({ summary: 'Update manual product annotations' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  async updateProduct(
    @Param('sku') sku: string,
    @Body() dto: UpdateProductDto,
  ) {
    await this.updateProductService.execute(sku, dto);
    return {
      message: 'Product updated successfully',
    };
  }
}
