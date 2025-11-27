import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { CoingeckoService } from './coingecko.service';
import { MarketCapSchedulerService } from './market-cap-scheduler.service';
import { CommonModule } from '../common/common.module';
import { Token } from '../entities/token.entity';

/**
 * Prices Module
 * Handles static token metadata and live price data
 * - Static data: Stored in tokens table (one-time seed via seed script)
 * - Market cap: Updated daily in tokens table (static snapshot, refreshed every 24h)
 * - Live data: Cached in Redis ONLY (NOT saved to database)
 */
@Module({
  imports: [
    CommonModule, // For RedisService
    TypeOrmModule.forFeature([Token]), // For Token repository
  ],
  controllers: [PricesController],
  providers: [
    PricesService,
    CoingeckoService,
    MarketCapSchedulerService, // Daily market cap refresh scheduler
  ],
  exports: [PricesService],
})
export class PricesModule {}
