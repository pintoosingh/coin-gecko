"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = require("dotenv");
const typeorm_1 = require("typeorm");
const token_entity_1 = require("../entities/token.entity");
const coingecko_service_1 = require("../prices/coingecko.service");
const process = require("process");
(0, dotenv_1.config)();
async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('ERROR: DATABASE_URL environment variable is not set!');
        console.error('Please create a .env file with: DATABASE_URL=postgresql://user:password@localhost:5432/pricesdb');
        process.exit(1);
    }
    const dbUrl = String(process.env.DATABASE_URL).trim();
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
        console.error('ERROR: DATABASE_URL must start with postgresql:// or postgres://');
        console.error('Format: postgresql://user:password@host:port/database');
        process.exit(1);
    }
    const passwordMatch = dbUrl.match(/:\/\/[^:]+:([^@]+)@/);
    if (!passwordMatch || !passwordMatch[1] || passwordMatch[1].trim() === '') {
        console.error('ERROR: DATABASE_URL must include a password!');
        console.error('Format: postgresql://user:password@host:port/database');
        console.error('Current URL (password hidden):', dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@'));
        process.exit(1);
    }
    console.log('Connecting to database...');
    console.log('Database URL (password hidden):', dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@'));
    const ds = new typeorm_1.DataSource({
        type: 'postgres',
        url: dbUrl,
        entities: [token_entity_1.Token],
        synchronize: false,
    });
    try {
        await ds.initialize();
        console.log('Database connection established');
    }
    catch (err) {
        console.error('Failed to connect to database:', err.message);
        console.error('Please check your DATABASE_URL and ensure PostgreSQL is running');
        process.exit(1);
    }
    const repo = ds.getRepository(token_entity_1.Token);
    const cg = new coingecko_service_1.CoingeckoService();
    const ids = (process.env.SEED_IDS && process.env.SEED_IDS.split(',')) || ['bitcoin', 'ethereum', 'solana'];
    for (const id of ids) {
        try {
            const details = await cg.coinDetails(id);
            const symbol = (details.symbol || '').toUpperCase();
            let contractAddresses = null;
            if (details.contract_addresses) {
                const filtered = {};
                for (const [network, address] of Object.entries(details.contract_addresses)) {
                    if (address && typeof address === 'string' && address.trim() !== '') {
                        filtered[network] = address;
                    }
                }
                contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
            }
            else if (details.platforms && typeof details.platforms === 'object') {
                const filtered = {};
                for (const [network, address] of Object.entries(details.platforms)) {
                    if (address && typeof address === 'string' && address.trim() !== '') {
                        filtered[network] = address;
                    }
                }
                contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
            }
            const categories = details.categories && Array.isArray(details.categories) && details.categories.length > 0
                ? details.categories
                : null;
            const meta = {
                symbol,
                coingecko_id: id,
                name: details.name,
                logo: details.image?.thumb || details.image?.small || null,
                image_url: details.image?.large || null,
                social_links: {
                    twitter: details.links?.twitter_screen_name ? `https://twitter.com/${details.links.twitter_screen_name}` : null,
                    homepage: details.links?.homepage?.[0] || null
                },
                about: details.description?.en || null,
                category: details.categories && details.categories.length ? details.categories.join(',') : null,
                smart_contract_address: (details.platforms && details.platforms.ethereum) ? details.platforms.ethereum : null,
                contract_address: contractAddresses,
                categories: categories
            };
            await repo.upsert(meta, ['symbol']);
            console.log('seeded', symbol);
        }
        catch (err) {
            console.error('seed failed for', id, err.message);
        }
    }
    await ds.destroy();
    process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
//# sourceMappingURL=seed-tokens.js.map