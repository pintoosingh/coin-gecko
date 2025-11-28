/**
 * Example seed script to populate static token metadata from Coingecko.
 * Usage: npm run seed
 * NOTE: This script assumes TypeORM is configured and DB is reachable.
 * example one-time seed
 */
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { Token } from '../entities/token.entity';
import { CoingeckoService } from '../prices/coingecko.service';
import * as process from 'process';

// Load environment variables from .env file
config();

/**
 * Main function to seed static token metadata into database
 * Fetches token details from CoinGecko and stores in tokens table
 * Processes tokens specified in SEED_IDS environment variable or defaults
 */
async function main() {
  // Validate DATABASE_URL is set
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL environment variable is not set!');
    console.error('Please create a .env file with: DATABASE_URL=postgresql://user:password@localhost:5432/pricesdb');
    process.exit(1);
  }

  // Ensure DATABASE_URL is a string and validate format
  const dbUrl = String(process.env.DATABASE_URL).trim();
  
  if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
    console.error('ERROR: DATABASE_URL must start with postgresql:// or postgres://');
    console.error('Format: postgresql://user:password@host:port/database');
    process.exit(1);
  }
  
  // Check if password is present (basic regex check)
  const passwordMatch = dbUrl.match(/:\/\/[^:]+:([^@]+)@/);
  if (!passwordMatch || !passwordMatch[1] || passwordMatch[1].trim() === '') {
    console.error('ERROR: DATABASE_URL must include a password!');
    console.error('Format: postgresql://user:password@host:port/database');
    console.error('Current URL (password hidden):', dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@'));
    process.exit(1);
  }
  
  console.log('Connecting to database...');
  console.log('Database URL (password hidden):', dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@'));

  const ds = new DataSource({
    type: 'postgres',
    url: dbUrl,
    entities: [Token],
    synchronize: false,
  });
  
  try {
    await ds.initialize();
    console.log('Database connection established');
  } catch (err) {
    console.error('Failed to connect to database:', (err as any).message);
    console.error('Please check your DATABASE_URL and ensure PostgreSQL is running');
    process.exit(1);
  }
  const repo = ds.getRepository(Token);
  const cg = new CoingeckoService();

  // Check command line arguments
  const seedSpecific = process.argv.includes('--specific');
  
  // Check if specific IDs are provided
  const seedIdsRaw = process.env.SEED_IDS;
  const seedIds = seedIdsRaw ? seedIdsRaw.split(',').map(id => id.trim()).filter(id => id.length > 0) : null;
  
  let coinIds: string[] = [];
  
  // Default behavior: seed ALL coins
  // Only seed specific coins if --specific flag is used AND SEED_IDS is set
  const useSpecificIds = seedSpecific && seedIds && seedIds.length > 0;
  
  if (useSpecificIds) {
    // Use specific IDs if --specific flag is used
    coinIds = seedIds;
    console.log(`Seeding ${coinIds.length} specific tokens: ${coinIds.join(', ')}`);
  } else {
    // Fetch all coins from CoinGecko markets
    console.log('Fetching all coins from CoinGecko markets...');
    const maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);
    const perPage = Number(process.env.PER_PAGE || 250);
    
    const allCoinIds = new Set<string>();
    
    for (let page = 1; page <= maxPages; page++) {
      try {
        const markets = await cg.coinsMarkets(page);
        if (!markets || markets.length === 0) break;
        
        // Extract coin IDs from market data
        for (const market of markets) {
          if (market.id) {
            allCoinIds.add(market.id);
          }
        }
        
        console.log(`Fetched page ${page}: ${markets.length} coins (total unique: ${allCoinIds.size})`);
        
        // Gentle pause to avoid rate limits
        await new Promise((res) => setTimeout(res, 200));
        
        // If we got less than perPage items, we've reached the end
        if (markets.length < perPage) break;
      } catch (err) {
        console.error(`Failed to fetch page ${page}:`, (err as any).message);
        break;
      }
    }
    
    coinIds = Array.from(allCoinIds);
    console.log(`Total coins to seed: ${coinIds.length}`);
  }
  
  // Process each coin
  let seeded = 0;
  let failed = 0;
  
  for (let i = 0; i < coinIds.length; i++) {
    const id = coinIds[i];
    try {
      const details = await cg.coinDetails(id);
      const symbol = (details.symbol || '').toUpperCase();
      
      // Process contract_addresses: store as JSON object with network as key
      // Handle both contract_addresses (custom format) and platforms (standard CoinGecko format)
      // Networks (like Solana) will have empty contract_addresses, tokens will have addresses per network
      let contractAddresses: Record<string, string> | null = null;
      
      // Try contract_addresses first (if provided in custom format)
      if (details.contract_addresses) {
        const filtered: Record<string, string> = {};
        for (const [network, address] of Object.entries(details.contract_addresses)) {
          if (address && typeof address === 'string' && address.trim() !== '') {
            filtered[network] = address;
          }
        }
        contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
      }
      // Fallback to platforms (standard CoinGecko API format)
      else if (details.platforms && typeof details.platforms === 'object') {
        const filtered: Record<string, string> = {};
        for (const [network, address] of Object.entries(details.platforms)) {
          if (address && typeof address === 'string' && address.trim() !== '') {
            filtered[network] = address;
          }
        }
        contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
      }
      
      // Process categories: store as JSON array
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
      await repo.upsert(meta as any, ['coingecko_id']); // Use coingecko_id as unique identifier
      seeded++;
      console.log('seeded', symbol);
      
      // Progress logging every 10 coins
      if ((i + 1) % 10 === 0 || i + 1 === coinIds.length) {
        console.log(`Progress: ${i + 1}/${coinIds.length} processed (${seeded} seeded, ${failed} failed)`);
      }
      
      // Gentle pause to avoid rate limits
      await new Promise((res) => setTimeout(res, 100));
    } catch (err) {
      console.error('seed failed for', id, (err as any).message);
      failed++;
      
      // On error, wait a bit longer before continuing
      await new Promise((res) => setTimeout(res, 500));
    }
  }
  
  console.log(`\nSeed completed: ${seeded} tokens seeded, ${failed} failed`);

  await ds.destroy();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
