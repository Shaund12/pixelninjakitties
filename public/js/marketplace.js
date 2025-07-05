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

// Determine rarity based on ID
function getRarity(id) {
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

        const token = {
            id: tokenId,
            metadata,
            rarity: getRarity(tokenId)
        };

        tokenCache[tokenId] = token;
        return token;
    } catch (error) {
        console.error(`Error fetching metadata for token #${tokenId}:`, error);
        return null;
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
            <p>Error loading listings: ${error.message}</p>
            <button onclick="window.location.reload()">Try Again</button>
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

        const card = document.createElement('div');
        card.className = 'listing-card';
        card.dataset.tokenId = tokenId;

        card.innerHTML = `
            <div class="rarity-badge ${token.rarity}">${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</div>
            <img src="${token.metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" class="listing-image" alt="${token.metadata.name}">
            <div class="listing-info">
                <h3>${token.metadata.name}</h3>
                <div>Token ID: #${tokenId}</div>
                <div>Breed: ${token.metadata.attributes[0].value}</div>
                <div>Seller: ${sellerAddress.slice(0, 6)}...${sellerAddress.slice(-4)}</div>
                <div class="listing-price">
                    ${formattedPrice} <span class="listing-price-currency">${currencyName}</span>
                </div>
                <div class="listing-actions">
                    <button class="buy-btn" data-token-id="${tokenId}" data-currency="${listing.currency}">
                        Buy Now
                    </button>
                </div>
            </div>
        `;

        // Add buy button event listener
        const buyBtn = card.querySelector('.buy-btn');
        buyBtn.addEventListener('click', () => buyListing(tokenId, listing.price, listing.currency));

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
                <img src="${token.metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" class="listing-image" alt="${token.metadata.name}">
                <div class="listing-info">
                    <h3>${token.metadata.name}</h3>
                    <div>Token ID: #${tokenId}</div>
                    <div>Breed: ${token.metadata.attributes[0].value}</div>
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
                <img src="${token.metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" class="listing-image" alt="${token.metadata.name}">
                <div class="listing-info">
                    <h3>${token.metadata.name}</h3>
                    <div>Token ID: #${tokenId}</div>
                    <div>Breed: ${token.metadata.attributes[0].value}</div>
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
    }
}

// Show form to create a new listing
function showListingForm(token) {
    selectedCatForListing = token;

    const selectedCatDiv = listingForm.querySelector('.selected-cat');
    selectedCatDiv.innerHTML = `
        <div style="display: flex; gap: 1rem; margin-bottom: 1.5rem;">
            <img src="${token.metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" 
                 style="width: 100px; height: 100px; object-fit: cover; border-radius: 8px;" 
                 alt="${token.metadata.name}">
            <div>
                <h3>${token.metadata.name}</h3>
                <div>Token ID: #${token.id}</div>
                <div>Breed: ${token.metadata.attributes[0].value}</div>
                <div>Rarity: ${token.rarity.charAt(0).toUpperCase() + token.rarity.slice(1)}</div>
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
                const approveTx = await usdc.approve(MARKETPLACE_ADDRESS, ethers.MaxUint256);
                await approveTx.wait();
                console.log("USDC approval granted to marketplace");
            }
        } else {
            priceInSmallestUnits = ethers.parseEther(price.toString());
            currency = ethers.ZeroAddress; // Native currency
        }

        // Check and request NFT approval if needed
        const approved = await nft.getApproved(tokenId);
        if (approved.toLowerCase() !== MARKETPLACE_ADDRESS.toLowerCase()) {
            const approveTx = await nft.approve(MARKETPLACE_ADDRESS, tokenId);
            await approveTx.wait();
            console.log("NFT approval granted to marketplace");
        }

        // Create the listing
        const tx = await marketplace.createListing(tokenId, priceInSmallestUnits, currency);
        await tx.wait();

        alert(`Listing created successfully for token #${tokenId}`);

        // Reload user's cats and listings
        hideListingForm();
        await loadUserCats();
        await loadUserListings();
        await loadListings(); // Also refresh all listings

    } catch (error) {
        console.error("Error creating listing:", error);
        alert(`Error creating listing: ${error.message}`);
    }
}

// Cancel a listing
async function cancelListing(tokenId) {
    if (!confirm(`Are you sure you want to cancel the listing for token #${tokenId}?`)) {
        return;
    }

    try {
        const tx = await marketplace.cancelListing(tokenId);
        await tx.wait();

        alert(`Listing for token #${tokenId} has been cancelled`);

        // Reload listings
        await loadUserCats();
        await loadUserListings();
        await loadListings();

    } catch (error) {
        console.error("Error cancelling listing:", error);
        alert(`Error cancelling listing: ${error.message}`);
    }
}

// Buy a listed NFT
async function buyListing(tokenId, price, currency) {
    if (!currentAccount) {
        alert("Please connect your wallet to make a purchase");
        return;
    }

    try {
        // Get signer from browser provider for transactions
        if (!browserProvider) {
            throw new Error("Browser provider not available");
        }

        const signer = await browserProvider.getSigner();
        const connectedMarketplace = marketplace.connect(signer);
        const connectedUsdc = usdc.connect(signer);

        let tx;

        if (currency.toLowerCase() === USDC_ADDRESS.toLowerCase()) {
            // ERC-20 (USDC) purchase
            const allowance = await connectedUsdc.allowance(currentAccount, MARKETPLACE_ADDRESS);

            if (allowance < price) {
                // Approve marketplace to spend USDC
                const approveTx = await connectedUsdc.approve(MARKETPLACE_ADDRESS, ethers.MaxUint256);
                await approveTx.wait();
                console.log("USDC approval granted to marketplace");
            }

            // Buy with USDC
            tx = await connectedMarketplace.buyItemWithERC20(tokenId);
        } else {
            // Native currency purchase
            tx = await connectedMarketplace.buyItem(tokenId, { value: price });
        }

        await tx.wait();

        alert(`Congratulations! You've purchased token #${tokenId}`);

        // Reload listings and user data
        await loadListings();
        if (sellContent.style.display === 'block') {
            await loadUserCats();
            await loadUserListings();
        }

    } catch (error) {
        console.error("Error buying token:", error);
        alert(`Error purchasing token: ${error.message}`);
    }
}

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
                alert("Please enter a valid price greater than 0");
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

    } catch (error) {
        console.error("Initialization error:", error);
    }
}

// Start the app when DOM is ready
document.addEventListener('DOMContentLoaded', init);