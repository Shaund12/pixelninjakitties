import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
// import { finalizeMint } from '../scripts/finalizeMint.js'; // Currently unused

const app = express();
app.use(cors());
app.use(express.json());

// Setup environment variables
const {
    RPC_URL,
    CONTRACT_ADDRESS,
    PRIVATE_KEY,
    // PLACEHOLDER_URI, // Currently unused
    MARKETPLACE_ADDRESS
} = process.env;

// Provider + signer + contract setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// NFT contract setup
const nftAbi = [
    'event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)',
    'function tokenURI(uint256) view returns (string)',
    'function setTokenURI(uint256,string)',
    'function totalSupply() view returns (uint256)',
    'function tokenByIndex(uint256) view returns (uint256)',
    'function ownerOf(uint256) view returns (address)',
    'function balanceOf(address) view returns (uint256)',
    'function tokenOfOwnerByIndex(address,uint256) view returns (uint256)'
];
const nft = new ethers.Contract(CONTRACT_ADDRESS, nftAbi, signer);

// Marketplace contract setup
const marketplaceAbi = [
    'function createListing(uint256 tokenId, uint256 price, address currency) external',
    'function cancelListing(uint256 tokenId) external',
    'function buyItem(uint256 tokenId) external payable',
    'function buyItemWithERC20(uint256 tokenId) external',
    'function getListings() view returns (tuple(uint256 tokenId, address seller, uint256 price, address currency, bool active)[])',
    'function getListing(uint256 tokenId) view returns (tuple(uint256 tokenId, address seller, uint256 price, address currency, bool active))'
];

let marketplace;
if (MARKETPLACE_ADDRESS) {
    marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, marketplaceAbi, signer);
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        contracts: {
            nft: CONTRACT_ADDRESS,
            marketplace: MARKETPLACE_ADDRESS || 'Not configured'
        }
    });
});

// METADATA CACHE
const metadataCache = {};

// IPFS gateways to try in order
const IPFS_GATEWAYS = [
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
    'https://dweb.link/ipfs/'
];

/**
 * Fetch metadata with multiple fallback mechanisms
 * @param {string} uri - Original token URI
 * @param {string|number} tokenId - Token ID for logging
 * @returns {Promise<Object>} - Parsed metadata object
 */
async function fetchMetadataWithFallback(uri, tokenId) {
    if (!uri || typeof uri !== 'string') {
        throw new Error(`Invalid URI for token #${tokenId}: ${uri}`);
    }

    // Handle IPFS URIs
    const attempts = [];
    if (uri.startsWith('ipfs://')) {
        const ipfsHash = uri.replace('ipfs://', '');

        // Try multiple IPFS gateways
        for (const gateway of IPFS_GATEWAYS) {
            try {
                const url = `${gateway}${ipfsHash}`;
                console.log(`Attempting to fetch metadata for token #${tokenId} from: ${url}`);

                const response = await fetch(url, {
                    timeout: 10000, // 10 second timeout
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'PixelNinjaCats/1.0'
                    }
                });

                if (!response.ok) {
                    attempts.push(`${gateway}: HTTP ${response.status} ${response.statusText}`);
                    continue;
                }

                // Check if response is actually JSON
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    // Try to read as text to see what we got
                    const text = await response.text();
                    if (text.trim().startsWith('<')) {
                        attempts.push(`${gateway}: Received HTML instead of JSON`);
                        continue;
                    }

                    // Try to parse anyway if it looks like JSON
                    if (text.trim().startsWith('{')) {
                        try {
                            const metadata = JSON.parse(text);
                            console.log(`✅ Successfully fetched metadata for token #${tokenId} from ${gateway}`);
                            return metadata;
                        } catch (parseError) {
                            attempts.push(`${gateway}: JSON parse error - ${parseError.message}`);
                            continue;
                        }
                    }
                }

                // Parse JSON response
                const metadata = await response.json();

                // Validate basic metadata structure
                if (!metadata || typeof metadata !== 'object') {
                    attempts.push(`${gateway}: Invalid metadata structure`);
                    continue;
                }

                console.log(`✅ Successfully fetched metadata for token #${tokenId} from ${gateway}`);
                return metadata;

            } catch (error) {
                attempts.push(`${gateway}: ${error.message}`);
                console.warn(`Failed to fetch from ${gateway}: ${error.message}`);
                continue;
            }
        }
    } else {
        // Handle regular HTTP/HTTPS URLs
        try {
            const response = await fetch(uri, {
                timeout: 10000,
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'PixelNinjaCats/1.0'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const metadata = await response.json();
            console.log(`✅ Successfully fetched metadata for token #${tokenId} from direct URL`);
            return metadata;

        } catch (error) {
            attempts.push(`Direct URL: ${error.message}`);
        }
    }

    // If all attempts failed, throw an error with details
    const errorMsg = `Failed to fetch metadata for token #${tokenId} from all sources:\n${attempts.join('\n')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
}

// Debug endpoint for metadata issues
app.get('/api/debug/metadata/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const debug = {
            tokenId: id,
            timestamp: new Date().toISOString(),
            steps: []
        };

        // Step 1: Check if token exists
        debug.steps.push({ step: 1, action: 'Checking token existence' });
        try {
            const owner = await nft.ownerOf(id);
            debug.steps.push({ step: 1, result: 'success', owner });
        } catch (error) {
            debug.steps.push({ step: 1, result: 'error', error: error.message });
            return res.status(404).json({ error: 'Token not found', debug });
        }

        // Step 2: Get tokenURI
        debug.steps.push({ step: 2, action: 'Getting tokenURI' });
        let uri;
        try {
            uri = await nft.tokenURI(id);
            debug.steps.push({ step: 2, result: 'success', uri });
        } catch (error) {
            debug.steps.push({ step: 2, result: 'error', error: error.message });
            return res.status(500).json({ error: 'Failed to get tokenURI', debug });
        }

        // Step 3: Test each IPFS gateway
        debug.steps.push({ step: 3, action: 'Testing IPFS gateways' });
        const gatewayResults = [];
        
        if (uri.startsWith('ipfs://')) {
            const ipfsHash = uri.replace('ipfs://', '');
            
            for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
                const gateway = IPFS_GATEWAYS[i];
                const url = `${gateway}${ipfsHash}`;
                const gatewayTest = {
                    gateway,
                    url,
                    attempt: i + 1
                };

                try {
                    const response = await fetch(url, {
                        timeout: 5000,
                        headers: {
                            'Accept': 'application/json',
                            'User-Agent': 'PixelNinjaCats/1.0'
                        }
                    });

                    gatewayTest.status = response.status;
                    gatewayTest.statusText = response.statusText;
                    gatewayTest.contentType = response.headers.get('content-type');

                    if (response.ok) {
                        const text = await response.text();
                        gatewayTest.responseLength = text.length;
                        gatewayTest.responseStart = text.substring(0, 100);
                        
                        if (text.trim().startsWith('{')) {
                            try {
                                const metadata = JSON.parse(text);
                                gatewayTest.result = 'success';
                                gatewayTest.metadata = {
                                    name: metadata.name,
                                    hasDescription: !!metadata.description,
                                    hasImage: !!metadata.image,
                                    attributeCount: metadata.attributes?.length || 0
                                };
                            } catch (parseError) {
                                gatewayTest.result = 'json_parse_error';
                                gatewayTest.parseError = parseError.message;
                            }
                        } else {
                            gatewayTest.result = 'invalid_format';
                            gatewayTest.note = 'Response does not appear to be JSON';
                        }
                    } else {
                        gatewayTest.result = 'http_error';
                    }
                } catch (error) {
                    gatewayTest.result = 'fetch_error';
                    gatewayTest.error = error.message;
                }

                gatewayResults.push(gatewayTest);
            }
        } else {
            gatewayResults.push({
                note: 'Not an IPFS URI, attempting direct fetch',
                url: uri
            });

            try {
                const response = await fetch(uri, {
                    timeout: 5000,
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'PixelNinjaCats/1.0'
                    }
                });

                gatewayResults[0].status = response.status;
                gatewayResults[0].statusText = response.statusText;
                gatewayResults[0].contentType = response.headers.get('content-type');

                if (response.ok) {
                    const metadata = await response.json();
                    gatewayResults[0].result = 'success';
                    gatewayResults[0].metadata = {
                        name: metadata.name,
                        hasDescription: !!metadata.description,
                        hasImage: !!metadata.image,
                        attributeCount: metadata.attributes?.length || 0
                    };
                } else {
                    gatewayResults[0].result = 'http_error';
                }
            } catch (error) {
                gatewayResults[0].result = 'error';
                gatewayResults[0].error = error.message;
            }
        }

        debug.steps.push({ step: 3, result: 'completed', gatewayResults });

        // Step 4: Summary
        const successfulGateways = gatewayResults.filter(g => g.result === 'success');
        debug.summary = {
            totalGatewaysTested: gatewayResults.length,
            successfulGateways: successfulGateways.length,
            recommendation: successfulGateways.length > 0 
                ? 'Metadata should load correctly'
                : 'Metadata loading will fail - check IPFS pin status'
        };

        res.json({ debug });

    } catch (error) {
        console.error(`Debug endpoint error for token #${req.params.id}:`, error);
        res.status(500).json({ 
            error: error.message,
            note: 'Debug endpoint encountered an error'
        });
    }
});

// ALL KITTIES ENDPOINTS

// Get total supply
app.get('/api/kitties/total', async (req, res) => {
    try {
        const totalSupply = await nft.totalSupply();
        res.json({ totalSupply: Number(totalSupply) });
    } catch (error) {
        console.error('Error fetching total supply:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get a page of kitties with pagination
app.get('/api/kitties', async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 12;
        const skip = (page - 1) * limit;

        const totalSupply = Number(await nft.totalSupply());
        const end = Math.min(skip + limit, totalSupply);

        const kitties = [];
        for (let i = skip; i < end; i++) {
            try {
                const tokenId = await nft.tokenByIndex(i);
                const id = Number(tokenId);
                const owner = await nft.ownerOf(id);

                // Get metadata
                let metadata;
                if (metadataCache[id]) {
                    metadata = metadataCache[id];
                } else {
                    try {
                        const uri = await nft.tokenURI(id);
                        metadata = await fetchMetadataWithFallback(uri, id);
                        metadataCache[id] = metadata;
                    } catch (error) {
                        console.error(`Error fetching metadata for token #${id}:`, error.message);
                        // Provide fallback metadata
                        metadata = {
                            name: `Pixel Ninja Cat #${id}`,
                            description: 'Metadata temporarily unavailable',
                            image: 'https://via.placeholder.com/300x300?text=Loading...',
                            attributes: []
                        };
                    }
                }

                kitties.push({
                    id,
                    owner,
                    metadata,
                    rarity: getRarity(id, metadata)
                });
            } catch (error) {
                console.error(`Error with token at index ${i}:`, error);
                // Continue with next token
            }
        }

        res.json({
            kitties,
            pagination: {
                total: totalSupply,
                page,
                limit,
                pages: Math.ceil(totalSupply / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching kitties:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get specific kitty by ID
app.get('/api/kitties/:id', async (req, res) => {
    try {
        const id = req.params.id;

        // Check if token exists by trying to get its owner
        let owner;
        try {
            owner = await nft.ownerOf(id);
        } catch {
            return res.status(404).json({ error: 'Token not found' });
        }

        // Get metadata
        let metadata;
        if (metadataCache[id]) {
            metadata = metadataCache[id];
        } else {
            try {
                const uri = await nft.tokenURI(id);
                metadata = await fetchMetadataWithFallback(uri, id);
                metadataCache[id] = metadata;
            } catch (error) {
                console.error(`Error fetching metadata for token #${id}:`, error.message);
                // Provide fallback metadata
                metadata = {
                    name: `Pixel Ninja Cat #${id}`,
                    description: 'Metadata temporarily unavailable',
                    image: 'https://via.placeholder.com/300x300?text=Loading...',
                    attributes: []
                };
            }
        }

        // Check if this token is listed in marketplace
        let listing = null;
        if (marketplace) {
            try {
                const listingData = await marketplace.getListing(id);
                if (listingData.active) {
                    listing = {
                        price: listingData.price.toString(),
                        seller: listingData.seller,
                        currency: listingData.currency,
                        active: listingData.active
                    };
                }
            } catch {
                // Listing not found or error, continue without listing data
            }
        }

        res.json({
            id,
            owner,
            metadata,
            rarity: getRarity(id, metadata),
            listing
        });
    } catch (error) {
        console.error(`Error fetching kitty #${req.params.id}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Get kitties owned by address
app.get('/api/kitties/owner/:address', async (req, res) => {
    try {
        const address = req.params.address;
        const balance = await nft.balanceOf(address);

        const kitties = [];
        for (let i = 0; i < balance; i++) {
            const tokenId = await nft.tokenOfOwnerByIndex(address, i);
            const id = Number(tokenId);

            // Get metadata
            let metadata;
            if (metadataCache[id]) {
                metadata = metadataCache[id];
            } else {
                try {
                    const uri = await nft.tokenURI(id);
                    metadata = await fetchMetadataWithFallback(uri, id);
                    metadataCache[id] = metadata;
                } catch (error) {
                    console.error(`Error fetching metadata for token #${id}:`, error.message);
                    // Provide fallback metadata
                    metadata = {
                        name: `Pixel Ninja Cat #${id}`,
                        description: 'Metadata temporarily unavailable',
                        image: 'https://via.placeholder.com/300x300?text=Loading...',
                        attributes: []
                    };
                }
            }

            kitties.push({
                id,
                metadata,
                rarity: getRarity(id, metadata)
            });
        }

        res.json({ kitties, balance: Number(balance) });
    } catch (error) {
        console.error(`Error fetching kitties for owner ${req.params.address}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// MARKETPLACE ENDPOINTS
// These will only work if MARKETPLACE_ADDRESS is configured

// Get all marketplace listings
app.get('/api/marketplace/listings', async (req, res) => {
    if (!marketplace) {
        return res.status(404).json({ error: 'Marketplace not configured' });
    }

    try {
        const listings = await marketplace.getListings();

        // Filter only active listings
        const activeListings = listings
            .filter(listing => listing.active)
            .map(listing => ({
                tokenId: Number(listing.tokenId),
                seller: listing.seller,
                price: listing.price.toString(),
                currency: listing.currency,
                active: listing.active
            }));

        // Enhance listings with metadata
        for (const listing of activeListings) {
            try {
                let metadata;
                if (metadataCache[listing.tokenId]) {
                    metadata = metadataCache[listing.tokenId];
                } else {
                    const uri = await nft.tokenURI(listing.tokenId);
                    const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
                    metadata = await response.json();
                    metadataCache[listing.tokenId] = metadata;
                }

                listing.metadata = metadata;
                listing.rarity = getRarity(listing.tokenId, metadata);
            } catch (error) {
                console.error(`Error fetching metadata for listing #${listing.tokenId}:`, error);
            }
        }

        res.json({ listings: activeListings });
    } catch (error) {
        console.error('Error fetching marketplace listings:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get a specific listing
app.get('/api/marketplace/listings/:tokenId', async (req, res) => {
    if (!marketplace) {
        return res.status(404).json({ error: 'Marketplace not configured' });
    }

    try {
        const tokenId = req.params.tokenId;
        const listing = await marketplace.getListing(tokenId);

        if (!listing.active) {
            return res.status(404).json({ error: 'Listing not active' });
        }

        const formattedListing = {
            tokenId: Number(listing.tokenId),
            seller: listing.seller,
            price: listing.price.toString(),
            currency: listing.currency,
            active: listing.active
        };

        // Add metadata
        try {
            let metadata;
            if (metadataCache[tokenId]) {
                metadata = metadataCache[tokenId];
            } else {
                const uri = await nft.tokenURI(tokenId);
                const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
                metadata = await response.json();
                metadataCache[tokenId] = metadata;
            }

            formattedListing.metadata = metadata;
            formattedListing.rarity = getRarity(tokenId, metadata);
        } catch (error) {
            console.error(`Error fetching metadata for listing #${tokenId}:`, error);
        }

        res.json({ listing: formattedListing });
    } catch (error) {
        console.error(`Error fetching listing #${req.params.tokenId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// Get pricing information for a specific token ID
app.get('/api/pricing-info/:tokenId', async (req, res) => {
    if (!marketplace) {
        return res.status(404).json({ error: 'Marketplace not configured' });
    }

    try {
        const tokenId = req.params.tokenId;

        // Get the token's metadata and rarity
        let metadata;
        if (metadataCache[tokenId]) {
            metadata = metadataCache[tokenId];
        } else {
            const uri = await nft.tokenURI(tokenId);
            const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
            metadata = await response.json();
            metadataCache[tokenId] = metadata;
        }

        const rarity = getRarity(tokenId, metadata);

        // Get all active listings
        const listings = await marketplace.getListings();
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
        console.error(`Error fetching pricing info for token #${req.params.tokenId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

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

// Export express app as serverless function
export default app;