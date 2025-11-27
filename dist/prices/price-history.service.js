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
var PriceHistoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceHistoryService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const price_history_entity_1 = require("../entities/price-history.entity");
let PriceHistoryService = PriceHistoryService_1 = class PriceHistoryService {
    constructor(priceHistoryRepo) {
        this.priceHistoryRepo = priceHistoryRepo;
        this.logger = new common_1.Logger(PriceHistoryService_1.name);
    }
    async savePriceSnapshot(marketData) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        try {
            await this.priceHistoryRepo.query('SELECT 1 FROM price_history LIMIT 1');
        }
        catch (err) {
            this.logger.error(`Table access test failed: ${err.message}`);
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
            }
            catch (createErr) {
                this.logger.error(`Failed to create table: ${createErr.message}`);
                throw createErr;
            }
        }
        const existing = await this.priceHistoryRepo.findOne({
            where: {
                symbol: marketData.symbol?.toUpperCase(),
                snapshot_date: today,
            },
        });
        const priceData = {
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
            await this.priceHistoryRepo.update(existing.id, priceData);
            this.logger.debug(`Updated price snapshot for ${priceData.symbol} on ${today.toISOString()}`);
            return this.priceHistoryRepo.findOne({ where: { id: existing.id } });
        }
        else {
            const saved = await this.priceHistoryRepo.save(priceData);
            this.logger.debug(`Saved price snapshot for ${priceData.symbol} on ${today.toISOString()}`);
            return saved;
        }
    }
    async savePriceSnapshots(markets) {
        let saved = 0;
        for (const market of markets) {
            try {
                await this.savePriceSnapshot(market);
                saved++;
            }
            catch (err) {
                this.logger.error(`Failed to save snapshot for ${market.symbol}: ${err.message}`);
            }
        }
        this.logger.log(`Saved ${saved}/${markets.length} price snapshots`);
        return saved;
    }
    async getPriceHistory(symbol, days) {
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
    async getLatestSnapshot(symbol) {
        return this.priceHistoryRepo.findOne({
            where: { symbol: symbol.toUpperCase() },
            order: { snapshot_date: 'DESC' },
        });
    }
};
exports.PriceHistoryService = PriceHistoryService;
exports.PriceHistoryService = PriceHistoryService = PriceHistoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(price_history_entity_1.PriceHistory)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PriceHistoryService);
//# sourceMappingURL=price-history.service.js.map