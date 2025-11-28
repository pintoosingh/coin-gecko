"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PricesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const redis_service_1 = require("../common/redis.service");
const coingecko_service_1 = require("./coingecko.service");
const token_entity_1 = require("../entities/token.entity");
let PricesService = PricesService_1 = class PricesService {
    constructor(redisSvc, cg, tokenRepo) {
        this.redisSvc = redisSvc;
        this.cg = cg;
        this.tokenRepo = tokenRepo;
        this.logger = new common_1.Logger(PricesService_1.name);
        this.redis = null;
        this.poller = null;
        this.ttl = Number(process.env.PRICE_CACHE_TTL_SECONDS || 30);
        this.intervalMs = Number(process.env.PRICE_UPDATE_INTERVAL_MS || 60000);
        this.maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);
    }
    onModuleInit() {
        try {
            const client = this.redisSvc.getClient();
            if (client) {
                this.redis = client;
                this.logger.debug('Redis client initialized in PricesService');
            }
            else {
                this.logger.warn('RedisService.getClient() returned undefined onModuleInit');
            }
        }
        catch (err) {
            this.logger.warn('Error getting Redis client on init: ' + err.message);
            this.redis = null;
        }
        this.startPoller();
    }
    onModuleDestroy() {
        if (this.poller) {
            clearInterval(this.poller);
            this.poller = null;
        }
    }
    priceKey(symbol) {
        return `price:${symbol.toLowerCase()}`;
    }
    allKey() {
        return `prices:all`;
    }
    coinDetailsKey(coinId) {
        return `coin:details:${coinId.toLowerCase()}`;
    }
    ensureRedis() {
        if (!this.redis) {
            try {
                const client = this.redisSvc.getClient();
                if (client) {
                    this.redis = client;
                    this.logger.debug('Redis client lazily initialized');
                }
            }
            catch (err) {
                this.logger.warn('Failed to lazily init redis client: ' + err.message);
                this.redis = null;
            }
        }
        return this.redis;
    }
    async getTokenMetadata(symbol) {
        try {
            const token = await this.tokenRepo.findOne({
                where: { symbol: symbol.toUpperCase() },
            });
            if (!token) {
                return null;
            }
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
                market_cap: token.market_cap,
            };
        }
        catch (err) {
            this.logger.warn(`Failed to fetch metadata for ${symbol}: ${err.message}`);
            return null;
        }
    }
    formatResponse(liveData, staticData) {
        if (!liveData)
            return null;
        const formatted = {
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
        if (staticData) {
            formatted.contract_address = staticData.contract_address;
            formatted.categories = staticData.categories;
        }
        return formatted;
    }
    async mergeWithStaticData(liveData, symbol, coinDetailsData) {
        if (!liveData)
            return null;
        try {
            const token = await this.tokenRepo.findOne({
                where: { symbol: symbol.toUpperCase() },
            });
            let contractAddress = null;
            let categories = null;
            if (token) {
                contractAddress = token.contract_address;
                categories = token.categories;
            }
            else if (coinDetailsData) {
                if (coinDetailsData.contract_addresses) {
                    const filtered = {};
                    for (const [network, address] of Object.entries(coinDetailsData.contract_addresses)) {
                        if (address && typeof address === 'string' && address.trim() !== '') {
                            filtered[network] = address;
                        }
                    }
                    contractAddress = Object.keys(filtered).length > 0 ? filtered : null;
                }
                else if (coinDetailsData.platforms && typeof coinDetailsData.platforms === 'object') {
                    const filtered = {};
                    for (const [network, address] of Object.entries(coinDetailsData.platforms)) {
                        if (address && typeof address === 'string' && address.trim() !== '') {
                            filtered[network] = address;
                        }
                    }
                    contractAddress = Object.keys(filtered).length > 0 ? filtered : null;
                }
                if (coinDetailsData.categories && Array.isArray(coinDetailsData.categories)) {
                    categories = coinDetailsData.categories.length > 0 ? coinDetailsData.categories : null;
                }
            }
            const staticDataForFormat = token || (contractAddress || categories ? {
                contract_address: contractAddress,
                categories: categories,
            } : null);
            return this.formatResponse(liveData, staticDataForFormat);
        }
        catch (err) {
            this.logger.warn(`Failed to fetch static data for ${symbol}: ${err.message}`);
            return this.formatResponse(liveData);
        }
    }
    async getPriceBySymbol(symbol) {
        const key = this.priceKey(symbol);
        let liveData = null;
        let coinId = null;
        try {
            const token = await this.tokenRepo.findOne({
                where: { symbol: symbol.toUpperCase() },
                select: ['coingecko_id'],
            });
            if (token && token.coingecko_id) {
                coinId = token.coingecko_id;
                this.logger.debug(`Found token in database: ${symbol} -> ${coinId}`);
            }
        }
        catch (err) {
            this.logger.warn(`Failed to check database for ${symbol}: ${err.message}`);
        }
        let coinIdFromCache = null;
        try {
            const client = this.ensureRedis();
            if (client) {
                const cached = await client.get(key);
                if (cached) {
                    try {
                        liveData = JSON.parse(cached);
                        coinIdFromCache = liveData?.id || null;
                        if (coinId && coinIdFromCache && coinIdFromCache !== coinId) {
                            this.logger.warn(`Cache mismatch for ${symbol}: cached=${coinIdFromCache}, db=${coinId}. Invalidating cache.`);
                            liveData = null;
                            coinIdFromCache = null;
                            try {
                                await client.del(key);
                            }
                            catch (e) {
                            }
                        }
                    }
                    catch (e) {
                        this.logger.warn('Failed parsing cached price JSON for ' + symbol);
                    }
                }
            }
            else {
                this.logger.debug('Redis not available — falling back to direct Coingecko for symbol=' + symbol);
            }
        }
        catch (err) {
            this.logger.warn('Redis get error for ' + key + ': ' + err.message);
        }
        if (liveData && coinIdFromCache && !liveData.__coinDetailsData) {
            try {
                const tokenInDb = await this.tokenRepo.findOne({
                    where: { symbol: symbol.toUpperCase() },
                    select: ['contract_address', 'categories'],
                });
                if (tokenInDb && (tokenInDb.contract_address || tokenInDb.categories)) {
                    this.logger.debug(`Using static data from database for ${symbol}`);
                    liveData.__coinDetailsData = null;
                }
                else {
                    const client = this.ensureRedis();
                    if (client) {
                        const detailsKey = this.coinDetailsKey(coinIdFromCache);
                        const cachedDetails = await client.get(detailsKey);
                        if (cachedDetails) {
                            try {
                                liveData.__coinDetailsData = JSON.parse(cachedDetails);
                                this.logger.debug(`Found coin details in cache for ${coinIdFromCache}`);
                            }
                            catch (e) {
                            }
                        }
                    }
                    if (!liveData.__coinDetailsData) {
                        try {
                            const coinDetailsData = await this.cg.coinDetails(coinIdFromCache, false);
                            liveData.__coinDetailsData = coinDetailsData;
                            try {
                                const client = this.ensureRedis();
                                if (client) {
                                    const detailsKey = this.coinDetailsKey(coinIdFromCache);
                                    await client.set(detailsKey, JSON.stringify(coinDetailsData), 'EX', 3600);
                                }
                            }
                            catch (err) {
                                this.logger.debug('Failed to cache coin details');
                            }
                        }
                        catch (err) {
                            this.logger.warn(`Failed to fetch coin details for cached ${coinIdFromCache}: ${err.message}`);
                        }
                    }
                }
            }
            catch (err) {
                this.logger.warn(`Failed to check database for static data: ${err.message}`);
            }
        }
        if (!liveData) {
            try {
                let found = null;
                const searchPages = Math.min(2, this.maxPages);
                if (coinId) {
                    try {
                        const markets = await this.cg.coinsMarkets(1, [coinId]);
                        if (markets && markets.length > 0) {
                            found = markets[0];
                            liveData = found;
                            this.logger.debug(`Found token using database coingecko_id: ${coinId}`);
                        }
                    }
                    catch (err) {
                        this.logger.warn(`Failed to fetch market data for ${coinId}: ${err.message}`);
                    }
                }
                if (!found) {
                    for (let page = 1; page <= searchPages; page++) {
                        const markets = await this.cg.coinsMarkets(page);
                        found = markets.find((m) => m.symbol && m.symbol.toLowerCase() === symbol.toLowerCase());
                        if (found) {
                            liveData = found;
                            coinId = found.id;
                            break;
                        }
                        if (!markets || markets.length === 0)
                            break;
                    }
                }
                if (!found) {
                    const perPage = Number(process.env.PER_PAGE || 250);
                    this.logger.debug(`Token ${symbol} not found in top ${searchPages * perPage} tokens, trying coins/list`);
                    try {
                        const coinsList = await this.cg.coinsList();
                        const coinInfo = coinsList.find((c) => c.symbol && c.symbol.toLowerCase() === symbol.toLowerCase());
                        if (coinInfo && coinInfo.id) {
                            coinId = coinInfo.id;
                        }
                    }
                    catch (err) {
                        this.logger.warn(`Failed to fetch coins list: ${err.message}`);
                    }
                }
                let coinDetailsData = null;
                if (coinId) {
                    try {
                        const tokenInDb = await this.tokenRepo.findOne({
                            where: { symbol: symbol.toUpperCase() },
                            select: ['contract_address', 'categories'],
                        });
                        if (tokenInDb && (tokenInDb.contract_address || tokenInDb.categories)) {
                            this.logger.debug(`Using static data from database for ${symbol}, skipping CoinGecko API call`);
                            coinDetailsData = null;
                        }
                        else {
                            const client = this.ensureRedis();
                            if (client) {
                                const detailsKey = this.coinDetailsKey(coinId);
                                const cachedDetails = await client.get(detailsKey);
                                if (cachedDetails) {
                                    try {
                                        coinDetailsData = JSON.parse(cachedDetails);
                                        this.logger.debug(`Found coin details in cache for ${coinId}`);
                                    }
                                    catch (e) {
                                    }
                                }
                            }
                            if (!coinDetailsData) {
                                coinDetailsData = await this.cg.coinDetails(coinId, !found);
                                try {
                                    const client = this.ensureRedis();
                                    if (client) {
                                        const detailsKey = this.coinDetailsKey(coinId);
                                        await client.set(detailsKey, JSON.stringify(coinDetailsData), 'EX', 3600);
                                    }
                                }
                                catch (err) {
                                    this.logger.debug('Failed to cache coin details');
                                }
                            }
                        }
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
                        if (liveData) {
                            liveData.__coinDetailsData = coinDetailsData;
                        }
                    }
                    catch (err) {
                        this.logger.warn(`Failed to fetch coin details for ${coinId}: ${err.message}`);
                    }
                }
                if (liveData) {
                    try {
                        const client = this.ensureRedis();
                        if (client) {
                            const dataToCache = { ...liveData };
                            delete dataToCache.__coinDetailsData;
                            await client.set(key, JSON.stringify(dataToCache), 'EX', this.ttl);
                        }
                    }
                    catch (err) {
                        this.logger.debug('Failed to cache fallback market: ' + err.message);
                    }
                }
            }
            catch (err) {
                this.logger.error('fallback fetch failed', err);
                throw err;
            }
        }
        const coinDetailsData = liveData.__coinDetailsData;
        delete liveData.__coinDetailsData;
        return this.mergeWithStaticData(liveData, symbol, coinDetailsData);
    }
    async getAllPrices() {
        const key = this.allKey();
        let combined = [];
        try {
            const client = this.ensureRedis();
            if (client) {
                const cached = await client.get(key);
                if (cached) {
                    try {
                        combined = JSON.parse(cached);
                    }
                    catch (e) {
                    }
                }
            }
            else {
                this.logger.debug('Redis not available in getAllPrices — falling back to direct fetch');
            }
        }
        catch (err) {
            this.logger.warn('Redis get error for allKey: ' + err.message);
        }
        if (combined.length === 0) {
            for (let page = 1; page <= this.maxPages; page++) {
                try {
                    const data = await this.cg.coinsMarkets(page);
                    if (!data || data.length === 0)
                        break;
                    combined.push(...data);
                    if (data.length < Number(process.env.PER_PAGE || 250))
                        break;
                }
                catch (err) {
                    this.logger.error(`failed fetching page ${page}`, err);
                    break;
                }
            }
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
                    }
                    else {
                        this.logger.debug('Redis not available — skipping caching of combined results');
                    }
                }
                catch (err) {
                    this.logger.warn('Failed caching combined markets: ' + err.message);
                }
            }
        }
        try {
            const tokens = await this.tokenRepo.find();
            const tokenMap = new Map(tokens.map(t => [t.symbol.toUpperCase(), t]));
            return combined.map((liveData) => {
                const symbol = liveData.symbol?.toUpperCase();
                const token = symbol ? tokenMap.get(symbol) : null;
                return this.formatResponse(liveData, token || null);
            });
        }
        catch (err) {
            this.logger.warn('Failed to merge static data: ' + err.message);
            return combined.map((liveData) => this.formatResponse(liveData));
        }
    }
    startPoller() {
        const targetIds = ['bitcoin', 'ethereum', 'solana'];
        const runOnce = async () => {
            this.logger.debug('poller tick - fetching prices for bitcoin, ethereum, solana');
            try {
                const markets = await this.cg.coinsMarkets(1, targetIds);
                if (!markets || markets.length === 0) {
                    this.logger.warn('No market data returned for target tokens');
                    return;
                }
                const client = this.ensureRedis();
                if (client) {
                    try {
                        const pipeline = client.pipeline();
                        for (const m of markets) {
                            if (m.symbol) {
                                pipeline.set(this.priceKey(m.symbol), JSON.stringify(m), 'EX', this.ttl);
                            }
                        }
                        await pipeline.exec();
                        this.logger.debug(`Cached ${markets.length} tokens in Redis`);
                    }
                    catch (err) {
                        this.logger.warn('Failed to write markets to Redis pipeline: ' + err.message);
                    }
                }
                else {
                    this.logger.debug('Redis not available while polling; skipping caching');
                }
            }
            catch (err) {
                if (err?.response?.status === 429) {
                    const retryAfter = err?.response?.headers?.['retry-after'];
                    if (retryAfter) {
                        this.logger.warn(`Rate limit hit. Retry after ${retryAfter} seconds. Skipping this poll cycle.`);
                    }
                    else {
                        this.logger.warn('Rate limit hit. Skipping this poll cycle.');
                    }
                }
                else {
                    this.logger.error('poller error', err);
                }
            }
        };
        runOnce().catch((e) => this.logger.error('initial poller run failed', e));
        this.poller = setInterval(async () => {
            try {
                await runOnce();
            }
            catch (err) {
                this.logger.error('poller periodic run failed', err);
            }
        }, this.intervalMs);
    }
};
exports.PricesService = PricesService;
exports.PricesService = PricesService = PricesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectRepository)(token_entity_1.Token)),
    __metadata("design:paramtypes", [redis_service_1.RedisService,
        coingecko_service_1.CoingeckoService,
        typeorm_2.Repository])
], PricesService);
//# sourceMappingURL=prices.service.js.map