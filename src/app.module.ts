import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { PricesModule } from './prices/prices.module';
import { CommonModule } from './common/common.module';
import { Token } from './entities/token.entity';
import { PriceHistory } from './entities/price-history.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    CommonModule,
    BullModule.forRootAsync({
      useFactory: () => {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        if (redisUrl.startsWith('redis://')) {
          try {
            const url = new URL(redisUrl);
            return {
              connection: {
                host: url.hostname || 'localhost',
                port: parseInt(url.port || '6379', 10),
                password: url.password || undefined,
                db: 0,
              },
            };
          } catch (err) {
            return {
              connection: {
                host: 'localhost',
                port: 6379,
              },
            };
          }
        }
        return {
          connection: {
            host: 'localhost',
            port: 6379,
          },
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => {
        const config: any = {
          type: 'postgres',
          url: process.env.DATABASE_URL,
          autoLoadEntities: true,
          synchronize: true, // TODO: Set to false in production - use migrations instead
          logging: ['error', 'warn'], // Enable logging to debug connection issues
        };
        
        // Set search_path to ensure public schema is used
        if (process.env.DATABASE_URL) {
          // If using connection URL, add search_path via extra
          config.extra = {
            options: '-c search_path=public',
          };
        } else {
          config.schema = 'public';
        }
        
        return config;
      },
    }),
    TypeOrmModule.forFeature([Token, PriceHistory]),
    PricesModule,
  ],
})
export class AppModule {}

