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
var MarketCapSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarketCapSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const token_entity_1 = require("../entities/token.entity");
const coingecko_service_1 = require("./coingecko.service");
let MarketCapSchedulerService = MarketCapSchedulerService_1 = class MarketCapSchedulerService {
    constructor(tokenRepo, cg) {
        this.tokenRepo = tokenRepo;
        this.cg = cg;
        this.logger = new common_1.Logger(MarketCapSchedulerService_1.name);
        this.schedulerInterval = null;
        this.intervalMs = 24 * 60 * 60 * 1000;
    }
    onModuleInit() {
        this.logger.log('Starting market cap scheduler (24-hour refresh)');
        this.updateMarketCaps().catch((err) => {
            this.logger.error('Initial market cap update failed:', err);
        });
        this.schedulerInterval = setInterval(() => {
            this.updateMarketCaps().catch((err) => {
                this.logger.error('Scheduled market cap update failed:', err);
            });
        }, this.intervalMs);
    }
    onModuleDestroy() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
            this.logger.log('Market cap scheduler stopped');
        }
    }
    async updateMarketCaps() {
        this.logger.log('Starting market cap update for bitcoin, ethereum, solana');
        try {
            const targetIds = ['bitcoin', 'ethereum', 'solana'];
            const tokens = await this.tokenRepo
                .createQueryBuilder('token')
                .where('token.coingecko_id IN (:...ids)', { ids: targetIds })
                .getMany();
            if (tokens.length === 0) {
                this.logger.warn('No tokens found in database to update market cap (expected: bitcoin, ethereum, solana)');
                return;
            }
            const allMarkets = [];
            try {
                const markets = await this.cg.coinsMarkets(1, targetIds);
                if (markets && markets.length > 0) {
                    allMarkets.push(...markets);
                }
            }
            catch (err) {
                this.logger.error(`Failed to fetch market data: ${err.message}`);
                throw err;
            }
            const marketCapMap = new Map();
            for (const market of allMarkets) {
                if (market.id && market.market_cap) {
                    marketCapMap.set(market.id, market.market_cap);
                }
            }
            let updated = 0;
            for (const token of tokens) {
                if (token.coingecko_id && marketCapMap.has(token.coingecko_id)) {
                    const marketCap = marketCapMap.get(token.coingecko_id);
                    if (marketCap !== undefined && marketCap !== null) {
                        await this.tokenRepo.update({ id: token.id }, { market_cap: marketCap });
                        updated++;
                    }
                }
            }
            this.logger.log(`Market cap update completed: ${updated}/${tokens.length} tokens updated`);
        }
        catch (error) {
            this.logger.error(`Market cap update failed: ${error.message}`, error);
            throw error;
        }
    }
};
exports.MarketCapSchedulerService = MarketCapSchedulerService;
exports.MarketCapSchedulerService = MarketCapSchedulerService = MarketCapSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(token_entity_1.Token)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        coingecko_service_1.CoingeckoService])
], MarketCapSchedulerService);
//# sourceMappingURL=market-cap-scheduler.service.js.map