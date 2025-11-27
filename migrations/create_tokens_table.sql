-- Create tokens table for static token metadata
CREATE TABLE IF NOT EXISTS tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(50) NOT NULL UNIQUE,
    coingecko_id VARCHAR(200),
    name VARCHAR(200),
    logo TEXT,
    image_url TEXT,
    social_links JSONB,
    about TEXT,
    category VARCHAR(200),
    smart_contract_address VARCHAR(255),
    contract_address JSONB,
    categories JSONB,
    market_cap DECIMAL(30, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_tokens_coingecko_id ON tokens(coingecko_id);

-- Add comment
COMMENT ON TABLE tokens IS 'Static token metadata (logo, social links, categories, contract_address). Live price data is NOT stored here.';

