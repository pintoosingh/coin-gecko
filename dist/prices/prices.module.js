"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const prices_controller_1 = require("./prices.controller");
const prices_service_1 = require("./prices.service");
const coingecko_service_1 = require("./coingecko.service");
const market_cap_scheduler_service_1 = require("./market-cap-scheduler.service");
const common_module_1 = require("../common/common.module");
const token_entity_1 = require("../entities/token.entity");
let PricesModule = class PricesModule {
};
exports.PricesModule = PricesModule;
exports.PricesModule = PricesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            common_module_1.CommonModule,
            typeorm_1.TypeOrmModule.forFeature([token_entity_1.Token]),
        ],
        controllers: [prices_controller_1.PricesController],
        providers: [
            prices_service_1.PricesService,
            coingecko_service_1.CoingeckoService,
            market_cap_scheduler_service_1.MarketCapSchedulerService,
        ],
        exports: [prices_service_1.PricesService],
    })
], PricesModule);
//# sourceMappingURL=prices.module.js.map