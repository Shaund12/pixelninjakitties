/* global ethers, fetch */
// Import the CONNECTION_KEY from connect-only.js
const CONNECTION_KEY = 'ninja_cats_wallet';

// Keep your original imports for functionality
import './wallet.js';
import {
    CONTRACT_ADDRESS, NFT_ABI, RPC_URL
} from './config.js';
import {
    getAddress, connectWallet, short
} from './wallet.js';

const grid = document.getElementById('grid');
const detailedView = document.getElementById('detailedView');
const count = document.getElementById('count');
const dashboard = document.getElementById('dashboard');
const controls = document.getElementById('controls');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('emptyState');

// Connect to Vitruveo network
console.log("Connecting to Vitruveo RPC:", RPC_URL);
const rpc = new ethers.JsonRpcProvider(RPC_URL);
const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, rpc);

// Global state
let allNftData = [];
let filteredNftData = [];
let currentBreedFilter = '';
let currentSortOption = 'newest';

// Check for persistent wallet connection from connect-only.js
document.addEventListener('DOMContentLoaded', () => {
    // Display contract info without selector
    addContractDisplay();

    const savedAddress = localStorage.getItem(CONNECTION_KEY);
    if (savedAddress) {
        console.log("Using wallet from connect-only.js:", savedAddress);
        render(savedAddress);

        // Update any other UI elements if needed
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) {
            connectBtn.textContent = short(savedAddress);
        }
    } else {
        // Fall back to original connection system
        silentBoot();
    }

    // Set up event listeners for filters and sorting
    document.getElementById('breedFilter').addEventListener('change', (e) => {
        currentBreedFilter = e.target.value;
        applyFiltersAndSort();
    });

    document.getElementById('sortBy').addEventListener('change', (e) => {
        currentSortOption = e.target.value;
        applyFiltersAndSort();
    });

    // Set up event listener for pagination
    document.addEventListener('pageChanged', (e) => {
        const { page, itemsPerPage } = e.detail;
        renderPage(page, itemsPerPage);
    });
});

// Just display the contract address for reference
function addContractDisplay() {
    const header = document.querySelector('h1');
    if (header) {
        const addressDisplay = document.createElement('div');
        addressDisplay.id = 'contractAddressDisplay';
        addressDisplay.style.fontSize = '0.8rem';
        addressDisplay.style.color = '#8a8a8a';
        addressDisplay.style.marginTop = '0.5rem';
        addressDisplay.textContent = `Vitruveo Contract: ${short(CONTRACT_ADDRESS)}`;
        header.insertAdjacentElement('afterend', addressDisplay);
    }
}

// Original silent boot logic
async function silentBoot() {
    const addr = await getAddress();
    if (addr) render(addr);
}

/* nav button re-uses connectWallet */
document.getElementById('connectBtn').addEventListener('click', async () => {
    // Check if already connected via connect-only.js
    const savedAddress = localStorage.getItem(CONNECTION_KEY);
    if (savedAddress) {
        render(savedAddress);
        return;
    }

    // Fall back to original connection
    const { addr } = await connectWallet(document.getElementById('connectBtn'));
    render(addr);
});

// Apply filters and sorting
function applyFiltersAndSort() {
    // Apply breed filter
    if (currentBreedFilter) {
        filteredNftData = allNftData.filter(nft =>
            nft.breed.toLowerCase() === currentBreedFilter.toLowerCase()
        );
    } else {
        filteredNftData = [...allNftData];
    }

    // Apply sorting
    switch (currentSortOption) {
        case 'newest':
            filteredNftData.sort((a, b) => Number(b.id) - Number(a.id));
            break;
        case 'oldest':
            filteredNftData.sort((a, b) => Number(a.id) - Number(b.id));
            break;
        case 'rarity':
            filteredNftData.sort((a, b) => Number(a.rarityScore || 0) - Number(b.rarityScore || 0));
            break;
        case 'breed':
            filteredNftData.sort((a, b) => a.breed.localeCompare(b.breed));
            break;
    }

    // Trigger pagination update with new filtered data
    const event = new CustomEvent('kittyDataLoaded', {
        detail: {
            count: filteredNftData.length
        }
    });
    document.dispatchEvent(event);

    // Render first page
    renderPage(1, parseInt(document.getElementById('itemsPerPage').value));
}

// Render a specific page of NFTs
function renderPage(page, itemsPerPage) {
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, filteredNftData.length);

    // Get the current page items
    const pageItems = filteredNftData.slice(startIdx, endIdx);

    // Clear grid and detailed view
    grid.innerHTML = '';
    detailedView.innerHTML = '';

    // Render each NFT on the page
    pageItems.forEach(nft => {
        renderNftCard(nft);
        renderDetailedCard(nft);
    });
}

// Render NFT card using real blockchain data only
// Render NFT card using real blockchain data only
function renderNftCard(nft) {
    // Clone the template
    const template = document.getElementById('kittyCardTemplate');
    const card = template.content.cloneNode(true);

    // Set card class and data
    const cardElement = card.querySelector('.kitty-card');
    cardElement.dataset.tokenId = nft.id;

    // Set rarity badge if we have real rarity data
    const rarityBadge = card.querySelector('.kitty-rarity');
    if (nft.rarityTier) {
        rarityBadge.textContent = nft.rarityTier.charAt(0).toUpperCase() + nft.rarityTier.slice(1);
        rarityBadge.classList.add(nft.rarityTier);

        // Add legendary styling if applicable
        if (nft.rarityTier === 'legendary') {
            cardElement.classList.add('legendary-card');
        }
    } else {
        rarityBadge.style.display = 'none';
    }

    // Set image with error handling
    const image = card.querySelector('.kitty-image');
    image.src = nft.image;
    image.alt = nft.name;
    image.onerror = function () {
        this.src = 'assets/detailed_ninja_cat_64.png';
    };

    // Set name and ID
    card.querySelector('.kitty-name').firstChild.textContent = nft.name;
    card.querySelector('.kitty-id').textContent = `#${nft.id}`;

    // Set breed
    card.querySelector('.kitty-breed span').textContent = nft.breed || 'Unknown Breed';

    // Hide stats section since we don't want mock data
    const statsSection = card.querySelector('.kitty-stats');
    if (statsSection) {
        statsSection.style.display = 'none';
    }

    // Set traits
    const traitsContainer = card.querySelector('.kitty-traits');
    traitsContainer.innerHTML = ''; // Clear default traits

    // Add up to 3 real traits from metadata
    if (nft.traits && nft.traits.length) {
        nft.traits.slice(0, 3).forEach(trait => {
            const traitEl = document.createElement('span');
            traitEl.className = 'trait';
            traitEl.textContent = trait.value || trait;
            traitsContainer.appendChild(traitEl);
        });
    }

    // Get actions container
    const actionsContainer = card.querySelector('.actions');

    // Set button actions
    const viewDetailsBtn = card.querySelector('.view-details');
    viewDetailsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `kitty.html?id=${nft.id}&contract=${CONTRACT_ADDRESS}`;
    });

    const listForSaleBtn = card.querySelector('.share-btn');
    listForSaleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `marketplace.html?list=${nft.id}`;
    });

    // Add burn button
    const burnBtn = document.createElement('button');
    burnBtn.className = 'action-btn burn-btn';
    burnBtn.textContent = 'Burn';
    burnBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await confirmAndBurnToken(nft.id, nft.name);
    });
    actionsContainer.appendChild(burnBtn);

    // Add the card to the grid
    grid.appendChild(card);
}

// Add function to confirm and burn token
async function confirmAndBurnToken(tokenId, tokenName) {
    // Show confirmation dialog
    const confirmed = confirm(`WARNING: You are about to permanently destroy ${tokenName} (#${tokenId}).\n\nThis action CANNOT be undone. The NFT will be lost forever.\n\nAre you absolutely sure?`);

    if (!confirmed) return;

    // Double-check confirmation for safety
    const doubleConfirmed = confirm(`FINAL WARNING: Burning ${tokenName} (#${tokenId}) will permanently remove it from your wallet.\n\nType 'BURN' in the next prompt to confirm.`);

    if (!doubleConfirmed) return;

    const burnConfirmation = prompt(`To burn ${tokenName} (#${tokenId}), please type BURN below:`);
    if (burnConfirmation !== 'BURN') {
        alert('Burn cancelled.');
        return;
    }

    try {
        // Show loading indicator
        const loadingToast = showToast('Initiating burn transaction...', 'info', 0);

        // Get browser provider for sending transaction
        if (!window.ethereum) {
            throw new Error('No wallet provider detected');
        }

        const browserProvider = new ethers.BrowserProvider(window.ethereum);
        const signer = await browserProvider.getSigner();
        const connectedNft = nft.connect(signer);

        // Call burn function on the contract
        const tx = await connectedNft.burn(tokenId);

        // Update loading toast
        if (loadingToast) {
            loadingToast.innerHTML = 'Transaction submitted, waiting for confirmation...';
        }

        // Wait for transaction confirmation
        const receipt = await tx.wait();

        // Remove loading toast
        if (loadingToast) {
            document.body.removeChild(loadingToast);
        }

        // Show success message
        showToast(`Successfully burned ${tokenName} (#${tokenId})`, 'success');

        // Reload the page after a short delay to refresh the NFT list
        setTimeout(() => {
            const savedAddress = localStorage.getItem(CONNECTION_KEY);
            if (savedAddress) {
                render(savedAddress);
            }
        }, 2000);

    } catch (error) {
        console.error('Error burning token:', error);
        showToast(`Error burning token: ${error.message || 'Unknown error'}`, 'error');
    }
}

// Helper function to show toast notifications
function showToast(message, type = 'info', duration = 5000) {
    // Create toast container if it doesn't exist
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);

        // Add toast styles
        const style = document.createElement('style');
        style.textContent = `
            .toast-container {
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 1000;
            }
            .toast {
                background: #333;
                color: white;
                padding: 12px 20px;
                border-radius: 4px;
                margin-top: 10px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                min-width: 250px;
                opacity: 0;
                transform: translateY(20px);
                transition: all 0.3s ease;
            }
            .toast.show {
                opacity: 1;
                transform: translateY(0);
            }
            .toast.info { background: #2196F3; }
            .toast.success { background: #4CAF50; }
            .toast.error { background: #F44336; }
            
            .burn-btn {
                background: #F44336;
                color: white;
            }
            .burn-btn:hover {
                background: #D32F2F;
            }
        `;
        document.head.appendChild(style);
    }

    // Create toast
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    // Add to container
    toastContainer.appendChild(toast);

    // Trigger animation
    setTimeout(() => toast.classList.add('show'), 10);

    // Auto remove after duration (if duration > 0)
    if (duration > 0) {
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toastContainer.removeChild(toast), 300);
        }, duration);
    }

    return toast;
}

// Render detailed card with real data only
function renderDetailedCard(nft) {
    const template = document.getElementById('detailedCardTemplate');
    const card = template.content.cloneNode(true);

    // Set image with error handling
    const image = card.querySelector('.detailed-image');
    image.src = nft.image;
    image.alt = nft.name;
    image.onerror = function () {
        this.src = 'assets/detailed_ninja_cat_64.png';
    };

    // Set basic info
    card.querySelector('h2').textContent = nft.name;
    card.querySelector('.cat-breed').textContent = nft.breed || 'Unknown Breed';

    // Only set real data for mint date
    const mintDateElement = card.querySelector('.mint-date');
    if (nft.mintDate) {
        mintDateElement.textContent = nft.mintDate;
    } else {
        mintDateElement.parentElement.style.display = 'none';
    }

    // Only show real rarity data
    const rarityElement = card.querySelector('.rarity-score');
    if (nft.rarityScore) {
        rarityElement.textContent = nft.rarityScore;
    } else {
        rarityElement.parentElement.style.display = 'none';
    }

    // Set traits
    const traitsContainer = card.querySelector('.detailed-traits');
    traitsContainer.innerHTML = ''; // Clear any existing traits

    if (nft.traits && nft.traits.length) {
        nft.traits.forEach(trait => {
            const traitEl = document.createElement('div');
            traitEl.className = 'detailed-trait';

            const traitType = document.createElement('div');
            traitType.className = 'trait-type';
            traitType.textContent = trait.trait_type || 'Attribute';

            const traitValue = document.createElement('div');
            traitValue.className = 'trait-value';
            traitValue.textContent = trait.value || trait;

            traitEl.appendChild(traitType);
            traitEl.appendChild(traitValue);
            traitsContainer.appendChild(traitEl);
        });
    }

    // Set button actions
    const buttons = card.querySelectorAll('.detailed-actions .btn');

    // Vitruveo explorer button
    buttons[0].addEventListener('click', () => {
        // Open Vitruveo explorer with the correct URL - update this when available
        window.open(`https://explorer.vitruveo.xyz/tokens/${CONTRACT_ADDRESS}/${nft.id}`, '_blank');
    });

    // List for sale
    buttons[1].addEventListener('click', () => {
        window.location.href = `marketplace.html?list=${nft.id}`;
    });

    // Share button
    buttons[2].addEventListener('click', () => {
        if (navigator.share) {
            navigator.share({
                title: nft.name,
                text: `Check out my NFT on Vitruveo!`,
                url: window.location.origin + `/kitty.html?id=${nft.id}&contract=${CONTRACT_ADDRESS}`
            });
        } else {
            navigator.clipboard.writeText(window.location.origin + `/kitty.html?id=${nft.id}&contract=${CONTRACT_ADDRESS}`);
            alert('Link copied to clipboard!');
        }
    });

    // Add the card to the detailed view
    detailedView.appendChild(card);
}

// Update dashboard with real data only
function updateDashboard(nfts) {
    // Total count
    document.getElementById('totalCount').textContent = nfts.length;

    // Only show real data or hide stats
    const rarestElement = document.getElementById('rarestRarity');
    const breedElement = document.getElementById('breedDistribution');

    // Set breed distribution if we have real data
    const breedCounts = {};
    nfts.forEach(nft => {
        if (nft.breed) {
            breedCounts[nft.breed] = (breedCounts[nft.breed] || 0) + 1;
        }
    });

    let mostCommonBreed = '';
    let highestCount = 0;

    for (const breed in breedCounts) {
        if (breedCounts[breed] > highestCount) {
            mostCommonBreed = breed;
            highestCount = breedCounts[breed];
        }
    }

    if (mostCommonBreed) {
        breedElement.textContent = mostCommonBreed;
    } else {
        breedElement.textContent = 'Unknown';
    }

    // We'll hide rarity stats since we don't have real ones
    rarestElement.textContent = 'N/A';
}

// Improved metadata fetching specifically for Vitruveo IPFS
async function fetchMetadataWithFallbacks(uri, id) {
    // Check for empty URI
    if (!uri || uri === '') {
        console.error(`Token #${id} has empty URI`);
        return createFallbackMetadata(id);
    }

    console.log(`Fetching metadata for token #${id}, URI: ${uri}`);

    // List of IPFS gateways optimized for Vitruveo
    const gateways = [
        'https://ipfs.io/ipfs/',
        'https://gateway.pinata.cloud/ipfs/',
        'https://cloudflare-ipfs.com/ipfs/',
        'https://ipfs.infura.io/ipfs/'
    ];

    // Extract CID from IPFS URI
    const cid = uri.replace('ipfs://', '');

    if (!cid) {
        console.error(`Invalid IPFS URI for token #${id}: ${uri}`);
        return createFallbackMetadata(id);
    }

    // Try each gateway in sequence until one works
    for (const gateway of gateways) {
        try {
            const url = `${gateway}${cid}`;
            console.log(`Trying to fetch metadata from ${url}`);

            const response = await fetch(url);

            // Validate response
            if (!response.ok) {
                console.warn(`Gateway ${gateway} returned status ${response.status}`);
                continue;
            }

            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                console.warn(`Gateway ${gateway} returned non-JSON content: ${contentType}`);
                continue;
            }

            const data = await response.json();
            console.log(`Successfully fetched metadata from ${gateway} for token #${id}`);
            return data;
        } catch (error) {
            console.warn(`Failed to fetch from ${gateway}:`, error);
        }
    }

    // All gateways failed, return fallback
    return createFallbackMetadata(id);
}

// Create fallback metadata without mocked values
function createFallbackMetadata(id) {
    return {
        name: `NFT #${id}`,
        description: "Metadata unavailable",
        image: 'assets/detailed_ninja_cat_64.png',
        attributes: []
    };
}

// Main render function for Vitruveo NFTs
async function render(owner) {
    console.log(`Rendering NFTs for ${owner} from Vitruveo contract ${CONTRACT_ADDRESS}`);

    // Clear previous data
    grid.innerHTML = '';
    detailedView.innerHTML = '';
    allNftData = [];
    filteredNftData = [];

    // Show loading state
    loading.style.display = 'flex';
    dashboard.style.display = 'none';
    controls.style.display = 'none';
    emptyState.style.display = 'none';

    try {
        // Get balance from Vitruveo network
        const bal = Number(await nft.balanceOf(owner));
        console.log(`Owner has ${bal} NFTs on Vitruveo contract ${CONTRACT_ADDRESS}`);

        // Update count
        count.textContent = `You own ${bal} NFTs on Vitruveo`;

        if (!bal) {
            loading.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        // Fetch all NFT data from Vitruveo
        for (let i = 0; i < bal; i++) {
            try {
                const id = await nft.tokenOfOwnerByIndex(owner, i);
                console.log(`Processing NFT #${id}`);

                const uri = await nft.tokenURI(id);
                console.log(`URI for NFT #${id}: ${uri}`);

                const meta = await fetchMetadataWithFallbacks(uri, id);

                // Extract breed from attributes if available
                let breed = "Unknown";
                let traits = [];

                if (meta.attributes && meta.attributes.length) {
                    const breedAttr = meta.attributes.find(attr =>
                        attr.trait_type === "Breed" ||
                        attr.trait_type === "breed"
                    );
                    if (breedAttr) breed = breedAttr.value;
                    traits = meta.attributes;
                }

                // Populate breed filter
                const breedFilter = document.getElementById('breedFilter');
                if (breed !== "Unknown" && !Array.from(breedFilter.options).some(option => option.value === breed)) {
                    const option = document.createElement('option');
                    option.value = breed;
                    option.textContent = breed;
                    breedFilter.appendChild(option);
                }

                // Process image URL
                let imageUrl = meta.image;
                if (imageUrl && imageUrl.startsWith('ipfs://')) {
                    const cid = imageUrl.replace('ipfs://', '');
                    imageUrl = `https://ipfs.io/ipfs/${cid}`;
                } else if (!imageUrl) {
                    imageUrl = 'assets/detailed_ninja_cat_64.png';
                }

                allNftData.push({
                    id: id.toString(),
                    name: meta.name || `NFT #${id}`,
                    image: imageUrl,
                    breed,
                    traits
                });

            } catch (tokenError) {
                console.error(`Error fetching token #${i}:`, tokenError);
            }
        }

        // Show dashboard and controls
        dashboard.style.display = 'flex';
        controls.style.display = 'flex';

        // Update dashboard stats
        updateDashboard(allNftData);

        // Apply initial filters and sorting
        applyFiltersAndSort();

    } catch (error) {
        console.error("Error rendering NFTs from Vitruveo:", error);
        count.textContent = `Error loading your NFTs: ${error.message}`;
    } finally {
        loading.style.display = 'none';
    }
}