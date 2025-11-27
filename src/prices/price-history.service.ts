import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PriceHistory } from '../entities/price-history.entity';

/**
 * Service for persisting live price data to database daily table
 * Ensures all required live data fields are stored as per manager requirements
 */
@Injectable()
export class PriceHistoryService {
  private readonly logger = new Logger(PriceHistoryService.name);

  constructor(
    @InjectRepository(PriceHistory)
    private priceHistoryRepo: Repository<PriceHistory>,
  ) {}

  /**
   * Persist market data to price_history table
   * Maps CoinGecko market object to PriceHistory entity
   */
  async savePriceSnapshot(marketData: any): Promise<PriceHistory> {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set to start of day

    // Verify table exists - test query
    try {
      await this.priceHistoryRepo.query('SELECT 1 FROM price_history LIMIT 1');
    } catch (err) {
      this.logger.error(`Table access test failed: ${(err as any).message}`);
      // Try to create table if it doesn't exist (development only)
      try {
        await this.priceHistoryRepo.query(`
          CREATE TABLE IF NOT EXISTS price_history (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            symbol VARCHAR(50) NOT NULL,
            coingecko_id VARCHAR(200),
            name VARCHAR(200),
            image TEXT,
            current_price DECIMAL(20,8),
            market_cap DECIMAL(30,2),
            market_cap_rank INTEGER,
            fully_diluted_valuation DECIMAL(30,2),
            total_volume DECIMAL(30,2),
            high_24h DECIMAL(20,8),
            low_24h DECIMAL(20,8),
            price_change_24h DECIMAL(20,8),
            price_change_percentage_24h DECIMAL(10,4),
            market_cap_change_24h DECIMAL(30,2),
            market_cap_change_percentage_24h DECIMAL(10,4),
            circulating_supply DECIMAL(30,2),
            total_supply DECIMAL(30,2),
            max_supply DECIMAL(30,2),
            ath DECIMAL(20,8),
            ath_change_percentage DECIMAL(10,4),
            snapshot_date DATE NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            CONSTRAINT unique_symbol_date UNIQUE (symbol, snapshot_date)
          )
        `);
        await this.priceHistoryRepo.query('CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(symbol)');
        await this.priceHistoryRepo.query('CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(snapshot_date)');
        this.logger.log('Created price_history table via fallback');
      } catch (createErr) {
        this.logger.error(`Failed to create table: ${(createErr as any).message}`);
        throw createErr;
      }
    }

    // Check if snapshot already exists for today
    const existing = await this.priceHistoryRepo.findOne({
      where: {
        symbol: marketData.symbol?.toUpperCase(),
        snapshot_date: today,
      },
    });

    const priceData: Partial<PriceHistory> = {
      symbol: marketData.symbol?.toUpperCase(),
      coingecko_id: marketData.id,
      name: marketData.name,
      image: marketData.image,
      current_price: marketData.current_price,
      market_cap: marketData.market_cap,
      market_cap_rank: marketData.market_cap_rank,
      fully_diluted_valuation: marketData.fully_diluted_valuation,
      total_volume: marketData.total_volume,
      high_24h: marketData.high_24h,
      low_24h: marketData.low_24h,
      price_change_24h: marketData.price_change_24h,
      price_change_percentage_24h: marketData.price_change_percentage_24h,
      market_cap_change_24h: marketData.market_cap_change_24h,
      market_cap_change_percentage_24h: marketData.market_cap_change_percentage_24h,
      circulating_supply: marketData.circulating_supply,
      total_supply: marketData.total_supply,
      max_supply: marketData.max_supply,
      ath: marketData.ath,
      ath_change_percentage: marketData.ath_change_percentage,
      snapshot_date: today,
    };

    if (existing) {
      // Update existing snapshot
      await this.priceHistoryRepo.update(existing.id, priceData);
      this.logger.debug(`Updated price snapshot for ${priceData.symbol} on ${today.toISOString()}`);
      return this.priceHistoryRepo.findOne({ where: { id: existing.id } });
    } else {
      // Create new snapshot
      const saved = await this.priceHistoryRepo.save(priceData);
      this.logger.debug(`Saved price snapshot for ${priceData.symbol} on ${today.toISOString()}`);
      return saved;
    }
  }

  /**
   * Batch save multiple price snapshots
   */
  async savePriceSnapshots(markets: any[]): Promise<number> {
    let saved = 0;
    for (const market of markets) {
      try {
        await this.savePriceSnapshot(market);
        saved++;
      } catch (err) {
        this.logger.error(`Failed to save snapshot for ${market.symbol}: ${(err as any).message}`);
      }
    }
    this.logger.log(`Saved ${saved}/${markets.length} price snapshots`);
    return saved;
  }

  /**
   * Get price history for a symbol
   */
  async getPriceHistory(symbol: string, days?: number): Promise<PriceHistory[]> {
    const query = this.priceHistoryRepo
      .createQueryBuilder('ph')
      .where('ph.symbol = :symbol', { symbol: symbol.toUpperCase() })
      .orderBy('ph.snapshot_date', 'DESC');

    if (days) {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - days);
      query.andWhere('ph.snapshot_date >= :dateLimit', { dateLimit });
    }

    return query.getMany();
  }

  /**
   * Get latest price snapshot for a symbol
   */
  async getLatestSnapshot(symbol: string): Promise<PriceHistory | null> {
    return this.priceHistoryRepo.findOne({
      where: { symbol: symbol.toUpperCase() },
      order: { snapshot_date: 'DESC' },
    });
  }
}

