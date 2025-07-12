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
let isGridView = true;
let isInitialLoad = true;
let loadingProgress = 0;

// DOM elements
const grid = document.getElementById('kittiesGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const totalCountEl = document.getElementById('totalCount');
const paginationEl = document.getElementById('pagination');
const sortByEl = document.getElementById('sortBy');
const rarityFilterEl = document.getElementById('rarityFilter');
const breedFilterEl = document.getElementById('breedFilter');
const elementFilterEl = document.getElementById('elementFilter');
const weaponFilterEl = document.getElementById('weaponFilter');
const stanceFilterEl = document.getElementById('stanceFilter');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const resetFiltersBtn = document.getElementById('resetFilters');
const applyFiltersBtn = document.getElementById('applyFilters');
const retryBtn = document.getElementById('retryBtn');
const rankFilterEl = document.getElementById('rankFilter');


// Element Icons for display
const elementIcons = {
    'Fire': '🔥',
    'Water': '💧',
    'Earth': '🪨',
    'Air': '💨',
    'Void': '✨',
    'Thunder': '⚡',
    'Ice': '❄️',
    'Poison': '☠️',
    'Light': '☀️',
    'Dark': '🌑'
};

// Helper function to shorten address
function shortenAddress(address) {
    return address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Unknown';
}

// Determine rarity based on metadata or fallback to ID
function getRarity(id, metadata) {
    // If we have metadata with ninja_data containing rarity info, use that
    if (metadata && metadata.attributes) {
        // Check for explicit rarity attribute
        const rarityAttr = metadata.attributes.find(attr =>
            attr.trait_type === "Rarity" || attr.trait_type === "Rank");

        if (rarityAttr) {
            return rarityAttr.value.toLowerCase();
        }
    }

    // If we have ninja_data field
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

// Get all traits as a flat object from metadata
function getAllTraits(metadata) {
    const traits = {};

    if (metadata && metadata.attributes) {
        metadata.attributes.forEach(attr => {
            traits[attr.trait_type] = attr.value;
        });
    }

    return traits;
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

            // Get all traits in a flat object
            const traits = getAllTraits(metadata);

            // Cache the token data
            tokenCache[tokenId] = {
                id: tokenId,
                owner,
                metadata,
                traits,
                rarity: getRarity(tokenId, metadata)
            };
        }

        const token = tokenCache[tokenId];
        const metadata = token.metadata;
        const rarity = token.rarity;
        const traits = token.traits;

        // Get key traits to display
        const breed = traits['Breed'] || 'Unknown';
        const element = traits['Element'] || traits['Power'] || '';
        const weapon = traits['Weapon'] || traits['Equipment'] || '';
        const stance = traits['Stance'] || '';

        // Create element display with icon if available
        let elementDisplay = '';
        if (element) {
            const icon = elementIcons[element] || '';
            const elementClass = element.toLowerCase() === 'void' ? 'element-void' :
                element.toLowerCase() === 'fire' ? 'element-fire' :
                    element.toLowerCase() === 'water' ? 'element-water' :
                        element.toLowerCase() === 'earth' ? 'element-earth' :
                            element.toLowerCase() === 'air' ? 'element-air' : '';

            elementDisplay = `<span class="trait-tag ${elementClass}">
                ${icon ? `<span class="element-icon">${icon}</span>` : ''} ${element}
            </span>`;
        }

        // Create weapon display
        const weaponDisplay = weapon ? `<span class="trait-tag">${weapon}</span>` : '';

        // Create stance display
        const stanceDisplay = stance ? `<span class="trait-tag">${stance}</span>` : '';

        // Create combined traits display
        const displayTraits = `
            ${elementDisplay}
            ${weaponDisplay}
            ${stanceDisplay}
        `;

        // Create card element
        const card = document.createElement('div');
        card.className = 'cat-card';
        card.setAttribute('data-id', tokenId);
        card.setAttribute('data-rarity', rarity);
        card.innerHTML = `
            <img src="${metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" 
                 alt="${metadata.name}" class="cat-image" 
                 loading="lazy"
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
                    <button class="view-details-btn">View Details</button>
                </div>
            </div>
        `;

        // Add click handler for the whole card
        card.addEventListener('click', (e) => {
            // Don't navigate if they clicked the button (button has its own handler)
            if (!e.target.closest('.view-details-btn')) {
                window.location.href = `kitty.html?id=${tokenId}`;
            }
        });

        // Add click handler for the view details button
        const viewBtn = card.querySelector('.view-details-btn');
        if (viewBtn) {
            viewBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent the card click from triggering
                window.location.href = `kitty.html?id=${tokenId}`;
            });
        }

        return card;
    } catch (error) {
        console.error(`Error rendering cat #${tokenId}:`, error);
        return null;
    }
}

// Fetch all tokens and display them
async function fetchAllTokens() {
    try {
        showLoading(true);
        grid.innerHTML = '';

        // Get total supply of tokens
        totalSupply = Number(await nftContract.totalSupply());
        totalCountEl.textContent = totalSupply;

        updateLoadingProgress(20);

        // Fetch all token IDs
        allTokens = [];
        const batchSize = 10;
        const totalBatches = Math.ceil(totalSupply / batchSize);

        for (let i = 0; i < totalBatches; i++) {
            const start = i * batchSize;
            const end = Math.min(start + batchSize, totalSupply);
            const batchPromises = [];

            for (let j = start; j < end; j++) {
                batchPromises.push(nftContract.tokenByIndex(j));
            }

            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(tokenId => {
                allTokens.push(Number(tokenId));
            });

            // Update progress based on how many batches we've processed
            const progressPercent = 20 + (70 * (i + 1) / totalBatches);
            updateLoadingProgress(progressPercent);
        }

        // Initial filtering and sorting
        await applyFiltersAndSort();

        isInitialLoad = false;
        showLoading(false);
    } catch (error) {
        console.error("Error fetching tokens:", error);
        showError(error.message);
    }
}

// Apply filters and sorting to tokens
async function applyFiltersAndSort() {
    const rarityFilter = rarityFilterEl.value;
    const breedFilter = breedFilterEl.value;
    const elementFilter = elementFilterEl.value;
    const weaponFilter = weaponFilterEl.value;
    const stanceFilter = stanceFilterEl.value;
    const rankFilter = rankFilterEl.value;     // Add rank filter
    const sortBy = sortByEl.value;

    // Show loading state while filtering
    if (!isInitialLoad) {
        showLoading(true);
        updateLoadingProgress(30);
    }

    // First apply filters
    filteredTokens = [...allTokens];

    // Apply rarity filter
    if (rarityFilter) {
        filteredTokens = filteredTokens.filter(id => {
            if (tokenCache[id] && tokenCache[id].rarity) {
                return tokenCache[id].rarity === rarityFilter;
            }
            // Otherwise fall back to ID-based rarity
            return getRarity(id) === rarityFilter;
        });
    }

    updateLoadingProgress(50);

    // Apply other filters
    if (breedFilter || elementFilter || weaponFilter || stanceFilter || rankFilter) {
        // We need to ensure metadata is loaded for all tokens
        const missingMetadataTokens = filteredTokens.filter(id => !tokenCache[id]?.metadata);

        // Load metadata for tokens that don't have it yet
        if (missingMetadataTokens.length > 0) {
            const batchSize = 5;
            const totalBatches = Math.ceil(missingMetadataTokens.length / batchSize);

            for (let i = 0; i < totalBatches; i++) {
                const start = i * batchSize;
                const end = Math.min(start + batchSize, missingMetadataTokens.length);
                const batchPromises = [];

                for (let j = start; j < end; j++) {
                    const id = missingMetadataTokens[j];
                    batchPromises.push(loadTokenMetadata(id));
                }

                await Promise.all(batchPromises);

                // Update progress
                const progressPercent = 50 + (40 * (i + 1) / totalBatches);
                updateLoadingProgress(progressPercent);
            }
        }

        // Now apply attribute filters
        filteredTokens = filteredTokens.filter(id => {
            // Skip if metadata is not available
            if (!tokenCache[id]?.traits) return false;

            const traits = tokenCache[id].traits;

            // Check each filter
            if (breedFilter && traits['Breed'] !== breedFilter) return false;

            if (elementFilter) {
                const elementMatch = traits['Element'] === elementFilter || traits['Power'] === elementFilter;
                if (!elementMatch) return false;
            }

            if (weaponFilter) {
                const weaponMatch = traits['Weapon'] === weaponFilter || traits['Equipment'] === weaponFilter;
                if (!weaponMatch) return false;
            }

            if (stanceFilter && traits['Stance'] !== stanceFilter) return false;

            // Add rank filter check
            if (rankFilter && traits['Rank'] !== rankFilter) return false;

            return true;
        });
    }

    updateLoadingProgress(90);

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
                const rarityA = tokenCache[a]?.rarity || getRarity(a);
                const rarityB = tokenCache[b]?.rarity || getRarity(b);
                return rarityOrder[rarityA] - rarityOrder[rarityB];
            });
            break;
        case 'rarityAsc':
            const rarityOrderAsc = { 'common': 0, 'rare': 1, 'epic': 2, 'legendary': 3 };
            filteredTokens.sort((a, b) => {
                const rarityA = tokenCache[a]?.rarity || getRarity(a);
                const rarityB = tokenCache[b]?.rarity || getRarity(b);
                return rarityOrderAsc[rarityA] - rarityOrderAsc[rarityB];
            });
            break;
    }

    // Reset to first page and render
    currentPage = 1;
    updateLoadingProgress(100);
    await renderPage();

    // Show empty state if no results
    if (filteredTokens.length === 0) {
        showEmptyState(true);
    } else {
        showEmptyState(false);
    }

    if (!isInitialLoad) {
        showLoading(false);
    }
}

// Helper function to load token metadata
async function loadTokenMetadata(tokenId) {
    try {
        const uri = await nftContract.tokenURI(tokenId);
        const owner = await nftContract.ownerOf(tokenId);

        // Fetch metadata from IPFS
        const metaRes = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
        const metadata = await metaRes.json();

        // Get all traits in a flat object
        const traits = getAllTraits(metadata);

        // Cache the token data
        tokenCache[tokenId] = {
            id: tokenId,
            owner,
            metadata,
            traits,
            rarity: getRarity(tokenId, metadata)
        };

        return tokenCache[tokenId];
    } catch (error) {
        console.error(`Error loading metadata for token #${tokenId}:`, error);
        return null;
    }
}

// Render current page of tokens
async function renderPage() {
    grid.innerHTML = '';

    // Handle empty results
    if (filteredTokens.length === 0) {
        return;
    }

    // Set grid/list view class
    grid.className = isGridView ? 'grid-view' : 'list-view';

    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, filteredTokens.length);
    const pageTokens = filteredTokens.slice(startIdx, endIdx);

    // Render each token
    const cardPromises = pageTokens.map(tokenId => renderCatCard(tokenId));
    const cards = await Promise.all(cardPromises);

    // Add cards to grid with staggered animation
    cards.forEach((card, index) => {
        if (card) {
            // Add staggered animation delay
            card.style.animationDelay = `${index * 0.05}s`;
            grid.appendChild(card);
        }
    });

    // Update pagination
    renderPagination();
}

// Render pagination controls
function renderPagination() {
    const totalPages = Math.max(1, Math.ceil(filteredTokens.length / ITEMS_PER_PAGE));
    paginationEl.innerHTML = '';

    // Don't show pagination if only one page
    if (totalPages <= 1) {
        paginationEl.style.display = 'none';
        return;
    }

    paginationEl.style.display = 'flex';

    // Previous button
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '&larr;';
    prevBtn.disabled = currentPage === 1;
    prevBtn.setAttribute('aria-label', 'Previous page');
    prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            renderPage();
            window.scrollTo({ top: 0, behavior: 'smooth' });
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
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });
                paginationEl.appendChild(pageBtn);
            } else if (
                (i === currentPage - 2 && currentPage > 3) ||
                (i === currentPage + 2 && currentPage < totalPages - 2)
            ) {
                const ellipsis = document.createElement('span');
                ellipsis.textContent = '...';
                ellipsis.style.margin = '0 0.5rem';
                ellipsis.style.color = '#b0b0b0';
                paginationEl.appendChild(ellipsis);
            }
        } else {
            const pageBtn = document.createElement('button');
            pageBtn.textContent = i;
            pageBtn.className = i === currentPage ? 'active' : '';
            pageBtn.addEventListener('click', () => {
                currentPage = i;
                renderPage();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
            paginationEl.appendChild(pageBtn);
        }
    }

    // Next button
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = '&rarr;';
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.setAttribute('aria-label', 'Next page');
    nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderPage();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    paginationEl.appendChild(nextBtn);
}

// Reset all filters to default
function resetFilters() {
    sortByEl.value = 'newest';
    rarityFilterEl.value = '';
    breedFilterEl.value = '';
    elementFilterEl.value = '';
    weaponFilter.value = '';
    stanceFilterEl.value = '';
    rankFilterEl.value = '';  // Add reset for rank filter

    applyFiltersAndSort();
}

// Toggle between grid and list view
function toggleView(isGrid) {
    isGridView = isGrid;

    // Update button active state
    gridViewBtn.className = isGrid ? 'view-btn active' : 'view-btn';
    listViewBtn.className = isGrid ? 'view-btn' : 'view-btn active';

    // Update grid class
    grid.className = isGrid ? 'grid-view' : 'list-view';

    // Save preference to localStorage
    localStorage.setItem('ninjacat_view', isGrid ? 'grid' : 'list');
}

// Show/hide loading state
function showLoading(show) {
    if (show) {
        loadingState.style.display = 'flex';
        grid.style.opacity = '0.5';
    } else {
        loadingState.style.display = 'none';
        grid.style.opacity = '1';
    }
}

// Show/hide empty state
function showEmptyState(show) {
    emptyState.style.display = show ? 'flex' : 'none';
    grid.style.display = show ? 'none' : 'grid';
    paginationEl.style.display = show ? 'none' : 'flex';
}

// Show error message
function showError(message) {
    loadingState.innerHTML = `
        <div class="empty-icon">⚠️</div>
        <h3 class="empty-title">Oops! Something went wrong</h3>
        <p class="loading-text">Error loading ninja cats: ${message}</p>
        <button onclick="window.location.reload()" class="retry-btn">Try Again</button>
    `;
}

// Update loading progress
function updateLoadingProgress(percent) {
    loadingProgress = percent;
    const loadingBar = loadingState.querySelector('.loading-bar');
    if (loadingBar) {
        loadingBar.style.width = `${percent}%`;
    }
}

// Set up event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Check for saved view preference
    const savedView = localStorage.getItem('ninjacat_view');
    if (savedView) {
        toggleView(savedView === 'grid');
    }

    // Initialize
    fetchAllTokens();

    // Filter and sort event listeners
    applyFiltersBtn.addEventListener('click', applyFiltersAndSort);
    resetFiltersBtn.addEventListener('click', resetFilters);
    retryBtn.addEventListener('click', resetFilters);

    // Add change listeners for all filter dropdowns for improved UX
    sortByEl.addEventListener('change', () => {
        if (sortByEl.value) console.log(`Sort changed to: ${sortByEl.value}`);
    });

    rarityFilterEl.addEventListener('change', () => {
        if (rarityFilterEl.value) console.log(`Rarity filter changed to: ${rarityFilterEl.value}`);
    });

    breedFilterEl.addEventListener('change', () => {
        if (breedFilterEl.value) console.log(`Breed filter changed to: ${breedFilterEl.value}`);
    });

    elementFilterEl.addEventListener('change', () => {
        if (elementFilterEl.value) console.log(`Element filter changed to: ${elementFilterEl.value}`);
    });

    weaponFilterEl.addEventListener('change', () => {
        if (weaponFilterEl.value) console.log(`Weapon filter changed to: ${weaponFilterEl.value}`);
    });

    stanceFilterEl.addEventListener('change', () => {
        if (stanceFilterEl.value) console.log(`Stance filter changed to: ${stanceFilterEl.value}`);
    });

    // Add rank filter listener
    if (rankFilterEl) {
        rankFilterEl.addEventListener('change', () => {
            if (rankFilterEl.value) console.log(`Rank filter changed to: ${rankFilterEl.value}`);
        });
    }

    // View toggle event listeners
    gridViewBtn.addEventListener('click', () => toggleView(true));
    listViewBtn.addEventListener('click', () => toggleView(false));

    // Add keyboard shortcuts for accessibility
    document.addEventListener('keydown', (e) => {
        // Left arrow for previous page
        if (e.key === 'ArrowLeft' && !e.target.matches('input, select, textarea')) {
            if (currentPage > 1) {
                currentPage--;
                renderPage();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        // Right arrow for next page
        if (e.key === 'ArrowRight' && !e.target.matches('input, select, textarea')) {
            const totalPages = Math.ceil(filteredTokens.length / ITEMS_PER_PAGE);
            if (currentPage < totalPages) {
                currentPage++;
                renderPage();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    // Auto-apply filters when pressing Enter in any filter
    document.querySelectorAll('.filter-group select').forEach(select => {
        select.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                applyFiltersAndSort();
            }
        });
    });
});