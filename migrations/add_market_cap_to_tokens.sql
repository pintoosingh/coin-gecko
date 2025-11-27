-- Migration: Add market_cap column to tokens table
-- This column stores static market cap data that gets refreshed every 24 hours

ALTER TABLE tokens
ADD COLUMN IF NOT EXISTS market_cap DECIMAL(30, 2) NULL;

-- Add comment to document the column purpose
COMMENT ON COLUMN tokens.market_cap IS 'Market capitalization (static data, refreshed every 24 hours)';

