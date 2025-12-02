import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull } from 'typeorm';
import { RedisService } from '../common/redis.service';
import { CoingeckoService } from './coingecko.service';
import { Token } from '../entities/token.entity';
import Redis from 'ioredis';

@Injectable()
export class PricesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PricesService.name);
  private redis: Redis | null = null;
  private poller: NodeJS.Timeout | null = null;
  private readonly ttl = Number(process.env.PRICE_CACHE_TTL_SECONDS || 30);
  private readonly intervalMs = Number(process.env.PRICE_UPDATE_INTERVAL_MS || 60000); // Default: 60 seconds (was 20s)
  private readonly maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);

  constructor(
    private redisSvc: RedisService,
    private cg: CoingeckoService,
    @InjectRepository(Token)
    private tokenRepo: Repository<Token>,
  ) {}

  /**
   * Initializes the service when the module starts
   * Attempts to connect to Redis and starts the price polling mechanism
   */
  onModuleInit() {
    // Try to obtain redis client if available
    try {
      const client = this.redisSvc.getClient();
      if (client) {
        this.redis = client;
        this.logger.debug('Redis client initialized in PricesService');
      } else {
        this.logger.warn('RedisService.getClient() returned undefined onModuleInit');
      }
    } catch (err) {
      this.logger.warn('Error getting Redis client on init: ' + (err as any).message);
      this.redis = null;
    }

    // start poller regardless — poller will handle missing redis gracefully
    this.startPoller();
  }

  /**
   * Cleans up resources when the module is destroyed
   * Stops the polling interval to prevent memory leaks
   */
  onModuleDestroy() {
    if (this.poller) {
      clearInterval(this.poller);
      this.poller = null;
    }
  }

  /**
   * Generates a Redis key for a specific token symbol
   * @param symbol - Token symbol (e.g., 'BTC', 'ETH')
   * @returns Redis key string in format 'price:{symbol}'
   */
  private priceKey(symbol: string) {
    return `price:${symbol.toLowerCase()}`;
  }

  /**
   * Generates a Redis key for all prices cache
   * @returns Redis key string 'prices:all'
   */
  private allKey() {
    return `prices:all`;
  }

  /**
   * Generates a Redis key for coin details cache
   * @param coinId - CoinGecko coin ID
   * @returns Redis key string 'coin:details:{coinId}'
   */
  private coinDetailsKey(coinId: string) {
    return `coin:details:${coinId.toLowerCase()}`;
  }

  /**
   * Ensures Redis client is available (lazy initialization)
   * Attempts to get Redis client if not already initialized
   * @returns Redis client instance or null if unavailable
   */
  private ensureRedis() {
    if (!this.redis) {
      try {
        const client = this.redisSvc.getClient();
        if (client) {
          this.redis = client;
          this.logger.debug('Redis client lazily initialized');
        }
      } catch (err) {
        this.logger.warn('Failed to lazily init redis client: ' + (err as any).message);
        this.redis = null;
      }
    }
    return this.redis;
  }

  /**
   * Retrieves static token metadata from database only (no live price data)
   * @param symbol - Token symbol to fetch (e.g., 'BTC', 'ETH')
   * @returns Static metadata object or null if not found
   */
  async getTokenMetadata(symbol: string) {
    try {
      const token = await this.tokenRepo.findOne({
        where: { symbol: symbol.toUpperCase() },
      });

      if (!token) {
        return null;
      }

      // Return only static metadata fields
      return {
        symbol: token.symbol,
        name: token.name,
        coingecko_id: token.coingecko_id,
        logo: token.logo,
        image_url: token.image_url,
        contract_address: token.contract_address,
        categories: token.categories,
        social_links: token.social_links,
        about: token.about,
        category: token.category,
        smart_contract_address: token.smart_contract_address,
        market_cap: token.market_cap, // Static market cap (refreshed daily)
      };
    } catch (err) {
      this.logger.warn(`Failed to fetch metadata for ${symbol}: ${(err as any).message}`);
      return null;
    }
  }

  /**
   * Filters and formats response to include only required fields
   * @param liveData - Live price data from Redis/CoinGecko
   * @param staticData - Static metadata from database (optional)
   * @returns Filtered data object with only required fields
   */
  private formatResponse(liveData: any, staticData?: Token | null): any {
    if (!liveData) return null;

    // Extract only required fields from live data
    const formatted: any = {
      symbol: liveData.symbol,
      name: liveData.name,
      image: liveData.image,
      current_price: liveData.current_price,
      market_cap: liveData.market_cap,
      market_cap_rank: liveData.market_cap_rank,
      fully_diluted_valuation: liveData.fully_diluted_valuation,
      total_volume: liveData.total_volume,
      high_24h: liveData.high_24h,
      low_24h: liveData.low_24h,
      price_change_24h: liveData.price_change_24h,
      price_change_percentage_24h: liveData.price_change_percentage_24h,
      market_cap_change_24h: liveData.market_cap_change_24h,
      market_cap_change_percentage_24h: liveData.market_cap_change_percentage_24h,
      circulating_supply: liveData.circulating_supply,
      total_supply: liveData.total_supply,
      max_supply: liveData.max_supply,
      ath: liveData.ath,
      ath_change_percentage: liveData.ath_change_percentage,
    };

    // Add static data fields if available
    if (staticData) {
      formatted.contract_address = staticData.contract_address;
      formatted.categories = staticData.categories;
    }

    return formatted;
  }

  /**
   * Merges static token metadata from database with live price data
   * Also extracts contract_address and categories from CoinGecko if not in database
   * @param liveData - Live price data from Redis/CoinGecko
   * @param symbol - Token symbol to match
   * @param coinDetailsData - Optional CoinGecko coin details data (for contract_addresses and categories)
   * @returns Formatted data object with only required fields
   */
  private async mergeWithStaticData(liveData: any, symbol: string, coinDetailsData?: any): Promise<any> {
    if (!liveData) return null;

    try {
      // Fetch static data from database
      const token = await this.tokenRepo.findOne({
        where: { symbol: symbol.toUpperCase() },
      });

      // If not in database but we have coinDetailsData, extract contract_addresses and categories
      let contractAddress: Record<string, string> | null = null;
      let categories: string[] | null = null;

      if (token) {
        // Use database values
        contractAddress = token.contract_address;
        categories = token.categories;
      } else if (coinDetailsData) {
        // Extract from CoinGecko API response
        // Process contract_addresses (try both contract_addresses and platforms)
        if (coinDetailsData.contract_addresses) {
          const filtered: Record<string, string> = {};
          for (const [network, address] of Object.entries(coinDetailsData.contract_addresses)) {
            if (address && typeof address === 'string' && address.trim() !== '') {
              filtered[network] = address;
            }
          }
          contractAddress = Object.keys(filtered).length > 0 ? filtered : null;
        } else if (coinDetailsData.platforms && typeof coinDetailsData.platforms === 'object') {
          // Fallback to platforms (standard CoinGecko format)
          const filtered: Record<string, string> = {};
          for (const [network, address] of Object.entries(coinDetailsData.platforms)) {
            if (address && typeof address === 'string' && address.trim() !== '') {
              filtered[network] = address;
            }
          }
          contractAddress = Object.keys(filtered).length > 0 ? filtered : null;
        }
        // Process categories
        if (coinDetailsData.categories && Array.isArray(coinDetailsData.categories)) {
          categories = coinDetailsData.categories.length > 0 ? coinDetailsData.categories : null;
        }
      }

      // Create a temporary token-like object with the extracted data
      const staticDataForFormat = token || (contractAddress || categories ? {
        contract_address: contractAddress,
        categories: categories,
      } as Partial<Token> : null);

      return this.formatResponse(liveData, staticDataForFormat as Token | null);
    } catch (err) {
      this.logger.warn(`Failed to fetch static data for ${symbol}: ${(err as any).message}`);
      // Return formatted live data only if static data fetch fails
      return this.formatResponse(liveData);
    }
  }

  /**
   * Retrieves price data for a specific token symbol
   * Combines live price data (from Redis/CoinGecko) with static metadata (from database)
   * Uses cache-first strategy: checks Redis cache, falls back to CoinGecko API
   * @param symbol - Token symbol to fetch (e.g., 'BTC', 'ETH')
   * @returns Combined market data object with live prices and static metadata, or null if not found
   * @throws Error if API fetch fails
   */
  async getPriceBySymbol(symbol: string) {
    const key = this.priceKey(symbol);
    let liveData: any = null;
    let coinId: string | null = null;

    // First, check database for the token - if we have it, use its coingecko_id
    // This ensures we get the correct token (e.g., Solana instead of Wrapped SOL)
    try {
      const token = await this.tokenRepo.findOne({
        where: { symbol: symbol.toUpperCase() },
        select: ['coingecko_id'],
      });
      if (token && token.coingecko_id) {
        coinId = token.coingecko_id;
        this.logger.debug(`Found token in database: ${symbol} -> ${coinId}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to check database for ${symbol}: ${(err as any).message}`);
    }

    // try Redis first (if available)
    let coinIdFromCache: string | null = null;
    try {
      const client = this.ensureRedis();
      if (client) {
        const cached = await client.get(key);
        if (cached) {
          try {
            liveData = JSON.parse(cached);
            coinIdFromCache = liveData?.id || null; // Get coin ID for fetching details
            
            // If we have coinId from database, verify cached data matches
            // If not, invalidate cache and fetch correct token
            if (coinId && coinIdFromCache && coinIdFromCache !== coinId) {
              this.logger.warn(`Cache mismatch for ${symbol}: cached=${coinIdFromCache}, db=${coinId}. Invalidating cache.`);
              liveData = null; // Clear cached data to fetch correct token
              coinIdFromCache = null;
              // Delete incorrect cache entry
              try {
                await client.del(key);
              } catch (e) {
                // Ignore delete errors
              }
            }
          } catch (e) {
            this.logger.warn('Failed parsing cached price JSON for ' + symbol);
            // continue to fallback
          }
        }
      } else {
        this.logger.debug('Redis not available — falling back to direct Coingecko for symbol=' + symbol);
      }
    } catch (err) {
      this.logger.warn('Redis get error for ' + key + ': ' + (err as any).message);
      // continue to fallback
    }

    // If we have cached data, check if we need coin details for contract_address and categories
    // First check database - if token exists there, we already have the static data
    // Only fetch from CoinGecko if token is NOT in database
    if (liveData && coinIdFromCache && !(liveData as any).__coinDetailsData) {
      try {
        // Check database first - if token exists, we have contract_address and categories
        const tokenInDb = await this.tokenRepo.findOne({
          where: { symbol: symbol.toUpperCase() },
          select: ['contract_address', 'categories'],
        });
        
        if (tokenInDb && (tokenInDb.contract_address || tokenInDb.categories)) {
          // We have static data in database, no need to fetch from CoinGecko
          this.logger.debug(`Using static data from database for ${symbol}`);
          (liveData as any).__coinDetailsData = null; // Mark as checked, no API call needed
        } else {
          // Token not in database or missing static fields, check Redis cache for coin details
          const client = this.ensureRedis();
          if (client) {
            const detailsKey = this.coinDetailsKey(coinIdFromCache);
            const cachedDetails = await client.get(detailsKey);
            if (cachedDetails) {
              try {
                (liveData as any).__coinDetailsData = JSON.parse(cachedDetails);
                this.logger.debug(`Found coin details in cache for ${coinIdFromCache}`);
              } catch (e) {
                // Cache parse failed, continue to fetch
              }
            }
          }

          // If not in cache and not in database, fetch from API (only if needed)
          if (!(liveData as any).__coinDetailsData) {
            try {
              const coinDetailsData = await this.cg.coinDetails(coinIdFromCache, false); // Don't need market data, we already have it
              (liveData as any).__coinDetailsData = coinDetailsData;
              
              // Cache coin details for 1 hour (static data doesn't change often)
              try {
                const client = this.ensureRedis();
                if (client) {
                  const detailsKey = this.coinDetailsKey(coinIdFromCache);
                  await client.set(detailsKey, JSON.stringify(coinDetailsData), 'EX', 3600); // 1 hour cache
                }
              } catch (err) {
                this.logger.debug('Failed to cache coin details');
              }
            } catch (err) {
              this.logger.warn(`Failed to fetch coin details for cached ${coinIdFromCache}: ${(err as any).message}`);
            }
          }
        }
      } catch (err) {
        // Continue to fetch if database check fails
        this.logger.warn(`Failed to check database for static data: ${(err as any).message}`);
      }
    }

    // fallback: fetch from Coingecko directly and cache if possible
    if (!liveData) {
      try {
        let found = null;
        const searchPages = Math.min(2, this.maxPages); // Only search first 2 pages for speed
        
        // If we have coinId from database, use it directly (most reliable)
        if (coinId) {
          try {
            // Fetch market data for this specific coin
            const markets = await this.cg.coinsMarkets(1, [coinId]);
            if (markets && markets.length > 0) {
              found = markets[0];
              liveData = found;
              this.logger.debug(`Found token using database coingecko_id: ${coinId}`);
            }
          } catch (err) {
            this.logger.warn(`Failed to fetch market data for ${coinId}: ${(err as any).message}`);
          }
        }
        
        // If not found via database coinId, search market pages
        // When multiple tokens share the same symbol, prioritize by market cap (markets are sorted by market cap desc)
        if (!found) {
          for (let page = 1; page <= searchPages; page++) {
            try {
              const markets = await this.cg.coinsMarkets(page);
              // Find all matches and pick the one with highest market cap (first in sorted list)
              found = markets.find((m) => m.symbol && m.symbol.toLowerCase() === symbol.toLowerCase());
              if (found) {
                liveData = found;
                coinId = found.id; // Get coin ID from market data
                break;
              }
              if (!markets || markets.length === 0) break;
            } catch (err: any) {
              // Handle rate limit errors gracefully
              if (err?.response?.status === 429) {
                const retryAfter = err?.response?.headers?.['retry-after'];
                const waitTime = retryAfter ? Number(retryAfter) * 1000 : 60000;
                this.logger.warn(`Rate limit hit while searching markets (page ${page}). CoinGecko API limit reached. Please try again later.`);
                // Don't throw - return null to indicate token not found due to rate limit
                break;
              }
              // For other errors, log and continue to next page
              this.logger.warn(`Failed to fetch markets page ${page}: ${err?.message || err}`);
              // Continue to next page or break if it's a critical error
              if (err?.response?.status >= 500) {
                break; // Server error, stop searching
              }
            }
          }
        }

        // If not found in markets, try using coins/list to find the coin ID
        // This is cached, so it's faster on subsequent calls
        if (!found) {
          const perPage = Number(process.env.PER_PAGE || 250);
          this.logger.debug(`Token ${symbol} not found in top ${searchPages * perPage} tokens, trying coins/list`);
          try {
            const coinsList = await this.cg.coinsList();
            const coinInfo = coinsList.find((c: any) => c.symbol && c.symbol.toLowerCase() === symbol.toLowerCase());
            if (coinInfo && coinInfo.id) {
              coinId = coinInfo.id;
            }
          } catch (err) {
            this.logger.warn(`Failed to fetch coins list: ${(err as any).message}`);
          }
        }

        // Fetch full coin details to get contract_addresses and categories
        // First check database - if token exists there, we already have the static data
        // Only fetch from CoinGecko if token is NOT in database
        let coinDetailsData: any = null;
        if (coinId) {
          try {
            // Check database first - if token exists, we have contract_address and categories
            const tokenInDb = await this.tokenRepo.findOne({
              where: { symbol: symbol.toUpperCase() },
              select: ['contract_address', 'categories'],
            });
            
            if (tokenInDb && (tokenInDb.contract_address || tokenInDb.categories)) {
              // We have static data in database, no need to fetch from CoinGecko
              this.logger.debug(`Using static data from database for ${symbol}, skipping CoinGecko API call`);
              coinDetailsData = null; // No API call needed
            } else {
              // Token not in database or missing static fields, check Redis cache for coin details
              const client = this.ensureRedis();
              if (client) {
                const detailsKey = this.coinDetailsKey(coinId);
                const cachedDetails = await client.get(detailsKey);
                if (cachedDetails) {
                  try {
                    coinDetailsData = JSON.parse(cachedDetails);
                    this.logger.debug(`Found coin details in cache for ${coinId}`);
                  } catch (e) {
                    // Cache parse failed, continue to fetch
                  }
                }
              }

              // If not in cache and not in database, fetch from API (only if needed)
              if (!coinDetailsData) {
                try {
                  // If we found it in markets, we already have live data, so just fetch static fields
                  // If we didn't find it, fetch full details including market data
                  coinDetailsData = await this.cg.coinDetails(coinId, !found);
                  
                  // Cache coin details for 1 hour (static data doesn't change often)
                  try {
                    const client = this.ensureRedis();
                    if (client) {
                      const detailsKey = this.coinDetailsKey(coinId);
                      await client.set(detailsKey, JSON.stringify(coinDetailsData), 'EX', 3600); // 1 hour cache
                    }
                  } catch (err) {
                    this.logger.debug('Failed to cache coin details');
                  }
                } catch (err: any) {
                  // Handle rate limit errors gracefully
                  if (err?.response?.status === 429) {
                    const retryAfter = err?.response?.headers?.['retry-after'];
                    this.logger.warn(`Rate limit hit while fetching coin details for ${coinId}. CoinGecko API limit reached. Please try again later.`);
                    // Continue without coin details - we'll use what we have
                    coinDetailsData = null;
                  } else {
                    this.logger.warn(`Failed to fetch coin details for ${coinId}: ${err?.message || err}`);
                    coinDetailsData = null;
                  }
                }
              }
            }
            
            // If we didn't find it in markets, use coin details for live data
            if (!found && coinDetailsData && coinDetailsData.market_data) {
              const md = coinDetailsData.market_data;
              liveData = {
                id: coinDetailsData.id,
                symbol: coinDetailsData.symbol,
                name: coinDetailsData.name,
                image: coinDetailsData.image?.large || coinDetailsData.image?.small || coinDetailsData.image?.thumb,
                current_price: md.current_price?.usd || null,
                market_cap: md.market_cap?.usd || null,
                market_cap_rank: md.market_cap_rank || null,
                fully_diluted_valuation: md.fully_diluted_valuation?.usd || null,
                total_volume: md.total_volume?.usd || null,
                high_24h: md.high_24h?.usd || null,
                low_24h: md.low_24h?.usd || null,
                price_change_24h: md.price_change_24h || null,
                price_change_percentage_24h: md.price_change_percentage_24h || null,
                market_cap_change_24h: md.market_cap_change_24h || null,
                market_cap_change_percentage_24h: md.market_cap_change_percentage_24h || null,
                circulating_supply: md.circulating_supply || null,
                total_supply: md.total_supply || null,
                max_supply: md.max_supply || null,
                ath: md.ath?.usd || null,
                ath_change_percentage: md.ath_change_percentage?.usd || null,
              };
            }
            
            // Store coinDetailsData to extract contract_addresses and categories
            if (liveData) {
              (liveData as any).__coinDetailsData = coinDetailsData;
            }
          } catch (err) {
            this.logger.warn(`Failed to fetch coin details for ${coinId}: ${(err as any).message}`);
          }
        }

        // Cache the result if found (but don't cache __coinDetailsData - it's temporary)
        if (liveData) {
          try {
            const client = this.ensureRedis();
            if (client) {
              // Create a clean copy without __coinDetailsData for caching
              const dataToCache = { ...liveData };
              delete (dataToCache as any).__coinDetailsData;
              await client.set(key, JSON.stringify(dataToCache), 'EX', this.ttl);
            }
          } catch (err) {
            this.logger.debug('Failed to cache fallback market: ' + (err as any).message);
          }
        }
      } catch (err: any) {
        // Don't re-throw rate limit errors - return null instead
        if (err?.response?.status === 429) {
          const retryAfter = err?.response?.headers?.['retry-after'];
          this.logger.warn(`Rate limit hit in fallback fetch. CoinGecko API limit reached. Retry-After: ${retryAfter || 'unknown'} seconds`);
          // Return null to indicate token not found due to rate limit
          return null;
        }
        this.logger.error('fallback fetch failed', err);
        throw err;
      }
    }

    // Merge with static data from database (and CoinGecko if not in DB)
    // Pass coinDetailsData if we fetched it (for contract_addresses and categories)
    const coinDetailsData = (liveData as any).__coinDetailsData;
    delete (liveData as any).__coinDetailsData; // Clean up temporary field
    return this.mergeWithStaticData(liveData, symbol, coinDetailsData);
  }

  /**
   * Retrieves all available token prices
   * Combines live price data with static metadata from database
   * Uses cache-first strategy: checks Redis aggregated cache, falls back to fetching from CoinGecko
   * Fetches multiple pages of market data and caches results
   * @returns Array of combined market data objects with live prices and static metadata
   */
  async getAllPrices() {
    const key = this.allKey();
    let combined: any[] = [];

    // try redis aggregated cache first
    try {
      const client = this.ensureRedis();
      if (client) {
        const cached = await client.get(key);
        if (cached) {
          try {
            combined = JSON.parse(cached);
          } catch (e) {
            // fallthrough to fetch
          }
        }
      } else {
        this.logger.debug('Redis not available in getAllPrices — falling back to direct fetch');
      }
    } catch (err) {
      this.logger.warn('Redis get error for allKey: ' + (err as any).message);
      // fall through to direct fetch
    }

    // fallback: fetch pages from coingecko
    if (combined.length === 0) {
      for (let page = 1; page <= this.maxPages; page++) {
        try {
          const data = await this.cg.coinsMarkets(page);
          if (!data || data.length === 0) break;
          combined.push(...data);
          if (data.length < Number(process.env.PER_PAGE || 250)) break;
        } catch (err) {
          this.logger.error(`failed fetching page ${page}`, err);
          break;
        }
      }

      // cache results if we have redis
      if (combined.length) {
        try {
          const client = this.ensureRedis();
          if (client) {
            await client.set(key, JSON.stringify(combined), 'EX', this.ttl);
            const pipeline = client.pipeline();
            for (const m of combined) {
              const k = this.priceKey(m.symbol);
              pipeline.set(k, JSON.stringify(m), 'EX', this.ttl);
            }
            await pipeline.exec();
          } else {
            this.logger.debug('Redis not available — skipping caching of combined results');
          }
        } catch (err) {
          this.logger.warn('Failed caching combined markets: ' + (err as any).message);
        }
      }
    }

    // Merge with static data from database for all tokens
    // Fetch all tokens from database in one query for efficiency
    try {
      const tokens = await this.tokenRepo.find();
      const tokenMap = new Map(tokens.map(t => [t.symbol.toUpperCase(), t]));

      return combined.map((liveData) => {
        const symbol = liveData.symbol?.toUpperCase();
        const token = symbol ? tokenMap.get(symbol) : null;
        return this.formatResponse(liveData, token || null);
      });
    } catch (err) {
      this.logger.warn('Failed to merge static data: ' + (err as any).message);
      return combined.map((liveData) => this.formatResponse(liveData));
    }
  }

  /**
   * Starts the background polling mechanism
   * Periodically fetches price data from CoinGecko for tokens in the database
   * Processes in smaller batches to avoid memory issues and rate limits
   * Runs immediately on startup, then at configured intervals
   */
  private startPoller() {
    // run immediately once, then schedule
    const runOnce = async () => {
      try {
        // Limit the number of tokens to poll per cycle to avoid memory issues
        // Poll top tokens by market cap (first page of markets) instead of all tokens
        const maxTokensToPoll = Number(process.env.MAX_TOKENS_TO_POLL || 1000); // Default: 1000 tokens
        
        this.logger.debug(`poller tick - fetching prices for top ${maxTokensToPoll} tokens`);
        
        // Fetch market data for top tokens (sorted by market cap)
        // This avoids loading all 19k+ tokens into memory
        const batchSize = 250; // CoinGecko limit per request
        const batchesNeeded = Math.ceil(maxTokensToPoll / batchSize);
        const client = this.ensureRedis();
        let totalCached = 0;
        
        for (let page = 1; page <= batchesNeeded; page++) {
          try {
            // Fetch markets page (sorted by market cap desc)
            const markets = await this.cg.coinsMarkets(page);
            if (!markets || markets.length === 0) {
              break;
            }
            
            // Cache immediately instead of storing in memory
            if (client) {
              try {
                const pipeline = client.pipeline();
                for (const m of markets) {
                  if (m.symbol) {
                    pipeline.set(this.priceKey(m.symbol), JSON.stringify(m), 'EX', this.ttl);
                  }
                }
                await pipeline.exec();
                totalCached += markets.length;
              } catch (err) {
                this.logger.warn(`Failed to write batch ${page} to Redis: ${(err as any).message}`);
              }
            }
            
            // Stop if we've cached enough tokens
            if (totalCached >= maxTokensToPoll) {
              break;
            }
            
            // Small delay between batches to avoid rate limits
            if (page < batchesNeeded) {
              await new Promise(resolve => setTimeout(resolve, 200));
            }
          } catch (err: any) {
            // Handle rate limits gracefully
            if (err?.response?.status === 429) {
              const retryAfter = err?.response?.headers?.['retry-after'];
              const waitTime = retryAfter ? Number(retryAfter) * 1000 : 60000;
              this.logger.warn(`Rate limit hit while fetching batch ${page}. Waiting ${waitTime}ms`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
              // Retry this batch
              page--;
              continue;
            }
            this.logger.warn(`Failed to fetch batch ${page}: ${err?.message || err}`);
            break; // Stop on other errors
          }
        }
        
        if (totalCached > 0) {
          this.logger.debug(`Cached ${totalCached} token prices in Redis`);
        } else {
          this.logger.warn('No market data cached');
        }

        // Live price data is cached in Redis for fast access (NOT saved to database)
        // Only static token metadata (tokens table) is saved to database
      } catch (err: any) {
        // Handle rate limits gracefully - don't treat as critical error
        if (err?.response?.status === 429) {
          const retryAfter = err?.response?.headers?.['retry-after'];
          if (retryAfter) {
            this.logger.warn(`Rate limit hit. Retry after ${retryAfter} seconds. Skipping this poll cycle.`);
          } else {
            this.logger.warn('Rate limit hit. Skipping this poll cycle.');
          }
          // Skip this cycle - next poll will retry
        } else {
          this.logger.error('poller error', err);
        }
      }
    };

    // do initial run async (don't block startup)
    runOnce().catch((e) => this.logger.error('initial poller run failed', e));

    // schedule repeating runs
    this.poller = setInterval(async () => {
      try {
        await runOnce();
      } catch (err) {
        this.logger.error('poller periodic run failed', err);
      }
    }, this.intervalMs);
  }
}
