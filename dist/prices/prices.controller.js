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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricesController = void 0;
const common_1 = require("@nestjs/common");
const prices_service_1 = require("./prices.service");
let PricesController = class PricesController {
    constructor(svc) {
        this.svc = svc;
    }
    async getAll() {
        return this.svc.getAllPrices();
    }
    async getMetadata(symbol) {
        if (!symbol || symbol.trim().length === 0) {
            throw new common_1.BadRequestException('Symbol parameter is required and cannot be empty');
        }
        if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol.trim())) {
            throw new common_1.BadRequestException('Invalid symbol format. Symbol must be alphanumeric and 1-20 characters long');
        }
        const data = await this.svc.getTokenMetadata(symbol.trim());
        if (!data) {
            throw new common_1.NotFoundException(`Token with symbol '${symbol}' not found`);
        }
        return data;
    }
    async getHistory(symbol, days) {
        if (!symbol || symbol.trim().length === 0) {
            throw new common_1.BadRequestException('Symbol parameter is required and cannot be empty');
        }
        if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol.trim())) {
            throw new common_1.BadRequestException('Invalid symbol format. Symbol must be alphanumeric and 1-20 characters long');
        }
        const data = await this.svc.getPriceBySymbol(symbol.trim());
        if (!data) {
            throw new common_1.NotFoundException(`Token with symbol '${symbol}' not found`);
        }
        return [data];
    }
    async getLatest(symbol) {
        if (!symbol || symbol.trim().length === 0) {
            throw new common_1.BadRequestException('Symbol parameter is required and cannot be empty');
        }
        if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol.trim())) {
            throw new common_1.BadRequestException('Invalid symbol format. Symbol must be alphanumeric and 1-20 characters long');
        }
        const data = await this.svc.getPriceBySymbol(symbol.trim());
        if (!data) {
            throw new common_1.NotFoundException(`Token with symbol '${symbol}' not found`);
        }
        return data;
    }
    async getOne(symbol) {
        if (!symbol || symbol.trim().length === 0) {
            throw new common_1.BadRequestException('Symbol parameter is required and cannot be empty');
        }
        if (!/^[a-zA-Z0-9]{1,20}$/.test(symbol.trim())) {
            throw new common_1.BadRequestException('Invalid symbol format. Symbol must be alphanumeric and 1-20 characters long');
        }
        const data = await this.svc.getPriceBySymbol(symbol.trim());
        if (!data) {
            throw new common_1.NotFoundException(`Token with symbol '${symbol}' not found`);
        }
        return data;
    }
};
exports.PricesController = PricesController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PricesController.prototype, "getAll", null);
__decorate([
    (0, common_1.Get)(':symbol/metadata'),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PricesController.prototype, "getMetadata", null);
__decorate([
    (0, common_1.Get)(':symbol/history'),
    __param(0, (0, common_1.Param)('symbol')),
    __param(1, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PricesController.prototype, "getHistory", null);
__decorate([
    (0, common_1.Get)(':symbol/latest'),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PricesController.prototype, "getLatest", null);
__decorate([
    (0, common_1.Get)(':symbol'),
    __param(0, (0, common_1.Param)('symbol')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], PricesController.prototype, "getOne", null);
exports.PricesController = PricesController = __decorate([
    (0, common_1.Controller)('prices'),
    __metadata("design:paramtypes", [prices_service_1.PricesService])
], PricesController);
//# sourceMappingURL=prices.controller.js.map