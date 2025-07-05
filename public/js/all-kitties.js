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

// Helper function to shorten address
function shortenAddress(address) {
    return address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Unknown';
}

// Determine rarity based on metadata or fallback to ID
function getRarity(id, metadata) {
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
                rarity: getRarity(tokenId, metadata)
            };
        }

        const token = tokenCache[tokenId];
        const metadata = token.metadata;
        const rarity = token.rarity;

        // Get up to 3 interesting traits for display
        const displayTraits = metadata.attributes
            .filter(attr => attr.trait_type !== "Breed") // Breed already in title
            .slice(0, 3) // Show just 3 key traits
            .map(attr => `<span class="trait-tag">${attr.trait_type}: ${attr.value}</span>`)
            .join('');

        // Create card element
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.innerHTML = `
            <img src="${metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" 
                 alt="${metadata.name}" class="cat-image" 
                 onerror="this.src='assets/detailed_ninja_cat_64.png'">
                 
            <span class="rarity-badge ${rarity}">${rarity.charAt(0).toUpperCase() + rarity.slice(1)}</span>
            
            <div class="cat-info">
                <h3 class="cat-name">${metadata.name}</h3>
                
                <div class="cat-traits">
                    ${displayTraits}
                </div>
                
                <div class="cat-owner">
                    <span class="cat-owner-label">Owner:</span> ${shortenAddress(token.owner)}
                </div>
                
                <div class="cat-actions">
                    <button class="view-btn" onclick="window.location.href='kitty.html?id=${tokenId}'">View Details</button>
                </div>
            </div>
        `;

        // Add click handler for the whole card
        card.addEventListener('click', (e) => {
            // Don't navigate if they clicked the button (button has its own handler)
            if (!e.target.closest('.view-btn')) {
                window.location.href = `kitty.html?id=${tokenId}`;
            }
        });

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
            <button onclick="window.location.reload()" class="retry-btn">Try Again</button>
        `;
    }
}

// Apply filters and sorting to tokens
async function applyFiltersAndSort() {
    const rarityFilter = rarityFilterEl.value;
    const breedFilter = breedFilterEl.value;
    const sortBy = sortByEl.value;

    // Show loading state while filtering
    loadingState.style.display = 'flex';
    loadingState.innerHTML = `<div class="spinner"></div><p>Applying filters...</p>`;

    // First apply filters
    filteredTokens = [...allTokens];

    if (rarityFilter) {
        filteredTokens = filteredTokens.filter(id => {
            // If we have cached metadata, use that for rarity
            if (tokenCache[id] && tokenCache[id].metadata) {
                return getRarity(id, tokenCache[id].metadata) === rarityFilter;
            }
            // Otherwise fall back to ID-based rarity
            return getRarity(id) === rarityFilter;
        });
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
                        rarity: getRarity(id, metadata)
                    };
                } catch (error) {
                    console.error(`Error fetching metadata for token #${id}:`, error);
                    return null;
                }
            }

            // Check if breed matches filter
            const breedAttr = tokenCache[id]?.metadata?.attributes?.find(attr => attr.trait_type === "Breed");
            return breedAttr?.value === breedFilter ? id : null;
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
                const rarityA = getRarity(a, tokenCache[a]?.metadata);
                const rarityB = getRarity(b, tokenCache[b]?.metadata);
                return rarityOrder[rarityA] - rarityOrder[rarityB];
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
    loadingState.innerHTML = `<div class="spinner"></div><p>Loading ninja cats...</p>`;

    // If no items found
    if (filteredTokens.length === 0) {
        grid.innerHTML = `<div class="no-results">No ninja cats match your filters. Try changing your selection.</div>`;
        loadingState.style.display = 'none';
        renderPagination();
        return;
    }

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
    const totalPages = Math.max(1, Math.ceil(filteredTokens.length / ITEMS_PER_PAGE));
    paginationEl.innerHTML = '';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.textContent = '←';
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage();
            window.scrollTo(0, 0); // Scroll to top
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
                    window.scrollTo(0, 0); // Scroll to top
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
                window.scrollTo(0, 0); // Scroll to top
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
            window.scrollTo(0, 0); // Scroll to top
        }
    });
    paginationEl.appendChild(nextBtn);
}

// Add these CSS styles programmatically for dark mode
const styleEl = document.createElement('style');
styleEl.textContent = `
    body {
        background-color: #121212;
        color: #e0e0e0;
    }
    
    .wrapper {
        background-color: #121212;
    }
    
    .gallery-header h1 {
        color: #ffffff;
    }
    
    .filter-controls {
        background: rgba(255,255,255,0.05);
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    }
    
    .filter-controls label {
        color: #e0e0e0;
    }
    
    .filter-controls select {
        background: #2c2c2e;
        color: #ffffff;
        border: 1px solid #444;
    }
    
    .cat-card {
        background: #1e1e1e;
        border: 1px solid #333;
        box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    }
    
    .cat-card:hover {
        box-shadow: 0 8px 20px rgba(0,0,0,0.6), 0 0 15px rgba(88, 120, 188, 0.3);
        transform: translateY(-6px);
    }
    
    .cat-info {
        background: linear-gradient(to bottom, #1e1e1e, #252525);
        border-top: 1px solid #333;
    }
    
    .cat-name {
        color: #ffffff;
    }
    
    .cat-traits {
        margin: 0.8rem 0;
    }
    
    .trait-tag {
        background: #2c2c2e;
        color: #b0b0b0;
        padding: 0.3rem 0.6rem;
        border-radius: 4px;
        font-size: 0.7rem;
        font-weight: 500;
        display: inline-block;
        margin-right: 0.4rem;
        margin-bottom: 0.4rem;
        border: 1px solid #444;
    }
    
    .cat-owner {
        color: #9e9e9e;
        padding-top: 0.8rem;
        border-top: 1px solid #333;
        margin-top: 0.8rem;
    }
    
    .cat-owner-label {
        color: #b0b0b0;
    }
    
    .cat-actions {
        margin-top: 1rem;
        text-align: center;
    }
    
    .view-btn {
        background: #3949ab;
        color: white;
        border: none;
        padding: 0.5rem 1rem;
        border-radius: 4px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        width: 100%;
    }
    
    .view-btn:hover {
        background: #5c6bc0;
        transform: translateY(-2px);
    }
    
    .pagination {
        margin-top: 2.5rem;
    }
    
    .pagination button {
        background: #2c2c2e;
        color: #e0e0e0;
        border: 1px solid #444;
        padding: 0.6rem 1.2rem;
        border-radius: 6px;
    }
    
    .pagination button:hover:not(:disabled) {
        background: #3a3a3c;
    }
    
    .pagination button.active {
        background: #3949ab;
        color: white;
        border-color: #3949ab;
    }
    
    .pagination button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .loading {
        color: #e0e0e0;
    }
    
    .spinner {
        border: 5px solid rgba(255,255,255,0.1);
        border-left-color: #5c6bc0;
    }
    
    .no-results {
        background: #1e1e1e;
        color: #9e9e9e;
        border: 1px dashed #444;
    }
    
    .retry-btn {
        background: #3949ab;
        color: white;
    }
    
    /* Keep rarity badges vibrant but add shadow for better contrast */
    .rarity-badge {
        box-shadow: 0 2px 5px rgba(0,0,0,0.5);
        font-size: 0.75rem;
    }
`;
document.head.appendChild(styleEl);

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Initialize
    fetchAllTokens();

    // Filter and sort event listeners
    sortByEl.addEventListener('change', applyFiltersAndSort);
    rarityFilterEl.addEventListener('change', applyFiltersAndSort);
    breedFilterEl.addEventListener('change', applyFiltersAndSort);
});
