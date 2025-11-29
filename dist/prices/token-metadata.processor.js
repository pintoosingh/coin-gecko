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
var TokenMetadataProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenMetadataProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const token_entity_1 = require("../entities/token.entity");
const coingecko_service_1 = require("./coingecko.service");
let TokenMetadataProcessor = TokenMetadataProcessor_1 = class TokenMetadataProcessor extends bullmq_1.WorkerHost {
    constructor(tokenRepo, cg) {
        super();
        this.tokenRepo = tokenRepo;
        this.cg = cg;
        this.logger = new common_1.Logger(TokenMetadataProcessor_1.name);
    }
    async process(job) {
        this.logger.log(`Processing token metadata job ${job.id} of type ${job.name}`);
        try {
            let coinIds = [];
            let coinsWithPlatforms = null;
            try {
                const allCoins = await this.cg.coinsList(true);
                this.logger.log(`Fetched ${allCoins.length} coins from CoinGecko /coins/list endpoint (with platforms)`);
                coinIds = allCoins
                    .map((coin) => coin.id)
                    .filter((id) => id && id.trim() !== '');
                coinsWithPlatforms = new Map();
                allCoins.forEach((coin) => {
                    if (coin.id && coin.platforms) {
                        coinsWithPlatforms.set(coin.id, coin);
                    }
                });
            }
            catch (err) {
                this.logger.error(`Failed to fetch coins list: ${err.message}`);
                this.logger.log('Falling back to markets endpoint...');
                const maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);
                const allCoinIds = new Set();
                for (let page = 1; page <= maxPages; page++) {
                    try {
                        const markets = await this.cg.coinsMarkets(page);
                        if (!markets || markets.length === 0)
                            break;
                        for (const market of markets) {
                            if (market.id) {
                                allCoinIds.add(market.id);
                            }
                        }
                        await new Promise((res) => setTimeout(res, 200));
                        if (markets.length < Number(process.env.PER_PAGE || 250))
                            break;
                    }
                    catch (err2) {
                        this.logger.error(`Failed to fetch page ${page}: ${err2.message}`);
                        break;
                    }
                }
                coinIds = Array.from(allCoinIds);
            }
            this.logger.log(`Found ${coinIds.length} coins to process for metadata`);
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
                    let contractAddresses = null;
                    let smartContractAddress = null;
                    const coinFromList = coinsWithPlatforms?.get(coinId);
                    if (coinFromList && coinFromList.platforms && typeof coinFromList.platforms === 'object') {
                        const filtered = {};
                        for (const [network, address] of Object.entries(coinFromList.platforms)) {
                            if (address && typeof address === 'string' && address.trim() !== '') {
                                filtered[network] = address;
                            }
                        }
                        contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
                    }
                    else if (details.platforms && typeof details.platforms === 'object') {
                        const filtered = {};
                        for (const [network, address] of Object.entries(details.platforms)) {
                            if (address && typeof address === 'string' && address.trim() !== '') {
                                filtered[network] = address;
                            }
                        }
                        contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
                    }
                    else if (details.contract_addresses) {
                        const filtered = {};
                        for (const [network, address] of Object.entries(details.contract_addresses)) {
                            if (address && typeof address === 'string' && address.trim() !== '') {
                                filtered[network] = address;
                            }
                        }
                        contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
                    }
                    if (contractAddresses) {
                        if (contractAddresses.ethereum) {
                            smartContractAddress = contractAddresses.ethereum;
                        }
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
                        else {
                            const firstPlatform = Object.keys(contractAddresses)[0];
                            if (firstPlatform) {
                                smartContractAddress = contractAddresses[firstPlatform];
                            }
                        }
                    }
                    else if (details.platforms && typeof details.platforms === 'object') {
                        if (details.platforms.ethereum) {
                            smartContractAddress = details.platforms.ethereum;
                        }
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
                    await this.tokenRepo.upsert(meta, ['coingecko_id']);
                    saved++;
                    if ((i + 1) % 50 === 0 || i + 1 === coinIds.length) {
                        this.logger.log(`Token metadata progress: ${i + 1}/${coinIds.length} processed (${saved} saved, ${failed} failed)`);
                    }
                    await new Promise((res) => setTimeout(res, 100));
                }
                catch (err) {
                    this.logger.error(`Failed to process token metadata for ${coinId}: ${err.message}`);
                    failed++;
                    await new Promise((res) => setTimeout(res, 500));
                }
            }
            this.logger.log(`Token metadata job completed: ${saved} tokens saved, ${failed} failed`);
            return { saved, total: coinIds.length, failed };
        }
        catch (error) {
            this.logger.error(`Token metadata job ${job.id} failed: ${error.message}`, error);
            throw error;
        }
    }
};
exports.TokenMetadataProcessor = TokenMetadataProcessor;
exports.TokenMetadataProcessor = TokenMetadataProcessor = TokenMetadataProcessor_1 = __decorate([
    (0, bullmq_1.Processor)('token-metadata'),
    __param(0, (0, typeorm_1.InjectRepository)(token_entity_1.Token)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        coingecko_service_1.CoingeckoService])
], TokenMetadataProcessor);
//# sourceMappingURL=token-metadata.processor.js.map