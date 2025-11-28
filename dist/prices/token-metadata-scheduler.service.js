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
var TokenMetadataSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TokenMetadataSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
let TokenMetadataSchedulerService = TokenMetadataSchedulerService_1 = class TokenMetadataSchedulerService {
    constructor(tokenMetadataQueue) {
        this.tokenMetadataQueue = tokenMetadataQueue;
        this.logger = new common_1.Logger(TokenMetadataSchedulerService_1.name);
        this.schedulerInterval = null;
        this.intervalMs = Number(process.env.TOKEN_METADATA_INTERVAL_MS || 24 * 60 * 60 * 1000);
    }
    onModuleInit() {
        this.logger.log('Starting token metadata scheduler');
        this.scheduleJob();
        this.schedulerInterval = setInterval(() => {
            this.scheduleJob();
        }, this.intervalMs);
    }
    onModuleDestroy() {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
            this.logger.log('Token metadata scheduler stopped');
        }
    }
    async scheduleJob() {
        try {
            await this.tokenMetadataQueue.add('persist-metadata', {}, {
                removeOnComplete: { count: 10 },
                removeOnFail: { count: 5 },
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 5000,
                },
            });
            this.logger.debug('Scheduled token metadata persistence job');
        }
        catch (error) {
            this.logger.error(`Failed to schedule token metadata job: ${error.message}`);
        }
    }
};
exports.TokenMetadataSchedulerService = TokenMetadataSchedulerService;
exports.TokenMetadataSchedulerService = TokenMetadataSchedulerService = TokenMetadataSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)('token-metadata')),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], TokenMetadataSchedulerService);
//# sourceMappingURL=token-metadata-scheduler.service.js.map