import { Entity, PrimaryGeneratedColumn, Column, Index, CreateDateColumn, UpdateDateColumn } from 'typeorm';
//static metadata
@Entity({ name: 'tokens' })
export class Token {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  symbol: string;

  @Index()
  @Column({ type: 'varchar', length: 200, nullable: true })
  coingecko_id: string;

  @Column({ type: 'text', nullable: true })
  name: string;

  @Column({ type: 'text', nullable: true })
  logo: string;

  @Column({ type: 'text', nullable: true })
  image_url: string;

  @Column({ type: 'jsonb', nullable: true })
  social_links: Record<string, string>;

  @Column({ type: 'text', nullable: true })
  about: string;

  @Column({ type: 'text', nullable: true })
  category: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  smart_contract_address: string;

  @Column({ type: 'jsonb', nullable: true })
  contract_address: Record<string, string>;

  @Column({ type: 'jsonb', nullable: true })
  categories: string[];

  @Column({ type: 'decimal', precision: 30, scale: 2, nullable: true })
  market_cap: number;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
