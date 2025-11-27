import { Controller, Get, Param, Query, NotFoundException, BadRequestException } from '@nestjs/common';
import { PricesService } from './prices.service';

/**
 * REST API controller for price-related endpoints
 * - Static data: Stored in tokens table (one-time seed)
 * - Live data: Served from Redis cache only (updated every 20s, NOT saved to database)
 */
@Controller('prices')
export class PricesController {
  constructor(
    private svc: PricesService,
  ) {}

  /**
   * GET /prices
   * Retrieves all cached token prices from Redis
   * @returns Array of all token market data (from Redis cache)
   */
  @Get()
  async getAll() {
    return this.svc.getAllPrices();
  }

  /**
   * GET /prices/:symbol/metadata
   * Retrieves static metadata for a specific token from database
   * Returns only static data: contract_address, categories, social_links, about, etc.
   * @param symbol - Token symbol (e.g., 'BTC', 'ETH')
   * @returns Static metadata object from database
   * @throws NotFoundException if token is not found
   * @throws BadRequestException if symbol is invalid
   */
  @Get(':symbol/metadata')
  async getMetadata(@Param('symbol') symbol: string) {
    // Validate symbol parameter
    if (!symbol || symbol.trim().length === 0) {
      throw new BadRequestException('Symbol parameter is required and cannot be empty');
    }

    if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol.trim())) {
      throw new BadRequestException('Invalid symbol format. Symbol must be alphanumeric and 1-20 characters long');
    }

    const data = await this.svc.getTokenMetadata(symbol.trim());
    
    if (!data) {
      throw new NotFoundException(`Token with symbol '${symbol}' not found`);
    }

    return data;
  }

  /**
   * GET /prices/:symbol/history?days=N
   * Retrieves current price data from Redis cache
   * Note: Historical data is NOT stored in database (only static metadata is saved)
   * @param symbol - Token symbol (e.g., 'BTC', 'ETH')
   * @param days - Optional number of days (ignored - returns current cached data)
   * @returns Current price data from Redis cache (wrapped in array for compatibility)
   * @throws NotFoundException if token is not found
   * @throws BadRequestException if symbol is invalid
   */
  @Get(':symbol/history')
  async getHistory(
    @Param('symbol') symbol: string,
    @Query('days') days?: string,
  ) {
    // Validate symbol parameter
    if (!symbol || symbol.trim().length === 0) {
      throw new BadRequestException('Symbol parameter is required and cannot be empty');
    }

    if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol.trim())) {
      throw new BadRequestException('Invalid symbol format. Symbol must be alphanumeric and 1-20 characters long');
    }

    const data = await this.svc.getPriceBySymbol(symbol.trim());
    
    if (!data) {
      throw new NotFoundException(`Token with symbol '${symbol}' not found`);
    }

    // Return as array for compatibility, but note that historical data is not stored
    return [data];
  }

  /**
   * GET /prices/:symbol/latest
   * Retrieves the latest price data from Redis cache
   * Note: Returns current cached data, NOT from database (only static metadata is saved)
   * @param symbol - Token symbol (e.g., 'BTC', 'ETH')
   * @returns Latest price data from Redis cache
   * @throws NotFoundException if token is not found
   * @throws BadRequestException if symbol is invalid
   */
  @Get(':symbol/latest')
  async getLatest(@Param('symbol') symbol: string) {
    // Validate symbol parameter
    if (!symbol || symbol.trim().length === 0) {
      throw new BadRequestException('Symbol parameter is required and cannot be empty');
    }

    if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol.trim())) {
      throw new BadRequestException('Invalid symbol format. Symbol must be alphanumeric and 1-20 characters long');
    }

    const data = await this.svc.getPriceBySymbol(symbol.trim());
    
    if (!data) {
      throw new NotFoundException(`Token with symbol '${symbol}' not found`);
    }

    return data;
  }

  /**
   * GET /prices/:symbol
   * Retrieves current price data for a specific token from Redis cache
   * Note: This route must be defined LAST to avoid conflicts with /history and /latest routes
   * @param symbol - Token symbol (e.g., 'BTC', 'ETH')
   * @returns Market data object for the specified token (from Redis cache)
   * @throws NotFoundException if token is not found
   * @throws BadRequestException if symbol is invalid
   */
  @Get(':symbol')
  async getOne(@Param('symbol') symbol: string) {
    // Validate symbol parameter
    if (!symbol || symbol.trim().length === 0) {
      throw new BadRequestException('Symbol parameter is required and cannot be empty');
    }

    // Validate symbol format (alphanumeric, max 20 chars)
    if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol.trim())) {
      throw new BadRequestException('Invalid symbol format. Symbol must be alphanumeric and 1-20 characters long');
    }

    const data = await this.svc.getPriceBySymbol(symbol.trim());
    
    if (!data) {
      throw new NotFoundException(`Token with symbol '${symbol}' not found`);
    }

    return data;
  }
}
