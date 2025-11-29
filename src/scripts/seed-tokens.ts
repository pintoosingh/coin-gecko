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
    // Fetch ALL coins from CoinGecko using /coins/list endpoint
    // This endpoint returns all coins in a single response (no pagination needed)
    console.log('Fetching all coins from CoinGecko /coins/list endpoint...');
    const maxCoins = process.env.MAX_COINS ? Number(process.env.MAX_COINS) : null; // Optional limit (no limit by default)
    
    if (maxCoins) {
      console.log(`MAX_COINS limit set: ${maxCoins} coins`);
    }
    
    try {
      // Use coinsList() which calls /coins/list endpoint - returns ALL coins
      const allCoins = await cg.coinsList();
      console.log(`Fetched ${allCoins.length} coins from CoinGecko /coins/list endpoint`);
      
      // Extract coin IDs
      coinIds = allCoins
        .map((coin: any) => coin.id)
        .filter((id: string) => id && id.trim() !== '');
      
      // Apply MAX_COINS limit if set
      if (maxCoins && coinIds.length > maxCoins) {
        coinIds = coinIds.slice(0, maxCoins);
        console.log(`Limited to ${maxCoins} coins (MAX_COINS limit)`);
      }
      
      console.log(`Total coins to seed: ${coinIds.length}`);
    } catch (err) {
      console.error('Failed to fetch coins list:', (err as any).message);
      console.error('Falling back to markets endpoint...');
      
      // Fallback to markets endpoint if /coins/list fails
      const maxPages = Number(process.env.COINGECKO_MAX_PAGES || 5);
      const perPage = Number(process.env.PER_PAGE || 250);
      const allCoinIds = new Set<string>();
      
      for (let page = 1; page <= maxPages; page++) {
        try {
          const markets = await cg.coinsMarkets(page);
          if (!markets || markets.length === 0) break;
          
          for (const market of markets) {
            if (market.id) {
              if (!maxCoins || allCoinIds.size < maxCoins) {
                allCoinIds.add(market.id);
              }
              if (maxCoins && allCoinIds.size >= maxCoins) break;
            }
          }
          
          if (maxCoins && allCoinIds.size >= maxCoins) break;
          if (markets.length < perPage) break;
          
          await new Promise((res) => setTimeout(res, 200));
        } catch (err2) {
          console.error(`Failed to fetch page ${page}:`, (err2 as any).message);
          break;
        }
      }
      
      coinIds = Array.from(allCoinIds);
      console.log(`Total coins to seed (fallback): ${coinIds.length}`);
    }
  }
  
  // Process each coin
  let seeded = 0;
  let failed = 0;
  const delayBetweenRequests = Number(process.env.SEED_DELAY_MS || 2000); // Default 2 seconds between requests
  
  for (let i = 0; i < coinIds.length; i++) {
    const id = coinIds[i];
    let retries = 0;
    const maxRetries = 5;
    let success = false;
    
    while (retries < maxRetries && !success) {
      try {
        const details = await cg.coinDetails(id);
        
        // Validate we got valid data
        if (!details || !details.id) {
          throw new Error(`Invalid response for ${id}: missing data`);
        }
        
        const symbol = (details.symbol || '').toUpperCase();
        
        if (!symbol) {
          console.warn(`Skipping ${id}: no symbol found`);
          failed++;
          success = true; // Mark as processed (even though failed) to continue
          break;
        }
        
        // Process contract_addresses: store as JSON object with network as key
        // Handle both contract_addresses (custom format) and platforms (standard CoinGecko format)
        // Networks (like Solana) will have empty contract_addresses, tokens will have addresses per network
        let contractAddresses: Record<string, string> | null = null;
        let smartContractAddress: string | null = null;
        
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
        
        // Extract smart_contract_address: prioritize Ethereum, then first available platform
        if (contractAddresses) {
          // First try Ethereum (most common)
          if (contractAddresses.ethereum) {
            smartContractAddress = contractAddresses.ethereum;
          }
          // Then try other common networks
          else if (contractAddresses['ethereum-classic']) {
            smartContractAddress = contractAddresses['ethereum-classic'];
          }
          else if (contractAddresses.binance) {
            smartContractAddress = contractAddresses.binance;
          }
          else if (contractAddresses.polygon) {
            smartContractAddress = contractAddresses.polygon;
          }
          else if (contractAddresses.avalanche) {
            smartContractAddress = contractAddresses.avalanche;
          }
          // Fallback to first available platform
          else {
            const firstPlatform = Object.keys(contractAddresses)[0];
            if (firstPlatform) {
              smartContractAddress = contractAddresses[firstPlatform];
            }
          }
        }
        // Also check platforms directly (in case contractAddresses wasn't populated)
        else if (details.platforms && typeof details.platforms === 'object') {
          // Prioritize Ethereum
          if (details.platforms.ethereum) {
            smartContractAddress = details.platforms.ethereum;
          }
          // Fallback to first available platform
          else {
            const platforms = Object.entries(details.platforms);
            for (const [network, address] of platforms) {
              if (address && typeof address === 'string' && address.trim() !== '') {
                smartContractAddress = address;
                break;
              }
            }
          }
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
          smart_contract_address: smartContractAddress,
          contract_address: contractAddresses,
          categories: categories
        };
        await repo.upsert(meta as any, ['coingecko_id']); // Use coingecko_id as unique identifier
        seeded++;
        console.log(`[${i + 1}/${coinIds.length}] Seeded ${symbol} (${id})`);
        success = true;
        
        // Progress logging every 10 coins
        if ((i + 1) % 10 === 0 || i + 1 === coinIds.length) {
          console.log(`Progress: ${i + 1}/${coinIds.length} processed (${seeded} seeded, ${failed} failed)`);
        }
        
        break; // Success, exit retry loop
      } catch (err: any) {
        retries++;
        const isRateLimit = err?.response?.status === 429;
        const retryAfter = err?.response?.headers?.['retry-after'];
        
        if (isRateLimit && retryAfter) {
          const waitTime = Number(retryAfter) * 1000;
          console.warn(`Rate limit hit for ${id}. Waiting ${waitTime}ms (Retry-After: ${retryAfter}s)`);
          await new Promise((res) => setTimeout(res, waitTime));
          // Don't increment retries for rate limits - we'll retry after waiting
          retries--;
        } else if (retries >= maxRetries) {
          console.error(`Failed to seed ${id} after ${maxRetries} attempts:`, err?.message || err);
          failed++;
          success = true; // Mark as processed (even though failed) to continue
        } else {
          // For other errors, wait with exponential backoff
          const waitTime = Math.min(1000 * Math.pow(2, retries - 1), 30000); // Max 30 seconds
          console.warn(`Error seeding ${id} (attempt ${retries}/${maxRetries}): ${err?.message || err}. Retrying in ${waitTime}ms...`);
          await new Promise((res) => setTimeout(res, waitTime));
        }
      }
    }
    
    // Delay between requests to avoid rate limits (only if not the last item)
    if (i < coinIds.length - 1) {
      await new Promise((res) => setTimeout(res, delayBetweenRequests));
    }
  }
  
  console.log(`\nSeed completed: ${seeded} tokens seeded, ${failed} failed`);

  await ds.destroy();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
