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
      // Use coinsList() with include_platform=true to get ALL coins with contract addresses
      // This endpoint returns all coins in a single response (no pagination needed)
      // Response includes: id, symbol, name, platforms (contract addresses)
      
      // Add a small delay before making the request to avoid hitting rate limits
      console.log('Waiting 5 seconds before making API request to avoid rate limits...');
      await new Promise((res) => setTimeout(res, 5000));
      
      const allCoins = await cg.coinsList(true); // include_platform=true to get contract addresses
      
      // Verify response
      if (!Array.isArray(allCoins)) {
        throw new Error(`Invalid response format: expected array, got ${typeof allCoins}`);
      }
      
      console.log(`Fetched ${allCoins.length} coins from CoinGecko /coins/list endpoint (with platforms)`);
      
      // Apply MAX_COINS limit if set
      let coinsToProcess = allCoins;
      if (maxCoins && allCoins.length > maxCoins) {
        coinsToProcess = allCoins.slice(0, maxCoins);
        console.log(`Limited to ${maxCoins} coins (MAX_COINS limit)`);
      }
      
      console.log(`Total coins to seed: ${coinsToProcess.length}`);
      
      // Process ALL coins directly from /coins/list response (single API call!)
      // No need to call coinDetails() for each token - we have all the data we need
      let seeded = 0;
      let failed = 0;
      
      console.log('Processing coins directly from /coins/list response...');
      
      for (let i = 0; i < coinsToProcess.length; i++) {
        const coin = coinsToProcess[i];
        
        try {
          if (!coin.id || !coin.symbol) {
            console.warn(`Skipping invalid coin at index ${i}`);
            failed++;
            continue;
          }
          
          const symbol = (coin.symbol || '').toUpperCase();
          const coinId = coin.id;
          
          // Extract contract addresses from platforms
          let contractAddresses: Record<string, string> | null = null;
          let smartContractAddress: string | null = null;
          
          if (coin.platforms && typeof coin.platforms === 'object') {
            const filtered: Record<string, string> = {};
            for (const [network, address] of Object.entries(coin.platforms)) {
              const addressStr = typeof address === 'string' ? address : String(address);
              if (addressStr && addressStr.trim() !== '' && addressStr !== 'null' && addressStr !== 'undefined') {
                filtered[network] = addressStr;
              }
            }
            contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
            
            // Extract smart_contract_address: prioritize common networks, then any available
            // Only check if contractAddresses is not null
            if (contractAddresses) {
              if (contractAddresses.ethereum) {
                smartContractAddress = contractAddresses.ethereum;
              } else if (contractAddresses['ethereum-classic']) {
                smartContractAddress = contractAddresses['ethereum-classic'];
              } else if (contractAddresses.binance || contractAddresses['binance-smart-chain']) {
                smartContractAddress = contractAddresses.binance || contractAddresses['binance-smart-chain'];
              } else if (contractAddresses.polygon || contractAddresses['polygon-pos']) {
                smartContractAddress = contractAddresses.polygon || contractAddresses['polygon-pos'];
              } else if (contractAddresses.avalanche) {
                smartContractAddress = contractAddresses.avalanche;
              } else if (contractAddresses.core || contractAddresses['core-dao']) {
                smartContractAddress = contractAddresses.core || contractAddresses['core-dao'];
              } else {
                // Fallback: use first available platform (any network)
                const firstPlatform = Object.keys(contractAddresses)[0];
                if (firstPlatform) {
                  smartContractAddress = contractAddresses[firstPlatform];
                }
              }
            }
          }
          
          // Skip coinDetails fallback to avoid rate limits
          // Most tokens should have platforms in /coins/list response
          // Missing contract addresses can be updated later via token metadata processor
          // If you need to fetch coinDetails, set FETCH_MISSING_CONTRACT_ADDRESSES=true in .env
          const fetchMissingAddresses = process.env.FETCH_MISSING_CONTRACT_ADDRESSES === 'true';
          
          if (fetchMissingAddresses && !smartContractAddress && !contractAddresses) {
            // Only fetch coinDetails if explicitly enabled (to avoid rate limits)
            try {
              const details = await cg.coinDetails(coinId);
              
              // Extract platforms from coinDetails
              if (details.platforms && typeof details.platforms === 'object') {
                const filtered: Record<string, string> = {};
                for (const [network, address] of Object.entries(details.platforms)) {
                  const addressStr = typeof address === 'string' ? address : String(address);
                  if (addressStr && addressStr.trim() !== '' && addressStr !== 'null' && addressStr !== 'undefined') {
                    filtered[network] = addressStr;
                  }
                }
                if (Object.keys(filtered).length > 0) {
                  contractAddresses = filtered;
                  
                  // Extract smart contract address
                  if (filtered.ethereum) {
                    smartContractAddress = filtered.ethereum;
                  } else if (filtered['ethereum-classic']) {
                    smartContractAddress = filtered['ethereum-classic'];
                  } else if (filtered.binance || filtered['binance-smart-chain']) {
                    smartContractAddress = filtered.binance || filtered['binance-smart-chain'];
                  } else if (filtered.polygon || filtered['polygon-pos']) {
                    smartContractAddress = filtered.polygon || filtered['polygon-pos'];
                  } else if (filtered.avalanche) {
                    smartContractAddress = filtered.avalanche;
                  } else if (filtered.core || filtered['core-dao']) {
                    smartContractAddress = filtered.core || filtered['core-dao'];
                  } else {
                    const firstPlatform = Object.keys(filtered)[0];
                    if (firstPlatform) {
                      smartContractAddress = filtered[firstPlatform];
                    }
                  }
                }
              }
              
              // Delay to avoid rate limits when fetching coinDetails
              await new Promise((res) => setTimeout(res, 2000)); // 2 seconds delay
            } catch (err: any) {
              // If rate limited, stop fetching coinDetails to avoid blocking the entire seed
              if (err?.response?.status === 429) {
                console.warn(`Rate limit hit while fetching coinDetails. Skipping remaining coinDetails calls.`);
                // Disable further coinDetails calls for this run
                process.env.FETCH_MISSING_CONTRACT_ADDRESSES = 'false';
              }
            }
          }
          
          // Prepare metadata from /coins/list response
          // Note: logo, image_url, description, etc. are not in /coins/list
          // We'll set them to null and they can be updated later via coinDetails if needed
          const meta = {
            symbol,
            coingecko_id: coinId,
            name: coin.name || null,
            logo: null, // Not available in /coins/list
            image_url: null, // Not available in /coins/list
            social_links: {
              twitter: null, // Not available in /coins/list
              homepage: null // Not available in /coins/list
            },
            about: null, // Not available in /coins/list
            category: null, // Not available in /coins/list
            smart_contract_address: smartContractAddress,
            contract_address: contractAddresses,
            categories: null // Not available in /coins/list
          };
          
          await repo.upsert(meta as any, ['coingecko_id']);
          seeded++;
          
          // Progress logging every 1000 coins
          if ((i + 1) % 1000 === 0 || i + 1 === coinsToProcess.length) {
            console.log(`Progress: ${i + 1}/${coinsToProcess.length} processed (${seeded} seeded, ${failed} failed)`);
          }
        } catch (err: any) {
          // Log detailed error information
          const errorMsg = err?.message || String(err);
          const errorCode = err?.code;
          const errorDetail = err?.detail;
          
          console.error(`Failed to seed ${coin.id} (${coin.symbol}): ${errorMsg}`);
          if (errorCode) {
            console.error(`  Error code: ${errorCode}`);
          }
          if (errorDetail) {
            console.error(`  Error detail: ${errorDetail}`);
          }
          
          // If it's a constraint violation, log the conflicting data
          if (errorCode === '23505' || errorMsg.includes('duplicate') || errorMsg.includes('unique')) {
            console.error(`  ⚠️ Duplicate key violation for coingecko_id: ${coin.id}`);
          }
          
          failed++;
        }
      }
      
      console.log(`\nSeed completed: ${seeded} tokens seeded, ${failed} failed`);
      console.log(`Total processed: ${coinsToProcess.length} coins`);
      console.log(`Success rate: ${((seeded / coinsToProcess.length) * 100).toFixed(2)}%`);
      
      if (failed > 0) {
        console.log(`\n⚠️ Warning: ${failed} coins failed to seed. Check error messages above for details.`);
      }
      
      console.log(`\nNote: Basic token data (symbol, name, contract addresses) has been stored.`);
      console.log(`To get additional metadata (logo, description, etc.), run the token metadata processor or update individual tokens.`);
      
      await ds.destroy();
      process.exit(0);
    } catch (err: any) {
      const isRateLimit = err?.response?.status === 429;
      const retryAfter = err?.response?.headers?.['retry-after'];
      
      if (isRateLimit) {
        console.error('\n❌ Rate limit exceeded (429 Too Many Requests)');
        console.error('CoinGecko API rate limit has been reached.');
        if (retryAfter) {
          const waitMinutes = Math.ceil(Number(retryAfter) / 60);
          console.error(`\n⏳ Please wait ${retryAfter} seconds (${waitMinutes} minutes) before trying again.`);
          console.error(`   Or wait a few minutes and run: npm run seed`);
        } else {
          console.error('\n⏳ Please wait 5-10 minutes before trying again.');
          console.error('   CoinGecko free tier allows 5-15 calls per minute.');
        }
        console.error('\n💡 Tips to avoid rate limits:');
        console.error('   1. Wait 5-10 minutes between seed runs');
        console.error('   2. Use a CoinGecko API key for higher limits (30-50 calls/min)');
        console.error('   3. Run seed script during off-peak hours');
        console.error('\n');
        await ds.destroy();
        process.exit(1); // Exit early on rate limit - don't try fallback
      } else {
        console.error('Failed to fetch coins list:', err?.message || err);
        console.error('Falling back to markets endpoint...');
      }
      
      // Fallback to markets endpoint if /coins/list fails (only for non-rate-limit errors)
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
      
      // Fallback: Process coins using coinDetails (slower, but works if /coins/list fails)
      let seeded = 0;
      let failed = 0;
      const delayBetweenRequests = Number(process.env.SEED_DELAY_MS || 2000);
      
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
        // First try to get platforms from /coins/list response (faster, already fetched)
      let contractAddresses: Record<string, string> | null = null;
        let smartContractAddress: string | null = null;
        
        const coinsWithPlatforms = (global as any).__coinsWithPlatforms as Map<string, any> | undefined;
        const coinFromList = coinsWithPlatforms?.get(id);
      
        // Use platforms from /coins/list if available (more efficient)
        if (coinFromList && coinFromList.platforms && typeof coinFromList.platforms === 'object') {
        const filtered: Record<string, string> = {};
          for (const [network, address] of Object.entries(coinFromList.platforms)) {
          if (address && typeof address === 'string' && address.trim() !== '') {
            filtered[network] = address;
          }
        }
        contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
      }
        // Fallback to coinDetails platforms
      else if (details.platforms && typeof details.platforms === 'object') {
        const filtered: Record<string, string> = {};
        for (const [network, address] of Object.entries(details.platforms)) {
          if (address && typeof address === 'string' && address.trim() !== '') {
            filtered[network] = address;
          }
        }
        contractAddresses = Object.keys(filtered).length > 0 ? filtered : null;
      }
        // Also check contract_addresses field (if provided in custom format)
        else if (details.contract_addresses) {
          const filtered: Record<string, string> = {};
          for (const [network, address] of Object.entries(details.contract_addresses)) {
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
          else if (contractAddresses.binance || contractAddresses['binance-smart-chain']) {
            smartContractAddress = contractAddresses.binance || contractAddresses['binance-smart-chain'];
          }
          else if (contractAddresses.polygon || contractAddresses['polygon-pos']) {
            smartContractAddress = contractAddresses.polygon || contractAddresses['polygon-pos'];
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
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
