import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Token } from '../entities/token.entity';
import { CoingeckoService } from './coingecko.service';

/**
 * BullMQ processor for storing token metadata (contract addresses, categories, etc.)
 * Processes jobs to fetch coin details from CoinGecko and store in tokens table
 * Same format as seed script for bitcoin, ethereum, solana
 */
@Processor('token-metadata')
export class TokenMetadataProcessor extends WorkerHost {
  private readonly logger = new Logger(TokenMetadataProcessor.name);

  constructor(
    @InjectRepository(Token)
    private tokenRepo: Repository<Token>,
    private cg: CoingeckoService,
  ) {
    super();
  }

  /**
   * Processes a token metadata job from the BullMQ queue
   * Fetches coin details from CoinGecko and stores token metadata in tokens table
   * @param job - BullMQ job object containing job metadata
   * @returns Object with saved count and total count
   * @throws Error if job processing fails (will trigger retry)
   */
  async process(job: Job<any, any, string>): Promise<any> {
    this.logger.log(`Processing token metadata job ${job.id} of type ${job.name}`);
    
    try {
      const maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);
      const allCoinIds = new Set<string>();

      // Fetch all coin IDs from markets
      for (let page = 1; page <= maxPages; page++) {
        try {
          const markets = await this.cg.coinsMarkets(page);
          if (!markets || markets.length === 0) break;
          
          for (const market of markets) {
            if (market.id) {
              allCoinIds.add(market.id);
            }
          }
          
          // Gentle pause to avoid rate limits
          await new Promise((res) => setTimeout(res, 200));
          
          if (markets.length < Number(process.env.PER_PAGE || 250)) break;
        } catch (err) {
          this.logger.error(`Failed to fetch page ${page}: ${(err as any).message}`);
          break;
        }
      }

      const coinIds = Array.from(allCoinIds);
      this.logger.log(`Found ${coinIds.length} coins to process for metadata`);

      // Process each coin and store metadata
      let saved = 0;
      let failed = 0;

      for (let i = 0; i < coinIds.length; i++) {
        const coinId = coinIds[i];
        try {
          const details = await this.cg.coinDetails(coinId);
          const symbol = (details.symbol || '').toUpperCase();
          
          if (!symbol) {
            this.logger.warn(`Skipping ${coinId}: no symbol found`);
            failed++;
            continue;
          }
          
          // Process contract_addresses: store as JSON object with network as key
          // Same format as seed script for bitcoin, ethereum, solana
          let contractAddresses: Record<string, string> | null = null;
          
          // Try contract_addresses first (if provided in custom format)
          if (details.contract_addresses) {
            const filtered: Record<string, string> = {};
            for (const [network, address] of Object.entries(details.contract_addresses)) {
              if (address && typeof address === 'string' && address.trim() !== '') {
                filtered[network] = address;
              }
            }
            contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
          }
          // Fallback to platforms (standard CoinGecko API format)
          else if (details.platforms && typeof details.platforms === 'object') {
            const filtered: Record<string, string> = {};
            for (const [network, address] of Object.entries(details.platforms)) {
              if (address && typeof address === 'string' && address.trim() !== '') {
                filtered[network] = address;
              }
            }
            contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
          }
          
          // Process categories: store as JSON array
          const categories = details.categories && Array.isArray(details.categories) && details.categories.length > 0
            ? details.categories
            : null;
          
          const meta = {
            symbol,
            coingecko_id: coinId,
            name: details.name,
            logo: details.image?.thumb || details.image?.small || null,
            image_url: details.image?.large || null,
            social_links: {
              twitter: details.links?.twitter_screen_name ? `https://twitter.com/${details.links.twitter_screen_name}` : null,
              homepage: details.links?.homepage?.[0] || null
            },
            about: details.description?.en || null,
            category: details.categories && details.categories.length ? details.categories.join(',') : null,
            smart_contract_address: (details.platforms && details.platforms.ethereum) ? details.platforms.ethereum : null,
            contract_address: contractAddresses,
            categories: categories
          };
          
          await this.tokenRepo.upsert(meta as any, ['coingecko_id']); // Use coingecko_id as unique identifier
          saved++;
          
          // Progress logging every 50 coins
          if ((i + 1) % 50 === 0 || i + 1 === coinIds.length) {
            this.logger.log(`Token metadata progress: ${i + 1}/${coinIds.length} processed (${saved} saved, ${failed} failed)`);
          }
          
          // Gentle pause to avoid rate limits
          await new Promise((res) => setTimeout(res, 100));
        } catch (err) {
          this.logger.error(`Failed to process token metadata for ${coinId}: ${(err as any).message}`);
          failed++;
          await new Promise((res) => setTimeout(res, 500));
        }
      }

      this.logger.log(`Token metadata job completed: ${saved} tokens saved, ${failed} failed`);
      return { saved, total: coinIds.length, failed };
    } catch (error) {
      this.logger.error(`Token metadata job ${job.id} failed: ${(error as any).message}`, error);
      throw error;
    }
  }
}

