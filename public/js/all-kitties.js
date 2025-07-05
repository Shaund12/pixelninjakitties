import { RPC_URL, CONTRACT_ADDRESS, NFT_ABI } from './config.js';

// Constants
const ITEMS_PER_PAGE = 12;
const provider = new ethers.JsonRpcProvider(RPC_URL);
const nftContract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);

// Cache for token data
const tokenCache = {};
let totalSupply = 0;
let currentPage = 1;
let filteredTokens = [];
let allTokens = [];

// DOM elements
const grid = document.getElementById('kittiesGrid');
const loadingState = document.getElementById('loadingState');
const totalCountEl = document.getElementById('totalCount');
const paginationEl = document.getElementById('pagination');
const sortByEl = document.getElementById('sortBy');
const rarityFilterEl = document.getElementById('rarityFilter');
const breedFilterEl = document.getElementById('breedFilter');

// Determine rarity based on ID
function getRarity(id) {
    const numId = parseInt(id);
    if (numId % 100 === 0) return 'legendary';
    if (numId % 10 === 0) return 'epic';
    if (numId % 2 === 0) return 'rare';
    return 'common';
}

// Function to render a single cat card
async function renderCatCard(tokenId) {
    try {
        // Check if we already have this token's data in cache
        if (!tokenCache[tokenId]) {
            const uri = await nftContract.tokenURI(tokenId);
            const owner = await nftContract.ownerOf(tokenId);

            // Fetch metadata from IPFS
            const metaRes = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
            const metadata = await metaRes.json();

            // Cache the token data
            tokenCache[tokenId] = {
                id: tokenId,
                owner,
                metadata,
                rarity: getRarity(tokenId)
            };
        }

        const token = tokenCache[tokenId];
        const metadata = token.metadata;
        const rarity = token.rarity;

        // Create card HTML
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.innerHTML = `
            <div class="rarity-badge ${rarity}">${rarity.charAt(0).toUpperCase() + rarity.slice(1)}</div>
            <img src="${metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" 
                 alt="${metadata.name}" class="cat-image">
            <div class="cat-info">
                <h3 class="cat-name">${metadata.name}</h3>
                <div class="cat-breed">${metadata.attributes[0].value}</div>
                <div class="cat-owner">Owner: ${token.owner.slice(0, 6)}...${token.owner.slice(-4)}</div>
                <button class="view-btn" onclick="window.location.href='kitty.html?id=${tokenId}'">View Details</button>
            </div>
        `;

        return card;
    } catch (error) {
        console.error(`Error rendering cat #${tokenId}:`, error);
        return null;
    }
}

// Fetch all tokens and display them
async function fetchAllTokens() {
    try {
        loadingState.style.display = 'flex';
        grid.innerHTML = '';

        // Get total supply of tokens
        totalSupply = Number(await nftContract.totalSupply());
        totalCountEl.textContent = totalSupply;

        // Fetch all token IDs
        allTokens = [];
        for (let i = 0; i < totalSupply; i++) {
            const tokenId = await nftContract.tokenByIndex(i);
            allTokens.push(Number(tokenId));
        }

        // Initial filtering and sorting
        applyFiltersAndSort();

        loadingState.style.display = 'none';
    } catch (error) {
        console.error("Error fetching tokens:", error);
        loadingState.innerHTML = `
            <p>Error loading ninja cats: ${error.message}</p>
            <button onclick="window.location.reload()">Try Again</button>
        `;
    }
}

// Apply filters and sorting to tokens
async function applyFiltersAndSort() {
    const rarityFilter = rarityFilterEl.value;
    const breedFilter = breedFilterEl.value;
    const sortBy = sortByEl.value;

    // First apply filters
    filteredTokens = [...allTokens];

    if (rarityFilter) {
        filteredTokens = filteredTokens.filter(id => getRarity(id) === rarityFilter);
    }

    if (breedFilter) {
        // We need to load metadata for breed filtering
        filteredTokens = await Promise.all(filteredTokens.map(async (id) => {
            if (!tokenCache[id]) {
                try {
                    const uri = await nftContract.tokenURI(id);
                    const metaRes = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
                    const metadata = await metaRes.json();
                    const owner = await nftContract.ownerOf(id);

                    tokenCache[id] = {
                        id,
                        owner,
                        metadata,
                        rarity: getRarity(id)
                    };
                } catch (error) {
                    console.error(`Error fetching metadata for token #${id}:`, error);
                    return null;
                }
            }

            return tokenCache[id]?.metadata?.attributes[0]?.value === breedFilter ? id : null;
        }));

        // Remove nulls
        filteredTokens = filteredTokens.filter(id => id !== null);
    }

    // Then apply sorting
    switch (sortBy) {
        case 'newest':
            filteredTokens.sort((a, b) => b - a);
            break;
        case 'oldest':
            filteredTokens.sort((a, b) => a - b);
            break;
        case 'rarity':
            const rarityOrder = { 'legendary': 0, 'epic': 1, 'rare': 2, 'common': 3 };
            filteredTokens.sort((a, b) => {
                return rarityOrder[getRarity(a)] - rarityOrder[getRarity(b)];
            });
            break;
    }

    // Reset to first page and render
    currentPage = 1;
    renderPage();
}

// Render current page of tokens
async function renderPage() {
    grid.innerHTML = '';
    loadingState.style.display = 'flex';

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, filteredTokens.length);
    const pageTokens = filteredTokens.slice(startIdx, endIdx);

    // Render each token
    const cardPromises = pageTokens.map(tokenId => renderCatCard(tokenId));
    const cards = await Promise.all(cardPromises);

    // Add cards to grid
    cards.forEach(card => {
        if (card) grid.appendChild(card);
    });

    // Update pagination
    renderPagination();

    loadingState.style.display = 'none';
}

// Render pagination controls
function renderPagination() {
    const totalPages = Math.ceil(filteredTokens.length / ITEMS_PER_PAGE);
    paginationEl.innerHTML = '';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '←';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage();
        }
    });
    paginationEl.appendChild(prevBtn);

    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages > 7) {
            // Show first, last, and pages around current
            if (
                i === 1 ||
                i === totalPages ||
                (i >= currentPage - 1 && i <= currentPage + 1)
            ) {
                const pageBtn = document.createElement('button');
                pageBtn.textContent = i;
                pageBtn.className = i === currentPage ? 'active' : '';
                pageBtn.addEventListener('click', () => {
                    currentPage = i;
                    renderPage();
                });
                paginationEl.appendChild(pageBtn);
            } else if (
                (i === currentPage - 2 && currentPage > 3) ||
                (i === currentPage + 2 && currentPage < totalPages - 2)
            ) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                paginationEl.appendChild(ellipsis);
            }
        } else {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.className = i === currentPage ? 'active' : '';
            pageBtn.addEventListener('click', () => {
                currentPage = i;
                renderPage();
            });
            paginationEl.appendChild(pageBtn);
        }
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.textContent = '→';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderPage();
        }
    });
    paginationEl.appendChild(nextBtn);
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize
    fetchAllTokens();

    // Filter and sort event listeners
    sortByEl.addEventListener('change', applyFiltersAndSort);
    rarityFilterEl.addEventListener('change', applyFiltersAndSort);
    breedFilterEl.addEventListener('change', applyFiltersAndSort);
});