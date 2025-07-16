/**
 * Enhanced All Kitties Gallery with Supabase-backed personalization
 * Features: Infinite scroll, theming, favorites, search, modal details, accessibility
 */

import { RPC_URL, CONTRACT_ADDRESS, NFT_ABI } from './config.js';
import { userPreferences } from './userPreferences.js';
import { favoritesManager } from './favoritesManager.js';
import { analyticsManager } from './analyticsManager.js';

// Constants
const ITEMS_PER_BATCH = 20;
const SCROLL_THRESHOLD = 200;
const DEBOUNCE_DELAY = 300;
const RPC_TIMEOUT = 10000;

// Initialize providers and contracts
const provider = new ethers.JsonRpcProvider(RPC_URL);
const nftContract = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);

// Application state
let totalSupply = 0;
let allTokens = [];
let filteredTokens = [];
let loadedTokens = [];
const tokenCache = {};
let isLoading = false;
let isInitialized = false;
let searchTimeout;
let currentFilters = {};
let debugMode = false;
const startTime = Date.now();

// DOM elements
const grid = document.getElementById('kittiesGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const infiniteLoading = document.getElementById('infiniteLoading');
const totalCountEl = document.getElementById('totalCount');
const searchBar = document.getElementById('searchBar');
const favoritesFilter = document.getElementById('favoritesFilter');
const themeToggle = document.getElementById('themeToggle');
const debugToggle = document.getElementById('debugToggle');
const debugPanel = document.getElementById('debugPanel');
const cardModal = document.getElementById('cardModal');
const modalClose = document.getElementById('modalClose');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const resetFiltersBtn = document.getElementById('resetFilters');
const applyFiltersBtn = document.getElementById('applyFilters');

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
    if (metadata && metadata.attributes) {
        const rarityAttr = metadata.attributes.find(attr =>
            attr.trait_type === 'Rarity' || attr.trait_type === 'Rank');
        if (rarityAttr) {
            return rarityAttr.value.toLowerCase();
        }
    }

    if (metadata && metadata.ninja_data && metadata.ninja_data.rarity && metadata.ninja_data.rarity.tier) {
        return metadata.ninja_data.rarity.tier.toLowerCase();
    }

    const numId = parseInt(id, 10);
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

// Create skeleton card for loading state
function createSkeletonCard() {
    const card = document.createElement('div');
    card.className = 'skeleton-card';
    card.innerHTML = `
        <div class="skeleton-image"></div>
        <div class="skeleton-info">
            <div class="skeleton-text title"></div>
            <div>
                <div class="skeleton-text tag"></div>
                <div class="skeleton-text tag"></div>
                <div class="skeleton-text tag"></div>
            </div>
            <div class="skeleton-text owner"></div>
        </div>
    `;
    return card;
}

// Load token metadata with caching and timeout
async function loadTokenMetadata(tokenId) {
    if (tokenCache[tokenId]) {
        return tokenCache[tokenId];
    }

    const startTime = Date.now();

    try {
        const uri = await Promise.race([
            nftContract.tokenURI(tokenId),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('URI fetch timeout')), RPC_TIMEOUT)
            )
        ]);

        const owner = await Promise.race([
            nftContract.ownerOf(tokenId),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Owner fetch timeout')), RPC_TIMEOUT)
            )
        ]);

        const metaRes = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));
        const metadata = await metaRes.json();

        const token = {
            id: tokenId,
            owner,
            metadata,
            traits: getAllTraits(metadata),
            rarity: getRarity(tokenId, metadata)
        };

        tokenCache[tokenId] = token;

        // Log RPC latency
        const latency = Date.now() - startTime;
        await analyticsManager.logRPCLatency('token_metadata', latency);

        return token;
    } catch (error) {
        console.error(`Error loading metadata for token #${tokenId}:`, error);
        await analyticsManager.logError('metadata_load_error', error.message, { token_id: tokenId });
        return null;
    }
}

// Render a single cat card
async function renderCatCard(tokenId) {
    const token = await loadTokenMetadata(tokenId);
    if (!token) return null;

    const { metadata, traits, rarity } = token;
    const breed = traits['Breed'] || 'Unknown';
    const element = traits['Element'] || traits['Power'] || '';
    const weapon = traits['Weapon'] || traits['Equipment'] || '';
    const stance = traits['Stance'] || '';

    // Create element display with icon
    let elementDisplay = '';
    if (element) {
        const icon = elementIcons[element] || '';
        const elementClass = `element-${element.toLowerCase()}`;
        elementDisplay = `<span class="trait-tag ${elementClass}">
            ${icon ? `<span class="element-icon">${icon}</span>` : ''} ${element}
        </span>`;
    }

    const weaponDisplay = weapon ? `<span class="trait-tag">${weapon}</span>` : '';
    const stanceDisplay = stance ? `<span class="trait-tag">${stance}</span>` : '';

    const card = document.createElement('div');
    card.className = 'cat-card';
    card.setAttribute('data-id', tokenId);
    card.setAttribute('data-rarity', rarity);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `View details for ${metadata.name}`);

    const isFavorite = favoritesManager.isFavorite(tokenId);

    card.innerHTML = `
        <button class="favorite-btn ${isFavorite ? 'active' : ''}" 
                data-token-id="${tokenId}"
                aria-label="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}"
                title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">
            <span class="favorite-icon">${isFavorite ? '⭐' : '☆'}</span>
        </button>
        
        <img src="${metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" 
             alt="${metadata.name}" 
             class="cat-image" 
             loading="lazy"
             onerror="this.src='assets/detailed_ninja_cat_64.png'">
             
        <span class="rarity-badge ${rarity}">${rarity.charAt(0).toUpperCase() + rarity.slice(1)}</span>
        
        <div class="cat-info">
            <h3 class="cat-name">${metadata.name}</h3>
            
            <div class="cat-traits">
                ${elementDisplay}
                ${weaponDisplay}
                ${stanceDisplay}
            </div>
            
            <div class="cat-owner">
                <span class="cat-owner-label">Owner:</span> ${shortenAddress(token.owner)}
            </div>
            
            <div class="cat-actions">
                <button class="view-details-btn" data-token-id="${tokenId}">View Details</button>
            </div>
        </div>
    `;

    // Add event listeners
    setupCardEventListeners(card, tokenId, token);

    return card;
}

// Setup event listeners for a card
function setupCardEventListeners(card, tokenId, token) {
    // Favorite button
    const favoriteBtn = card.querySelector('.favorite-btn');
    favoriteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await toggleFavorite(tokenId, favoriteBtn);
    });

    // Card click for modal
    card.addEventListener('click', (e) => {
        if (!e.target.closest('.favorite-btn') && !e.target.closest('.view-details-btn')) {
            openModal(tokenId, token);
        }
    });

    // Keyboard support
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal(tokenId, token);
        }
    });

    // View details button
    const viewBtn = card.querySelector('.view-details-btn');
    viewBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openModal(tokenId, token);
    });
}

// Toggle favorite status
async function toggleFavorite(tokenId, favoriteBtn) {
    const wasActive = favoriteBtn.classList.contains('active');

    // Optimistic update
    favoriteBtn.classList.toggle('active');
    const icon = favoriteBtn.querySelector('.favorite-icon');
    icon.textContent = wasActive ? '☆' : '⭐';
    favoriteBtn.setAttribute('aria-label', wasActive ? 'Add to favorites' : 'Remove from favorites');

    try {
        await favoritesManager.toggleFavorite(tokenId);
        updateDebugPanel();
    } catch (error) {
        // Revert on error
        favoriteBtn.classList.toggle('active');
        icon.textContent = wasActive ? '⭐' : '☆';
        favoriteBtn.setAttribute('aria-label', wasActive ? 'Remove from favorites' : 'Add to favorites');
        console.error('Error toggling favorite:', error);
    }
}

// Open modal with token details
async function openModal(tokenId, token) {
    const modalContent = document.getElementById('modalContent');
    const { metadata, traits, rarity } = token;

    modalContent.innerHTML = `
        <div style="display: flex; gap: 2rem; align-items: flex-start; flex-wrap: wrap;">
            <img src="${metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}" 
                 alt="${metadata.name}" 
                 class="modal-image"
                 style="flex-shrink: 0;">
            
            <div style="flex: 1; min-width: 300px;">
                <h2 id="modalTitle" style="margin: 0 0 1rem 0; color: var(--accent-color);">
                    ${metadata.name}
                </h2>
                
                <div style="margin-bottom: 1.5rem;">
                    <span class="rarity-badge ${rarity}">${rarity.charAt(0).toUpperCase() + rarity.slice(1)}</span>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <p><strong>Token ID:</strong> ${tokenId}</p>
                    <p><strong>Owner:</strong> ${shortenAddress(token.owner)}</p>
                    <p><strong>Description:</strong> ${metadata.description || 'No description available'}</p>
                </div>
                
                <div class="modal-traits">
                    ${Object.entries(traits).map(([key, value]) => `
                        <div class="modal-trait">
                            <div class="modal-trait-label">${key}</div>
                            <div class="modal-trait-value">${value}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div style="margin-top: 2rem;">
                    <a href="kitty.html?id=${tokenId}" 
                       style="display: inline-block; padding: 0.8rem 1.5rem; background: var(--accent-color); color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                        View on Explorer
                    </a>
                </div>
            </div>
        </div>
    `;

    cardModal.classList.add('show');
    cardModal.setAttribute('aria-hidden', 'false');
    modalContent.focus();

    // Log analytics
    await analyticsManager.logModalOpen(tokenId);
}

// Close modal
function closeModal() {
    cardModal.classList.remove('show');
    cardModal.setAttribute('aria-hidden', 'true');
}

// Initialize the application
async function init() {
    if (isInitialized) return;

    showLoading(true);

    try {
        // Initialize managers
        await Promise.all([
            userPreferences.init(),
            favoritesManager.init(),
            analyticsManager.init()
        ]);

        // Apply saved preferences
        await applyTheme(userPreferences.getTheme());
        await applyViewMode(userPreferences.getViewMode());
        debugMode = userPreferences.getDebugMode();
        updateDebugToggle();

        // Load saved filters
        currentFilters = userPreferences.getLastFilters();
        applyFiltersToUI();

        // Get total supply
        totalSupply = Number(await nftContract.totalSupply());
        totalCountEl.textContent = totalSupply;

        // Load all token IDs
        allTokens = [];
        for (let i = 0; i < totalSupply; i++) {
            const tokenId = await nftContract.tokenByIndex(i);
            allTokens.push(Number(tokenId));
        }

        // Initial filter and load
        await applyFilters();
        await loadMore();

        // Setup intersection observer for infinite scroll
        setupInfiniteScroll();

        // Log page load analytics
        const loadTime = Date.now() - startTime;
        await analyticsManager.logPageLoad(loadTime, totalSupply);

        isInitialized = true;
        showLoading(false);

    } catch (error) {
        console.error('Error initializing gallery:', error);
        await analyticsManager.logError('init_error', error.message);
        showError(error.message);
    }
}

// Apply theme
async function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const themeIcon = document.getElementById('themeIcon');
    themeIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
    await userPreferences.setTheme(theme);
    await analyticsManager.logThemeChange(theme);
    updateDebugPanel();
}

// Apply view mode
async function applyViewMode(mode) {
    grid.className = mode === 'grid' ? 'grid-view' : 'list-view';
    gridViewBtn.classList.toggle('active', mode === 'grid');
    listViewBtn.classList.toggle('active', mode === 'list');
    await userPreferences.setViewMode(mode);
    await analyticsManager.logViewModeChange(mode);
    updateDebugPanel();
}

// Apply filters to UI elements
function applyFiltersToUI() {
    const sortBy = document.getElementById('sortBy');
    const rarityFilter = document.getElementById('rarityFilter');
    const breedFilter = document.getElementById('breedFilter');
    const elementFilter = document.getElementById('elementFilter');
    const weaponFilter = document.getElementById('weaponFilter');
    const stanceFilter = document.getElementById('stanceFilter');
    const rankFilter = document.getElementById('rankFilter');

    if (sortBy) sortBy.value = currentFilters.sortBy || 'newest';
    if (rarityFilter) rarityFilter.value = currentFilters.rarity || '';
    if (breedFilter) breedFilter.value = currentFilters.breed || '';
    if (elementFilter) elementFilter.value = currentFilters.element || '';
    if (weaponFilter) weaponFilter.value = currentFilters.weapon || '';
    if (stanceFilter) stanceFilter.value = currentFilters.stance || '';
    if (rankFilter) rankFilter.value = currentFilters.rank || '';

    searchBar.value = currentFilters.search || '';
    favoritesFilter.classList.toggle('active', currentFilters.favoritesOnly || false);
}

// Apply filters and update URL
async function applyFilters() {
    const sortBy = document.getElementById('sortBy');
    const rarityFilter = document.getElementById('rarityFilter');
    const breedFilter = document.getElementById('breedFilter');
    const elementFilter = document.getElementById('elementFilter');
    const weaponFilter = document.getElementById('weaponFilter');
    const stanceFilter = document.getElementById('stanceFilter');
    const rankFilter = document.getElementById('rankFilter');

    currentFilters = {
        search: searchBar.value.trim(),
        rarity: rarityFilter?.value || '',
        breed: breedFilter?.value || '',
        element: elementFilter?.value || '',
        weapon: weaponFilter?.value || '',
        stance: stanceFilter?.value || '',
        rank: rankFilter?.value || '',
        sortBy: sortBy?.value || 'newest',
        favoritesOnly: favoritesFilter.classList.contains('active')
    };

    // Save filters
    await userPreferences.setLastFilters(currentFilters);

    // Update URL
    updateURL();

    // Filter tokens
    filteredTokens = [...allTokens];

    // Apply search filter
    if (currentFilters.search) {
        const searchTerm = currentFilters.search.toLowerCase();
        filteredTokens = filteredTokens.filter(tokenId => {
            const token = tokenCache[tokenId];
            if (!token) return false;

            const searchText = [
                token.metadata.name,
                tokenId.toString(),
                token.owner,
                ...Object.values(token.traits)
            ].join(' ').toLowerCase();

            return searchText.includes(searchTerm);
        });
    }

    // Apply favorites filter
    if (currentFilters.favoritesOnly) {
        const favorites = favoritesManager.getFavorites();
        filteredTokens = filteredTokens.filter(tokenId => favorites.includes(tokenId.toString()));
    }

    // Apply other filters
    if (currentFilters.rarity || currentFilters.breed || currentFilters.element ||
        currentFilters.weapon || currentFilters.stance || currentFilters.rank) {

        filteredTokens = filteredTokens.filter(tokenId => {
            const token = tokenCache[tokenId];
            if (!token) return false;

            const traits = token.traits;

            if (currentFilters.rarity && token.rarity !== currentFilters.rarity) return false;
            if (currentFilters.breed && traits['Breed'] !== currentFilters.breed) return false;
            if (currentFilters.element && traits['Element'] !== currentFilters.element && traits['Power'] !== currentFilters.element) return false;
            if (currentFilters.weapon && traits['Weapon'] !== currentFilters.weapon && traits['Equipment'] !== currentFilters.weapon) return false;
            if (currentFilters.stance && traits['Stance'] !== currentFilters.stance) return false;
            if (currentFilters.rank && traits['Rank'] !== currentFilters.rank) return false;

            return true;
        });
    }

    // Apply sorting
    switch (currentFilters.sortBy) {
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

    // Reset loaded tokens and reload
    loadedTokens = [];
    grid.innerHTML = '';

    // Log search analytics
    if (currentFilters.search) {
        await analyticsManager.logSearchQuery(currentFilters.search, filteredTokens.length);
    }

    // Log filter changes
    Object.entries(currentFilters).forEach(([key, value]) => {
        if (value) {
            analyticsManager.logFilterChange(key, value);
        }
    });

    await loadMore();
    updateDebugPanel();
}

// Update URL with current filters
function updateURL() {
    const url = new URL(window.location);
    const params = new URLSearchParams();

    Object.entries(currentFilters).forEach(([key, value]) => {
        if (value && value !== '' && value !== false) {
            params.set(key, value);
        }
    });

    url.search = params.toString();
    window.history.replaceState({}, '', url);
}

// Load more tokens (infinite scroll)
async function loadMore() {
    if (isLoading || loadedTokens.length >= filteredTokens.length) return;

    isLoading = true;
    showInfiniteLoading(true);

    const startIndex = loadedTokens.length;
    const endIndex = Math.min(startIndex + ITEMS_PER_BATCH, filteredTokens.length);
    const tokensToLoad = filteredTokens.slice(startIndex, endIndex);

    // Show skeleton cards first
    const skeletonCards = [];
    for (let i = 0; i < tokensToLoad.length; i++) {
        const skeleton = createSkeletonCard();
        skeletonCards.push(skeleton);
        grid.appendChild(skeleton);
    }

    // Load actual cards
    const cardPromises = tokensToLoad.map(tokenId => renderCatCard(tokenId));
    const cards = await Promise.all(cardPromises);

    // Replace skeleton cards with actual cards
    cards.forEach((card, index) => {
        if (card) {
            card.style.animationDelay = `${index * 0.05}s`;
            grid.replaceChild(card, skeletonCards[index]);
        } else {
            grid.removeChild(skeletonCards[index]);
        }
    });

    loadedTokens = loadedTokens.concat(tokensToLoad.filter((_, index) => cards[index]));

    // Log infinite scroll analytics
    await analyticsManager.logInfiniteScrollLoad(Math.floor(loadedTokens.length / ITEMS_PER_BATCH), tokensToLoad.length);

    isLoading = false;
    showInfiniteLoading(false);
    updateDebugPanel();
}

// Setup infinite scroll
function setupInfiniteScroll() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isLoading && loadedTokens.length < filteredTokens.length) {
                loadMore();
            }
        });
    }, {
        rootMargin: `${SCROLL_THRESHOLD}px`
    });

    // Observe a sentinel element at the bottom
    const sentinel = document.createElement('div');
    sentinel.style.height = '1px';
    sentinel.id = 'scroll-sentinel';
    document.body.appendChild(sentinel);
    observer.observe(sentinel);
}

// Show/hide loading states
function showLoading(show) {
    loadingState.style.display = show ? 'flex' : 'none';
    grid.style.opacity = show ? '0.5' : '1';
}

function showInfiniteLoading(show) {
    infiniteLoading.style.display = show ? 'flex' : 'none';
}

function showError(message) {
    loadingState.innerHTML = `
        <div class="empty-icon">⚠️</div>
        <h3 class="empty-title">Oops! Something went wrong</h3>
        <p class="loading-text">Error loading ninja cats: ${message}</p>
        <button onclick="window.location.reload()" class="retry-btn">Try Again</button>
    `;
}

// Update debug panel
function updateDebugPanel() {
    if (!debugMode) return;

    document.getElementById('debugItemsLoaded').textContent = loadedTokens.length;
    document.getElementById('debugFavoritesCount').textContent = favoritesManager.getFavoriteCount();
    document.getElementById('debugCurrentTheme').textContent = userPreferences.getTheme();
    document.getElementById('debugCurrentView').textContent = userPreferences.getViewMode();

    const activeFilters = Object.entries(currentFilters)
        .filter(([key, value]) => value && value !== '' && value !== false)
        .map(([key, value]) => `${key}:${value}`)
        .join(', ');
    document.getElementById('debugActiveFilters').textContent = activeFilters || 'none';

    // Get average RPC latency
    analyticsManager.getPerformanceStats().then(stats => {
        document.getElementById('debugRPCLatency').textContent = `${Math.round(stats.averageRPCLatency || 0)}ms`;
    });
}

function updateDebugToggle() {
    debugToggle.classList.toggle('active', debugMode);
    debugPanel.classList.toggle('show', debugMode);
}

// Setup event listeners
function setupEventListeners() {
    // Search with debouncing
    searchBar.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            applyFilters();
        }, DEBOUNCE_DELAY);
    });

    // Favorites filter
    favoritesFilter.addEventListener('click', () => {
        favoritesFilter.classList.toggle('active');
        applyFilters();
    });

    // Theme toggle
    themeToggle.addEventListener('click', () => {
        const currentTheme = userPreferences.getTheme();
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        applyTheme(newTheme);
    });

    // Debug toggle
    debugToggle.addEventListener('click', () => {
        debugMode = !debugMode;
        userPreferences.setDebugMode(debugMode);
        analyticsManager.setDebugMode(debugMode);
        updateDebugToggle();
        updateDebugPanel();
    });

    // View toggle
    gridViewBtn.addEventListener('click', () => applyViewMode('grid'));
    listViewBtn.addEventListener('click', () => applyViewMode('list'));

    // Filter buttons
    if (applyFiltersBtn) {
        applyFiltersBtn.addEventListener('click', applyFilters);
    }

    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            currentFilters = {};
            applyFiltersToUI();
            applyFilters();
        });
    }

    // Modal events
    modalClose.addEventListener('click', closeModal);
    cardModal.addEventListener('click', (e) => {
        if (e.target === cardModal) {
            closeModal();
        }
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModal();
        }
    });

    // Filter change listeners
    const filterElements = ['sortBy', 'rarityFilter', 'breedFilter', 'elementFilter', 'weaponFilter', 'stanceFilter', 'rankFilter'];
    filterElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('change', applyFilters);
        }
    });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    init();
});

// Export for debugging
window.galleryDebug = {
    loadedTokens,
    filteredTokens,
    tokenCache,
    currentFilters,
    userPreferences,
    favoritesManager,
    analyticsManager
};