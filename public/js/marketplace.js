import { RPC_URL, CONTRACT_ADDRESS, NFT_ABI, USDC_ADDRESS, USDC_ABI } from './config.js';

// Constants
const MARKETPLACE_ADDRESS = "0x0191A91B7F7E8c9E97bDB8566D0AAEbc48A81187";
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

// Load all marketplace listings
async function loadListings() {
    try {
        listingsLoading.style.display = 'flex';
        listingsGrid.innerHTML = '';

        allListings = await marketplace.getListings();

        // Filter out inactive listings
        allListings = allListings.filter(listing => listing.active);

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

// Apply filters and sorting to listings
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

    // Render the filtered and sorted listings
    await renderListings(filteredListings);
}

// Render marketplace listings
async function renderListings(listings) {
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

        // Calculate fees
        const price = parseFloat(formattedPrice);
        const platformFee = price * 0.025; // 2.5% platform fee
        const gasFee = 0.001; // Estimated gas fee
        const totalCost = price + platformFee + gasFee;

        const card = document.createElement('div');
        card.className = 'listing-card';
        card.dataset.tokenId = tokenId;

        card.innerHTML = `
            <div class="rarity-badge ${token.rarity}">${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</div>
            <img src="${token.image}" class="listing-image" alt="${token.name}" onerror="this.src='assets/detailed_ninja_cat_64.png'">
            <div class="listing-info">
                <h3 class="listing-name">${token.name}</h3>
                <div class="listing-breed">${token.breed}</div>
                <div class="listing-seller">Seller: ${shortenAddress(sellerAddress)}</div>
                <div class="listing-price">
                    ${formattedPrice} <span class="listing-price-currency">${currencyName}</span>
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
                            Gas (est.)
                            <span class="tooltiptext">Estimated network fee for processing your transaction</span>
                        </span>
                        <span>${gasFee.toFixed(4)} ${currencyName}</span>
                    </div>
                    <div class="total-price">
                        <span>Total Cost:</span>
                        <span>${totalCost.toFixed(4)} ${currencyName}</span>
                    </div>
                </div>
                
                <div class="listing-actions">
                    <button class="buy-btn" data-token-id="${tokenId}">
                        Buy Now
                    </button>
                </div>
            </div>
        `;

        // Add buy button event listener
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
                currencyAddress: listing.currency
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

        listingsGrid.appendChild(card);
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

        // Filter for user's active listings
        const userListings = userActiveListings;

        if (userListings.length === 0) {
            noUserListings.style.display = 'block';
            return;
        }

        noUserListings.style.display = 'none';

        for (const tokenId of userListings) {
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
        const savedAddress = localStorage.getItem('ninja_cats_wallet');
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

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);