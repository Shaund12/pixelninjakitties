import { ethers } from 'ethers';

// Setup constants - hardcoded for serverless environment
const RPC_URL = 'https://rpc.vitruveo.xyz';
const CONTRACT_ADDRESS = '0x2D732b0Bb33566A13E586aE83fB21d2feE34e906';
const MARKETPLACE_ADDRESS = '0x5031fc07293d574Ccbd4d12b0E7106A95502a299';
const USDC_ADDRESS = '0xbCfB3FCa16b12C7756CD6C24f1cC0AC0E38569CF';

// Provider and contract setup
const provider = new ethers.JsonRpcProvider(RPC_URL);

// NFT contract setup
const nftAbi = [
    'function tokenURI(uint256) view returns (string)',
    'function ownerOf(uint256) view returns (address)'
];
const nft = new ethers.Contract(CONTRACT_ADDRESS, nftAbi, provider);

// Marketplace contract setup
const marketplaceAbi = [
    'function getListings() view returns (tuple(uint256 tokenId, address seller, uint256 price, address currency, bool active)[])',
    'function getListing(uint256 tokenId) view returns (tuple(uint256 tokenId, address seller, uint256 price, address currency, bool active))'
];

// METADATA CACHE
const metadataCache = {};

// Get VTRU/USDC price function
async function getVtruUsdcPrice() {
    try {
        // Contract addresses
        const LP_ADDRESS = '0x8B3808260a058ECfFA9b1d0eaA988A1b4167DDba';

        // Simplified LP ABI just for querying reserves
        const LP_ABI = [
            'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
        ];

        // Create contract instance
        const lpContract = new ethers.Contract(LP_ADDRESS, LP_ABI, provider);

        // Get reserves
        const reserves = await lpContract.getReserves();

        // Assuming reserve0 is VTRU and reserve1 is USDC
        const vtruReserve = parseFloat(ethers.formatEther(reserves[0]));
        const usdcReserve = parseFloat(ethers.formatUnits(reserves[1], 6)); // USDC has 6 decimals

        // Calculate price (USDC per VTRU)
        const vtruPriceInUsdc = usdcReserve / vtruReserve;

        console.log(`VTRU/USDC Price: 1 VTRU = ${vtruPriceInUsdc.toFixed(6)} USDC`);
        return vtruPriceInUsdc;
    } catch (error) {
        console.error('Error fetching VTRU/USDC price:', error);
        // Fallback price if we can't get the actual price
        return 0.1; // Assume 1 VTRU = 0.1 USDC as fallback
    }
}

// Helper function to determine rarity based on metadata or token ID as fallback
function getRarity(id, metadata) {
    // If we have metadata with ninja_data containing rarity info, use that
    if (metadata && metadata.ninja_data && metadata.ninja_data.rarity && metadata.ninja_data.rarity.tier) {
        const metadataRarity = metadata.ninja_data.rarity.tier.toLowerCase();
        console.log(`Token ${id} rarity from metadata: ${metadataRarity}`);
        return metadataRarity;
    }

    // Fallback to the previous ID-based calculation for backward compatibility
    const numId = parseInt(id, 10);
    let calculatedRarity;
    if (numId % 100 === 0) calculatedRarity = 'legendary';
    else if (numId % 10 === 0) calculatedRarity = 'epic';
    else if (numId % 2 === 0) calculatedRarity = 'rare';
    else calculatedRarity = 'common';

    console.log(`Token ${id} rarity from ID calculation: ${calculatedRarity} (${numId} % 2 = ${numId % 2})`);
    return calculatedRarity;
}

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const tokenId = req.query.tokenId;

    if (!tokenId) {
        return res.status(400).json({ error: 'Token ID is required' });
    }

    const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, marketplaceAbi, provider);

    try {
        // Get VTRU/USDC price for conversion
        const vtruPriceInUsdc = await getVtruUsdcPrice();

        // Get the token's metadata and rarity
        let metadata;
        if (metadataCache[tokenId]) {
            metadata = metadataCache[tokenId];
        } else {
            try {
                const uri = await nft.tokenURI(tokenId);
                const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
                metadata = await response.json();
                metadataCache[tokenId] = metadata;
            } catch (error) {
                console.error(`Error fetching metadata for token ${tokenId}:`, error);
                // Continue with null metadata
                metadata = null;
            }
        }

        const rarity = getRarity(tokenId, metadata);

        // Get all active listings with timeout
        let listings;
        try {
            listings = await marketplace.getListings();
        } catch (error) {
            console.error('Error fetching listings:', error);
            // Return fallback data if blockchain call fails
            return res.json({
                rarity: rarity,
                floorPrice: 0,
                avgPrice: 0,
                lastSold: 0,
                matchingListings: 0,
                traitMatches: 0,
                suggestedPrice: 0,
                breed: metadata?.attributes?.find(attr => attr.trait_type === 'Breed')?.value || null,
                error: 'Unable to fetch marketplace data'
            });
        }

        const activeListings = listings.filter(listing => listing.active);

        // Enhance listings with metadata for filtering
        const enhancedListings = [];
        for (const listing of activeListings) {
            try {
                let listingMetadata;
                if (metadataCache[listing.tokenId]) {
                    listingMetadata = metadataCache[listing.tokenId];
                } else {
                    const uri = await nft.tokenURI(listing.tokenId);
                    const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
                    listingMetadata = await response.json();
                    metadataCache[listing.tokenId] = listingMetadata;
                }

                const listingRarity = getRarity(listing.tokenId, listingMetadata);
                const priceInEth = listing.currency === ethers.ZeroAddress ?
                    parseFloat(ethers.formatEther(listing.price)) :
                    parseFloat(ethers.formatUnits(listing.price, 6)); // USDC has 6 decimals

                // Convert to USDC for consistent comparison
                const priceInUsdc = listing.currency === ethers.ZeroAddress ?
                    priceInEth * vtruPriceInUsdc : // VTRU to USDC
                    priceInEth; // Already in USDC

                enhancedListings.push({
                    ...listing,
                    metadata: listingMetadata,
                    rarity: listingRarity,
                    priceInEth: priceInEth,
                    priceInUsdc: priceInUsdc
                });
            } catch (error) {
                console.error(`Error processing listing #${listing.tokenId}:`, error);
                // Include listing without metadata if fetch fails
                const fallbackRarity = getRarity(listing.tokenId, null);
                const priceInEth = listing.currency === ethers.ZeroAddress ?
                    parseFloat(ethers.formatEther(listing.price)) :
                    parseFloat(ethers.formatUnits(listing.price, 6));

                // Convert to USDC for consistent comparison
                const priceInUsdc = listing.currency === ethers.ZeroAddress ?
                    priceInEth * vtruPriceInUsdc : // VTRU to USDC
                    priceInEth; // Already in USDC

                enhancedListings.push({
                    ...listing,
                    metadata: null,
                    rarity: fallbackRarity,
                    priceInEth: priceInEth,
                    priceInUsdc: priceInUsdc
                });
            }
        }

        // Filter listings by same rarity
        const sameRarityListings = enhancedListings.filter(listing =>
            listing.rarity === rarity
        );

        console.log(`Token ${tokenId} rarity: ${rarity}`);
        console.log(`Total enhanced listings: ${enhancedListings.length}`);
        console.log(`Same rarity listings: ${sameRarityListings.length}`);
        console.log('Rarity distribution:', enhancedListings.reduce((acc, l) => {
            acc[l.rarity] = (acc[l.rarity] || 0) + 1;
            return acc;
        }, {}));

        // DEBUG: Show detailed listing information for debugging
        console.log('Enhanced listings details:');
        enhancedListings.forEach((listing, index) => {
            console.log(`  Listing ${index + 1}:`);
            console.log(`    Token ID: ${listing.tokenId}`);
            console.log(`    Rarity: ${listing.rarity}`);
            console.log(`    Price (ETH): ${listing.priceInEth}`);
            console.log(`    Price (USDC): ${listing.priceInUsdc}`);
            console.log(`    Active: ${listing.active}`);
            console.log(`    Currency: ${listing.currency}`);
            console.log(`    Metadata loaded: ${!!listing.metadata}`);
            if (listing.metadata && listing.metadata.attributes) {
                const breed = listing.metadata.attributes.find(attr => attr.trait_type === 'Breed')?.value;
                console.log(`    Breed: ${breed}`);
            }
        });

        // Calculate floor price (lowest price in USDC)
        const floorPrice = sameRarityListings.length > 0 ?
            Math.min(...sameRarityListings.map(l => l.priceInUsdc)) : 0;

        // Calculate average price (in USDC)
        const avgPrice = sameRarityListings.length > 0 ?
            sameRarityListings.reduce((sum, l) => sum + l.priceInUsdc, 0) / sameRarityListings.length : 0;

        // Get trait-based matches if breed exists
        let traitMatches = [];
        if (metadata && metadata.attributes) {
            const breed = metadata.attributes.find(attr => attr.trait_type === 'Breed')?.value;
            if (breed) {
                traitMatches = enhancedListings.filter(listing => {
                    const listingBreed = listing.metadata?.attributes?.find(attr => attr.trait_type === 'Breed')?.value;
                    return listingBreed === breed;
                });
            }
        }

        // Calculate suggested price (floor + 10% or average, whichever is higher)
        let suggestedPrice = 0;
        if (floorPrice > 0) {
            suggestedPrice = Math.max(floorPrice * 1.1, avgPrice || floorPrice);
        }

        // Format response
        const pricingInfo = {
            rarity: rarity,
            floorPrice: floorPrice,
            avgPrice: avgPrice,
            lastSold: 0, // TODO: Would need to track historical sales
            matchingListings: sameRarityListings.length,
            traitMatches: traitMatches.length,
            suggestedPrice: suggestedPrice,
            breed: metadata?.attributes?.find(attr => attr.trait_type === 'Breed')?.value || null
        };

        res.json(pricingInfo);
    } catch (error) {
        console.error(`Error fetching pricing info for token #${req.query.tokenId}:`, error);

        // Return fallback data instead of 500 error
        res.json({
            rarity: 'common',
            floorPrice: 0,
            avgPrice: 0,
            lastSold: 0,
            matchingListings: 0,
            traitMatches: 0,
            suggestedPrice: 0,
            breed: null,
            error: error.message
        });
    }
}