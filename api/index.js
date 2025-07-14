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
                    const uri = await nft.tokenURI(id);
                    const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
                    metadata = await response.json();
                    metadataCache[id] = metadata;
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
            const uri = await nft.tokenURI(id);
            const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
            metadata = await response.json();
            metadataCache[id] = metadata;
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
                const uri = await nft.tokenURI(id);
                const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
                metadata = await response.json();
                metadataCache[id] = metadata;
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