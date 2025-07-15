import { ethers } from 'ethers';

// Setup environment variables
const {
    RPC_URL,
    CONTRACT_ADDRESS,
    MARKETPLACE_ADDRESS
} = process.env;

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

// Helper function to determine rarity based on metadata or token ID as fallback
function getRarity(id, metadata) {
    // If we have metadata with ninja_data containing rarity info, use that
    if (metadata && metadata.ninja_data && metadata.ninja_data.rarity && metadata.ninja_data.rarity.tier) {
        return metadata.ninja_data.rarity.tier.toLowerCase(); // Convert to lowercase to match existing format
    }

    // Fallback to the previous ID-based calculation for backward compatibility
    const numId = parseInt(id, 10);
    if (numId % 100 === 0) return 'legendary';
    if (numId % 10 === 0) return 'epic';
    if (numId % 2 === 0) return 'rare';
    return 'common';
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

    // Return fallback data if marketplace is not configured
    if (!MARKETPLACE_ADDRESS) {
        return res.json({
            rarity: 'common',
            floorPrice: null,
            avgPrice: null,
            lastSold: null,
            matchingListings: 0,
            traitMatches: 0,
            suggestedPrice: null,
            breed: null,
            error: 'Marketplace not configured'
        });
    }

    const marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, marketplaceAbi, provider);

    try {
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
                floorPrice: null,
                avgPrice: null,
                lastSold: null,
                matchingListings: 0,
                traitMatches: 0,
                suggestedPrice: null,
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
                enhancedListings.push({
                    ...listing,
                    metadata: listingMetadata,
                    rarity: listingRarity,
                    priceInEth: listing.currency === '0x0000000000000000000000000000000000000000' ?
                        parseFloat(ethers.formatEther(listing.price)) :
                        parseFloat(ethers.formatUnits(listing.price, 6)) // USDC has 6 decimals
                });
            } catch (error) {
                console.error(`Error processing listing #${listing.tokenId}:`, error);
            }
        }

        // Filter listings by same rarity
        const sameRarityListings = enhancedListings.filter(listing =>
            listing.rarity === rarity
        );

        // Calculate floor price (lowest price)
        const floorPrice = sameRarityListings.length > 0 ?
            Math.min(...sameRarityListings.map(l => l.priceInEth)) : null;

        // Calculate average price
        const avgPrice = sameRarityListings.length > 0 ?
            sameRarityListings.reduce((sum, l) => sum + l.priceInEth, 0) / sameRarityListings.length : null;

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
        let suggestedPrice = null;
        if (floorPrice !== null) {
            suggestedPrice = Math.max(floorPrice * 1.1, avgPrice || floorPrice);
        }

        // Format response
        const pricingInfo = {
            rarity: rarity,
            floorPrice: floorPrice,
            avgPrice: avgPrice,
            lastSold: null, // TODO: Would need to track historical sales
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
            floorPrice: null,
            avgPrice: null,
            lastSold: null,
            matchingListings: 0,
            traitMatches: 0,
            suggestedPrice: null,
            breed: null,
            error: error.message
        });
    }
}