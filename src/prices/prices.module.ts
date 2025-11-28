import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PricesController } from './prices.controller';
import { PricesService } from './prices.service';
import { CoingeckoService } from './coingecko.service';
import { MarketCapSchedulerService } from './market-cap-scheduler.service';
import { PriceSchedulerService } from './price-scheduler.service';
import { PricePersistenceProcessor } from './price-persistence.processor';
import { TokenMetadataProcessor } from './token-metadata.processor';
import { TokenMetadataSchedulerService } from './token-metadata-scheduler.service';
import { PriceHistoryService } from './price-history.service';
import { CommonModule } from '../common/common.module';
import { Token } from '../entities/token.entity';
import { PriceHistory } from '../entities/price-history.entity';

/**
 * Prices Module
 * Handles static token metadata and live price data
 * - Static data: Stored in tokens table via BullMQ processor
 * - Market cap: Updated daily in tokens table (static snapshot, refreshed every 24h)
 * - Live data: Cached in Redis and persisted to price_history via BullMQ
 */
@Module({
  imports: [
    CommonModule, // For RedisService
    TypeOrmModule.forFeature([Token, PriceHistory]), // For Token and PriceHistory repositories
    BullModule.registerQueue({
      name: 'token-metadata',
    }),
    BullModule.registerQueue({
      name: 'price-persistence',
    }),
  ],
  controllers: [PricesController],
  providers: [
    PricesService,
    CoingeckoService,
    MarketCapSchedulerService, // Daily market cap refresh scheduler
    TokenMetadataSchedulerService, // BullMQ scheduler for token metadata persistence
    TokenMetadataProcessor, // BullMQ processor for storing token metadata (contract addresses, categories)
    PriceSchedulerService, // BullMQ scheduler for price persistence
    PricePersistenceProcessor, // BullMQ processor for price history
    PriceHistoryService, // Service for managing price history
  ],
  exports: [PricesService],
})
export class PricesModule {}
