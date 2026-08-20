import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Manual material annotation' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  material?: string | null;

  @ApiPropertyOptional({ description: 'Manual thickness annotation' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  thickness?: string | null;

  @ApiPropertyOptional({ description: 'Manual pack quantity' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  packQty?: number | null;
}
