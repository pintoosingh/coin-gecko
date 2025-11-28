-- Update tokens table to use coingecko_id as unique identifier instead of symbol
-- This allows multiple tokens with the same symbol (e.g., USDT on different chains)

-- First, remove the unique constraint from symbol
ALTER TABLE tokens DROP CONSTRAINT IF EXISTS tokens_symbol_key;
DROP INDEX IF EXISTS idx_tokens_symbol;

-- Make coingecko_id NOT NULL (if there are any nulls, update them first)
-- Update any existing NULL coingecko_id values (shouldn't happen, but just in case)
UPDATE tokens SET coingecko_id = symbol WHERE coingecko_id IS NULL;

-- Make coingecko_id NOT NULL
ALTER TABLE tokens ALTER COLUMN coingecko_id SET NOT NULL;

-- Remove unique constraint from symbol index (create non-unique index)
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);

-- Add unique constraint to coingecko_id
ALTER TABLE tokens ADD CONSTRAINT tokens_coingecko_id_unique UNIQUE (coingecko_id);
DROP INDEX IF EXISTS idx_tokens_coingecko_id;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tokens_coingecko_id ON tokens(coingecko_id);

-- Add comment
COMMENT ON COLUMN tokens.coingecko_id IS 'CoinGecko coin ID (unique identifier for each token)';
COMMENT ON COLUMN tokens.symbol IS 'Token symbol (may not be unique as multiple tokens can share the same symbol)';

