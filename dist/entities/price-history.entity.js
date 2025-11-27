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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PriceHistory = void 0;
const typeorm_1 = require("typeorm");
let PriceHistory = class PriceHistory {
};
exports.PriceHistory = PriceHistory;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PriceHistory.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], PriceHistory.prototype, "symbol", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'varchar', length: 200, nullable: true }),
    __metadata("design:type", String)
], PriceHistory.prototype, "coingecko_id", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'varchar', length: 200, nullable: true }),
    __metadata("design:type", String)
], PriceHistory.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'text', nullable: true }),
    __metadata("design:type", String)
], PriceHistory.prototype, "image", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 20, scale: 8, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "current_price", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 30, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "market_cap", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'integer', nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "market_cap_rank", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 30, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "fully_diluted_valuation", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 30, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "total_volume", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 20, scale: 8, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "high_24h", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 20, scale: 8, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "low_24h", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 20, scale: 8, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "price_change_24h", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "price_change_percentage_24h", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 30, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "market_cap_change_24h", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "market_cap_change_percentage_24h", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 30, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "circulating_supply", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 30, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "total_supply", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 30, scale: 2, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "max_supply", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 20, scale: 8, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "ath", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: 'decimal', precision: 10, scale: 4, nullable: true }),
    __metadata("design:type", Number)
], PriceHistory.prototype, "ath_change_percentage", void 0);
__decorate([
    (0, typeorm_1.Index)(),
    (0, typeorm_1.Column)({ type: 'date' }),
    __metadata("design:type", Date)
], PriceHistory.prototype, "snapshot_date", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)(),
    __metadata("design:type", Date)
], PriceHistory.prototype, "created_at", void 0);
exports.PriceHistory = PriceHistory = __decorate([
    (0, typeorm_1.Entity)({ name: 'price_history', schema: 'public' })
], PriceHistory);
//# sourceMappingURL=price-history.entity.js.map