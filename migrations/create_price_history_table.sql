-- Migration: Create price_history table
-- Run this SQL script in your PostgreSQL database to create the price_history table

CREATE TABLE IF NOT EXISTS price_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(50) NOT NULL,
  coingecko_id VARCHAR(200),
  name VARCHAR(200),
  image TEXT,
  current_price DECIMAL(20,8),
  market_cap DECIMAL(30,2),
  market_cap_rank INTEGER,
  fully_diluted_valuation DECIMAL(30,2),
  total_volume DECIMAL(30,2),
  high_24h DECIMAL(20,8),
  low_24h DECIMAL(20,8),
  price_change_24h DECIMAL(20,8),
  price_change_percentage_24h DECIMAL(10,4),
  market_cap_change_24h DECIMAL(30,2),
  market_cap_change_percentage_24h DECIMAL(10,4),
  circulating_supply DECIMAL(30,2),
  total_supply DECIMAL(30,2),
  max_supply DECIMAL(30,2),
  ath DECIMAL(20,8),
  ath_change_percentage DECIMAL(10,4),
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT unique_symbol_date UNIQUE (symbol, snapshot_date)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_price_history_symbol ON price_history(symbol);
CREATE INDEX IF NOT EXISTS idx_price_history_date ON price_history(snapshot_date);
CREATE INDEX IF NOT EXISTS idx_price_history_symbol_date ON price_history(symbol, snapshot_date);

