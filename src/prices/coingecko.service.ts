import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import axiosRetry from 'axios-retry';

@Injectable()
export class CoingeckoService {
  private readonly logger = new Logger(CoingeckoService.name);
  private axios: AxiosInstance;
  private readonly base = process.env.COINGECKO_BASE || 'https://api.coingecko.com/api/v3';
  private readonly vsCurrency = process.env.VS_CURRENCY || 'usd';
  private readonly perPage = Number(process.env.PER_PAGE || 250);
  
  // Cache for coins list (doesn't change often, cache for 1 hour)
  private coinsListCache: { data: any[]; timestamp: number } | null = null;
  private readonly coinsListCacheTTL = 60 * 60 * 1000; // 1 hour

  /**
   * Initializes the CoinGecko API service
   * Sets up axios instance with retry logic, timeout, and proper headers
   * Configures exponential backoff retry strategy for rate limits and server errors
   */
  constructor() {
    this.axios = axios.create({
      baseURL: this.base,
      timeout: 15000,
      headers: {
        'User-Agent': 'Larvens-Prices-Service/1.0 (+https://your.company)',
        Accept: 'application/json',
      },
    });

    // retry config: retry on 429, 500-504, or network errors
    axiosRetry(this.axios, {
      retries: 3,
      retryDelay: (retryCount, error) => {
        // If server sent Retry-After header, respect it (seconds)
        const retryAfter = error?.response?.headers?.['retry-after'];
        if (retryAfter) {
          const wait = Number(retryAfter) * 1000;
          this.logger.warn(`Retry-After header present, wait ${wait}ms`);
          return wait;
        }
        // exponential backoff base: 1000ms * 2^(retryCount-1)
        const delay = 1000 * Math.pow(2, retryCount - 1);
        return delay;
      },
      shouldResetTimeout: true,
      retryCondition: (error) => {
        // retry on network error or 429 or 5xx
        if (axiosRetry.isNetworkOrIdempotentRequestError(error)) return true;
        const status = error?.response?.status;
        return status === 429 || (status >= 500 && status < 600);
      },
    });
  }

  /**
   * Fetches market data for cryptocurrencies from CoinGecko
   * @param page - Page number for pagination (default: 1)
   * @param ids - Optional array of CoinGecko coin IDs to filter results
   * @returns Array of market data objects containing price, volume, market cap, etc.
   */
  async coinsMarkets(page = 1, ids?: string[]) {
    const params: any = {
      vs_currency: this.vsCurrency,
      order: 'market_cap_desc',
      per_page: this.perPage,
      page,
      sparkline: false,
      price_change_percentage: '24h',
    };
    if (ids && ids.length) params.ids = ids.join(',');
    const r = await this.axios.get('/coins/markets', { params });
    return r.data;
  }

  /**
   * Fetches detailed information for a specific cryptocurrency
   * @param id - CoinGecko coin ID (e.g., 'bitcoin', 'ethereum')
   * @param includeMarketData - Whether to include market data (default: false for static data, true for live prices)
   * @returns Detailed coin information including metadata, links, categories, etc.
   */
  async coinDetails(id: string, includeMarketData = false) {
    const params: any = {
      localization: false,
      tickers: false,
      community_data: false,
      developer_data: false,
      sparkline: false,
    };
    
    // Include market_data if needed for live price fetching
    if (includeMarketData) {
      params.market_data = true;
    } else {
      params.market_data = false;
    }
    
    const r = await this.axios.get(`/coins/${encodeURIComponent(id)}`, { params });
    return r.data;
  }

  /**
   * Fetches the complete list of all supported cryptocurrencies from CoinGecko
   * Uses in-memory cache to avoid repeated slow API calls (cache for 1 hour)
   * @returns Array of coin objects with id, symbol, and name
   */
  async coinsList() {
    // Check cache first
    if (this.coinsListCache && (Date.now() - this.coinsListCache.timestamp) < this.coinsListCacheTTL) {
      this.logger.debug('Returning coins list from cache');
      return this.coinsListCache.data;
    }

    // Fetch from API
    this.logger.debug('Fetching coins list from CoinGecko API (this may take a few seconds)');
    const r = await this.axios.get('/coins/list');
    
    // Update cache
    this.coinsListCache = {
      data: r.data,
      timestamp: Date.now(),
    };
    
    return r.data;
  }
}
