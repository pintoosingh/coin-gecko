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
var CoingeckoService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoingeckoService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = require("axios");
const axios_retry_1 = require("axios-retry");
let CoingeckoService = CoingeckoService_1 = class CoingeckoService {
    constructor() {
        this.logger = new common_1.Logger(CoingeckoService_1.name);
        this.base = process.env.COINGECKO_BASE || 'https://api.coingecko.com/api/v3';
        this.vsCurrency = process.env.VS_CURRENCY || 'usd';
        this.perPage = Number(process.env.PER_PAGE || 250);
        this.coinsListCache = null;
        this.coinsListCacheTTL = 60 * 60 * 1000;
        this.axios = axios_1.default.create({
            baseURL: this.base,
            timeout: 60000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            headers: {
                'User-Agent': 'Larvens-Prices-Service/1.0 (+https://your.company)',
                Accept: 'application/json',
            },
        });
        (0, axios_retry_1.default)(this.axios, {
            retries: 5,
            retryDelay: (retryCount, error) => {
                const retryAfter = error?.response?.headers?.['retry-after'];
                if (retryAfter) {
                    const wait = Number(retryAfter) * 1000;
                    const waitWithBuffer = wait + 10000;
                    this.logger.warn(`Retry-After header present, wait ${waitWithBuffer}ms (${wait}ms + 10s buffer)`);
                    return waitWithBuffer;
                }
                const status = error?.response?.status;
                if (status === 429) {
                    const delay = 60000;
                    this.logger.warn(`Rate limit hit (429), waiting ${delay}ms before retry`);
                    return delay;
                }
                const delay = 2000 * Math.pow(2, retryCount - 1);
                return delay;
            },
            shouldResetTimeout: true,
            retryCondition: (error) => {
                if (axios_retry_1.default.isNetworkOrIdempotentRequestError(error))
                    return true;
                const status = error?.response?.status;
                return status === 429 || (status >= 500 && status < 600);
            },
        });
    }
    async coinsMarkets(page = 1, ids) {
        const params = {
            vs_currency: this.vsCurrency,
            order: 'market_cap_desc',
            per_page: this.perPage,
            page,
            sparkline: false,
            price_change_percentage: '24h',
        };
        if (ids && ids.length)
            params.ids = ids.join(',');
        const r = await this.axios.get('/coins/markets', { params });
        return r.data;
    }
    async coinDetails(id, includeMarketData = false) {
        const params = {
            localization: false,
            tickers: false,
            community_data: false,
            developer_data: false,
            sparkline: false,
        };
        if (includeMarketData) {
            params.market_data = true;
        }
        else {
            params.market_data = false;
        }
        const r = await this.axios.get(`/coins/${encodeURIComponent(id)}`, { params });
        return r.data;
    }
    async coinsList(includePlatform = true) {
        const cacheKey = includePlatform ? 'with-platforms' : 'basic';
        if (this.coinsListCache && (Date.now() - this.coinsListCache.timestamp) < this.coinsListCacheTTL) {
            this.logger.debug('Returning coins list from cache');
            return this.coinsListCache.data;
        }
        this.logger.debug('Fetching coins list from CoinGecko API (this may take a few seconds)');
        const params = {};
        if (includePlatform) {
            params.include_platform = true;
        }
        const r = await this.axios.get('/coins/list', {
            params,
            timeout: 60000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
        });
        this.coinsListCache = {
            data: r.data,
            timestamp: Date.now(),
        };
        return r.data;
    }
    async assetToken(network, address) {
        const r = await this.axios.get(`/networks/${encodeURIComponent(network)}/tokens/${encodeURIComponent(address)}`);
        return r.data;
    }
};
exports.CoingeckoService = CoingeckoService;
exports.CoingeckoService = CoingeckoService = CoingeckoService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], CoingeckoService);
//# sourceMappingURL=coingecko.service.js.map