import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PriceHistoryService } from './price-history.service';
import { CoingeckoService } from './coingecko.service';

/**
 * BullMQ processor for scheduled price data persistence
 * Processes jobs to save price snapshots to database
 */
@Processor('price-persistence')
export class PricePersistenceProcessor extends WorkerHost {
  private readonly logger = new Logger(PricePersistenceProcessor.name);

  constructor(
    private priceHistorySvc: PriceHistoryService,
    private cg: CoingeckoService,
  ) {
    super();
  }

  /**
   * Processes a price persistence job from the BullMQ queue
   * Fetches market data from CoinGecko and persists to database
   * @param job - BullMQ job object containing job metadata
   * @returns Object with saved count and total count
   * @throws Error if job processing fails (will trigger retry)
   */
  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`);
    
    try {
      const maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);
      const allMarkets: any[] = [];

      // Fetch all pages from CoinGecko
      for (let page = 1; page <= maxPages; page++) {
        try {
          const markets = await this.cg.coinsMarkets(page);
          if (!markets || markets.length === 0) break;
          allMarkets.push(...markets);
          
          // Gentle pause to avoid rate limits
          await new Promise((res) => setTimeout(res, 200));
        } catch (err) {
          this.logger.error(`Failed to fetch page ${page}: ${(err as any).message}`);
          break;
        }
      }

      // Persist to database
      if (allMarkets.length > 0) {
        const saved = await this.priceHistorySvc.savePriceSnapshots(allMarkets);
        this.logger.log(`Successfully persisted ${saved} price snapshots`);
        return { saved, total: allMarkets.length };
      }

      return { saved: 0, total: 0 };
    } catch (error) {
      this.logger.error(`Job ${job.id} failed: ${(error as any).message}`, error);
      throw error;
    }
  }
}

