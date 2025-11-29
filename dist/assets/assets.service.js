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
var AssetsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssetsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const token_entity_1 = require("../entities/token.entity");
let AssetsService = AssetsService_1 = class AssetsService {
    constructor(tokenRepo) {
        this.tokenRepo = tokenRepo;
        this.logger = new common_1.Logger(AssetsService_1.name);
    }
    async getAllTokens() {
        try {
            const tokens = await this.tokenRepo.find({
                order: {
                    symbol: 'ASC',
                },
            });
            return tokens.map((token) => ({
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
                created_at: token.created_at,
                updated_at: token.updated_at,
            }));
        }
        catch (err) {
            this.logger.error(`Failed to fetch all tokens: ${err.message}`);
            throw err;
        }
    }
    async createToken(tokenData) {
        try {
            const normalizedData = {
                ...tokenData,
                symbol: tokenData.symbol.toUpperCase(),
            };
            const result = await this.tokenRepo.upsert(normalizedData, ['coingecko_id']);
            const token = await this.tokenRepo.findOne({
                where: { coingecko_id: normalizedData.coingecko_id },
            });
            if (!token) {
                throw new Error('Failed to retrieve token after upsert');
            }
            this.logger.log(`Token ${token.symbol} (${token.coingecko_id}) stored successfully`);
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
                created_at: token.created_at,
                updated_at: token.updated_at,
            };
        }
        catch (err) {
            this.logger.error(`Failed to store token: ${err.message}`);
            throw err;
        }
    }
};
exports.AssetsService = AssetsService;
exports.AssetsService = AssetsService = AssetsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(token_entity_1.Token)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AssetsService);
//# sourceMappingURL=assets.service.js.map