import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn } from 'typeorm';

/**
 * Daily price history table for storing live price data snapshots
 * Stores all required live data fields as per manager requirements
 */
@Entity({ name: 'price_history', schema: 'public' })
export class PriceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 50 })
  symbol: string;

  @Index()
  @Column({ type: 'varchar', length: 200, nullable: true })
  coingecko_id: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  image: string;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  current_price: number;

  @Column({ type: 'decimal', precision: 30, scale: 2, nullable: true })
  market_cap: number;

  @Column({ type: 'integer', nullable: true })
  market_cap_rank: number;

  @Column({ type: 'decimal', precision: 30, scale: 2, nullable: true })
  fully_diluted_valuation: number;

  @Column({ type: 'decimal', precision: 30, scale: 2, nullable: true })
  total_volume: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  high_24h: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  low_24h: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  price_change_24h: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  price_change_percentage_24h: number;

  @Column({ type: 'decimal', precision: 30, scale: 2, nullable: true })
  market_cap_change_24h: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  market_cap_change_percentage_24h: number;

  @Column({ type: 'decimal', precision: 30, scale: 2, nullable: true })
  circulating_supply: number;

  @Column({ type: 'decimal', precision: 30, scale: 2, nullable: true })
  total_supply: number;

  @Column({ type: 'decimal', precision: 30, scale: 2, nullable: true })
  max_supply: number;

  @Column({ type: 'decimal', precision: 20, scale: 8, nullable: true })
  ath: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  ath_change_percentage: number;

  @Index()
  @Column({ type: 'date' })
  snapshot_date: Date;

  @CreateDateColumn()
  created_at: Date;
}

