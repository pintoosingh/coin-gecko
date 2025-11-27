import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import { CoingeckoService } from './coingecko.service';

/**
 * Service for scheduling daily market cap updates
 * Updates market_cap field in tokens table every 24 hours
 * This is static data that gets refreshed daily, not live data
 */
@Injectable()
export class MarketCapSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketCapSchedulerService.name);
  private schedulerInterval: NodeJS.Timeout | null = null;
  private readonly intervalMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

  constructor(
    @InjectRepository(Token)
    private tokenRepo: Repository<Token>,
    private cg: CoingeckoService,
  ) {}

  /**
   * Initializes the scheduler when module starts
   * Runs immediately on startup, then schedules recurring updates every 24 hours
   */
  onModuleInit() {
    this.logger.log('Starting market cap scheduler (24-hour refresh)');
    
    // Run immediately on startup
    this.updateMarketCaps().catch((err) => {
      this.logger.error('Initial market cap update failed:', err);
    });

    // Schedule recurring updates every 24 hours
    this.schedulerInterval = setInterval(() => {
      this.updateMarketCaps().catch((err) => {
        this.logger.error('Scheduled market cap update failed:', err);
      });
    }, this.intervalMs);
  }

  /**
   * Cleans up scheduler resources when module is destroyed
   */
  onModuleDestroy() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
      this.logger.log('Market cap scheduler stopped');
    }
  }

  /**
   * Updates market_cap for all tokens in the database
   * Fetches current market data from CoinGecko and updates only market_cap field
   * Currently only processes: bitcoin, ethereum, solana
   * @private
   */
  private async updateMarketCaps() {
    this.logger.log('Starting market cap update for bitcoin, ethereum, solana');
    
    try {
      // Only get the three main tokens: bitcoin, ethereum, solana
      const targetIds = ['bitcoin', 'ethereum', 'solana'];
      const tokens = await this.tokenRepo
        .createQueryBuilder('token')
        .where('token.coingecko_id IN (:...ids)', { ids: targetIds })
        .getMany();

      if (tokens.length === 0) {
        this.logger.warn('No tokens found in database to update market cap (expected: bitcoin, ethereum, solana)');
        return;
      }

      // Fetch market data only for the three target tokens
      // Use coinsMarkets with specific IDs to fetch only what we need
      const allMarkets: any[] = [];

      try {
        // Fetch market data for only our target tokens (more efficient)
        const markets = await this.cg.coinsMarkets(1, targetIds);
        if (markets && markets.length > 0) {
          allMarkets.push(...markets);
        }
      } catch (err) {
        this.logger.error(`Failed to fetch market data: ${(err as any).message}`);
        throw err;
      }

      // Create a map of coingecko_id -> market_cap for quick lookup
      const marketCapMap = new Map<string, number>();
      for (const market of allMarkets) {
        if (market.id && market.market_cap) {
          marketCapMap.set(market.id, market.market_cap);
        }
      }

      // Update market_cap for each token
      let updated = 0;
      for (const token of tokens) {
        if (token.coingecko_id && marketCapMap.has(token.coingecko_id)) {
          const marketCap = marketCapMap.get(token.coingecko_id);
          if (marketCap !== undefined && marketCap !== null) {
            await this.tokenRepo.update(
              { id: token.id },
              { market_cap: marketCap },
            );
            updated++;
          }
        }
      }

      this.logger.log(`Market cap update completed: ${updated}/${tokens.length} tokens updated`);
    } catch (error) {
      this.logger.error(`Market cap update failed: ${(error as any).message}`, error);
      throw error;
    }
  }
}

