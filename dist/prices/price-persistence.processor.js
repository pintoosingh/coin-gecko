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
var PricePersistenceProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricePersistenceProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const price_history_service_1 = require("./price-history.service");
const coingecko_service_1 = require("./coingecko.service");
let PricePersistenceProcessor = PricePersistenceProcessor_1 = class PricePersistenceProcessor extends bullmq_1.WorkerHost {
    constructor(priceHistorySvc, cg) {
        super();
        this.priceHistorySvc = priceHistorySvc;
        this.cg = cg;
        this.logger = new common_1.Logger(PricePersistenceProcessor_1.name);
    }
    async process(job) {
        this.logger.log(`Processing job ${job.id} of type ${job.name}`);
        try {
            const maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);
            const allMarkets = [];
            for (let page = 1; page <= maxPages; page++) {
                try {
                    const markets = await this.cg.coinsMarkets(page);
                    if (!markets || markets.length === 0)
                        break;
                    allMarkets.push(...markets);
                    await new Promise((res) => setTimeout(res, 200));
                }
                catch (err) {
                    this.logger.error(`Failed to fetch page ${page}: ${err.message}`);
                    break;
                }
            }
            if (allMarkets.length > 0) {
                const saved = await this.priceHistorySvc.savePriceSnapshots(allMarkets);
                this.logger.log(`Successfully persisted ${saved} price snapshots`);
                return { saved, total: allMarkets.length };
            }
            return { saved: 0, total: 0 };
        }
        catch (error) {
            this.logger.error(`Job ${job.id} failed: ${error.message}`, error);
            throw error;
        }
    }
};
exports.PricePersistenceProcessor = PricePersistenceProcessor;
exports.PricePersistenceProcessor = PricePersistenceProcessor = PricePersistenceProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('price-persistence'),
    __metadata("design:paramtypes", [price_history_service_1.PriceHistoryService,
        coingecko_service_1.CoingeckoService])
], PricePersistenceProcessor);
//# sourceMappingURL=price-persistence.processor.js.map