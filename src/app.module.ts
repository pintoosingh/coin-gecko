import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PricesModule } from './prices/prices.module';
import { CommonModule } from './common/common.module';
import { Token } from './entities/token.entity';
import { PriceHistory } from './entities/price-history.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    CommonModule, // << add this
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

