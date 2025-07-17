import { RPC_URL, CONTRACT_ADDRESS, NFT_ABI, USDC_ADDRESS, USDC_ABI } from './config.js';
import { getFavorites, toggleFavorite, savePreferences, loadPreferences, subscribeToListings, getActiveListings } from './supabaseClient.js';
import { getCurrentWalletAddress, addConnectionListener, removeConnectionListener } from './walletConnector.js';
import { logListingView, logFavoriteAction, logPurchase, logListingCreated, logListingCancelled, logMarketplaceView, logFilterApplied } from './activityLogger.js';
import WatchlistComponent from '../components/WatchlistComponent.js';
import SettingsComponent from '../components/SettingsComponent.js';

// Constants
const MARKETPLACE_ADDRESS = '0x5031fc07293d574Ccbd4d12b0E7106A95502a299';
const MARKETPLACE_ABI = [
    'function createListing(uint256 tokenId, uint256 price, address currency) external',
    'function cancelListing(uint256 tokenId) external',
    'function buyItem(uint256 tokenId) external payable',
    'function buyItemWithERC20(uint256 tokenId) external',
    'function getListings() view returns (tuple(uint256 tokenId, address seller, uint256 price, address currency, bool active)[])',
    'function getListing(uint256 tokenId) view returns (tuple(uint256 tokenId, address seller, uint256 price, address currency, bool active))',
    'event ListingCreated(uint256 indexed tokenId, address indexed seller, uint256 price, address currency)',
    'event ListingCancelled(uint256 indexed tokenId)',
    'event ItemSold(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price, address currency)'
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
const tabIndicator = document.querySelector('.tab-indicator');
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
const scrollTopBtn = document.getElementById('scrollTopBtn');
const quickPreviewModal = document.getElementById('quickPreview');
const notificationSystem = document.getElementById('notificationSystem');

// State
let currentAccount = null;
let selectedCatForListing = null;
let marketplace = null;
let nft = null;
let usdc = null;
let allListings = [];
let userCats = [];
let userActiveListings = [];
let hotItems = []; // Store the hottest items based on activity
const rarityFloorPrices = {}; // Track floor prices by rarity
let allListingsForPreview = []; // Store all listings for preview navigation
let currentPreviewIndex = 0;
let favorites = []; // Will be loaded from Supabase
let hotItemsCarouselIndex = 0;

// Token cache to avoid refetching metadata
const tokenCache = {};

// Show notification toast - enhanced version
function showToast(message, type = 'info') {
    // Call both the legacy toast and the enhanced notification system
    showLegacyToast(message, type);
    showEnhancedNotification(getNotificationTitle(type), message, type);
}

// Legacy toast function for backward compatibility
function showLegacyToast(message, type = 'info') {
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

// Enhanced notification system
function showEnhancedNotification(title, message, type = 'info') {
    if (!notificationSystem) return; // Safety check

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    let iconSvg = '';

    switch (type) {
        case 'success':
            iconSvg = '<svg width="24" height="24" fill="none" stroke="#10b981" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
            break;
        case 'error':
            iconSvg = '<svg width="24" height="24" fill="none" stroke="#ef4444" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
            break;
        default:
            iconSvg = '<svg width="24" height="24" fill="none" stroke="#3b82f6" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    notification.innerHTML = `
        <div class="notification-icon">${iconSvg}</div>
        <div class="notification-content">
            <div class="notification-title">${title}</div>
            <div class="notification-message">${message}</div>
        </div>
    `;

    notificationSystem.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after a delay
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => notification.remove(), 400);
    }, 5000);
}

// Helper function to get title for notifications
function getNotificationTitle(type) {
    switch (type) {
        case 'success': return 'Success';
        case 'error': return 'Error';
        case 'info': return 'Information';
        default: return 'Notification';
    }
}

// Enhanced quick preview modal with navigation and favorites
async function showQuickPreview(token, listing = null) {
    const previewImage = document.getElementById('previewImage');
    const previewDetails = document.getElementById('previewDetails');
    const previewCurrent = document.getElementById('previewCurrent');
    const previewTotal = document.getElementById('previewTotal');
    const favoriteBtn = document.getElementById('favoriteBtn');

    if (!previewImage || !previewDetails || !token) return;

    // Set up preview data for navigation
    if (listing) {
        allListingsForPreview = allListings.filter(l => l.active);
        currentPreviewIndex = allListingsForPreview.findIndex(l =>
            Number(l.tokenId) === Number(token.id));

        if (currentPreviewIndex === -1) currentPreviewIndex = 0;
    } else {
        allListingsForPreview = [];
        currentPreviewIndex = 0;
    }

    // Update navigation state
    updatePreviewNavigation();

    previewImage.src = token.image;

    // Check if item is favorited
    const isFavorited = isTokenFavorited(token.id);
    updateFavoriteButton(isFavorited);

    // Log the listing view
    await logListingView(token.id, {
        price: listing?.price,
        currency: listing?.currency,
        seller: listing?.seller,
        rarity: token.rarity
    });

    // Prepare pricing information if available
    let pricingHtml = '';
    if (listing) {
        const formattedPrice = formatPrice(listing.price, listing.currency);
        const currencyName = getCurrencyName(listing.currency);

        pricingHtml = `
            <div class="listing-price" style="margin: 1.5rem 0; font-size: 1.6rem;">
                ${formattedPrice} <span class="listing-price-currency">${currencyName}</span>
            </div>
        `;
    }

    // Prepare HTML for the details panel
    previewDetails.innerHTML = `
        <h2 style="margin-top: 0; color: white; font-size: 1.8rem;">${token.name}</h2>
        <div class="token-details">
            <div style="display: inline-block; padding: 4px 12px; background: rgba(138, 101, 255, 0.15); 
                 color: #8a65ff; border-radius: 20px; font-size: 0.9rem; margin-bottom: 1rem; border: 1px solid rgba(138, 101, 255, 0.3);">
                ${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}
            </div>
            
            <div style="margin-bottom: 1.5rem;">
                <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                    <span style="width: 100px; color: var(--text-muted);">Breed:</span>
                    <span style="color: white; font-weight: 500;">${token.breed}</span>
                </div>
                <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                    <span style="width: 100px; color: var(--text-muted);">Token ID:</span>
                    <span style="color: white; font-weight: 500;">#${token.id}</span>
                </div>
                ${listing ? `
                <div style="display: flex; align-items: center; margin-bottom: 0.5rem;">
                    <span style="width: 100px; color: var(--text-muted);">Seller:</span>
                    <span style="color: white; font-weight: 500;">${shortenAddress(listing.seller)}</span>
                </div>` : ''}
            </div>
            
            ${pricingHtml}
            
            ${token.metadata.attributes ? `
            <h3 style="margin: 1.5rem 0 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem;">Attributes</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 0.75rem;">
                ${token.metadata.attributes.map(attr => `
                    <div style="background: rgba(255,255,255,0.05); border-radius: 8px; padding: 0.75rem; text-align: center; border: 1px solid rgba(255,255,255,0.08);">
                        <div style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.25rem;">${attr.trait_type}</div>
                        <div style="color: white; font-weight: 500; font-size: 0.95rem;">${attr.value}</div>
                    </div>
                `).join('')}
            </div>` : ''}
            
            ${listing ? `
            <div style="margin-top: 2rem; text-align: right;">
                <button id="quickPreviewBuyBtn" class="btn primary-btn" style="padding: 0.75rem 2rem;">
                    Purchase Now
                </button>
            </div>` : ''}
        </div>
    `;

    // Add buy button functionality if this is a listing
    if (listing) {
        setTimeout(() => {
            const buyBtn = document.getElementById('quickPreviewBuyBtn');
            if (buyBtn) {
                buyBtn.addEventListener('click', () => {
                    // Close the preview modal
                    quickPreviewModal.classList.remove('active');

                    // Prepare listing data for purchase modal
                    const listingData = {
                        id: token.id,
                        name: token.name,
                        image: token.image,
                        breed: token.breed,
                        seller: listing.seller,
                        price: formatPrice(listing.price, listing.currency),
                        rawPrice: listing.price.toString(),
                        currency: getCurrencyName(listing.currency),
                        currencyAddress: listing.currency
                    };

                    // Show the purchase modal
                    if (window.showPurchaseModal) {
                        window.showPurchaseModal(listingData);
                    }
                });
            }
        }, 100);
    }

    // Show the modal
    quickPreviewModal.classList.add('active');
}

// Update preview navigation
function updatePreviewNavigation() {
    const previewCurrent = document.getElementById('previewCurrent');
    const previewTotal = document.getElementById('previewTotal');
    const prevBtn = document.getElementById('prevPreviewBtn');
    const nextBtn = document.getElementById('nextPreviewBtn');

    if (previewCurrent && previewTotal) {
        previewCurrent.textContent = currentPreviewIndex + 1;
        previewTotal.textContent = allListingsForPreview.length;
    }

    if (prevBtn && nextBtn) {
        prevBtn.disabled = currentPreviewIndex === 0;
        nextBtn.disabled = currentPreviewIndex >= allListingsForPreview.length - 1;
    }
}

// Navigate to previous item in preview
async function navigatePreview(direction) {
    if (allListingsForPreview.length === 0) return;

    const newIndex = direction === 'prev' ?
        Math.max(0, currentPreviewIndex - 1) :
        Math.min(allListingsForPreview.length - 1, currentPreviewIndex + 1);

    if (newIndex !== currentPreviewIndex) {
        currentPreviewIndex = newIndex;
        const listing = allListingsForPreview[currentPreviewIndex];
        const token = await fetchTokenMetadata(Number(listing.tokenId));

        if (token) {
            showQuickPreview(token, {
                price: listing.price,
                currency: listing.currency,
                seller: listing.seller
            });
        }
    }
}

// Update favorite button state
function updateFavoriteButton(isFavorited) {
    const favoriteBtn = document.getElementById('favoriteBtn');
    if (!favoriteBtn) return;

    const span = favoriteBtn.querySelector('span');
    if (isFavorited) {
        favoriteBtn.classList.add('favorited');
        if (span) span.textContent = 'Remove from Favorites';
    } else {
        favoriteBtn.classList.remove('favorited');
        if (span) span.textContent = 'Add to Favorites';
    }
}



// Share functionality
function shareItem(token) {
    const shareData = {
        title: token.name,
        text: `Check out this ${token.rarity} ${token.breed} NFT!`,
        url: window.location.href + `?token=${token.id}`
    };

    if (navigator.share) {
        navigator.share(shareData);
    } else {
        // Fallback: copy to clipboard
        navigator.clipboard.writeText(shareData.url).then(() => {
            showEnhancedNotification('Link Copied', 'Share link copied to clipboard', 'success');
        }).catch(() => {
            showEnhancedNotification('Share Failed', 'Could not copy link to clipboard', 'error');
        });
    }
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

// Load favorites from Supabase
async function loadFavorites() {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) {
            favorites = [];
            return;
        }

        favorites = await getFavorites(walletAddress);
        console.log(`Loaded ${favorites.length} favorites from Supabase`);
    } catch (error) {
        console.error('Error loading favorites:', error);
        favorites = [];
    }
}

// Toggle favorite status with Supabase
async function toggleFavoriteStatus(tokenId) {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) {
            showToast('Please connect your wallet to manage favorites', 'error');
            return;
        }

        const result = await toggleFavorite(walletAddress, tokenId);

        if (result.action === 'added') {
            favorites.push(tokenId);
            showEnhancedNotification('Added to Favorites', 'Item added to your favorites list', 'success');

            // Log activity
            await logFavoriteAction(tokenId, 'add');
        } else {
            favorites = favorites.filter(id => id !== tokenId);
            showEnhancedNotification('Removed from Favorites', 'Item removed from your favorites list', 'info');

            // Log activity
            await logFavoriteAction(tokenId, 'remove');
        }

        // Update button state
        updateFavoriteButton(favorites.includes(tokenId));

    } catch (error) {
        console.error('Error toggling favorite:', error);
        showToast('Error updating favorites. Please try again.', 'error');
    }
}

// Check if token is favorited
function isTokenFavorited(tokenId) {
    return favorites.includes(tokenId);
}

// Handle wallet connection changes
async function handleWalletConnectionChange(walletAddress) {
    if (walletAddress) {
        // Wallet connected - load user data
        await loadFavorites();
        await loadUserPreferences();

        // Update UI
        if (walletPrompt) walletPrompt.style.display = 'none';
        if (sellContent) sellContent.style.display = 'block';

        // Initialize contracts and load user data
        if (browserProvider) {
            try {
                const signer = await browserProvider.getSigner();
                await initContractsWithSigner(signer);
                await loadUserCats();
                await loadUserListings();
            } catch (err) {
                console.error('Error getting signer:', err);
            }
        }
    } else {
        // Wallet disconnected - clear user data
        favorites = [];
        currentAccount = null;

        // Update UI
        if (walletPrompt) walletPrompt.style.display = 'block';
        if (sellContent) sellContent.style.display = 'none';
    }
}

// Load user preferences from Supabase
async function loadUserPreferences() {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) return;

        const preferences = await loadPreferences(walletAddress);

        // Apply saved filters
        if (preferences.filters && Object.keys(preferences.filters).length > 0) {
            applySavedFilters(preferences.filters);
        }

        // Apply theme
        if (preferences.theme && preferences.theme !== 'dark') {
            document.body.classList.add(`theme-${preferences.theme}`);
        }

        console.log('User preferences loaded:', preferences);
    } catch (error) {
        console.error('Error loading user preferences:', error);
    }
}

// Apply saved filters to the UI
function applySavedFilters(filters) {
    try {
        if (filters.currency && currencyFilter) {
            currencyFilter.value = filters.currency;
        }

        if (filters.sort && sortListings) {
            sortListings.value = filters.sort;
        }

        // Apply filters and refresh listings
        applyListingFiltersAndSort();
    } catch (error) {
        console.error('Error applying saved filters:', error);
    }
}

// Save current filters as user preferences
async function saveCurrentFilters() {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) return;

        const currentFilters = {
            currency: currencyFilter ? currencyFilter.value : 'all',
            sort: sortListings ? sortListings.value : 'newest'
        };

        const preferences = await loadPreferences(walletAddress);
        preferences.filters = currentFilters;

        await savePreferences(walletAddress, preferences);

        // Log activity
        await logFilterApplied('batch', currentFilters);
    } catch (error) {
        console.error('Error saving filters:', error);
    }
}
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
        console.error('Error estimating gas fee:', error);
        return '0.001'; // Fallback estimate
    }
}

// Initialize contracts with signer
async function initContractsWithSigner(signer) {
    if (!signer) {
        console.error('No signer provided');
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
        let breed = 'Ninja Cat';
        if (metadata.attributes && metadata.attributes.length) {
            const breedAttr = metadata.attributes.find(attr => attr.trait_type === 'Breed');
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
            console.error('Error updating marketplace stats:', err);
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
        console.error('Error loading marketplace listings:', error);
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

    // Update hot items collection - pick top 3 from newest listings
    updateHotItems(filteredListings.slice(0, 3));
}

// Update hot items collection for the banner
function updateHotItems(items) {
    hotItems = items;
    renderHotItemsCarousel();
}

// Render hot items carousel
async function renderHotItemsCarousel() {
    const carousel = document.getElementById('hotlistCarousel');
    const hotItemCount = document.getElementById('hotItemCount');

    if (!carousel || !hotItems.length) return;

    // Update count
    if (hotItemCount) {
        hotItemCount.textContent = hotItems.length;
    }

    // Clear existing items
    carousel.innerHTML = '';

    // Create carousel items
    for (const listing of hotItems) {
        const tokenId = Number(listing.tokenId);
        const token = await fetchTokenMetadata(tokenId);

        if (!token) continue;

        const formattedPrice = formatPrice(listing.price, listing.currency);
        const currencyName = getCurrencyName(listing.currency);

        const hotItem = document.createElement('div');
        hotItem.className = 'hotlist-item';
        hotItem.innerHTML = `
            <div class="hotlist-item-trending">🔥 Hot</div>
            <img src="${token.image}" alt="${token.name}" class="hotlist-item-image" onerror="this.src='assets/detailed_ninja_cat_64.png'">
            <div class="hotlist-item-name">${token.name}</div>
            <div class="hotlist-item-price">${formattedPrice} ${currencyName}</div>
        `;

        // Add click handler to show preview
        hotItem.addEventListener('click', () => {
            showQuickPreview(token, {
                price: listing.price,
                currency: listing.currency,
                seller: listing.seller
            });
        });

        carousel.appendChild(hotItem);
    }

    // Setup carousel navigation
    setupHotItemsCarouselNavigation();
}

// Setup hot items carousel navigation
function setupHotItemsCarouselNavigation() {
    const prevBtn = document.getElementById('hotlistPrev');
    const nextBtn = document.getElementById('hotlistNext');
    const carousel = document.getElementById('hotlistCarousel');

    if (!prevBtn || !nextBtn || !carousel) return;

    prevBtn.addEventListener('click', () => {
        hotItemsCarouselIndex = Math.max(0, hotItemsCarouselIndex - 1);
        updateCarouselPosition();
    });

    nextBtn.addEventListener('click', () => {
        const maxIndex = Math.max(0, hotItems.length - 3);
        hotItemsCarouselIndex = Math.min(maxIndex, hotItemsCarouselIndex + 1);
        updateCarouselPosition();
    });

    function updateCarouselPosition() {
        const itemWidth = 200 + 24; // item width + gap
        const scrollLeft = hotItemsCarouselIndex * itemWidth;
        carousel.scrollTo({ left: scrollLeft, behavior: 'smooth' });

        // Update button states
        prevBtn.disabled = hotItemsCarouselIndex === 0;
        nextBtn.disabled = hotItemsCarouselIndex >= hotItems.length - 3;
    }

    // Initial state
    updateCarouselPosition();
}

// Update renderListings to include cancel button for owner's listings and support for the quick preview
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
            <div class="card-shine"></div>
            <div class="listing-image-container">
                <img src="${token.image}" class="listing-image" alt="${token.name}" onerror="this.src='assets/detailed_ninja_cat_64.png'">
            </div>
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

        // Add click handler for the entire card to open the quick preview
        card.addEventListener('click', (e) => {
            // Don't trigger if the click was on a button
            if (!e.target.closest('button')) {
                showQuickPreview(token, {
                    price: listing.price,
                    currency: listing.currency,
                    seller: sellerAddress
                });
            }
        });

        // Add appropriate button event listener
        if (isOwner) {
            const cancelBtn = card.querySelector('.cancel-btn');
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click
                cancelListing(tokenId);
            });
        } else {
            const buyBtn = card.querySelector('.buy-btn');
            buyBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // Prevent card click

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
}

// Load user's cats with enhanced UI
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

        // Render each available cat with lazy loading
        for (const tokenId of availableCats) {
            const token = await fetchTokenMetadata(tokenId);
            if (!token) continue;

            const card = document.createElement('div');
            card.className = 'listing-card';
            card.dataset.tokenId = tokenId;

            card.innerHTML = `
                <div class="rarity-badge ${token.rarity}">${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</div>
                <div class="card-shine"></div>
                <div class="listing-image-container">
                    <img data-src="${token.image}" class="listing-image lazy" alt="${token.name}" 
                         src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='280' height='280'%3E%3Crect width='100%25' height='100%25' fill='%23333'/%3E%3C/svg%3E"
                         onerror="this.src='assets/detailed_ninja_cat_64.png'">
                </div>
                <div class="listing-info">
                    <h3 class="listing-name">${token.name}</h3>
                    <div class="listing-breed">${token.breed}</div>
                    <div>Token ID: #${tokenId}</div>
                    <div class="listing-actions">
                        <button class="list-btn">List for Sale</button>
                    </div>
                </div>
            `;

            // Add click handler for the entire card to open the quick preview
            card.addEventListener('click', (e) => {
                if (!e.target.closest('button')) {
                    showQuickPreview(token);
                }
            });

            // Add list button event listener
            const listBtn = card.querySelector('.list-btn');
            listBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showListingForm(token);
            });

            userCatsGrid.appendChild(card);
        }

        // Setup lazy loading for new images
        setupLazyLoading();

        // Update collection value
        updateCollectionValueDisplay();

        userCatsLoading.style.display = 'none';

        // Update wallet display
        if (document.getElementById('walletAddress')) {
            document.getElementById('walletAddress').textContent = shortenAddress(currentAccount);
        }

    } catch (error) {
        console.error('Error loading user cats:', error);
        userCatsLoading.style.display = 'none';
        userCatsCount.textContent = `Error loading your cats: ${error.message}`;
        showToast(`Error loading your cats: ${error.message}`, 'error');
    }
}

// Load user's active listings with enhanced UI
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

        // Get the latest VTRU/USDC price for display
        const vtruPriceInUsdc = await getVtruUsdcPrice();

        // Render each listing
        for (const tokenId of userActiveListings) {
            const listing = await marketplace.getListing(tokenId);
            const token = await fetchTokenMetadata(tokenId);

            if (!token) continue;

            const formattedPrice = formatPrice(listing.price, listing.currency);
            const currencyName = getCurrencyName(listing.currency);
            const isNativeCurrency = listing.currency === ethers.ZeroAddress;

            // Calculate USDC equivalent if this is a VTRU listing
            let usdcEquivalent = '';
            if (isNativeCurrency && vtruPriceInUsdc > 0) {
                const price = parseFloat(formattedPrice);
                const priceInUsdc = price * vtruPriceInUsdc;
                usdcEquivalent = `<div class="usdc-equivalent">≈ ${priceInUsdc.toFixed(2)} USDC</div>`;
            }

            const card = document.createElement('div');
            card.className = 'listing-card';
            card.dataset.tokenId = tokenId;

            card.innerHTML = `
                <div class="rarity-badge ${token.rarity}">${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</div>
                <div class="card-shine"></div>
                <div class="listing-image-container">
                    <img src="${token.image}" class="listing-image" alt="${token.name}" onerror="this.src='assets/detailed_ninja_cat_64.png'">
                </div>
                <div class="listing-info">
                    <h3 class="listing-name">${token.name}</h3>
                    <div class="listing-breed">${token.breed}</div>
                    <div>Token ID: #${tokenId}</div>
                    <div class="listing-price">
                        ${formattedPrice} <span class="listing-price-currency">${currencyName}</span>
                        ${usdcEquivalent}
                    </div>
                    <div class="listing-actions">
                        <button class="cancel-btn">Cancel Listing</button>
                    </div>
                </div>
            `;

            // Add click handler for the entire card to open the quick preview
            card.addEventListener('click', (e) => {
                // Don't trigger if the click was on a button
                if (!e.target.closest('button')) {
                    showQuickPreview(token, {
                        price: listing.price,
                        currency: listing.currency,
                        seller: listing.seller
                    });
                }
            });

            // Add cancel button event listener
            const cancelBtn = card.querySelector('.cancel-btn');
            cancelBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card click
                cancelListing(tokenId);
            });

            userListingsGrid.appendChild(card);
        }
    } catch (error) {
        console.error('Error loading user listings:', error);
        showToast(`Error loading your listings: ${error.message}`, 'error');
    }
}

// Set up event listeners for the listing form modal
function setupListingFormModal() {
    const listingFormModal = document.getElementById('listingFormModal');
    const closeBtn = document.getElementById('closeListingFormBtn');
    const confirmBtn = document.getElementById('confirmListingBtn');
    const cancelBtn = document.getElementById('cancelListingForm');

    // Close button in header
    if (closeBtn) {
        closeBtn.addEventListener('click', hideListingForm);
    }

    // Cancel button in footer
    if (cancelBtn) {
        cancelBtn.addEventListener('click', hideListingForm);
    }

    // Confirm button in footer - properly get the price from the active modal
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function () {
            // Important: Get the price input directly from the modal, not by global ID
            const priceInput = listingFormModal.querySelector('#listingPrice');
            const currencySelect = listingFormModal.querySelector('#listingCurrency');

            if (!priceInput || !currencySelect) {
                showToast('Error finding form fields', 'error');
                return;
            }

            const price = parseFloat(priceInput.value);
            const currency = currencySelect.value;

            console.log('Submitting with price:', price, 'currency:', currency);

            if (isNaN(price) || price <= 0) {
                showToast('Please enter a valid price greater than 0', 'error');
                return;
            }

            if (selectedCatForListing) {
                createListing(selectedCatForListing.id, price, currency);
            }
        });
    }

    // Close when clicking outside the modal content
    if (listingFormModal) {
        listingFormModal.addEventListener('click', function (e) {
            if (e.target === listingFormModal) {
                hideListingForm();
            }
        });
    }
}

// Show form to create a new listing
// Show form to create a new listing
function showListingForm(token) {
    selectedCatForListing = token;

    // Get the modal elements
    const listingFormModal = document.getElementById('listingFormModal');
    const selectedCatDiv = listingFormModal.querySelector('.selected-cat');

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

    // Reset form values
    const listingPriceInput = document.getElementById('listingPrice');
    if (listingPriceInput) {
        listingPriceInput.value = '';
    }

    // Load saved price from localStorage
    const savedPrice = localStorage.getItem('lastListingPrice');
    if (savedPrice && listingPriceInput) {
        listingPriceInput.value = savedPrice;
    }

    // Show pricing context and load pricing data
    const pricingContext = document.getElementById('pricingContext');
    if (pricingContext) {
        pricingContext.style.display = 'block';
        loadPricingData(token.id);
    }

    // Setup event listeners for this modal instance
    setupListingFormEventListeners();

    // Show the modal
    listingFormModal.classList.add('active');

    // Focus on the price input
    setTimeout(() => {
        if (listingPriceInput) {
            listingPriceInput.focus();
        }
    }, 100);
}

// Load pricing data from the API
async function loadPricingData(tokenId) {
    const pricingLoading = document.getElementById('pricingLoading');
    const pricingData = document.getElementById('pricingData');

    try {
        // Show loading state
        pricingLoading.style.display = 'flex';
        pricingData.style.display = 'none';

        // Fetch pricing data with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        const response = await fetch(`/api/pricing-info/${tokenId}`, {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Update pricing display
        document.getElementById('floorPrice').textContent = data.floorPrice && data.floorPrice > 0 ? `${data.floorPrice.toFixed(4)} USDC` : 'No listings';
        document.getElementById('avgPrice').textContent = data.avgPrice && data.avgPrice > 0 ? `${data.avgPrice.toFixed(4)} USDC` : 'No data';
        document.getElementById('lastSold').textContent = data.lastSold && data.lastSold > 0 ? `${data.lastSold.toFixed(4)} USDC` : 'No data';
        document.getElementById('matchingListings').textContent = `${data.matchingListings} matching listings found`;

        // Update trait matches
        const traitMatches = document.getElementById('traitMatches');
        if (data.breed) {
            traitMatches.textContent = `${data.traitMatches} trait matches found for breed: ${data.breed}`;
            traitMatches.style.display = 'block';
        } else {
            traitMatches.style.display = 'none';
        }

        // Show suggested price
        const suggestedPriceSection = document.getElementById('suggestedPriceSection');
        const suggestedPrice = document.getElementById('suggestedPrice');
        if (data.suggestedPrice && data.suggestedPrice > 0) {
            suggestedPrice.textContent = `${data.suggestedPrice.toFixed(4)} USDC`;
            suggestedPriceSection.style.display = 'flex';
        } else {
            suggestedPriceSection.style.display = 'none';
        }

        // Store pricing data for validation
        window.currentPricingData = data;

        // Hide loading, show data
        pricingLoading.style.display = 'none';
        pricingData.style.display = 'block';

    } catch (error) {
        console.error('Error loading pricing data:', error);

        // Hide loading on error
        pricingLoading.style.display = 'none';

        // Show fallback pricing data - modal still works but without market insights
        showFallbackPricingData();
        pricingData.style.display = 'block';
    }
}

// Show fallback pricing data when API fails
function showFallbackPricingData() {
    const pricingData = document.getElementById('pricingData');

    // Set fallback values instead of breaking the modal
    document.getElementById('floorPrice').textContent = 'No listings';
    document.getElementById('avgPrice').textContent = 'No data';
    document.getElementById('lastSold').textContent = 'No data';
    document.getElementById('matchingListings').textContent = 'Market data unavailable';

    // Hide trait matches section
    const traitMatches = document.getElementById('traitMatches');
    traitMatches.style.display = 'none';

    // Hide suggested price section
    const suggestedPriceSection = document.getElementById('suggestedPriceSection');
    suggestedPriceSection.style.display = 'none';

    // Clear pricing data to prevent validation errors
    window.currentPricingData = {
        floorPrice: 0,
        avgPrice: 0,
        lastSold: 0,
        matchingListings: 0,
        traitMatches: 0,
        suggestedPrice: 0
    };

    // Add a small notice at the top of pricing data
    const existingNotice = pricingData.querySelector('.api-notice');
    if (!existingNotice) {
        const notice = document.createElement('div');
        notice.className = 'api-notice';
        notice.style.cssText = `
            background: rgba(255, 193, 7, 0.1);
            border: 1px solid rgba(255, 193, 7, 0.3);
            color: #ffc107;
            padding: 8px;
            border-radius: 4px;
            font-size: 0.8rem;
            margin-bottom: 10px;
            text-align: center;
        `;
        notice.innerHTML = '⚠️ Market data temporarily unavailable. You can still list your item.';
        pricingData.insertBefore(notice, pricingData.firstChild);
    }
}

// Setup event listeners for the listing form modal
function setupListingFormEventListeners() {
    const listingFormModal = document.getElementById('listingFormModal');
    const listingPriceInput = document.getElementById('listingPrice');
    const traitMatchingCheckbox = document.getElementById('traitMatchingEnabled');
    const useSuggestedBtn = document.getElementById('useSuggestedBtn');

    // Price input validation
    if (listingPriceInput) {
        listingPriceInput.addEventListener('input', function() {
            const price = parseFloat(this.value);
            validatePrice(price);

            // Save to localStorage
            localStorage.setItem('lastListingPrice', this.value);
        });

        // Keyboard navigation
        listingPriceInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const confirmBtn = document.getElementById('confirmListingBtn');
                if (confirmBtn) {
                    confirmBtn.click();
                }
            }
        });
    }

    // Trait matching toggle
    if (traitMatchingCheckbox) {
        traitMatchingCheckbox.addEventListener('change', function() {
            const traitMatches = document.getElementById('traitMatches');
            if (this.checked) {
                traitMatches.style.display = 'block';
            } else {
                traitMatches.style.display = 'none';
            }
        });
    }

    // Use suggested price button
    if (useSuggestedBtn) {
        useSuggestedBtn.addEventListener('click', function() {
            const suggestedPrice = document.getElementById('suggestedPrice');
            if (suggestedPrice && listingPriceInput) {
                const price = parseFloat(suggestedPrice.textContent);
                listingPriceInput.value = price.toFixed(4);
                validatePrice(price);
            }
        });
    }

    // Keyboard navigation for modal
    listingFormModal.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            hideListingForm();
        }
    });
}

// Validate price input and show visual feedback
function validatePrice(price) {
    const priceValidation = document.getElementById('priceValidation');
    const priceBand = document.getElementById('priceBand');
    const bandIndicator = document.getElementById('bandIndicator');

    if (!window.currentPricingData || !priceValidation || !priceBand) return;

    const { floorPrice, avgPrice } = window.currentPricingData;

    // Clear previous validation
    priceValidation.style.display = 'none';
    priceBand.style.display = 'none';
    priceValidation.className = 'price-validation';
    bandIndicator.className = 'band-indicator';

    if (isNaN(price) || price <= 0) return;

    let message = '';
    let level = 'success';
    let band = 'fair';

    // Check if price is too high (>2x average)
    if (avgPrice && price > avgPrice * 2) {
        message = '⚠️ Price is more than 2x the average - may reduce visibility';
        level = 'warning';
        band = 'high';
    }
    // Check if price is too low (<50% of floor)
    else if (floorPrice && price < floorPrice * 0.5) {
        message = '⚠️ Price is significantly below floor - expect quick sale';
        level = 'error';
        band = 'low';
    }
    // Check if price is above average
    else if (avgPrice && price > avgPrice) {
        message = '💡 Price exceeds average - good for maximizing profit';
        level = 'warning';
        band = 'high';
    }
    // Check if price is below floor
    else if (floorPrice && price < floorPrice) {
        message = '📉 Price is below floor - expect quick sale';
        level = 'warning';
        band = 'low';
    }
    // Price is in fair range
    else {
        message = '✅ Price is in fair range';
        level = 'success';
        band = 'fair';
    }

    // Show validation message
    priceValidation.textContent = message;
    priceValidation.className = `price-validation ${level}`;
    priceValidation.style.display = 'block';

    // Show price band
    bandIndicator.textContent = band === 'fair' ? 'Fair Range' :
                                band === 'high' ? 'Above Average' : 'Below Floor';
    bandIndicator.className = `band-indicator ${band}`;
    priceBand.style.display = 'block';
}

// Hide listing form
function hideListingForm() {
    const listingFormModal = document.getElementById('listingFormModal');
    if (listingFormModal) {
        listingFormModal.classList.remove('active');
    }

    // Hide pricing context
    const pricingContext = document.getElementById('pricingContext');
    if (pricingContext) {
        pricingContext.style.display = 'none';
    }

    // Clear pricing data
    window.currentPricingData = null;

    selectedCatForListing = null;
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
                showToast('Requesting USDC approval...', 'info');
                const approveTx = await usdc.approve(MARKETPLACE_ADDRESS, ethers.MaxUint256);
                showToast('Waiting for approval confirmation...', 'info');
                await approveTx.wait();
                showToast('USDC approval granted to marketplace', 'success');
            }
        } else {
            priceInSmallestUnits = ethers.parseEther(price.toString());
            currency = ethers.ZeroAddress; // Native currency
        }

        // Check and request NFT approval if needed
        const approved = await nft.getApproved(tokenId);
        if (approved.toLowerCase() !== MARKETPLACE_ADDRESS.toLowerCase()) {
            showToast('Requesting NFT approval...', 'info');
            const approveTx = await nft.approve(MARKETPLACE_ADDRESS, tokenId);
            showToast('Waiting for NFT approval confirmation...', 'info');
            await approveTx.wait();
            showToast('NFT approval granted to marketplace', 'success');
        }

        // Create the listing
        showToast('Creating marketplace listing...', 'info');
        const tx = await marketplace.createListing(tokenId, priceInSmallestUnits, currency);
        showToast('Waiting for transaction confirmation...', 'info');
        await tx.wait();

        showToast(`Listing created successfully for ${selectedCatForListing.name}!`, 'success');

        // Log the listing creation activity
        await logListingCreated(tokenId, {
            price: price,
            currency: currency === USDC_ADDRESS ? 'USDC' : 'VTRU',
            rarity: selectedCatForListing?.rarity,
            breed: selectedCatForListing?.breed
        });

        // Reload user's cats and listings
        hideListingForm();
        await loadUserCats();
        await loadUserListings();
        await loadListings(); // Also refresh all listings

    } catch (error) {
        console.error('Error creating listing:', error);
        showToast(`Error creating listing: ${error.message}`, 'error');
    }
}

// Cancel a listing
async function cancelListing(tokenId) {
    if (!confirm('Are you sure you want to cancel this listing?')) {
        return;
    }

    try {
        showToast('Cancelling listing...', 'info');
        const tx = await marketplace.cancelListing(tokenId);
        showToast('Waiting for transaction confirmation...', 'info');
        await tx.wait();

        showToast('Listing cancelled successfully!', 'success');

        // Log the listing cancellation activity
        await logListingCancelled(tokenId);

        // Reload listings
        await loadUserCats();
        await loadUserListings();
        await loadListings();

    } catch (error) {
        console.error('Error cancelling listing:', error);
        showToast(`Error cancelling listing: ${error.message}`, 'error');
    }
}

// Buy a listed NFT - This is called from the purchase confirmation modal
async function buyListing(tokenId, price, currency) {
    if (!currentAccount) {
        showToast('Please connect your wallet to make a purchase', 'error');
        throw new Error('Wallet not connected');
    }

    try {
        // Get signer from browser provider for transactions
        if (!browserProvider) {
            throw new Error('Browser provider not available');
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
            showToast('Checking USDC allowance...', 'info');

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
                console.warn('Could not check balance:', balanceError);
                // Continue with the purchase attempt
            }

            // Check allowance and approve if needed
            const allowance = await connectedUsdc.allowance(currentAccount, MARKETPLACE_ADDRESS);
            if (allowance < price) {
                showToast('Requesting USDC approval...', 'info');
                const approveTx = await connectedUsdc.approve(MARKETPLACE_ADDRESS, ethers.MaxUint256);
                showToast('Waiting for USDC approval confirmation...', 'info');
                await approveTx.wait();
                showToast('USDC approval granted', 'success');
            }

            // Buy with USDC
            showToast('Processing your purchase with USDC...', 'info');

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
            showToast('Processing your purchase...', 'info');
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

        showToast('Waiting for transaction confirmation...', 'info');
        await tx.wait();

        showToast('Purchase successful! The NFT has been transferred to your wallet.', 'success');

        // Log the purchase activity
        await logPurchase(tokenId, {
            price: ethers.formatUnits(price, currency === ethers.ZeroAddress ? 18 : 6),
            currency: getCurrencyName(currency),
            seller: currentAccount,
            transactionHash: tx.hash
        });

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

        // Close any open modals
        const purchaseModal = document.getElementById('purchaseModal');
        if (purchaseModal) purchaseModal.classList.remove('active');

        // Reload listings and user data
        await loadListings();
        if (sellContent.style.display === 'block') {
            await loadUserCats();
            await loadUserListings();
        }

        return true; // Return success

    } catch (error) {
        console.error('Error buying token:', error);
        showToast(`Error purchasing NFT: ${error.message}`, 'error');
        throw error; // Re-throw the error so the modal can handle it
    }
}

// Helper function to handle transaction errors with better messages
function handleTransactionError(error, tokenId) {
    console.error('Transaction error details:', error);

    // Check for common errors with missing revert data
    if (error.message) {
        const errorMessage = error.message.toLowerCase();

        if (errorMessage.includes('missing revert data')) {
            // Check transaction details for clues
            if (error.transaction) {
                return checkCommonErrors(error, tokenId);
            }
            return 'Transaction would fail: The listing might not be active anymore or another issue occurred.';
        }

        if (errorMessage.includes('insufficient funds')) {
            return "You don't have enough funds to complete this purchase.";
        }

        if (errorMessage.includes('user rejected')) {
            return 'Transaction was cancelled by the user.';
        }

        if (errorMessage.includes('erc20 balance too low')) {
            return 'Your token balance is too low to complete this purchase.';
        }

        // Contract-specific error messages
        if (errorMessage.includes('listing not active')) {
            return 'This listing is no longer active. It may have been sold or cancelled.';
        }

        if (errorMessage.includes('already owner')) {
            return 'You already own this NFT.';
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
            return 'This item appears to be no longer available. It may have been purchased by someone else or delisted.';
        }

        // Generic message for other cases
        return 'The transaction would fail. The listing may have changed or been removed.';
    } catch (e) {
        return 'Unable to complete transaction. Please try again later.';
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
        console.error('Error in executePurchase:', error);

        // Show error in modal
        const errorDisplay = document.createElement('div');
        errorDisplay.className = 'purchase-error';
        errorDisplay.innerHTML = `
            <svg viewBox="0 0 24 24" width="24" height="24" stroke="#ef4444" fill="none" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>${error.message || 'Transaction failed'}</span>
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

async function init() {
    try {
        // Initialize read-only contracts for browsing
        initReadOnlyContracts();

        // Initialize UI components
        watchlistComponent = new WatchlistComponent();
        settingsComponent = new SettingsComponent();

        // Set up wallet connection listeners
        addConnectionListener(handleWalletConnectionChange);

        // Load initial listings
        await loadListings();

        // Log marketplace view
        await logMarketplaceView();

        // Set up tab switching with proper animation
        setupTabs();

        // Initialize hot items
        initHotItems();

        setupListingFormModal();

        // Set up scroll to top functionality
        setupScrollToTop();

        // Set up enhanced event listeners
        setupEnhancedEventListeners();

        // Load trending items
        await loadTrendingItems();

// Set up real-time subscriptions for live updates
async function setupRealtimeSubscriptions() {
    try {
        // Clean up existing subscription
        if (realtimeSubscription) {
            await realtimeSubscription.unsubscribe();
        }

        // Subscribe to listing changes
        realtimeSubscription = await subscribeToListings((eventType, listing) => {
            switch (eventType) {
                case 'listing_created':
                    handleNewListing(listing);
                    break;
                case 'listing_cancelled':
                    handleListingCancelled(listing);
                    break;
                case 'item_sold':
                    handleItemSold(listing);
                    break;
            }
        });

        console.log('✅ Real-time subscriptions set up successfully');
    } catch (error) {
        console.error('❌ Failed to set up real-time subscriptions:', error);
        // Fall back to polling
        setupPollingFallback();
    }
}

// Handle new listing events
function handleNewListing(listing) {
    showToast(`New listing: NFT #${listing.token_id} for ${listing.price} ETH`, 'info');
    
    // Add to current listings if not already present
    const existingIndex = allListings.findIndex(l => l.tokenId === listing.token_id);
    if (existingIndex === -1) {
        // Convert Supabase listing to our format and add to beginning
        const formattedListing = {
            tokenId: listing.token_id,
            seller: listing.seller_address,
            price: listing.price,
            currency: listing.currency_address,
            active: listing.is_active
        };
        allListings.unshift(formattedListing);
        
        // Re-render listings
        applyListingFiltersAndSort();
    }
}

// Handle listing cancellation events
function handleListingCancelled(listing) {
    showToast(`Listing cancelled: NFT #${listing.token_id}`, 'warning');
    
    // Remove from current listings
    allListings = allListings.filter(l => l.tokenId !== listing.token_id);
    
    // Re-render listings
    applyListingFiltersAndSort();
}

// Handle item sold events
function handleItemSold(listing) {
    showToast(`Item sold: NFT #${listing.token_id} for ${listing.price} ETH`, 'success');
    
    // Remove from current listings
    allListings = allListings.filter(l => l.tokenId !== listing.token_id);
    
    // Re-render listings
    applyListingFiltersAndSort();
}

// Fallback polling mechanism
function setupPollingFallback() {
    console.log('Setting up polling fallback for real-time updates...');
    
    // Poll every 30 seconds
    setInterval(async () => {
        try {
            await loadListings();
        } catch (error) {
            console.error('Polling update failed:', error);
        }
    }, 30000);
}

        // Set up lazy loading
        setupLazyLoading();

        // Set up filters
        currencyFilter.addEventListener('change', async () => {
            await logFilterApplied('currency', currencyFilter.value);
            applyListingFiltersAndSort();
            await saveCurrentFilters();
        });

        sortListings.addEventListener('change', async () => {
            await logFilterApplied('sort', sortListings.value);
            applyListingFiltersAndSort();
            await saveCurrentFilters();
        });

        // Set up listing form
        createListingForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const price = parseFloat(document.getElementById('listingPrice').value);
            const currency = document.getElementById('listingCurrency').value;

            if (price <= 0) {
                showToast('Please enter a valid price greater than 0', 'error');
                return;
            }

            if (selectedCatForListing) {
                createListing(selectedCatForListing.id, price, currency);
            }
        });

        document.getElementById('cancelListingForm').addEventListener('click', hideListingForm);

        // Check for wallet connection using the wallet connector
        const walletAddress = getCurrentWalletAddress();
        if (walletAddress) {
            currentAccount = walletAddress;
            await handleWalletConnectionChange(walletAddress);
        } else {
            // Try to initialize wallet connection
            const { initializeWalletConnection } = await import('./walletConnector.js');
            const connection = await initializeWalletConnection();
            if (connection && connection.address) {
                currentAccount = connection.address;
                await handleWalletConnectionChange(connection.address);
            }
        }

        // Add toast container for notifications
        const toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);

        // Add toast styles if not already present
        if (!document.getElementById('toast-styles')) {
            const toastStyles = document.createElement('style');
            toastStyles.id = 'toast-styles';
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
                
                .lazy {
                    opacity: 0.5;
                    transition: opacity 0.3s ease;
                }
                
                .lazy:not([src]) {
                    background: linear-gradient(90deg, #333, #555, #333);
                    background-size: 200% 100%;
                    animation: shimmer 1.5s infinite;
                }
                
                @keyframes shimmer {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `;
            document.head.appendChild(toastStyles);
        }

    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Error initializing marketplace. Please refresh the page.', 'error');
    }
}

// Enhanced event listeners for new functionality
function setupEnhancedEventListeners() {
    // Hot items carousel navigation
    const hotlistPrev = document.getElementById('hotlistPrev');
    const hotlistNext = document.getElementById('hotlistNext');
    const viewHotCollectionBtn = document.getElementById('viewHotCollectionBtn');

    if (hotlistPrev && hotlistNext) {
        hotlistPrev.addEventListener('click', () => {
            hotItemsCarouselIndex = Math.max(0, hotItemsCarouselIndex - 1);
            updateHotItemsCarouselPosition();
        });

        hotlistNext.addEventListener('click', () => {
            const maxIndex = Math.max(0, hotItems.length - 3);
            hotItemsCarouselIndex = Math.min(maxIndex, hotItemsCarouselIndex + 1);
            updateHotItemsCarouselPosition();
        });
    }

    if (viewHotCollectionBtn) {
        viewHotCollectionBtn.addEventListener('click', () => {
            const browseTab = document.querySelector('.tab-btn[data-tab="browse"]');
            if (browseTab) browseTab.click();
            sortListings.value = 'newest';
            applyListingFiltersAndSort();
            document.getElementById('browse-tab').scrollIntoView({ behavior: 'smooth' });
        });
    }

    // Preview navigation
    const prevPreviewBtn = document.getElementById('prevPreviewBtn');
    const nextPreviewBtn = document.getElementById('nextPreviewBtn');

    if (prevPreviewBtn && nextPreviewBtn) {
        prevPreviewBtn.addEventListener('click', () => navigatePreview('prev'));
        nextPreviewBtn.addEventListener('click', () => navigatePreview('next'));
    }

    // Favorite and share buttons
    const favoriteBtn = document.getElementById('favoriteBtn');
    const shareBtn = document.getElementById('shareBtn');

    if (favoriteBtn) {
        favoriteBtn.addEventListener('click', () => {
            const previewImage = document.getElementById('previewImage');
            if (previewImage && previewImage.src) {
                // Extract token ID from current preview
                const currentListing = allListingsForPreview[currentPreviewIndex];
                if (currentListing) {
                    toggleFavorite(Number(currentListing.tokenId));
                }
            }
        });
    }

    if (shareBtn) {
        shareBtn.addEventListener('click', () => {
            const currentListing = allListingsForPreview[currentPreviewIndex];
            if (currentListing) {
                fetchTokenMetadata(Number(currentListing.tokenId)).then(token => {
                    if (token) shareItem(token);
                });
            }
        });
    }

    // Wallet actions
    const copyAddressBtn = document.getElementById('copyAddressBtn');
    const viewOnExplorerBtn = document.getElementById('viewOnExplorerBtn');

    if (copyAddressBtn) {
        copyAddressBtn.addEventListener('click', () => {
            if (currentAccount) {
                navigator.clipboard.writeText(currentAccount).then(() => {
                    showEnhancedNotification('Address Copied', 'Wallet address copied to clipboard', 'success');
                }).catch(() => {
                    showEnhancedNotification('Copy Failed', 'Could not copy address to clipboard', 'error');
                });
            }
        });
    }

    if (viewOnExplorerBtn) {
        viewOnExplorerBtn.addEventListener('click', () => {
            if (currentAccount) {
                const explorerUrl = `https://explorer.vitruveo.xyz/address/${currentAccount}`;
                window.open(explorerUrl, '_blank');
            }
        });
    }

    // Saved searches functionality
    const saveSearchBtn = document.getElementById('saveSearchBtn');
    const savedSearchesBtn = document.getElementById('savedSearchesBtn');
    const saveCurrentSearchBtn = document.getElementById('saveCurrentSearchBtn');
    const closeSavedSearchesBtn = document.getElementById('closeSavedSearchesBtn');

    if (saveSearchBtn) {
        saveSearchBtn.addEventListener('click', () => {
            const searchName = prompt('Enter a name for this search:');
            if (searchName) {
                saveCurrentSearch(searchName);
            }
        });
    }

    if (savedSearchesBtn) {
        savedSearchesBtn.addEventListener('click', () => {
            showSavedSearchesModal();
        });
    }

    if (saveCurrentSearchBtn) {
        saveCurrentSearchBtn.addEventListener('click', () => {
            const searchNameInput = document.getElementById('searchNameInput');
            const searchName = searchNameInput.value.trim();
            if (searchName) {
                saveCurrentSearch(searchName);
                searchNameInput.value = '';
            }
        });
    }

    if (closeSavedSearchesBtn) {
        closeSavedSearchesBtn.addEventListener('click', () => {
            document.getElementById('savedSearchesModal').classList.remove('active');
        });
    }

    // Notification bell functionality
    const notificationBell = document.getElementById('notificationBell');
    const notificationDropdown = document.getElementById('notificationDropdown');
    const markAllRead = document.getElementById('markAllRead');

    if (notificationBell) {
        notificationBell.addEventListener('click', () => {
            notificationDropdown.classList.toggle('show');
        });
    }

    if (markAllRead) {
        markAllRead.addEventListener('click', () => {
            markAllNotificationsRead();
        });
    }

    // Close dropdowns when clicking outside
    document.addEventListener('click', (event) => {
        if (!notificationBell.contains(event.target)) {
            notificationDropdown.classList.remove('show');
        }
    });

    // Trending carousel controls
    const trendingPrev = document.getElementById('trendingPrev');
    const trendingNext = document.getElementById('trendingNext');

    if (trendingPrev) {
        trendingPrev.addEventListener('click', () => {
            scrollTrendingCarousel('prev');
        });
    }

    if (trendingNext) {
        trendingNext.addEventListener('click', () => {
            scrollTrendingCarousel('next');
        });
    }

    // Auto-hide trending carousel after 10 seconds
    setTimeout(() => {
        const trendingCarousel = document.getElementById('trendingCarousel');
        if (trendingCarousel) {
            trendingCarousel.classList.add('show');
            setTimeout(() => {
                trendingCarousel.classList.remove('show');
            }, 10000);
        }
    }, 2000);
}

// Save current search function
async function saveCurrentSearch(searchName) {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) {
            showToast('Please connect your wallet to save searches', 'error');
            return;
        }

        const currentFilters = {
            currency: currencyFilter ? currencyFilter.value : 'all',
            sort: sortListings ? sortListings.value : 'newest'
        };

        const { saveSearch } = await import('./supabaseClient.js');
        await saveSearch(walletAddress, searchName, currentFilters);

        showEnhancedNotification('Search Saved', `Search "${searchName}" has been saved`, 'success');
    } catch (error) {
        console.error('Error saving search:', error);
        showToast('Error saving search. Please try again.', 'error');
    }
}

// Show saved searches modal
async function showSavedSearchesModal() {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) {
            showToast('Please connect your wallet to view saved searches', 'error');
            return;
        }

        const { loadPreferences } = await import('./supabaseClient.js');
        const preferences = await loadPreferences(walletAddress);

        const modal = document.getElementById('savedSearchesModal');
        const savedSearchesList = document.getElementById('savedSearchesList');

        if (preferences.savedSearches && preferences.savedSearches.length > 0) {
            savedSearchesList.innerHTML = preferences.savedSearches.map(search => `
                <div class="saved-search-item">
                    <div class="saved-search-info">
                        <div class="saved-search-name">${search.name}</div>
                        <div class="saved-search-filters">
                            Currency: ${search.filters.currency || 'All'} • 
                            Sort: ${search.filters.sort || 'Newest'}
                        </div>
                    </div>
                    <div class="saved-search-actions">
                        <button class="saved-search-btn" onclick="applySavedSearch('${search.name}')">Apply</button>
                        <button class="saved-search-btn danger" onclick="deleteSavedSearch('${search.name}')">Delete</button>
                    </div>
                </div>
            `).join('');
        } else {
            savedSearchesList.innerHTML = '<div class="no-notifications">No saved searches found</div>';
        }

        modal.classList.add('active');
    } catch (error) {
        console.error('Error loading saved searches:', error);
        showToast('Error loading saved searches', 'error');
    }
}

// Apply saved search
async function applySavedSearch(searchName) {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) return;

        const { loadPreferences } = await import('./supabaseClient.js');
        const preferences = await loadPreferences(walletAddress);

        const savedSearch = preferences.savedSearches.find(s => s.name === searchName);
        if (savedSearch) {
            // Apply the saved filters
            if (savedSearch.filters.currency && currencyFilter) {
                currencyFilter.value = savedSearch.filters.currency;
            }
            if (savedSearch.filters.sort && sortListings) {
                sortListings.value = savedSearch.filters.sort;
            }

            // Apply filters and close modal
            applyListingFiltersAndSort();
            document.getElementById('savedSearchesModal').classList.remove('active');

            showEnhancedNotification('Search Applied', `Applied saved search "${searchName}"`, 'success');
        }
    } catch (error) {
        console.error('Error applying saved search:', error);
        showToast('Error applying saved search', 'error');
    }
}

// Delete saved search
async function deleteSavedSearch(searchName) {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) return;

        const { loadPreferences, savePreferences } = await import('./supabaseClient.js');
        const preferences = await loadPreferences(walletAddress);

        preferences.savedSearches = preferences.savedSearches.filter(s => s.name !== searchName);
        await savePreferences(walletAddress, preferences);

        // Refresh the modal
        showSavedSearchesModal();

        showEnhancedNotification('Search Deleted', `Deleted saved search "${searchName}"`, 'info');
    } catch (error) {
        console.error('Error deleting saved search:', error);
        showToast('Error deleting saved search', 'error');
    }
}

// Notification system functions
const notifications = [];
let notificationCount = 0;

function showRealtimeNotification(title, message, type = 'info') {
    const notification = {
        id: Date.now(),
        title,
        message,
        type,
        timestamp: new Date(),
        read: false
    };

    notifications.unshift(notification);
    notificationCount++;

    // Update notification bell
    updateNotificationBell();

    // Show toast notification
    showEnhancedNotification(title, message, type);

    // Update dropdown
    updateNotificationDropdown();
}

function updateNotificationBell() {
    const countElement = document.getElementById('notificationCount');
    if (countElement) {
        countElement.textContent = notificationCount;
        countElement.classList.toggle('hidden', notificationCount === 0);
    }
}

function updateNotificationDropdown() {
    const listElement = document.getElementById('notificationList');
    if (!listElement) return;

    if (notifications.length === 0) {
        listElement.innerHTML = '<div class="no-notifications">No new notifications</div>';
        return;
    }

    listElement.innerHTML = notifications.slice(0, 10).map(notification => `
        <div class="notification-item ${notification.read ? '' : 'unread'}">
            <div class="notification-item-content">
                <div class="notification-item-icon">
                    ${notification.type === 'success' ? '✅' :
                      notification.type === 'error' ? '❌' : 'ℹ️'}
                </div>
                <div class="notification-item-text">
                    <div class="notification-item-title">${notification.title}</div>
                    <div class="notification-item-message">${notification.message}</div>
                    <div class="notification-item-time">${timeAgo(notification.timestamp)}</div>
                </div>
            </div>
        </div>
    `).join('');
}

function markAllNotificationsRead() {
    notifications.forEach(n => n.read = true);
    notificationCount = 0;
    updateNotificationBell();
    updateNotificationDropdown();
}

function timeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
}

// Trending carousel functions
let trendingItems = [];
const trendingIndex = 0;

async function loadTrendingItems() {
    try {
        const { getTrendingTokens } = await import('./supabaseClient.js');
        const trendingData = await getTrendingTokens(5);

        trendingItems = [];
        for (const item of trendingData) {
            const tokenMetadata = await fetchTokenMetadata(item.token_id);
            if (tokenMetadata) {
                // Find the current listing for this token
                const listing = allListings.find(l => l.tokenId === item.token_id && l.active);
                if (listing) {
                    trendingItems.push({
                        ...tokenMetadata,
                        activityCount: item.activity_count,
                        listing
                    });
                }
            }
        }

        renderTrendingCarousel();
    } catch (error) {
        console.error('Error loading trending items:', error);
    }
}

function renderTrendingCarousel() {
    const trendingItemsContainer = document.getElementById('trendingItems');
    if (!trendingItemsContainer || trendingItems.length === 0) return;

    trendingItemsContainer.innerHTML = trendingItems.map(item => {
        const formattedPrice = formatPrice(item.listing.price, item.listing.currency);
        const currencyName = getCurrencyName(item.listing.currency);

        return `
            <div class="trending-item" data-token-id="${item.id}">
                <img src="${item.image}" alt="${item.name}" class="trending-item-image" 
                     onerror="this.src='assets/detailed_ninja_cat_64.png'">
                <div class="trending-item-name">${item.name}</div>
                <div class="trending-item-price">${formattedPrice} ${currencyName}</div>
            </div>
        `;
    }).join('');

    // Add click handlers
    trendingItemsContainer.querySelectorAll('.trending-item').forEach(item => {
        item.addEventListener('click', () => {
            const tokenId = item.dataset.tokenId;
            const trendingItem = trendingItems.find(t => t.id == tokenId);
            if (trendingItem) {
                showQuickPreview(trendingItem, {
                    price: trendingItem.listing.price,
                    currency: trendingItem.listing.currency,
                    seller: trendingItem.listing.seller
                });
            }
        });
    });

    // Show trending carousel
    const trendingCarousel = document.getElementById('trendingCarousel');
    if (trendingCarousel) {
        trendingCarousel.classList.add('show');
    }
}

function scrollTrendingCarousel(direction) {
    const container = document.getElementById('trendingItems');
    if (!container) return;

    const scrollAmount = 140; // width of one item plus gap
    const currentScroll = container.scrollLeft;

    if (direction === 'prev') {
        container.scrollTo({
            left: currentScroll - scrollAmount,
            behavior: 'smooth'
        });
    } else {
        container.scrollTo({
            left: currentScroll + scrollAmount,
            behavior: 'smooth'
        });
    }
}

// Real-time subscriptions
async function setupRealtimeSubscriptions() {
    try {
        const { subscribeToNewListings, subscribeToUserNotifications } = await import('./supabaseClient.js');

        // Subscribe to new listings
        await subscribeToNewListings((payload) => {
            if (payload.new && payload.new.event_type === 'listing_created') {
                showRealtimeNotification(
                    'New Listing',
                    'A new NFT has been listed for sale!',
                    'info'
                );

                // Refresh listings
                loadListings();
            }
        });

        // Subscribe to user notifications
        const walletAddress = getCurrentWalletAddress();
        if (walletAddress) {
            await subscribeToUserNotifications(walletAddress, (payload) => {
                if (payload.new) {
                    const event = payload.new;
                    handleRealtimeEvent(event);
                }
            });
        }

        console.log('Real-time subscriptions set up successfully');
    } catch (error) {
        console.error('Error setting up real-time subscriptions:', error);
    }
}

function handleRealtimeEvent(event) {
    switch (event.event_type) {
        case 'purchase':
            if (event.token_id) {
                showRealtimeNotification(
                    'Item Sold',
                    `Token #${event.token_id} has been sold!`,
                    'success'
                );
            }
            break;
        case 'listing_created':
            if (event.token_id) {
                showRealtimeNotification(
                    'New Listing',
                    `Token #${event.token_id} has been listed for sale!`,
                    'info'
                );
            }
            break;
        case 'favorite':
            if (event.token_id) {
                showRealtimeNotification(
                    'Item Favorited',
                    `Token #${event.token_id} was added to someone's favorites!`,
                    'info'
                );
            }
            break;
        default:
            console.log('Unknown real-time event:', event);
    }
}

// Update hot items carousel position
function updateHotItemsCarouselPosition() {
    const carousel = document.getElementById('hotlistCarousel');
    const prevBtn = document.getElementById('hotlistPrev');
    const nextBtn = document.getElementById('hotlistNext');

    if (!carousel) return;

    const itemWidth = 200 + 24; // item width + gap
    const scrollLeft = hotItemsCarouselIndex * itemWidth;
    carousel.scrollTo({ left: scrollLeft, behavior: 'smooth' });

    // Update button states
    if (prevBtn) prevBtn.disabled = hotItemsCarouselIndex === 0;
    if (nextBtn) nextBtn.disabled = hotItemsCarouselIndex >= hotItems.length - 3;
}

// Lazy loading implementation for images
function setupLazyLoading() {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                observer.unobserve(img);
            }
        });
    });

    // Apply lazy loading to all images with data-src
    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);

// Initialize hot items for the banner
function initHotItems() {
    // This would populate the hot items banner if implemented
    // For now it's just a placeholder
    const hotBannerBtn = document.querySelector('.hotlist-banner .btn');
    if (hotBannerBtn) {
        hotBannerBtn.addEventListener('click', () => {
            // Jump to marketplace tab and apply hot filter
            const browseTab = document.querySelector('.tab-btn[data-tab="browse"]');
            if (browseTab) browseTab.click();

            // Could implement a specific hot filter here
            sortListings.value = 'newest';
            applyListingFiltersAndSort();

            // Scroll to listings
            document.getElementById('browse-tab').scrollIntoView({ behavior: 'smooth' });
        });
    }
}

// Set up the wallet prompt
// Set up the wallet prompt
function setupWalletPrompt() {
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
                    alert('Please install MetaMask or another Ethereum wallet');
                }
            } else {
                alert('Please install MetaMask or another Ethereum wallet');
            }
        });
    }
}

// Set up tab switching with smooth indicator animation
function setupTabs() {
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabId = button.getAttribute('data-tab');

            // Update active tab button
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Show selected tab content
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(`${tabId}-tab`).classList.add('active');

            // Animate tab indicator
            if (tabIndicator) {
                tabIndicator.style.width = `${button.offsetWidth}px`;
                tabIndicator.style.left = `${button.offsetLeft}px`;
            }
        });
    });

    // Set initial indicator position
    if (tabIndicator) {
        const activeTab = document.querySelector('.tab-btn.active') || tabButtons[0];
        if (activeTab) {
            tabIndicator.style.width = `${activeTab.offsetWidth}px`;
            tabIndicator.style.left = `${activeTab.offsetLeft}px`;
        }
    }
}

// Set up scroll to top functionality
function setupScrollToTop() {
    if (!scrollTopBtn) return;

    // Show/hide scroll button based on scroll position
    window.addEventListener('scroll', function () {
        if (window.pageYOffset > 300) {
            scrollTopBtn.classList.add('visible');
        } else {
            scrollTopBtn.classList.remove('visible');
        }
    });

    // Scroll to top when clicked
    scrollTopBtn.addEventListener('click', function () {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Add this function after the init() function in marketplace.js:
async function getVtruUsdcPrice() {
    try {
        // Contract addresses
        const SWAP_ROUTER_ADDRESS = '0x3295fd27D6e44529c51Ef05a5d16Ca17Fb9e10A8';
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
        // If it's the other way around, you'll need to swap these
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

// Complete replacement for exchange rate functionality
window.showExchangeRateDetails = async function () {
    console.log('Opening exchange rate modal');
    const modal = document.getElementById('exchangeRateModal');
    const loadingElement = document.getElementById('exchangeRateLoading');
    const contentElement = document.getElementById('exchangeRateContent');

    // Show modal and loading spinner
    if (modal) modal.classList.add('active');
    if (loadingElement) loadingElement.style.display = 'flex';
    if (contentElement) contentElement.style.display = 'none';

    try {
        // Fetch LP data
        console.log('Fetching initial LP data');
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
            throw new Error('Invalid data received');
        }
    } catch (error) {
        console.error('Error showing exchange rate details:', error);
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
    console.log('Enhanced modal refresh: Starting...');

    try {
        // 1. Find the modal body
        const modalBody = document.querySelector('#exchangeRateModal .modal-body');
        if (!modalBody) {
            alert('Error: Modal body not found');
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
        console.log('Fetching LP data...');
        const lpData = await getLpDetails();
        console.log('LP data retrieved:', lpData);

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

        console.log('Enhanced exchange rate modal updated successfully');
    } catch (error) {
        console.error('Error updating exchange rate modal:', error);

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
            alert('Error: ' + error.message);
        }
    }
};

// Also replace the show modal function to make sure it works
window.updateExchangeRateTicker = async function () {
    try {
        const data = await getLpDetails();
        if (data && data.rate > 0) {
            document.getElementById('tickerExchangeRate').textContent = data.rate.toFixed(6);
            document.getElementById('tickerLastUpdated').textContent = new Date().toLocaleTimeString();
        }
    } catch (error) {
        console.error('Error updating ticker:', error);
    }
};

// Add this function near your other LP-related functions
async function getLpDetails() {
    console.log('Fetching LP details - starting');
    try {
        // Contract addresses
        const LP_ADDRESS = '0x8B3808260a058ECfFA9b1d0eaA988A1b4167DDba';

        // Create contract instance with more complete ABI
        const lpContract = new ethers.Contract(LP_ADDRESS, [
            'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
            'function token0() view returns (address)',
            'function token1() view returns (address)'
        ], provider);

        console.log('LP Contract created, getting token addresses');

        // Get token addresses with timeout
        const token0Promise = lpContract.token0();
        const token1Promise = lpContract.token1();

        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out after 5 seconds')), 5000)
        );

        // Race the contract calls with timeout
        const token0 = await Promise.race([token0Promise, timeoutPromise]);
        const token1 = await Promise.race([token1Promise, timeoutPromise]);

        console.log('Token addresses retrieved:', { token0, token1, USDC_ADDRESS });

        // Get reserves with timeout
        const reservesPromise = lpContract.getReserves();
        const reserves = await Promise.race([reservesPromise, timeoutPromise]);
        console.log('Reserves retrieved:', reserves);

        // Check if token0 is USDC
        const isToken0Usdc = token0.toLowerCase() === USDC_ADDRESS.toLowerCase();
        console.log('Is token0 USDC:', isToken0Usdc);

        // Get reserve values
        const vtruReserve = parseFloat(ethers.formatEther(isToken0Usdc ? reserves[1] : reserves[0]));
        const usdcReserve = parseFloat(ethers.formatUnits(isToken0Usdc ? reserves[0] : reserves[1], 6));
        console.log('Parsed reserves:', { vtruReserve, usdcReserve });

        // Validate reserve values
        if (isNaN(vtruReserve) || isNaN(usdcReserve) || vtruReserve <= 0) {
            throw new Error('Invalid reserve values: ' + JSON.stringify({ vtruReserve, usdcReserve }));
        }

        // Calculate rate and total value
        const rate = usdcReserve / vtruReserve;
        const totalValue = usdcReserve + (vtruReserve * rate);

        console.log('LP data calculation successful:', { rate, totalValue });

        return {
            vtruReserve,
            usdcReserve,
            rate,
            totalValue,
            lastUpdated: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error in getLpDetails:', error);
        throw new Error('Failed to get LP data: ' + error.message);
    }
}

// Enhanced marketplace stats calculation with rarity floor prices
async function calculateMarketplaceStats() {
    try {
        console.log('Calculating marketplace stats from blockchain data');

        // Get VTRU/USDC price for volume conversion
        const vtruPriceInUsdc = await getVtruUsdcPrice();

        // Get all listings directly from the contract
        const listings = await marketplace.getListings();
        console.log('Raw listings from contract:', listings);

        // Filter for active listings only
        const activeListings = listings.filter(listing => listing.active);
        const activeListingCount = activeListings.length;
        console.log(`Found ${activeListingCount} active listings`);

        // Track floor prices by currency type and rarity
        let lowestNativeListing = null;
        let lowestUSDCListing = null;
        const rarityFloorPrices = {
            legendary: { native: null, usdc: null },
            epic: { native: null, usdc: null },
            rare: { native: null, usdc: null },
            common: { native: null, usdc: null }
        };
        const rarityCounts = {
            legendary: 0,
            epic: 0,
            rare: 0,
            common: 0
        };

        // Process each active listing
        for (const listing of activeListings) {
            const price = listing.price;
            const tokenId = listing.tokenId;
            const currency = listing.currency;
            const isNative = currency === ethers.ZeroAddress;

            // Get rarity for this token - try to get metadata first for accurate rarity
            let rarity;
            try {
                const metadata = await fetchTokenMetadata(tokenId);
                rarity = getRarity(tokenId, metadata);
            } catch (error) {
                // Fallback to ID-based rarity if metadata fetch fails
                rarity = getRarity(tokenId);
            }
            rarityCounts[rarity]++;

            // Track rarity floor prices
            if (isNative) {
                if (!rarityFloorPrices[rarity].native || price < rarityFloorPrices[rarity].native.price) {
                    rarityFloorPrices[rarity].native = { price, tokenId };
                }
            } else if (currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                if (!rarityFloorPrices[rarity].usdc || price < rarityFloorPrices[rarity].usdc.price) {
                    rarityFloorPrices[rarity].usdc = { price, tokenId };
                }
            }

            // Track overall floor prices
            if (isNative) {
                if (lowestNativeListing === null || price < lowestNativeListing.price) {
                    lowestNativeListing = listing;
                }
            } else if (currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                if (lowestUSDCListing === null || price < lowestUSDCListing.price) {
                    lowestUSDCListing = listing;
                }
            }
        }

        // Determine the absolute floor price by comparing both currencies
        let floorPrice = null;
        let floorPriceCurrency = null;

        const nativeFloorPriceUSD = lowestNativeListing ?
            parseFloat(ethers.formatEther(lowestNativeListing.price)) * vtruPriceInUsdc : Infinity;
        const usdcFloorPriceUSD = lowestUSDCListing ?
            parseFloat(ethers.formatUnits(lowestUSDCListing.price, 6)) : Infinity;

        if (usdcFloorPriceUSD <= nativeFloorPriceUSD && lowestUSDCListing) {
            floorPrice = parseFloat(ethers.formatUnits(lowestUSDCListing.price, 6));
            floorPriceCurrency = 'USDC';
        } else if (lowestNativeListing) {
            floorPrice = parseFloat(ethers.formatEther(lowestNativeListing.price));
            floorPriceCurrency = 'VTRU';
        }

        // Get sales data
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 100000);
        const soldFilter = marketplace.filters.ItemSold();
        const soldEvents = await marketplace.queryFilter(soldFilter, fromBlock, 'latest');

        // Calculate volumes
        let totalVolumeNative = BigInt(0);
        let totalVolumeUSDC = BigInt(0);
        let volume24hNative = BigInt(0);
        let volume24hUSDC = BigInt(0);

        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);

        for (const event of soldEvents) {
            if (event.args) {
                const price = event.args.price;
                const currency = event.args.currency;
                const blockTimestamp = (await provider.getBlock(event.blockNumber)).timestamp * 1000;

                if (currency === ethers.ZeroAddress) {
                    totalVolumeNative += price;
                    if (blockTimestamp >= oneDayAgo) {
                        volume24hNative += price;
                    }
                } else if (currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                    totalVolumeUSDC += price;
                    if (blockTimestamp >= oneDayAgo) {
                        volume24hUSDC += price;
                    }
                }
            }
        }

        // Convert volumes to human-readable format
        const volumeNative = parseFloat(ethers.formatEther(totalVolumeNative));
        const volumeUSDC = parseFloat(ethers.formatUnits(totalVolumeUSDC, 6));
        const volume24hNativeValue = parseFloat(ethers.formatEther(volume24hNative));
        const volume24hUSDCValue = parseFloat(ethers.formatUnits(volume24hUSDC, 6));

        // Calculate total volumes in USDC equivalent
        const nativeVolumeInUsdc = volumeNative * vtruPriceInUsdc;
        const totalVolumeInUsdc = nativeVolumeInUsdc + volumeUSDC;
        const total24hVolumeInUsdc = (volume24hNativeValue * vtruPriceInUsdc) + volume24hUSDCValue;

        // Calculate total value locked (all active listings)
        let totalValueLockedNative = BigInt(0);
        let totalValueLockedUSDC = BigInt(0);

        for (const listing of activeListings) {
            if (listing.currency === ethers.ZeroAddress) {
                totalValueLockedNative += listing.price;
            } else if (listing.currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
                totalValueLockedUSDC += listing.price;
            }
        }

        const tvlNative = parseFloat(ethers.formatEther(totalValueLockedNative));
        const tvlUSDC = parseFloat(ethers.formatUnits(totalValueLockedUSDC, 6));
        const totalValueLocked = (tvlNative * vtruPriceInUsdc) + tvlUSDC;

        // Calculate average listing duration (placeholder for now)
        const avgListingDuration = '3.2 days'; // This would require more complex tracking

        // Construct stats object
        const stats = {
            totalVolume: volumeNative,
            volumeUSDC: volumeUSDC,
            totalVolumeInUsdc: totalVolumeInUsdc,
            volume24hInUsdc: total24hVolumeInUsdc,
            totalValueLocked: totalValueLocked,
            vtruPriceInUsdc: vtruPriceInUsdc,
            activeListings: activeListingCount,
            floorPrice: floorPrice,
            floorPriceCurrency: floorPriceCurrency,
            totalSales: soldEvents.length,
            rarityFloorPrices: rarityFloorPrices,
            rarityCounts: rarityCounts,
            avgListingDuration: avgListingDuration
        };

        console.log('Final marketplace stats:', stats);

        // Update the UI with real data
        if (window.updateMarketplaceStats) {
            window.updateMarketplaceStats(stats);
        }

        // Update rarity floor prices
        updateRarityFloorPrices(stats);

        return stats;
    } catch (error) {
        console.error('Error calculating marketplace stats:', error);
        return {
            totalVolume: 0,
            volumeUSDC: 0,
            totalVolumeInUsdc: 0,
            volume24hInUsdc: 0,
            totalValueLocked: 0,
            vtruPriceInUsdc: 0.1,
            activeListings: 0,
            floorPrice: null,
            floorPriceCurrency: null,
            totalSales: 0,
            rarityFloorPrices: {},
            rarityCounts: { legendary: 0, epic: 0, rare: 0, common: 0 },
            avgListingDuration: '-- days'
        };
    }
}

// Update rarity floor prices display
function updateRarityFloorPrices(stats) {
    const rarities = ['legendary', 'epic', 'rare', 'common'];

    rarities.forEach(rarity => {
        const floorElement = document.getElementById(`${rarity}Floor`);
        const countElement = document.getElementById(`${rarity}Count`);

        if (floorElement && countElement) {
            const rarityData = stats.rarityFloorPrices[rarity];
            const count = stats.rarityCounts[rarity];

            // Find the lowest price between native and USDC
            let lowestPrice = null;
            let currency = null;

            if (rarityData.native && rarityData.usdc) {
                const nativePrice = parseFloat(ethers.formatEther(rarityData.native.price));
                const usdcPrice = parseFloat(ethers.formatUnits(rarityData.usdc.price, 6));
                const nativePriceUSD = nativePrice * stats.vtruPriceInUsdc;

                if (usdcPrice <= nativePriceUSD) {
                    lowestPrice = usdcPrice;
                    currency = 'USDC';
                } else {
                    lowestPrice = nativePrice;
                    currency = 'VTRU';
                }
            } else if (rarityData.native) {
                lowestPrice = parseFloat(ethers.formatEther(rarityData.native.price));
                currency = 'VTRU';
            } else if (rarityData.usdc) {
                lowestPrice = parseFloat(ethers.formatUnits(rarityData.usdc.price, 6));
                currency = 'USDC';
            }

            if (lowestPrice !== null) {
                floorElement.textContent = `${lowestPrice.toFixed(2)} ${currency}`;
            } else {
                floorElement.textContent = 'No listings';
            }

            countElement.textContent = `${count} available`;
        }
    });

    // Update advanced analytics
    const volume24hElement = document.getElementById('volume24h');
    const avgListingElement = document.getElementById('avgListingDuration');
    const totalValueLockedElement = document.getElementById('totalValueLocked');

    if (volume24hElement) {
        volume24hElement.textContent = `$${stats.volume24hInUsdc.toFixed(2)} USDC`;
    }

    if (avgListingElement) {
        avgListingElement.textContent = stats.avgListingDuration;
    }

    if (totalValueLockedElement) {
        totalValueLockedElement.textContent = `$${stats.totalValueLocked.toFixed(2)} USDC`;
    }
}

// Calculate collection value based on user's cats and floor prices
async function calculateCollectionValue(userCats, stats) {
    if (!userCats || userCats.length === 0) return { total: 0, currency: 'USDC', breakdown: {} };

    let totalValueInUsdc = 0;
    const breakdown = {
        legendary: { count: 0, value: 0 },
        epic: { count: 0, value: 0 },
        rare: { count: 0, value: 0 },
        common: { count: 0, value: 0 }
    };

    for (const tokenId of userCats) {
        let rarity;
        try {
            const metadata = await fetchTokenMetadata(tokenId);
            rarity = getRarity(tokenId, metadata);
        } catch (error) {
            // Fallback to ID-based rarity if metadata fetch fails
            rarity = getRarity(tokenId);
        }
        breakdown[rarity].count++;

        // Get floor price for this rarity
        const rarityFloor = stats.rarityFloorPrices[rarity];
        if (rarityFloor) {
            let floorValueInUsdc = 0;

            if (rarityFloor.native && rarityFloor.usdc) {
                const nativePrice = parseFloat(ethers.formatEther(rarityFloor.native.price));
                const usdcPrice = parseFloat(ethers.formatUnits(rarityFloor.usdc.price, 6));
                const nativePriceUSD = nativePrice * stats.vtruPriceInUsdc;

                floorValueInUsdc = Math.min(usdcPrice, nativePriceUSD);
            } else if (rarityFloor.native) {
                const nativePrice = parseFloat(ethers.formatEther(rarityFloor.native.price));
                floorValueInUsdc = nativePrice * stats.vtruPriceInUsdc;
            } else if (rarityFloor.usdc) {
                floorValueInUsdc = parseFloat(ethers.formatUnits(rarityFloor.usdc.price, 6));
            }

            breakdown[rarity].value += floorValueInUsdc;
            totalValueInUsdc += floorValueInUsdc;
        }
    }

    return {
        total: totalValueInUsdc,
        currency: 'USDC',
        breakdown: breakdown
    };
}

// Update collection value display
async function updateCollectionValueDisplay() {
    const collectionValueElement = document.getElementById('collectionValue');
    const collectionValueSubtextElement = document.getElementById('collectionValueSubtext');

    if (!collectionValueElement || !currentAccount) return;

    try {
        // Get current marketplace stats
        const stats = await calculateMarketplaceStats();

        // Calculate collection value
        const collectionValue = await calculateCollectionValue(userCats, stats);

        if (collectionValue.total > 0) {
            collectionValueElement.textContent = `$${collectionValue.total.toFixed(2)} USDC`;

            // Create breakdown tooltip
            const breakdown = Object.entries(collectionValue.breakdown)
                .filter(([_, data]) => data.count > 0)
                .map(([rarity, data]) => `${data.count} ${rarity}: $${data.value.toFixed(2)}`)
                .join(' • ');

            collectionValueSubtextElement.textContent = breakdown || 'Based on floor prices';
        } else {
            collectionValueElement.textContent = '$0.00 USDC';
            collectionValueSubtextElement.textContent = 'No floor prices available';
        }
    } catch (error) {
        console.error('Error calculating collection value:', error);
        collectionValueElement.textContent = 'Error calculating';
        collectionValueSubtextElement.textContent = 'Please try again';
    }
}
