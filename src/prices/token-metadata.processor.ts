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
      // Use /coins/list endpoint with include_platform=true to get ALL coins with contract addresses
      // This endpoint returns all coins in a single response without pagination
      let coinIds: string[] = [];
      let coinsWithPlatforms: Map<string, any> | null = null;
      
      try {
        const allCoins = await this.cg.coinsList(true); // include_platform=true to get contract addresses
        this.logger.log(`Fetched ${allCoins.length} coins from CoinGecko /coins/list endpoint (with platforms)`);
        
        coinIds = allCoins
          .map((coin: any) => coin.id)
          .filter((id: string) => id && id.trim() !== '');
        
        // Store platforms data for efficient contract address extraction
        coinsWithPlatforms = new Map<string, any>();
        allCoins.forEach((coin: any) => {
          if (coin.id && coin.platforms) {
            coinsWithPlatforms!.set(coin.id, coin);
          }
        });
      } catch (err) {
        this.logger.error(`Failed to fetch coins list: ${(err as any).message}`);
        this.logger.log('Falling back to markets endpoint...');
        
        // Fallback to markets endpoint if /coins/list fails
        const maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);
        const allCoinIds = new Set<string>();

        for (let page = 1; page <= maxPages; page++) {
          try {
            const markets = await this.cg.coinsMarkets(page);
            if (!markets || markets.length === 0) break;
            
            for (const market of markets) {
              if (market.id) {
                allCoinIds.add(market.id);
              }
            }
            
            await new Promise((res) => setTimeout(res, 200));
            
            if (markets.length < Number(process.env.PER_PAGE || 250)) break;
          } catch (err2) {
            this.logger.error(`Failed to fetch page ${page}: ${(err2 as any).message}`);
            break;
          }
        }

        coinIds = Array.from(allCoinIds);
      }
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
          // First try to get platforms from /coins/list response (faster, already fetched)
          let contractAddresses: Record<string, string> | null = null;
          let smartContractAddress: string | null = null;
          
          const coinFromList = coinsWithPlatforms?.get(coinId);
          
          // Use platforms from /coins/list if available (more efficient - already fetched)
          if (coinFromList && coinFromList.platforms && typeof coinFromList.platforms === 'object') {
            const filtered: Record<string, string> = {};
            for (const [network, address] of Object.entries(coinFromList.platforms)) {
              if (address && typeof address === 'string' && address.trim() !== '') {
                filtered[network] = address;
              }
            }
            contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
          }
          // Fallback to coinDetails platforms
          else if (details.platforms && typeof details.platforms === 'object') {
            const filtered: Record<string, string> = {};
            for (const [network, address] of Object.entries(details.platforms)) {
              if (address && typeof address === 'string' && address.trim() !== '') {
                filtered[network] = address;
              }
            }
            contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
          }
          // Also check contract_addresses field (if provided in custom format)
          else if (details.contract_addresses) {
            const filtered: Record<string, string> = {};
            for (const [network, address] of Object.entries(details.contract_addresses)) {
              if (address && typeof address === 'string' && address.trim() !== '') {
                filtered[network] = address;
              }
            }
            contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
          }
          
          // Extract smart_contract_address: prioritize Ethereum, then first available platform
          if (contractAddresses) {
            // First try Ethereum (most common)
            if (contractAddresses.ethereum) {
              smartContractAddress = contractAddresses.ethereum;
            }
            // Then try other common networks
            else if (contractAddresses['ethereum-classic']) {
              smartContractAddress = contractAddresses['ethereum-classic'];
            }
            else if (contractAddresses.binance) {
              smartContractAddress = contractAddresses.binance;
            }
            else if (contractAddresses.polygon) {
              smartContractAddress = contractAddresses.polygon;
            }
            else if (contractAddresses.avalanche) {
              smartContractAddress = contractAddresses.avalanche;
            }
            // Fallback to first available platform
            else {
              const firstPlatform = Object.keys(contractAddresses)[0];
              if (firstPlatform) {
                smartContractAddress = contractAddresses[firstPlatform];
              }
            }
          }
          // Also check platforms directly (in case contractAddresses wasn't populated)
          else if (details.platforms && typeof details.platforms === 'object') {
            // Prioritize Ethereum
            if (details.platforms.ethereum) {
              smartContractAddress = details.platforms.ethereum;
            }
            // Fallback to first available platform
            else {
              const platforms = Object.entries(details.platforms);
              for (const [network, address] of platforms) {
                if (address && typeof address === 'string' && address.trim() !== '') {
                  smartContractAddress = address;
                  break;
                }
              }
            }
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
            smart_contract_address: smartContractAddress,
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

