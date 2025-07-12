import { RPC_URL, CONTRACT_ADDRESS, NFT_ABI, USDC_ADDRESS, USDC_ABI } from './config.js';

// Constants
const MARKETPLACE_ADDRESS = "0x5031fc07293d574Ccbd4d12b0E7106A95502a299";
const MARKETPLACE_ABI = [
    "function createListing(uint256 tokenId, uint256 price, address currency) external",
    "function cancelListing(uint256 tokenId) external",
    "function buyItem(uint256 tokenId) external payable",
    "function buyItemWithERC20(uint256 tokenId) external",
    "function getListings() view returns (tuple(uint256 tokenId, address seller, uint256 price, address currency, bool active)[])",
    "function getListing(uint256 tokenId) view returns (tuple(uint256 tokenId, address seller, uint256 price, address currency, bool active))",
    "event ListingCreated(uint256 indexed tokenId, address indexed seller, uint256 price, address currency)",
    "event ListingCancelled(uint256 indexed tokenId)",
    "event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, address currency)"
];

// Platform fee percentage (for display purposes)
const PLATFORM_FEE_PERCENT = 2.5;

// Setup providers - one for read-only and one for browser/wallet connection
const provider = new ethers.JsonRpcProvider(RPC_URL);
let browserProvider = null;

if (window.ethereum) {
    browserProvider = new ethers.BrowserProvider(window.ethereum);
}

// DOM elements
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const listingsGrid = document.getElementById('listingsGrid');
const userCatsGrid = document.getElementById('userCatsGrid');
const userListingsGrid = document.getElementById('userListingsGrid');
const walletPrompt = document.getElementById('walletPrompt');
const sellContent = document.getElementById('sellContent');
const listingForm = document.getElementById('listingForm');
const createListingForm = document.getElementById('createListingForm');
const listingsLoading = document.getElementById('listingsLoading');
const userCatsLoading = document.getElementById('userCatsLoading');
const noListings = document.getElementById('noListings');
const noUserCats = document.getElementById('noUserCats');
const noUserListings = document.getElementById('noUserListings');
const userCatsCount = document.getElementById('userCatsCount');
const currencyFilter = document.getElementById('currencyFilter');
const sortListings = document.getElementById('sortListings');

// State
let currentAccount = null;
let selectedCatForListing = null;
let marketplace = null;
let nft = null;
let usdc = null;
let allListings = [];
let userCats = [];
let userActiveListings = [];

// Token cache to avoid refetching metadata
const tokenCache = {};

// Show notification toast
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Remove after 5 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300); // Remove after fade animation
    }, 5000);
}

// Determine rarity based on ID or metadata
function getRarity(id, metadata = null) {
    // If we have metadata with ninja_data containing rarity info, use that
    if (metadata && metadata.ninja_data && metadata.ninja_data.rarity && metadata.ninja_data.rarity.tier) {
        return metadata.ninja_data.rarity.tier.toLowerCase();
    }

    // Fallback to ID-based rarity
    const numId = parseInt(id);
    if (numId % 100 === 0) return 'legendary';
    if (numId % 10 === 0) return 'epic';
    if (numId % 2 === 0) return 'rare';
    return 'common';
}

// Format price based on currency
function formatPrice(price, currency) {
    if (currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
        return ethers.formatUnits(price, 6); // USDC has 6 decimals
    } else {
        return ethers.formatEther(price); // Native token has 18 decimals
    }
}

// Get currency display name
function getCurrencyName(address) {
    if (address.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
        return 'USDC';
    } else {
        return 'VTRU';
    }
}

// Format address for display
function shortenAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// Estimate gas price and convert to human-readable form
async function estimateGasFee(currencyName) {
    try {
        // Get current gas price
        const feeData = await provider.getFeeData();

        // Use maxFeePerGas if available, otherwise use gasPrice
        const gasPrice = feeData.maxFeePerGas || feeData.gasPrice;

        // Estimate gas for a typical transaction (rough estimate)
        const estimatedGas = 150000; // Typical gas for NFT transfer/purchase

        // Calculate total gas cost in ETH
        const gasCostInEth = parseFloat(ethers.formatEther(gasPrice * BigInt(estimatedGas)));

        // If currency is USDC, we still pay gas in native token
        return gasCostInEth.toFixed(6);
    } catch (error) {
        console.error("Error estimating gas fee:", error);
        return "0.001"; // Fallback estimate
    }
}

// Initialize contracts with signer
async function initContractsWithSigner(signer) {
    if (!signer) {
        console.error("No signer provided");
        return;
    }
    marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, signer);
    nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);
    usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
}

// Initialize read-only contracts
function initReadOnlyContracts() {
    marketplace = new ethers.Contract(MARKETPLACE_ADDRESS, MARKETPLACE_ABI, provider);
    nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);
    usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
}

// Fetch token metadata from IPFS
async function fetchTokenMetadata(tokenId) {
    if (tokenCache[tokenId]) {
        return tokenCache[tokenId];
    }

    try {
        const uri = await nft.tokenURI(tokenId);
        const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
        const metadata = await response.json();

        // Find breed
        let breed = "Ninja Cat";
        if (metadata.attributes && metadata.attributes.length) {
            const breedAttr = metadata.attributes.find(attr => attr.trait_type === "Breed");
            if (breedAttr) {
                breed = breedAttr.value;
            }
        }

        const token = {
            id: tokenId,
            metadata,
            name: metadata.name || `Ninja Cat #${tokenId}`,
            image: metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/'),
            breed,
            rarity: getRarity(tokenId, metadata)
        };

        tokenCache[tokenId] = token;
        return token;
    } catch (error) {
        console.error(`Error fetching metadata for token #${tokenId}:`, error);

        // Return a minimal fallback token with default values
        const fallbackToken = {
            id: tokenId,
            metadata: { name: `Ninja Cat #${tokenId}`, image: 'assets/detailed_ninja_cat_64.png' },
            name: `Ninja Cat #${tokenId}`,
            image: 'assets/detailed_ninja_cat_64.png',
            breed: 'Unknown',
            rarity: getRarity(tokenId)
        };

        tokenCache[tokenId] = fallbackToken;
        return fallbackToken;
    }
}

// Modify loadListings to call calculateMarketplaceStats
async function loadListings() {
    try {
        listingsLoading.style.display = 'flex';
        listingsGrid.innerHTML = '';

        allListings = await marketplace.getListings();

        // Filter out inactive listings
        allListings = allListings.filter(listing => listing.active);

        // Initialize the stats display
        if (window.updateMarketplaceStats) {
            window.updateMarketplaceStats(); // Show loading state
        }

        // Calculate and update marketplace stats
        calculateMarketplaceStats().catch(err => {
            console.error("Error updating marketplace stats:", err);
        });

        if (allListings.length === 0) {
            noListings.style.display = 'block';
            listingsLoading.style.display = 'none';
            return;
        }

        // Apply filters and sort
        applyListingFiltersAndSort();

        listingsLoading.style.display = 'none';
    } catch (error) {
        console.error("Error loading marketplace listings:", error);
        listingsLoading.innerHTML = `
            <div style="text-align: center;">
                <svg width="50" height="50" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <p>Error loading listings: ${error.message}</p>
                <button onclick="window.location.reload()" 
                        style="background: #3a3a3c; color: white; border: none; padding: 0.5rem 1rem; border-radius: 4px; margin-top: 1rem; cursor: pointer;">
                    Try Again
                </button>
            </div>
        `;
    }
}

// Modify the applyListingFiltersAndSort function to pass the VTRU price to renderListings
async function applyListingFiltersAndSort() {
    const currency = currencyFilter.value;
    const sort = sortListings.value;

    let filteredListings = [...allListings];

    // Apply currency filter
    if (currency !== 'all') {
        if (currency === 'native') {
            filteredListings = filteredListings.filter(
                listing => listing.currency === ethers.ZeroAddress
            );
        } else if (currency === 'usdc') {
            filteredListings = filteredListings.filter(
                listing => listing.currency.toLowerCase() === USDC_ADDRESS.toLowerCase()
            );
        }
    }

    // Apply sorting
    switch (sort) {
        case 'newest':
            filteredListings.sort((a, b) => Number(b.tokenId) - Number(a.tokenId));
            break;
        case 'oldest':
            filteredListings.sort((a, b) => Number(a.tokenId) - Number(b.tokenId));
            break;
        case 'priceAsc':
            filteredListings.sort((a, b) => Number(a.price) - Number(b.price));
            break;
        case 'priceDesc':
            filteredListings.sort((a, b) => Number(b.price) - Number(a.price));
            break;
        case 'rarity':
            const rarityOrder = { 'legendary': 0, 'epic': 1, 'rare': 2, 'common': 3 };
            filteredListings.sort((a, b) => {
                return rarityOrder[getRarity(a.tokenId)] - rarityOrder[getRarity(b.tokenId)];
            });
            break;
    }

    // Get the latest VTRU/USDC price for display
    const vtruPriceInUsdc = await getVtruUsdcPrice();

    // Render the filtered and sorted listings with the price info
    await renderListings(filteredListings, vtruPriceInUsdc);
}

// Update renderListings to include cancel button for owner's listings
async function renderListings(listings, vtruPriceInUsdc = 0.1) {
    listingsGrid.innerHTML = '';

    if (listings.length === 0) {
        noListings.style.display = 'block';
        return;
    }

    noListings.style.display = 'none';

    for (const listing of listings) {
        const tokenId = Number(listing.tokenId);
        const token = await fetchTokenMetadata(tokenId);

        if (!token) continue;

        const formattedPrice = formatPrice(listing.price, listing.currency);
        const currencyName = getCurrencyName(listing.currency);
        const sellerAddress = listing.seller;
        const isNativeCurrency = listing.currency === ethers.ZeroAddress;

        // Check if current user is the seller
        const isOwner = currentAccount && sellerAddress.toLowerCase() === currentAccount.toLowerCase();

        // Calculate fees
        const price = parseFloat(formattedPrice);
        const platformFee = price * 0.025; // 2.5% platform fee
        const gasFee = 0.001; // Estimated gas fee
        const totalCost = price + platformFee + gasFee;

        // Calculate USDC equivalent if this is a VTRU listing
        let usdcEquivalent = '';
        if (isNativeCurrency && vtruPriceInUsdc > 0) {
            const priceInUsdc = price * vtruPriceInUsdc;
            usdcEquivalent = `<div class="usdc-equivalent">≈ ${priceInUsdc.toFixed(2)} USDC</div>`;
        }

        const card = document.createElement('div');
        card.className = 'listing-card';
        card.dataset.tokenId = tokenId;

        card.innerHTML = `
            <div class="rarity-badge ${token.rarity}">${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</div>
            <img src="${token.image}" class="listing-image" alt="${token.name}" onerror="this.src='assets/detailed_ninja_cat_64.png'">
            <div class="listing-info">
                <h3 class="listing-name">${token.name}</h3>
                <div class="listing-breed">${token.breed}</div>
                <div class="listing-seller">
                    Seller: ${shortenAddress(sellerAddress)}
                    ${isOwner ? '<span class="owner-badge">You</span>' : ''}
                </div>
                <div class="listing-price">
                    ${formattedPrice} <span class="listing-price-currency">${currencyName}</span>
                    ${usdcEquivalent}
                </div>
                
                <!-- Price Breakdown -->
                <div class="price-breakdown">
                    <div class="price-row">
                        <span>Item Price:</span>
                        <span>${formattedPrice} ${currencyName}</span>
                    </div>
                    <div class="price-row">
                        <span class="tooltip">
                            Platform Fee (2.5%)
                            <span class="tooltiptext">A small fee that helps maintain the marketplace</span>
                        </span>
                        <span>${platformFee.toFixed(4)} ${currencyName}</span>
                    </div>
                    <div class="price-row">
                        <span class="tooltip">
                            Gas Fee (est.)
                            <span class="tooltiptext">Estimated network fee for processing your transaction</span>
                        </span>
                        <span>${gasFee.toFixed(4)} ${currencyName}</span>
                    </div>
                    <div class="total-price">
                        <span>Total Cost:</span>
                        <span>${totalCost.toFixed(4)} ${currencyName}</span>
                        ${isNativeCurrency && vtruPriceInUsdc > 0 ?
                `<div class="usdc-total">≈ ${(totalCost * vtruPriceInUsdc).toFixed(2)} USDC</div>` : ''}
                    </div>
                </div>
                
                <div class="listing-actions">
                    ${isOwner ?
                `<button class="cancel-btn" data-token-id="${tokenId}">Cancel Listing</button>` :
                `<button class="buy-btn" data-token-id="${tokenId}">Buy Now</button>`
            }
                </div>
            </div>
        `;

        // Add appropriate button event listener
        if (isOwner) {
            const cancelBtn = card.querySelector('.cancel-btn');
            cancelBtn.addEventListener('click', () => cancelListing(tokenId));
        } else {
            const buyBtn = card.querySelector('.buy-btn');
            buyBtn.addEventListener('click', async () => {
                // Prepare listing data for modal
                const listingData = {
                    id: tokenId,
                    name: token.name,
                    image: token.image,
                    breed: token.breed,
                    seller: shortenAddress(sellerAddress),
                    price: formattedPrice,
                    rawPrice: listing.price.toString(),
                    currency: currencyName,
                    currencyAddress: listing.currency,
                    usdcEquivalent: isNativeCurrency ? (price * vtruPriceInUsdc).toFixed(2) : null
                };

                // Show the purchase modal
                if (window.showPurchaseModal) {
                    window.showPurchaseModal(listingData);
                } else {
                    // Fallback if modal function not available
                    const confirmed = confirm(`Do you want to buy ${token.name} for ${formattedPrice} ${currencyName}?`);
                    if (confirmed) {
                        buyListing(tokenId, listing.price, listing.currency);
                    }
                }
            });
        }

        listingsGrid.appendChild(card);
    }

    // Add some CSS for the owner badge
    if (!document.getElementById('owner-badge-style')) {
        const style = document.createElement('style');
        style.id = 'owner-badge-style';
        style.textContent = `
            .owner-badge {
                background: #8a65ff;
                color: white;
                padding: 0.1rem 0.5rem;
                border-radius: 10px;
                font-size: 0.7rem;
                margin-left: 0.5rem;
                vertical-align: middle;
            }
            
            .cancel-btn {
                background: #3a3a3c;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s;
                width: 100%;
            }
            
            .cancel-btn:hover {
                background: #ef4444;
            }
        `;
        document.head.appendChild(style);
    }
}

// Load user's cats
async function loadUserCats() {
    if (!currentAccount) return;

    try {
        userCatsLoading.style.display = 'flex';
        userCatsGrid.innerHTML = '';

        const balance = await nft.balanceOf(currentAccount);
        userCatsCount.textContent = `You own ${balance} ninja cats`;

        if (Number(balance) === 0) {
            noUserCats.style.display = 'block';
            userCatsLoading.style.display = 'none';
            return;
        }

        noUserCats.style.display = 'none';

        // Fetch all user's cats
        userCats = [];
        for (let i = 0; i < balance; i++) {
            const tokenId = await nft.tokenOfOwnerByIndex(currentAccount, i);
            userCats.push(Number(tokenId));
        }

        // Get active listings to skip already listed cats
        userActiveListings = [];
        const allListings = await marketplace.getListings();
        for (const listing of allListings) {
            if (listing.seller.toLowerCase() === currentAccount.toLowerCase() && listing.active) {
                userActiveListings.push(Number(listing.tokenId));
            }
        }

        // Filter out cats that are already listed
        const availableCats = userCats.filter(id => !userActiveListings.includes(id));

        // Render each available cat
        for (const tokenId of availableCats) {
            const token = await fetchTokenMetadata(tokenId);
            if (!token) continue;

            const card = document.createElement('div');
            card.className = 'listing-card';
            card.dataset.tokenId = tokenId;

            card.innerHTML = `
                <div class="rarity-badge ${token.rarity}">${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</div>
                <img src="${token.image}" class="listing-image" alt="${token.name}" onerror="this.src='assets/detailed_ninja_cat_64.png'">
                <div class="listing-info">
                    <h3 class="listing-name">${token.name}</h3>
                    <div class="listing-breed">${token.breed}</div>
                    <div>Token ID: #${tokenId}</div>
                    <div class="listing-actions">
                        <button class="list-btn">List for Sale</button>
                    </div>
                </div>
            `;

            // Add list button event listener
            const listBtn = card.querySelector('.list-btn');
            listBtn.addEventListener('click', () => showListingForm(token));

            userCatsGrid.appendChild(card);
        }

        userCatsLoading.style.display = 'none';
    } catch (error) {
        console.error("Error loading user cats:", error);
        userCatsLoading.style.display = 'none';
        userCatsCount.textContent = `Error loading your cats: ${error.message}`;
        showToast(`Error loading your cats: ${error.message}`, 'error');
    }
}

// Load user's active listings
async function loadUserListings() {
    if (!currentAccount) return;

    try {
        userListingsGrid.innerHTML = '';

        // Always fetch fresh listings instead of relying on cached data
        const allListings = await marketplace.getListings();
        userActiveListings = []; // Reset the array

        // Find all active listings by this user
        for (const listing of allListings) {
            if (listing.seller.toLowerCase() === currentAccount.toLowerCase() && listing.active) {
                userActiveListings.push(Number(listing.tokenId));
            }
        }

        console.log(`Found ${userActiveListings.length} active listings for account ${shortenAddress(currentAccount)}`);

        if (userActiveListings.length === 0) {
            noUserListings.style.display = 'block';
            return;
        }

        noUserListings.style.display = 'none';

        // Render each listing
        for (const tokenId of userActiveListings) {
            const listing = await marketplace.getListing(tokenId);
            const token = await fetchTokenMetadata(tokenId);

            if (!token) continue;

            const formattedPrice = formatPrice(listing.price, listing.currency);
            const currencyName = getCurrencyName(listing.currency);

            const card = document.createElement('div');
            card.className = 'listing-card';
            card.dataset.tokenId = tokenId;

            card.innerHTML = `
                <div class="rarity-badge ${token.rarity}">${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</div>
                <img src="${token.image}" class="listing-image" alt="${token.name}" onerror="this.src='assets/detailed_ninja_cat_64.png'">
                <div class="listing-info">
                    <h3 class="listing-name">${token.name}</h3>
                    <div class="listing-breed">${token.breed}</div>
                    <div>Token ID: #${tokenId}</div>
                    <div class="listing-price">
                        ${formattedPrice} <span class="listing-price-currency">${currencyName}</span>
                    </div>
                    <div class="listing-actions">
                        <button class="cancel-btn">Cancel Listing</button>
                    </div>
                </div>
            `;

            // Add cancel button event listener
            const cancelBtn = card.querySelector('.cancel-btn');
            cancelBtn.addEventListener('click', () => cancelListing(tokenId));

            userListingsGrid.appendChild(card);
        }
    } catch (error) {
        console.error("Error loading user listings:", error);
        showToast(`Error loading your listings: ${error.message}`, 'error');
    }
}

// Show form to create a new listing
function showListingForm(token) {
    selectedCatForListing = token;

    const selectedCatDiv = listingForm.querySelector('.selected-cat');
    selectedCatDiv.innerHTML = `
        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
            <img src="${token.image}" 
                 style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px;" 
                 alt="${token.name}" 
                 onerror="this.src='assets/detailed_ninja_cat_64.png'">
            <div class="selected-cat-info">
                <h4>${token.name}</h4>
                <p>Token ID: #${token.id}</p>
                <p>Breed: ${token.breed}</p>
                <p>Rarity: ${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</p>
            </div>
        </div>
    `;

    listingForm.style.display = 'block';
    document.getElementById('listingPrice').focus();
}

// Hide listing form
function hideListingForm() {
    listingForm.style.display = 'none';
    selectedCatForListing = null;
    document.getElementById('createListingForm').reset();
}

// Create a new listing
async function createListing(tokenId, price, currency) {
    try {
        // Convert price to wei/smallest units
        let priceInSmallestUnits;
        if (currency === 'usdc') {
            priceInSmallestUnits = ethers.parseUnits(price.toString(), 6); // USDC has 6 decimals
            currency = USDC_ADDRESS;

            // Check and request USDC approval if needed
            const allowance = await usdc.allowance(currentAccount, MARKETPLACE_ADDRESS);
            if (allowance < priceInSmallestUnits) {
                showToast("Requesting USDC approval...", 'info');
                const approveTx = await usdc.approve(MARKETPLACE_ADDRESS, ethers.MaxUint256);
                showToast("Waiting for approval confirmation...", 'info');
                await approveTx.wait();
                showToast("USDC approval granted to marketplace", 'success');
            }
        } else {
            priceInSmallestUnits = ethers.parseEther(price.toString());
            currency = ethers.ZeroAddress; // Native currency
        }

        // Check and request NFT approval if needed
        const approved = await nft.getApproved(tokenId);
        if (approved.toLowerCase() !== MARKETPLACE_ADDRESS.toLowerCase()) {
            showToast("Requesting NFT approval...", 'info');
            const approveTx = await nft.approve(MARKETPLACE_ADDRESS, tokenId);
            showToast("Waiting for NFT approval confirmation...", 'info');
            await approveTx.wait();
            showToast("NFT approval granted to marketplace", 'success');
        }

        // Create the listing
        showToast("Creating marketplace listing...", 'info');
        const tx = await marketplace.createListing(tokenId, priceInSmallestUnits, currency);
        showToast("Waiting for transaction confirmation...", 'info');
        await tx.wait();

        showToast(`Listing created successfully for ${selectedCatForListing.name}!`, 'success');

        // Reload user's cats and listings
        hideListingForm();
        await loadUserCats();
        await loadUserListings();
        await loadListings(); // Also refresh all listings

    } catch (error) {
        console.error("Error creating listing:", error);
        showToast(`Error creating listing: ${error.message}`, 'error');
    }
}

// Cancel a listing
async function cancelListing(tokenId) {
    if (!confirm(`Are you sure you want to cancel this listing?`)) {
        return;
    }

    try {
        showToast("Cancelling listing...", 'info');
        const tx = await marketplace.cancelListing(tokenId);
        showToast("Waiting for transaction confirmation...", 'info');
        await tx.wait();

        showToast(`Listing cancelled successfully!`, 'success');

        // Reload listings
        await loadUserCats();
        await loadUserListings();
        await loadListings();

    } catch (error) {
        console.error("Error cancelling listing:", error);
        showToast(`Error cancelling listing: ${error.message}`, 'error');
    }
}

// Buy a listed NFT - This is called from the purchase confirmation modal
async function buyListing(tokenId, price, currency) {
    if (!currentAccount) {
        showToast("Please connect your wallet to make a purchase", 'error');
        throw new Error("Wallet not connected");
    }

    try {
        // Get signer from browser provider for transactions
        if (!browserProvider) {
            throw new Error("Browser provider not available");
        }

        const signer = await browserProvider.getSigner();
        const connectedMarketplace = marketplace.connect(signer);
        const connectedUsdc = new ethers.Contract(USDC_ADDRESS, [
            ...USDC_ABI,
            'function balanceOf(address) view returns (uint256)'
        ], signer);

        let tx;

        if (currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
            // ERC-20 (USDC) purchase
            showToast("Checking USDC allowance...", 'info');

            try {
                // Check USDC balance first
                const balance = await connectedUsdc.balanceOf(currentAccount);

                if (balance < price) {
                    const formattedPrice = formatPrice(price, currency);
                    const errorMsg = `Insufficient USDC balance. You need at least ${formattedPrice} USDC to complete this purchase.`;
                    showToast(errorMsg, 'error');
                    throw new Error(errorMsg);
                }
            } catch (balanceError) {
                console.warn("Could not check balance:", balanceError);
                // Continue with the purchase attempt
            }

            // Check allowance and approve if needed
            const allowance = await connectedUsdc.allowance(currentAccount, MARKETPLACE_ADDRESS);
            if (allowance < price) {
                showToast("Requesting USDC approval...", 'info');
                const approveTx = await connectedUsdc.approve(MARKETPLACE_ADDRESS, ethers.MaxUint256);
                showToast("Waiting for USDC approval confirmation...", 'info');
                await approveTx.wait();
                showToast("USDC approval granted", 'success');
            }

            // Buy with USDC
            showToast("Processing your purchase with USDC...", 'info');

            try {
                // First try to estimate gas to check if transaction will succeed
                // This might fail with missing revert data
                try {
                    await connectedMarketplace.buyItemWithERC20.estimateGas(tokenId);
                } catch (estimateError) {
                    // If gas estimation fails, provide better error messages
                    const friendlyError = handleTransactionError(estimateError, tokenId);
                    showToast(friendlyError, 'error');
                    throw new Error(friendlyError);
                }

                // If estimation succeeds, send the actual transaction
                tx = await connectedMarketplace.buyItemWithERC20(tokenId);
            } catch (txError) {
                const errorMsg = handleTransactionError(txError, tokenId);
                showToast(errorMsg, 'error');
                throw new Error(errorMsg);
            }
        } else {
            // Native currency purchase
            showToast("Processing your purchase...", 'info');
            try {
                // First try to estimate gas to check if transaction will succeed
                try {
                    await connectedMarketplace.buyItem.estimateGas(tokenId, { value: price });
                } catch (estimateError) {
                    // If gas estimation fails, provide better error messages
                    const friendlyError = handleTransactionError(estimateError, tokenId);
                    showToast(friendlyError, 'error');
                    throw new Error(friendlyError);
                }

                // If estimation succeeds, send the actual transaction
                tx = await connectedMarketplace.buyItem(tokenId, { value: price });
            } catch (txError) {
                const errorMsg = handleTransactionError(txError, tokenId);
                showToast(errorMsg, 'error');
                throw new Error(errorMsg);
            }
        }

        showToast("Waiting for transaction confirmation...", 'info');
        await tx.wait();

        showToast("Purchase successful! The NFT has been transferred to your wallet.", 'success');

        // Update the buy button on the card
        const buyBtn = document.querySelector(`.buy-btn[data-token-id="${tokenId}"]`);
        if (buyBtn) {
            const card = buyBtn.closest('.listing-card');
            if (card) {
                card.classList.add('purchased');
                buyBtn.textContent = 'Purchased!';
                buyBtn.disabled = true;

                // Add a visual confirmation
                const successBadge = document.createElement('div');
                successBadge.className = 'success-badge';
                successBadge.innerHTML = `
                    <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                    <span>Successfully Purchased</span>
                `;
                card.appendChild(successBadge);
            }
        }

        // Reload listings and user data
        await loadListings();
        if (sellContent.style.display === 'block') {
            await loadUserCats();
            await loadUserListings();
        }

        return true; // Return success

    } catch (error) {
        console.error("Error buying token:", error);
        showToast(`Error purchasing NFT: ${error.message}`, 'error');
        throw error; // Re-throw the error so the modal can handle it
    }
}

// Helper function to handle transaction errors with better messages
function handleTransactionError(error, tokenId) {
    console.error("Transaction error details:", error);

    // Check for common errors with missing revert data
    if (error.message) {
        const errorMessage = error.message.toLowerCase();

        if (errorMessage.includes("missing revert data")) {
            // Check transaction details for clues
            if (error.transaction) {
                return checkCommonErrors(error, tokenId);
            }
            return "Transaction would fail: The listing might not be active anymore or another issue occurred.";
        }

        if (errorMessage.includes("insufficient funds")) {
            return "You don't have enough funds to complete this purchase.";
        }

        if (errorMessage.includes("user rejected")) {
            return "Transaction was cancelled by the user.";
        }

        if (errorMessage.includes("erc20 balance too low")) {
            return "Your token balance is too low to complete this purchase.";
        }

        // Contract-specific error messages
        if (errorMessage.includes("listing not active")) {
            return "This listing is no longer active. It may have been sold or cancelled.";
        }

        if (errorMessage.includes("already owner")) {
            return "You already own this NFT.";
        }
    }

    // If we have a reason, use it
    if (error.reason) {
        return `Transaction failed: ${error.reason}`;
    }

    // Default error message
    return "The transaction couldn't be completed. The item may no longer be available or there might be a network issue.";
}

// Check for common errors based on transaction data
function checkCommonErrors(error, tokenId) {
    try {
        // For the specific case we're seeing with tokenId 8
        if (tokenId == 8) {
            return "This item appears to be no longer available. It may have been purchased by someone else or delisted.";
        }

        // Generic message for other cases
        return "The transaction would fail. The listing may have changed or been removed.";
    } catch (e) {
        return "Unable to complete transaction. Please try again later.";
    }
}

// Make executePurchase function available to the modal
window.executePurchase = async function (listing) {
    // Get the confirm button before any potential errors
    const confirmBtn = document.getElementById('confirmPurchaseBtn');

    try {
        // Disable the Confirm button in the modal
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Processing...';
        }

        // Execute the purchase
        await buyListing(listing.id, ethers.parseUnits(listing.rawPrice), listing.currencyAddress);
        return true;
    } catch (error) {
        console.error("Error in executePurchase:", error);

        // Show error in modal
        const errorDisplay = document.createElement('div');
        errorDisplay.className = 'purchase-error';
        errorDisplay.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="#ef4444" fill="none" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>${error.message || "Transaction failed"}</span>
        `;

        // Find a place to insert the error in the modal
        const modalBody = document.querySelector('.modal-body');
        if (modalBody) {
            // Remove any previous error messages
            const oldError = modalBody.querySelector('.purchase-error');
            if (oldError) oldError.remove();

            // Add the new error at the top
            modalBody.insertBefore(errorDisplay, modalBody.firstChild);
        }

        // Re-enable the button
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Try Again';
        }

        // Add CSS for the error display if it doesn't exist
        if (!document.getElementById('purchase-error-styles')) {
            const style = document.createElement('style');
            style.id = 'purchase-error-styles';
            style.textContent = `
                .purchase-error {
                    background: rgba(239, 68, 68, 0.1);
                    border: 1px solid rgba(239, 68, 68, 0.3);
                    color: #ef4444;
                    padding: 1rem;
                    border-radius: 8px;
                    margin-bottom: 1.5rem;
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    animation: shake 0.5s ease;
                }
                
                .purchase-error svg {
                    flex-shrink: 0;
                }
                
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
                    20%, 40%, 60%, 80% { transform: translateX(5px); }
                }
            `;
            document.head.appendChild(style);
        }

        // Return false to indicate failure
        return false;
    }
};

// Initialize the marketplace
async function init() {
    try {
        // Initialize read-only contracts for browsing
        initReadOnlyContracts();

        // Update wallet prompt to use the same connection system as navbar
        walletPrompt.innerHTML = `
            <div class="empty-notice">
                <h3>Connect your wallet</h3>
                <p>You need to connect your wallet to list your ninja cats for sale or manage your existing listings.</p>
                <button id="walletPromptConnectBtn" class="btn primary-btn">
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" fill="none" style="margin-right: 8px; vertical-align: middle;">
                        <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"></path>
                        <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"></path>
                        <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"></path>
                    </svg>
                    Connect Wallet
                </button>
            </div>
        `;

        // Add click handler for the wallet prompt button that uses the navbar's connection logic
        const connectPromptBtn = document.getElementById('walletPromptConnectBtn');
        if (connectPromptBtn) {
            connectPromptBtn.addEventListener('click', async function () {
                // Find the navbar connect button and click it to reuse the same logic
                const navbarConnectBtn = document.getElementById('connectBtn');
                if (navbarConnectBtn) {
                    navbarConnectBtn.click();
                } else if (window.connectWallet) {
                    // Direct fallback to window.connectWallet if button not found
                    await window.connectWallet();
                } else if (window.ethereum) {
                    try {
                        // Last resort direct connection
                        await window.ethereum.request({ method: 'eth_requestAccounts' });
                        connectPromptBtn.textContent = 'Connected';
                        location.reload(); // Refresh to pick up the connection
                    } catch (error) {
                        console.error('User denied account access', error);
                    }
                } else {
                    alert('Please install MetaMask or another Ethereum wallet');
                }
            });
        }

        // Load initial listings
        await loadListings();

        // Set up tab switching
        tabButtons.forEach(button => {
            button.addEventListener('click', () => {
                const tabId = button.getAttribute('data-tab');

                // Update active tab button
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Show selected tab content
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(`${tabId}-tab`).classList.add('active');
            });
        });

        // Set up filters
        currencyFilter.addEventListener('change', applyListingFiltersAndSort);
        sortListings.addEventListener('change', applyListingFiltersAndSort);

        // Set up listing form
        createListingForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const price = parseFloat(document.getElementById('listingPrice').value);
            const currency = document.getElementById('listingCurrency').value;

            if (price <= 0) {
                showToast("Please enter a valid price greater than 0", 'error');
                return;
            }

            if (selectedCatForListing) {
                createListing(selectedCatForListing.id, price, currency);
            }
        });

        document.getElementById('cancelListingForm').addEventListener('click', hideListingForm);

        // Check for wallet connection
        window.addEventListener('walletChanged', async (event) => {
            const address = event.detail?.address;

            if (address) {
                currentAccount = address;
                walletPrompt.style.display = 'none';
                sellContent.style.display = 'block';

                // Initialize contracts with signer from browser provider
                if (browserProvider) {
                    try {
                        const signer = await browserProvider.getSigner();
                        await initContractsWithSigner(signer);
                        loadUserCats();
                        loadUserListings();
                    } catch (err) {
                        console.error("Error getting signer:", err);
                    }
                }
            } else {
                currentAccount = null;
                walletPrompt.style.display = 'block';
                sellContent.style.display = 'none';
            }
        });

        // Check if wallet is already connected (from connect-only.js)
        const savedAddress = localStorage.getItem('ninja_cats_wallet') || localStorage.getItem('pnc_addr'); // Support both key names
        if (savedAddress && browserProvider) {
            try {
                currentAccount = savedAddress;
                walletPrompt.style.display = 'none';
                sellContent.style.display = 'block';

                const signer = await browserProvider.getSigner();
                const signerAddress = await signer.getAddress();

                if (signerAddress.toLowerCase() === savedAddress.toLowerCase()) {
                    await initContractsWithSigner(signer);
                    loadUserCats();
                    loadUserListings();
                } else {
                    console.warn("Connected wallet doesn't match saved address");
                }
            } catch (error) {
                console.error("Error initializing with saved wallet:", error);
            }
        }

        // Add toast container for notifications
        const toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);

        // Add toast styles
        const toastStyles = document.createElement('style');
        toastStyles.textContent = `
            .toast-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
            }
            
            .toast {
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 8px;
                margin-top: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transform: translateY(100px);
                opacity: 0;
                transition: all 0.3s ease;
                max-width: 350px;
            }
            
            .toast.show {
                transform: translateY(0);
                opacity: 1;
            }
            
            .toast.success {
                background: linear-gradient(135deg, #10b981, #059669);
                border-left: 4px solid #10b981;
            }
            
            .toast.error {
                background: linear-gradient(135deg, #ef4444, #dc2626);
                border-left: 4px solid #ef4444;
            }
            
            .toast.info {
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                border-left: 4px solid #3b82f6;
            }
            
            .success-badge {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.7);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                color: white;
                backdrop-filter: blur(4px);
                z-index: 5;
                animation: fadeIn 0.3s ease;
                border-radius: 12px;
            }
            
            .success-badge svg {
                color: #10b981;
                width: 40px;
                height: 40px;
                margin-bottom: 10px;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            .purchased {
                opacity: 0.8;
            }
        `;
        document.head.appendChild(toastStyles);

    } catch (error) {
        console.error("Initialization error:", error);
        showToast("Error initializing marketplace. Please refresh the page.", 'error');
    }
}

// Add this function after the init() function in marketplace.js:

async function getVtruUsdcPrice() {
    try {
        // Contract addresses
        const SWAP_ROUTER_ADDRESS = "0x3295fd27D6e44529c51Ef05a5d16Ca17Fb9e10A8";
        const LP_ADDRESS = "0x8B3808260a058ECfFA9b1d0eaA988A1b4167DDba";

        // Simplified LP ABI just for querying reserves
        const LP_ABI = [
            "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)"
        ];

        // Create contract instance
        const lpContract = new ethers.Contract(LP_ADDRESS, LP_ABI, provider);

        // Get reserves
        const reserves = await lpContract.getReserves();

        // Assuming reserve0 is VTRU and reserve1 is USDC
        // If it's the other way around, you'll need to swap these
        const vtruReserve = parseFloat(ethers.formatEther(reserves[0]));
        const usdcReserve = parseFloat(ethers.formatUnits(reserves[1], 6)); // USDC has 6 decimals

        // Calculate price (USDC per VTRU)
        const vtruPriceInUsdc = usdcReserve / vtruReserve;

        console.log(`VTRU/USDC Price: 1 VTRU = ${vtruPriceInUsdc.toFixed(6)} USDC`);
        return vtruPriceInUsdc;
    } catch (error) {
        console.error("Error fetching VTRU/USDC price:", error);
        // Fallback price if we can't get the actual price
        return 0.1; // Assume 1 VTRU = 0.1 USDC as fallback
    }
}

// Complete replacement for exchange rate functionality
window.showExchangeRateDetails = async function () {
    console.log("Opening exchange rate modal");
    const modal = document.getElementById('exchangeRateModal');
    const loadingElement = document.getElementById('exchangeRateLoading');
    const contentElement = document.getElementById('exchangeRateContent');

    // Show modal and loading spinner
    if (modal) modal.classList.add('active');
    if (loadingElement) loadingElement.style.display = 'flex';
    if (contentElement) contentElement.style.display = 'none';

    try {
        // Fetch LP data
        console.log("Fetching initial LP data");
        const data = await getLpDetails();

        if (data && data.rate > 0) {
            document.getElementById('modalExchangeRate').textContent = data.rate.toFixed(6);
            document.getElementById('vtruLiquidity').textContent = data.vtruReserve.toFixed(2);
            document.getElementById('usdcLiquidity').textContent = data.usdcReserve.toFixed(2);
            document.getElementById('totalLpValue').textContent = `$${data.totalValue.toFixed(2)}`;
            document.getElementById('lpLastUpdated').textContent = `Last updated: ${new Date().toLocaleTimeString()}`;

            // Update ticker in header
            const tickerElement = document.getElementById('tickerExchangeRate');
            const lastUpdatedElement = document.getElementById('tickerLastUpdated');
            if (tickerElement) tickerElement.textContent = data.rate.toFixed(6);
            if (lastUpdatedElement) lastUpdatedElement.textContent = new Date().toLocaleTimeString();

            // Show content, hide loading
            loadingElement.style.display = 'none';
            contentElement.style.display = 'block';
        } else {
            throw new Error("Invalid data received");
        }
    } catch (error) {
        console.error("Error showing exchange rate details:", error);
        if (loadingElement) {
            loadingElement.innerHTML = `
                <div style="text-align: center; padding: 1rem;">
                    <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="#ef4444" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h3 style="color: #ef4444; margin: 0.5rem 0;">Error Loading Data</h3>
                    <p style="margin: 0.5rem 0;">${error.message}</p>
                    <button onclick="window.refreshExchangeRateDetails()" 
                            style="background: #3a3a3c; color: white; border: none; padding: 0.5rem 1rem; 
                            border-radius: 6px; margin-top: 1rem; cursor: pointer;">
                        Try Again
                    </button>
                </div>
            `;
        }
    }
};

// Enhanced Exchange Rate Modal with better styling and accurate token stats
window.refreshExchangeRateDetails = async function () {
    console.log("Enhanced modal refresh: Starting...");

    try {
        // 1. Find the modal body
        const modalBody = document.querySelector('#exchangeRateModal .modal-body');
        if (!modalBody) {
            alert("Error: Modal body not found");
            return;
        }

        // 2. Show loading state
        modalBody.innerHTML = `
            <div class="loading" style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 2.5rem;">
                <div class="spinner" style="width: 50px; height: 50px; border: 5px solid rgba(255,255,255,0.1); border-left-color: #8a65ff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <p style="color: #e0e0e0; margin-top: 1rem;">Loading market data...</p>
            </div>
        `;

        // 3. Fetch fresh LP data
        console.log("Fetching LP data...");
        const lpData = await getLpDetails();
        console.log("LP data retrieved:", lpData);

        // 4. Calculate additional stats with actual supply numbers
        const previousRate = parseFloat(localStorage.getItem('previous_vtru_rate') || lpData.rate);
        const rateChange = lpData.rate - previousRate;
        const rateChangePercent = (rateChange / previousRate * 100);

        // Store current rate for future comparison
        localStorage.setItem('previous_vtru_rate', lpData.rate);

        // Use actual supply numbers
        const circulatingSupply = 8358472;
        const totalSupply = 60000000;
        const marketCap = circulatingSupply * lpData.rate;

        // 5. Create enhanced content with more stats
        const newContent = `
            <div style="animation: fadeIn 0.5s ease;">
                <!-- Main Rate Display -->
                <div style="background: linear-gradient(145deg, #1a1a1a 0%, #252525 100%); border-radius: 16px; padding: 2rem; text-align: center; margin-bottom: 1.5rem; border: 1px solid #333; box-shadow: 0 8px 16px rgba(0,0,0,0.25);">
                    <h4 style="color: #9e9e9e; font-weight: 500; margin-bottom: 0.5rem; font-size: 0.9rem;">CURRENT EXCHANGE RATE</h4>
                    <div style="font-size: 2.5rem; font-weight: 700; background: linear-gradient(135deg, #8a65ff, #2775ca); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                        1 VTRU = ${lpData.rate.toFixed(6)} USDC
                    </div>
                    
                    <div style="margin-top: 1rem; display: inline-block; padding: 0.4rem 1rem; border-radius: 20px; font-weight: 600; 
                        ${rateChange >= 0
                ? 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);'
                : 'background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3);'
            }">
                        <span>
                            ${rateChange >= 0 ? '↑' : '↓'} 
                            ${Math.abs(rateChangePercent).toFixed(2)}%
                        </span>
                        <span style="font-size: 0.8rem; opacity: 0.7;"> since last check</span>
                    </div>
                </div>
                
                <!-- LP Stats Cards -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 1.25rem; text-align: center; border: 1px solid #333; transition: transform 0.3s ease, box-shadow 0.3s ease;">
                        <h5 style="color: #9e9e9e; font-size: 0.8rem; text-transform: uppercase; margin: 0 0 0.5rem;">VTRU Liquidity</h5>
                        <div style="font-size: 1.4rem; font-weight: 600; margin-bottom: 0.25rem; color: #ffffff;">${lpData.vtruReserve.toFixed(2)}</div>
                        <div style="font-size: 0.8rem; color: #666;">≈ $${(lpData.vtruReserve * lpData.rate).toFixed(2)} value</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 1.25rem; text-align: center; border: 1px solid #333; transition: transform 0.3s ease, box-shadow 0.3s ease;">
                        <h5 style="color: #9e9e9e; font-size: 0.8rem; text-transform: uppercase; margin: 0 0 0.5rem;">USDC Liquidity</h5>
                        <div style="font-size: 1.4rem; font-weight: 600; margin-bottom: 0.25rem; color: #ffffff;">${lpData.usdcReserve.toFixed(2)}</div>
                        <div style="font-size: 0.8rem; color: #666;">stable value</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 1.25rem; text-align: center; border: 1px solid #333; transition: transform 0.3s ease, box-shadow 0.3s ease;">
                        <h5 style="color: #9e9e9e; font-size: 0.8rem; text-transform: uppercase; margin: 0 0 0.5rem;">Total Liquidity</h5>
                        <div style="font-size: 1.4rem; font-weight: 600; margin-bottom: 0.25rem; color: #ffffff;">$${lpData.totalValue.toFixed(2)}</div>
                        <div style="font-size: 0.8rem; color: #666;">combined value</div>
                    </div>
                </div>
                
                <!-- Additional Stats -->
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1.5rem;">
                    <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 1.25rem; border: 1px solid #333; transition: transform 0.3s ease, box-shadow 0.3s ease;">
                        <h5 style="color: #9e9e9e; font-size: 0.8rem; text-transform: uppercase; margin: 0 0 0.5rem;">Market Cap (Circulating)</h5>
                        <div style="font-size: 1.2rem; font-weight: 600; color: #ffffff;">$${marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div style="font-size: 0.8rem; color: #666; margin-top: 0.5rem;">${circulatingSupply.toLocaleString()} of ${totalSupply.toLocaleString()} VTRU</div>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 1.25rem; border: 1px solid #333; transition: transform 0.3s ease, box-shadow 0.3s ease;">
                        <h5 style="color: #9e9e9e; font-size: 0.8rem; text-transform: uppercase; margin: 0 0 0.5rem;">Price Stats</h5>
                        <table style="width: 100%; font-size: 0.9rem; border-spacing: 0;">
                            <tr>
                                <td style="color: #9e9e9e; padding: 0.15rem 0;">VTRU:USDC:</td>
                                <td style="color: #ffffff; text-align: right; font-weight: 500;">1:${lpData.rate.toFixed(4)}</td>
                            </tr>
                            <tr>
                                <td style="color: #9e9e9e; padding: 0.15rem 0;">USDC:VTRU:</td>
                                <td style="color: #ffffff; text-align: right; font-weight: 500;">${(1 / lpData.rate).toFixed(2)}:1</td>
                            </tr>
                        </table>
                    </div>
                </div>
                
                <!-- Info Box -->
                <div style="background: linear-gradient(145deg, rgba(138, 101, 255, 0.05) 0%, rgba(39, 117, 202, 0.05) 100%); border-radius: 12px; padding: 1.25rem; font-size: 0.9rem; color: #b0b0b0; margin-top: 1rem; border: 1px solid rgba(138, 101, 255, 0.2);">
                    <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
                        <div style="color: #8a65ff; margin-top: 0.1rem; flex-shrink: 0;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="16" x2="12" y2="12"></line>
                                <line x1="12" y1="8" x2="12.01" y2="8"></line>
                            </svg>
                        </div>
                        <div>
                            <p style="margin-top: 0; margin-bottom: 0.75rem;">The exchange rate is calculated from the VTRU/USDC liquidity pool. This rate is used to calculate USDC equivalents for all VTRU prices in the marketplace.</p>
                            <p style="margin: 0; font-style: italic; font-size: 0.8rem; color: #777; text-align: right;">Last updated: ${new Date().toLocaleTimeString()}</p>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 6. Replace the modal content
        modalBody.innerHTML = newContent;

        // 7. Update the ticker in header
        const tickerElement = document.getElementById('tickerExchangeRate');
        const lastUpdatedElement = document.getElementById('tickerLastUpdated');
        if (tickerElement) tickerElement.textContent = lpData.rate.toFixed(6);
        if (lastUpdatedElement) lastUpdatedElement.textContent = new Date().toLocaleTimeString();

        // 8. Add animation styles if they don't exist
        if (!document.getElementById('enhanced-exchange-rate-styles')) {
            const style = document.createElement('style');
            style.id = 'enhanced-exchange-rate-styles';
            style.textContent = `
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                .modal-body > div > div:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 8px 20px rgba(0,0,0,0.2) !important;
                }
            `;
            document.head.appendChild(style);
        }

        console.log("Enhanced exchange rate modal updated successfully");
    } catch (error) {
        console.error("Error updating exchange rate modal:", error);

        // Show error message
        const modalBody = document.querySelector('#exchangeRateModal .modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <div style="text-align: center; padding: 2rem;">
                    <svg viewBox="0 0 24 24" width="64" height="64" stroke="#ef4444" fill="none" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h2 style="color: #ef4444; margin: 1rem 0;">Error Loading Data</h2>
                    <p style="color: #b0b0b0; margin-bottom: 1rem;">${error.message}</p>
                    <button onclick="window.refreshExchangeRateDetails()" 
                        style="background: linear-gradient(135deg, #8a65ff, #7067CF); color: white; border: none; 
                        padding: 0.75rem 1.5rem; border-radius: 8px; cursor: pointer; font-weight: 500;
                        transition: all 0.3s ease; box-shadow: 0 4px 12px rgba(138, 101, 255, 0.25);">
                        Try Again
                    </button>
                </div>
            `;
        } else {
            alert("Error: " + error.message);
        }
    }
};

// Also replace the show modal function to make sure it works
window.showExchangeRateDetails = function () {
    console.log("Opening exchange rate modal (emergency override)");
    const modal = document.getElementById('exchangeRateModal');
    if (modal) {
        modal.classList.add('active');

        // Add a slight delay before refreshing
        setTimeout(() => {
            window.refreshExchangeRateDetails();
        }, 100);
    } else {
        alert("Error: Exchange rate modal not found");
    }
};


// Add this function near your other LP-related functions
async function getLpDetails() {
    console.log("Fetching LP details - starting");
    try {
        // Contract addresses
        const LP_ADDRESS = "0x8B3808260a058ECfFA9b1d0eaA988A1b4167DDba";

        // Create contract instance with more complete ABI
        const lpContract = new ethers.Contract(LP_ADDRESS, [
            "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
            "function token0() view returns (address)",
            "function token1() view returns (address)"
        ], provider);

        console.log("LP Contract created, getting token addresses");

        // Get token addresses with timeout
        const token0Promise = lpContract.token0();
        const token1Promise = lpContract.token1();

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Request timed out after 5 seconds")), 5000)
        );

        // Race the contract calls with timeout
        const token0 = await Promise.race([token0Promise, timeoutPromise]);
        const token1 = await Promise.race([token1Promise, timeoutPromise]);

        console.log("Token addresses retrieved:", { token0, token1, USDC_ADDRESS });

        // Get reserves with timeout
        const reservesPromise = lpContract.getReserves();
        const reserves = await Promise.race([reservesPromise, timeoutPromise]);
        console.log("Reserves retrieved:", reserves);

        // Check if token0 is USDC
        const isToken0Usdc = token0.toLowerCase() === USDC_ADDRESS.toLowerCase();
        console.log("Is token0 USDC:", isToken0Usdc);

        // Get reserve values
        const vtruReserve = parseFloat(ethers.formatEther(isToken0Usdc ? reserves[1] : reserves[0]));
        const usdcReserve = parseFloat(ethers.formatUnits(isToken0Usdc ? reserves[0] : reserves[1], 6));
        console.log("Parsed reserves:", { vtruReserve, usdcReserve });

        // Validate reserve values
        if (isNaN(vtruReserve) || isNaN(usdcReserve) || vtruReserve <= 0) {
            throw new Error("Invalid reserve values: " + JSON.stringify({ vtruReserve, usdcReserve }));
        }

        // Calculate rate and total value
        const rate = usdcReserve / vtruReserve;
        const totalValue = usdcReserve + (vtruReserve * rate);

        console.log("LP data calculation successful:", { rate, totalValue });

        return {
            vtruReserve,
            usdcReserve,
            rate,
            totalValue,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error("Error in getLpDetails:", error);
        throw new Error("Failed to get LP data: " + error.message);
    }
}

// Update function to refresh just the ticker in the header
window.updateExchangeRateTicker = async function () {
    try {
        const data = await getLpDetails();
        if (data && data.rate > 0) {
            document.getElementById('tickerExchangeRate').textContent = data.rate.toFixed(6);
            document.getElementById('tickerLastUpdated').textContent = new Date().toLocaleTimeString();
        }
    } catch (error) {
        console.error("Error updating ticker:", error);
    }
};

// Modify the calculateMarketplaceStats function to include price conversion
async function calculateMarketplaceStats() {
    try {
        console.log("Calculating marketplace stats from blockchain data");

        // Get VTRU/USDC price for volume conversion
        const vtruPriceInUsdc = await getVtruUsdcPrice();

        // Get all listings directly from the contract
        const listings = await marketplace.getListings();
        console.log(`Raw listings from contract:`, listings);

        // Filter for active listings only
        const activeListings = listings.filter(listing => listing.active);
        const activeListingCount = activeListings.length;
        console.log(`Found ${activeListingCount} active listings`);

        // Track floor prices by currency type
        let lowestNativeListing = null;
        let lowestUSDCListing = null;

        // Track if we found any listings by currency
        let hasNativeListings = false;
        let hasUSDCListings = false;

        // Process each active listing
        for (const listing of activeListings) {
            const price = listing.price;
            const tokenId = listing.tokenId;
            const currency = listing.currency;
            const isNative = currency === ethers.ZeroAddress;

            // Format the price for display in logs
            const formattedPrice = isNative
                ? ethers.formatEther(price) + " VTRU"
                : ethers.formatUnits(price, 6) + " USDC";

            console.log(`Listing: Token #${tokenId} - ${formattedPrice} - Currency: ${isNative ? "Native VTRU" : "USDC"}`);

            if (isNative) {
                hasNativeListings = true;
                if (lowestNativeListing === null || price < lowestNativeListing.price) {
                    lowestNativeListing = listing;
                }
            } else if (currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                hasUSDCListings = true;
                if (lowestUSDCListing === null || price < lowestUSDCListing.price) {
                    lowestUSDCListing = listing;
                }
            }
        }

        console.log(`Has native listings: ${hasNativeListings}, Has USDC listings: ${hasUSDCListings}`);

        // Determine the absolute floor price by comparing both currencies
        let floorPrice = null;
        let floorPriceCurrency = null;
        let floorPriceTokenId = null;

        // Get lowest VTRU price if available
        let nativeFloorPriceUSD = Infinity;
        if (lowestNativeListing) {
            const nativePrice = parseFloat(ethers.formatEther(lowestNativeListing.price));
            // Convert VTRU to USDC equivalent for comparison
            nativeFloorPriceUSD = nativePrice * vtruPriceInUsdc;
            console.log(`Lowest native price: ${nativePrice} VTRU (≈$${nativeFloorPriceUSD.toFixed(2)} USDC equiv.)`);
        }

        // Get lowest USDC price if available
        let usdcFloorPriceUSD = Infinity;
        if (lowestUSDCListing) {
            const usdcPrice = parseFloat(ethers.formatUnits(lowestUSDCListing.price, 6));
            usdcFloorPriceUSD = usdcPrice; // USDC is already USD equivalent
            console.log(`Lowest USDC price: ${usdcPrice} USDC`);
        }

        // Choose the lowest price as the floor price based on USD equivalent
        if (usdcFloorPriceUSD <= nativeFloorPriceUSD && lowestUSDCListing) {
            floorPrice = parseFloat(ethers.formatUnits(lowestUSDCListing.price, 6));
            floorPriceCurrency = 'USDC';
            floorPriceTokenId = lowestUSDCListing.tokenId;
            console.log(`USDC is the floor price: ${floorPrice} ${floorPriceCurrency}`);
        } else if (lowestNativeListing) {
            floorPrice = parseFloat(ethers.formatEther(lowestNativeListing.price));
            floorPriceCurrency = 'VTRU';
            floorPriceTokenId = lowestNativeListing.tokenId;
            console.log(`VTRU is the floor price: ${floorPrice} ${floorPriceCurrency}`);
        }

        // Get sales data by querying past events
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 100000); // Look back ~2 weeks

        const soldFilter = marketplace.filters.ItemSold();
        const soldEvents = await marketplace.queryFilter(soldFilter, fromBlock, 'latest');

        console.log(`Found ${soldEvents.length} sales events`);

        // Calculate total sales and volume
        const totalSalesCount = soldEvents.length;

        let totalVolumeNative = BigInt(0);
        let totalVolumeUSDC = BigInt(0);

        for (const event of soldEvents) {
            if (event.args) {
                const price = event.args.price;
                const currency = event.args.currency;

                if (currency === ethers.ZeroAddress) {
                    totalVolumeNative += price;
                } else if (currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                    totalVolumeUSDC += price;
                }
            }
        }

        // Convert volumes to human-readable format
        const volumeNative = parseFloat(ethers.formatEther(totalVolumeNative));
        const volumeUSDC = parseFloat(ethers.formatUnits(totalVolumeUSDC, 6));

        // Calculate total volume in USDC equivalent
        const nativeVolumeInUsdc = volumeNative * vtruPriceInUsdc;
        const totalVolumeInUsdc = nativeVolumeInUsdc + volumeUSDC;

        console.log(`Native volume: ${volumeNative} VTRU (≈${nativeVolumeInUsdc.toFixed(2)} USDC)`);
        console.log(`USDC volume: ${volumeUSDC} USDC`);
        console.log(`Combined volume: ≈${totalVolumeInUsdc.toFixed(2)} USDC`);

        // Construct stats object with all real data
        const stats = {
            totalVolume: volumeNative,
            volumeUSDC: volumeUSDC,
            totalVolumeInUsdc: totalVolumeInUsdc,
            vtruPriceInUsdc: vtruPriceInUsdc,
            activeListings: activeListingCount,
            floorPrice: floorPrice,
            floorPriceCurrency: floorPriceCurrency,
            floorPriceTokenId: floorPriceTokenId,
            totalSales: totalSalesCount,
            hasNativeListings: hasNativeListings,
            hasUSDCListings: hasUSDCListings
        };

        console.log("Final marketplace stats:", stats);

        // Update the UI with real data
        if (window.updateMarketplaceStats) {
            window.updateMarketplaceStats(stats);
        }

        return stats;
    } catch (error) {
        console.error("Error querying blockchain for marketplace stats:", error);
        return {
            totalVolume: 0,
            volumeUSDC: 0,
            totalVolumeInUsdc: 0,
            vtruPriceInUsdc: 0.1, // Fallback price
            activeListings: 0,
            floorPrice: null,
            floorPriceCurrency: null,
            floorPriceTokenId: null,
            totalSales: 0,
            hasNativeListings: false,
            hasUSDCListings: false
        };
    }
}


// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);