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
const rpc = new ethers.JsonRpcProvider(RPC_URL);
const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, rpc);

// Global state
let allNftData = [];
let filteredNftData = [];
let currentBreedFilter = '';
let currentSortOption = 'newest';

// Check for persistent wallet connection from connect-only.js
document.addEventListener('DOMContentLoaded', () => {
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
        // Fall back to your original connection system
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

// Helper function to get rarity tier based on ID
function getRarityTier(id) {
    id = Number(id);
    if (id % 100 === 0) return 'legendary';
    if (id % 10 === 0) return 'epic';
    if (id % 2 === 0) return 'rare';
    return 'common';
}

// Helper function to get rarity percentage
function getRarityPercentage(id) {
    id = Number(id);
    if (id % 100 === 0) return 1; // Top 1%
    if (id % 10 === 0) return 10; // Top 10%
    if (id % 2 === 0) return 30; // Top 30%
    return 100; // Common
}

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
            filteredNftData.sort((a, b) => a.rarityPercentage - b.rarityPercentage);
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

// Render NFT card using the new template
function renderNftCard(nft) {
    // Clone the template
    const template = document.getElementById('kittyCardTemplate');
    const card = template.content.cloneNode(true);

    // Set card class and data
    const cardElement = card.querySelector('.kitty-card');
    cardElement.dataset.tokenId = nft.id;

    // Add legendary styling if applicable
    if (nft.rarityTier === 'legendary') {
        cardElement.classList.add('legendary-card');
    }

    // Set rarity badge
    const rarityBadge = card.querySelector('.kitty-rarity');
    rarityBadge.textContent = nft.rarityTier.charAt(0).toUpperCase() + nft.rarityTier.slice(1);
    rarityBadge.classList.add(nft.rarityTier);

    // Set image
    const image = card.querySelector('.kitty-image');
    image.src = nft.image;
    image.alt = nft.name;

    // Set name and ID
    card.querySelector('.kitty-name').firstChild.textContent = nft.name;
    card.querySelector('.kitty-id').textContent = `#${nft.id}`;

    // Set breed
    card.querySelector('.kitty-breed span').textContent = nft.breed;

    // Set stats
    // Level is mocked based on ID for demo purposes
    const level = Math.max(1, Math.floor(Math.random() * 10));
    const levelPercent = level * 10;

    card.querySelector('.stat-item:nth-child(1) .stat-value-text').textContent = level;
    card.querySelector('.stat-item:nth-child(1) .progress-fill').style.width = `${levelPercent}%`;

    // Set rarity stats
    const rarityPercent = 100 - nft.rarityPercentage;
    card.querySelector('.stat-item:nth-child(2) .stat-value-text').textContent = `Top ${nft.rarityPercentage}%`;
    card.querySelector('.stat-item:nth-child(2) .progress-fill').style.width = `${rarityPercent}%`;

    // Set traits
    const traitsContainer = card.querySelector('.kitty-traits');
    traitsContainer.innerHTML = ''; // Clear default traits

    // Add up to 3 traits
    if (nft.traits && nft.traits.length) {
        nft.traits.slice(0, 3).forEach(trait => {
            const traitEl = document.createElement('span');
            traitEl.className = 'trait';
            traitEl.textContent = trait.value || trait;
            traitsContainer.appendChild(traitEl);
        });
    }

    // Set button actions
    const viewDetailsBtn = card.querySelector('.view-details');
    viewDetailsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `kitty.html?id=${nft.id}`;
    });

    const listForSaleBtn = card.querySelector('.share-btn');
    listForSaleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = `marketplace.html?list=${nft.id}`;
    });

    // Add the card to the grid
    grid.appendChild(card);
}

// Render detailed card for the detailed view
function renderDetailedCard(nft) {
    const template = document.getElementById('detailedCardTemplate');
    const card = template.content.cloneNode(true);

    // Set image
    card.querySelector('.detailed-image').src = nft.image;

    // Set basic info
    card.querySelector('h2').textContent = nft.name;
    card.querySelector('.cat-breed').textContent = nft.breed;

    // Set mint date (mocked for demo)
    const mintDate = new Date();
    mintDate.setDate(mintDate.getDate() - (Number(nft.id) % 30)); // Just for variety
    card.querySelector('.mint-date').textContent = mintDate.toLocaleDateString();

    // Set rarity score
    const rarityScore = 100 - nft.rarityPercentage;
    card.querySelector('.rarity-score').textContent = rarityScore.toFixed(1);

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

    // Etherscan button
    buttons[0].addEventListener('click', () => {
        const chainId = 84531; // Base Goerli
        window.open(`https://goerli.basescan.org/token/${CONTRACT_ADDRESS}?a=${nft.id}`, '_blank');
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
                text: `Check out my Ninja Cat NFT!`,
                url: window.location.origin + `/kitty.html?id=${nft.id}`
            });
        } else {
            navigator.clipboard.writeText(window.location.origin + `/kitty.html?id=${nft.id}`);
            alert('Link copied to clipboard!');
        }
    });

    // Add the card to the detailed view
    detailedView.appendChild(card);
}

// Update dashboard stats
function updateDashboard(nfts) {
    // Total count
    document.getElementById('totalCount').textContent = nfts.length;

    // Rarest cat
    const rarestCat = nfts.reduce((rarest, current) =>
        current.rarityPercentage < rarest.rarityPercentage ? current : rarest
        , { rarityPercentage: 100 });

    document.getElementById('rarestRarity').textContent = `Top ${rarestCat.rarityPercentage}%`;

    // Most common breed
    const breedCounts = {};
    nfts.forEach(nft => {
        breedCounts[nft.breed] = (breedCounts[nft.breed] || 0) + 1;
    });

    let mostCommonBreed = '';
    let highestCount = 0;

    for (const breed in breedCounts) {
        if (breedCounts[breed] > highestCount) {
            mostCommonBreed = breed;
            highestCount = breedCounts[breed];
        }
    }

    document.getElementById('breedDistribution').textContent = mostCommonBreed;
}

// Main render function
async function render(owner) {
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
        const bal = Number(await nft.balanceOf(owner));

        // Update count
        count.textContent = `You own ${bal} ninja cats`;

        if (!bal) {
            loading.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        // Fetch all NFT data
        for (let i = 0; i < bal; i++) {
            const id = await nft.tokenOfOwnerByIndex(owner, i);
            const uri = await nft.tokenURI(id);
            const meta = await (await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'))).json();

            // Find breed attribute
            let breed = "Unknown";
            let traits = [];

            if (meta.attributes && meta.attributes.length) {
                const breedAttr = meta.attributes.find(attr => attr.trait_type === "Breed");
                if (breedAttr) breed = breedAttr.value;
                traits = meta.attributes;
            }

            // Populate breed filter if not already present
            const breedFilter = document.getElementById('breedFilter');
            if (!Array.from(breedFilter.options).some(option => option.value === breed)) {
                const option = document.createElement('option');
                option.value = breed;
                option.textContent = breed;
                breedFilter.appendChild(option);
            }

            // Create NFT data object
            const rarityTier = getRarityTier(id);
            const rarityPercentage = getRarityPercentage(id);

            allNftData.push({
                id: id.toString(),
                name: meta.name || `Ninja Cat #${id}`,
                image: meta.image.replace('ipfs://', 'https://ipfs.io/ipfs/'),
                breed,
                traits,
                rarityTier,
                rarityPercentage
            });
        }

        // Show dashboard and controls
        dashboard.style.display = 'flex';
        controls.style.display = 'flex';

        // Update dashboard stats
        updateDashboard(allNftData);

        // Apply initial filters and sorting
        applyFiltersAndSort();

    } catch (error) {
        console.error("Error rendering NFTs:", error);
        count.textContent = `Error loading your cats: ${error.message}`;
    } finally {
        loading.style.display = 'none';
    }
}