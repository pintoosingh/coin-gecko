"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RedisService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = require("ioredis");
let RedisService = RedisService_1 = class RedisService {
    constructor() {
        this.client = null;
        this.logger = new common_1.Logger(RedisService_1.name);
    }
    onModuleInit() {
        try {
            if (!this.client) {
                const url = process.env.REDIS_URL || 'redis://localhost:6379';
                this.client = new ioredis_1.default(url);
                this.client.on('error', (err) => this.logger.error('Redis error', err));
                this.logger.log('Redis client initialized in onModuleInit');
            }
        }
        catch (err) {
            this.logger.error('Failed to initialize redis client in onModuleInit', err);
        }
    }
    getClient() {
        if (!this.client) {
            const url = process.env.REDIS_URL || 'redis://localhost:6379';
            this.logger.warn('Redis client lazily initialized from getClient()');
            this.client = new ioredis_1.default(url);
            this.client.on('error', (err) => this.logger.error('Redis error', err));
        }
        return this.client;
    }
    async onModuleDestroy() {
        try {
            if (this.client)
                await this.client.quit();
        }
        catch (err) {
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = RedisService_1 = __decorate([
    (0, common_1.Injectable)()
], RedisService);
//# sourceMappingURL=redis.service.js.map