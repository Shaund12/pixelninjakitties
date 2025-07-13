/* global ethers, fetch, gsap, Sortable */
// Properly integrate with the wallet.js system
import {
    CONTRACT_ADDRESS, NFT_ABI, RPC_URL
} from './config.js';
import {
    getAddress, connectWallet, short, EVENTS as WALLET_EVENTS
} from './wallet.js';

// DOM Elements
const grid = document.getElementById('grid');
const detailedView = document.getElementById('detailedView');
const count = document.getElementById('count');
const dashboard = document.getElementById('dashboard');
const controls = document.getElementById('controls');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('emptyState');
const traitFilters = document.getElementById('traitFilters');
const collectionStats = document.getElementById('collectionStats');
const galleryView = document.getElementById('galleryView');

// Connect to Vitruveo network
console.log("Connecting to Vitruveo RPC:", RPC_URL);
const rpc = new ethers.JsonRpcProvider(RPC_URL);
const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, rpc);

// Global state
let allNftData = [];
let filteredNftData = [];
let currentFilters = {
    breed: '',
    element: '',
    weapon: '',
    rarity: '',
    stance: '',
    rank: ''
};
let currentSortOption = 'newest';
let currentView = 'grid';
let stats = {
    breedCount: {},
    elementCount: {},
    rarityCount: {},
    weaponCount: {},
    stanceCount: {},
    rankCount: {}
};

// Element icons mapping
const elementIcons = {
    'Fire': '🔥',
    'Water': '💧',
    'Earth': '🪨',
    'Air': '💨',
    'Void': '✨',
    'Lightning': '⚡',
    'Thunder': '⚡',
    'Ice': '❄️',
    'Shadow': '🌑',
    'Light': '☀️',
    'Cosmic': '🌌'
};

// Weapon icons mapping
const weaponIcons = {
    'Katana': '🗡️',
    'Shuriken': '✴️',
    'Nunchucks': '🔗',
    'Kunai': '🔪',
    'Sai': '🔱',
    'Bo Staff': '🥢',
    'Twin Blades': '⚔️',
    'Kusarigama': '⛓️',
    'War Fan': '🪶',
    'Ghost Dagger': '👻',
    'Claws': '🐾'
};

// Check for persistent wallet connection using wallet.js
document.addEventListener('DOMContentLoaded', () => {
    // Initialize tooltips
    initializeTooltips();

    // Display contract info without selector
    addContractDisplay();

    // Initialize GSAP animations
    initializeAnimations();

    // Use wallet.js for connection
    silentBoot();

    // Set up filter event listeners
    setupFilterListeners();

    // Set up view toggles
    setupViewToggles();

    // Set up sorting listeners
    setupSortingListeners();

    // Set up theme switcher
    setupThemeSwitcher();

    // Set up drag and drop functionality
    setupDragAndDrop();

    // Set up keyboard shortcuts
    setupKeyboardShortcuts();

    // Set up event listener for pagination
    document.addEventListener('pageChanged', (e) => {
        const { page, itemsPerPage } = e.detail;
        renderPage(page, itemsPerPage);
    });

    // Set up search functionality
    setupSearch();

    // Set up batch actions
    setupBatchActions();

    // Set up gallery mode
    setupGalleryMode();

    // Set up wallet events listener
    window.addEventListener(WALLET_EVENTS.CONNECTED, (e) => {
        const address = e.detail.address;
        if (address) {
            render(address);
        }
    });

    window.addEventListener(WALLET_EVENTS.DISCONNECTED, () => {
        // Clear UI state and show empty state
        grid.innerHTML = '';
        detailedView.innerHTML = '';
        allNftData = [];
        filteredNftData = [];

        loading.style.display = 'none';
        dashboard.style.display = 'none';
        controls.style.display = 'none';
        emptyState.style.display = 'block';
    });
});

// Add this near your other event handlers

// Update the burn button event handler to prevent navigation
document.addEventListener('click', async function (e) {
    if (e.target.classList.contains('burn-btn')) {
        // Prevent default behavior and stop event propagation
        e.preventDefault();
        e.stopPropagation();

        const cardElement = e.target.closest('.kitty-card') || e.target.closest('.detailed-card');
        if (!cardElement) return;

        const tokenId = cardElement.dataset.tokenId;
        if (!tokenId) {
            console.error('No token ID found for this NFT');
            showToast('Error: Unable to identify NFT token ID', 'error');
            return;
        }

        // Show confirmation modal
        if (confirm(`Are you sure you want to burn Ninja Cat #${tokenId}? This action CANNOT be undone!`)) {
            try {
                // Show loading state
                e.target.textContent = 'Burning...';
                e.target.disabled = true;

                // Check for ethereum provider
                if (!window.ethereum) {
                    throw new Error('No Ethereum provider detected. Please install MetaMask or another wallet.');
                }

                // Get address first to ensure we're connected
                const address = await getAddress();
                if (!address) {
                    throw new Error('Wallet not connected');
                }

                // Create a WRITE provider (not the read-only RPC provider)
                const provider = new ethers.BrowserProvider(window.ethereum);
                const signer = await provider.getSigner();

                // Create a contract instance with write capabilities
                const burnableNft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);

                // Verify the contract has a burn function
                if (!burnableNft.burn) {
                    throw new Error('Contract does not support burn functionality');
                }

                showToast('Sending burn transaction...', 'info');

                // Call contract burn function
                const tx = await burnableNft.burn(tokenId);

                // Wait for transaction to be mined
                e.target.textContent = 'Processing...';
                showToast('Waiting for transaction confirmation...', 'info');

                await tx.wait();

                // Show success message
                showToast(`Successfully burned Ninja Cat #${tokenId}`, 'success');

                // Remove the card from UI
                cardElement.style.animation = 'fadeOut 0.5s forwards';
                setTimeout(() => {
                    cardElement.remove();

                    // Update counts
                    const totalCountEl = document.getElementById('totalCount');
                    if (totalCountEl) {
                        const currentCount = parseInt(totalCountEl.textContent);
                        totalCountEl.textContent = Math.max(0, currentCount - 1);
                    }

                    // If no more cats, show empty state
                    const gridEl = document.getElementById('grid');
                    if (gridEl && (!gridEl.children.length || gridEl.children.length === 0)) {
                        document.getElementById('emptyState').style.display = 'block';
                    }
                }, 500);

            } catch (error) {
                console.error('Error burning NFT:', error);
                showToast(`Error burning NFT: ${error.message}`, 'error');

                // Reset button
                e.target.textContent = 'Burn NFT';
                e.target.disabled = false;
            }
        }
    }
});

// Initialize tooltips
function initializeTooltips() {
    // Add Tippy.js initialization if loaded
    if (window.tippy) {
        tippy('[data-tippy-content]', {
            theme: 'ninja-theme',
            animation: 'shift-away',
            placement: 'bottom'
        });
    }
}

// Initialize GSAP animations
function initializeAnimations() {
    if (window.gsap) {
        // Dashboard cards staggered animation
        gsap.from('.stat-card', {
            y: 30,
            opacity: 0,
            stagger: 0.1,
            duration: 0.8,
            ease: 'power2.out',
            scrollTrigger: {
                trigger: '.dashboard',
                start: 'top 80%'
            }
        });

        // Controls panel animation
        gsap.from('.controls', {
            y: 20,
            opacity: 0,
            duration: 0.6,
            delay: 0.2,
            ease: 'power2.out'
        });
    }
}

// Just display the contract address for reference
function addContractDisplay() {
    const header = document.querySelector('h1');
    if (header) {
        const addressDisplay = document.createElement('div');
        addressDisplay.id = 'contractAddressDisplay';
        addressDisplay.className = 'contract-address';
        addressDisplay.innerHTML = `
            <span>Vitruveo Contract:</span> 
            <a href="https://explorer.vitruveo.xyz/address/${CONTRACT_ADDRESS}" 
               target="_blank" 
               class="contract-link" 
               data-tippy-content="View on Vitruveo Explorer">
                ${short(CONTRACT_ADDRESS)}
                <svg class="external-link-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
            </a>
        `;
        header.insertAdjacentElement('afterend', addressDisplay);

        // Add copy to clipboard functionality
        addressDisplay.addEventListener('click', (e) => {
            if (e.target.closest('.contract-link')) {
                e.preventDefault();
                navigator.clipboard.writeText(CONTRACT_ADDRESS);
                showToast('Contract address copied to clipboard!', 'success');
            }
        });
    }
}

// Set up filter listeners
function setupFilterListeners() {
    // Main filters
    const breedFilter = document.getElementById('breedFilter');
    if (breedFilter) {
        breedFilter.addEventListener('change', (e) => {
            currentFilters.breed = e.target.value;
            applyFiltersAndSort();
        });
    }

    // Additional filter listeners for new filters
    const additionalFilters = ['element', 'weapon', 'rarity', 'stance', 'rank'];
    additionalFilters.forEach(filter => {
        const element = document.getElementById(`${filter}Filter`);
        if (element) {
            element.addEventListener('change', (e) => {
                currentFilters[filter] = e.target.value;
                applyFiltersAndSort();
            });
        }
    });

    // Reset filters button
    const resetFiltersBtn = document.getElementById('resetFilters');
    if (resetFiltersBtn) {
        resetFiltersBtn.addEventListener('click', () => {
            // Reset all filter dropdowns
            Object.keys(currentFilters).forEach(key => {
                const element = document.getElementById(`${key}Filter`);
                if (element) element.value = '';
                currentFilters[key] = '';
            });

            // Reset sort option
            const sortBy = document.getElementById('sortBy');
            if (sortBy) sortBy.value = 'newest';
            currentSortOption = 'newest';

            // Apply reset filters
            applyFiltersAndSort();

            // Show reset animation
            animateFilterReset();
        });
    }
}

// Animate filter reset
function animateFilterReset() {
    if (window.gsap) {
        // Flash the controls panel
        gsap.fromTo('.controls',
            { boxShadow: '0 0 0 2px rgba(138, 101, 255, 0.8)' },
            { boxShadow: '0 0 0 0px rgba(138, 101, 255, 0)', duration: 1 }
        );

        // Animate reset button
        gsap.fromTo('#resetFilters',
            { scale: 0.9 },
            { scale: 1, duration: 0.3, ease: 'back.out(1.7)' }
        );
    }
}

// Silent boot using wallet.js
async function silentBoot() {
    try {
        const address = await getAddress();
        if (address) {
            console.log("Using existing wallet connection:", address);
            render(address);

            // Update UI for connected state
            const connectBtn = document.getElementById('connectBtn');
            if (connectBtn) {
                connectBtn.textContent = short(address);
                connectBtn.classList.add('connected');
            }
        }
    } catch (error) {
        console.error("Silent wallet connection failed:", error);
    }
}

// Connect button handler - simplified to use wallet.js
document.getElementById('connectBtn')?.addEventListener('click', async () => {
    try {
        await connectWallet(document.getElementById('connectBtn'));
        // The wallet connected event will trigger render
    } catch (error) {
        console.error("Error connecting wallet:", error);
        showToast("Failed to connect wallet: " + error.message, "error");
    }
});

// Set up view toggles
function setupViewToggles() {
    const viewBtns = document.querySelectorAll('.view-btn');
    viewBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            const view = this.dataset.view;
            currentView = view;

            // Update active button
            viewBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // Show correct view with animation
            animateViewChange(view);
        });
    });
}

// Animate view change
function animateViewChange(view) {
    if (window.gsap) {
        // Fade out both views
        gsap.to([grid, detailedView], {
            opacity: 0,
            duration: 0.2,
            onComplete: () => {
                // Hide both first
                grid.style.display = 'none';
                detailedView.classList.remove('active');

                // Then show and fade in the correct view
                if (view === 'grid') {
                    grid.style.display = 'grid';
                    gsap.to(grid, { opacity: 1, duration: 0.3 });
                } else {
                    detailedView.classList.add('active');
                    gsap.to(detailedView, { opacity: 1, duration: 0.3 });
                }
            }
        });
    } else {
        // Fallback for when GSAP is not loaded
        if (view === 'grid') {
            grid.style.display = 'grid';
            detailedView.classList.remove('active');
        } else {
            grid.style.display = 'none';
            detailedView.classList.add('active');
        }
    }
}

// Set up sorting listeners
function setupSortingListeners() {
    const sortBy = document.getElementById('sortBy');
    if (sortBy) {
        sortBy.addEventListener('change', (e) => {
            currentSortOption = e.target.value;
            applyFiltersAndSort();
        });
    }
}

// Set up theme switcher
function setupThemeSwitcher() {
    const themeSwitcher = document.getElementById('themeSwitcher');
    if (themeSwitcher) {
        // Check for saved theme preference
        const savedTheme = localStorage.getItem('ninja_cats_theme');
        if (savedTheme) {
            document.body.classList.toggle('light-theme', savedTheme === 'light');
            themeSwitcher.checked = savedTheme === 'light';
        }

        // Theme switch event
        themeSwitcher.addEventListener('change', (e) => {
            const isLight = e.target.checked;
            document.body.classList.toggle('light-theme', isLight);
            localStorage.setItem('ninja_cats_theme', isLight ? 'light' : 'dark');

            // Animate theme change
            animateThemeChange(isLight);
        });
    }
}

// Animate theme change
function animateThemeChange(isLight) {
    if (window.gsap) {
        // Create a flash effect
        const overlay = document.createElement('div');
        overlay.className = 'theme-transition-overlay';
        document.body.appendChild(overlay);

        gsap.fromTo(overlay,
            { opacity: 0 },
            {
                opacity: 0.2,
                duration: 0.2,
                onComplete: () => {
                    gsap.to(overlay, {
                        opacity: 0,
                        duration: 0.5,
                        delay: 0.1,
                        onComplete: () => {
                            document.body.removeChild(overlay);
                        }
                    });
                }
            }
        );
    }
}

// Set up drag and drop functionality
function setupDragAndDrop() {
    // If Sortable.js is loaded, make the grid sortable
    if (window.Sortable && grid) {
        new Sortable(grid, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            handle: '.kitty-drag-handle',
            onEnd: function () {
                showToast('NFT order updated', 'success');
                saveCustomOrder();
            }
        });
    }
}

// Save custom order of NFTs
function saveCustomOrder() {
    const cardElements = grid.querySelectorAll('.kitty-card');
    const customOrder = Array.from(cardElements).map(card => card.dataset.tokenId);

    // Save to localStorage
    localStorage.setItem('ninja_cats_custom_order', JSON.stringify(customOrder));
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Alt+G for grid view
        if (e.altKey && e.key === 'g') {
            document.querySelector('.view-btn[data-view="grid"]')?.click();
        }

        // Alt+D for detailed view
        if (e.altKey && e.key === 'd') {
            document.querySelector('.view-btn[data-view="detailed"]')?.click();
        }

        // Alt+F to focus on filter
        if (e.altKey && e.key === 'f') {
            document.getElementById('searchInput')?.focus();
        }

        // Alt+R to reset filters
        if (e.altKey && e.key === 'r') {
            document.getElementById('resetFilters')?.click();
        }

        // Alt+S to open sort dropdown
        if (e.altKey && e.key === 's') {
            document.getElementById('sortBy')?.focus();
        }

        // Alt+M for gallery mode
        if (e.altKey && e.key === 'm') {
            toggleGalleryMode();
        }
    });
}

// Set up search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', debounce((e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            if (searchTerm.length > 0) {
                filterBySearch(searchTerm);
            } else {
                applyFiltersAndSort(); // Revert to normal filtering
            }
        }, 300));
    }
}

// Debounce helper function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Filter NFTs by search term
function filterBySearch(searchTerm) {
    // First apply normal filters
    let baseFiltered = [...allNftData];

    // Apply breed filter
    Object.keys(currentFilters).forEach(key => {
        if (currentFilters[key]) {
            baseFiltered = baseFiltered.filter(nft => {
                const traitValue = nft.traits?.find(t => t.trait_type.toLowerCase() === key)?.value;
                return traitValue && traitValue.toLowerCase() === currentFilters[key].toLowerCase();
            });
        }
    });

    // Then apply search across multiple fields
    filteredNftData = baseFiltered.filter(nft => {
        // Search in name
        if (nft.name.toLowerCase().includes(searchTerm)) return true;

        // Search in breed
        if (nft.breed.toLowerCase().includes(searchTerm)) return true;

        // Search in ID
        if (nft.id.toString().includes(searchTerm)) return true;

        // Search in traits
        if (nft.traits && nft.traits.some(trait =>
            trait.trait_type.toLowerCase().includes(searchTerm) ||
            trait.value.toString().toLowerCase().includes(searchTerm)
        )) {
            return true;
        }

        return false;
    });

    // Update search results count
    const searchResults = document.getElementById('searchResults');
    if (searchResults) {
        searchResults.textContent = `Found ${filteredNftData.length} results`;
        searchResults.style.display = 'block';
    }

    // Trigger pagination update with new filtered data
    const event = new CustomEvent('kittyDataLoaded', {
        detail: {
            count: filteredNftData.length
        }
    });
    document.dispatchEvent(event);

    // Render first page
    const itemsPerPage = document.getElementById('itemsPerPage')?.value || 12;
    renderPage(1, parseInt(itemsPerPage));

    // Highlight search matches if we have few enough results
    if (filteredNftData.length < 20) {
        highlightSearchMatches(searchTerm);
    }
}

// Highlight search matches in the DOM
function highlightSearchMatches(searchTerm) {
    setTimeout(() => {
        const textElements = document.querySelectorAll('.kitty-name, .kitty-breed span, .trait');
        textElements.forEach(element => {
            const originalText = element.textContent;
            if (originalText.toLowerCase().includes(searchTerm.toLowerCase())) {
                const highlightedText = originalText.replace(
                    new RegExp(`(${searchTerm})`, 'gi'),
                    '<mark>$1</mark>'
                );
                element.innerHTML = highlightedText;
            }
        });
    }, 100);
}

// Set up batch actions
function setupBatchActions() {
    const selectAllBtn = document.getElementById('selectAllBtn');
    const batchActionsPanel = document.getElementById('batchActionsPanel');

    if (selectAllBtn && batchActionsPanel) {
        // Set up selection mode toggle
        selectAllBtn.addEventListener('click', () => {
            const isSelecting = grid.classList.toggle('selection-mode');
            if (isSelecting) {
                selectAllBtn.textContent = 'Cancel Selection';
                selectAllBtn.classList.add('active');

                // Add checkboxes to each card
                document.querySelectorAll('.kitty-card').forEach(card => {
                    const checkbox = document.createElement('div');
                    checkbox.className = 'selection-checkbox';
                    card.appendChild(checkbox);

                    // Add click handler for selection
                    card.addEventListener('click', selectCardHandler);
                });

                // Show batch actions panel with animation
                batchActionsPanel.style.display = 'flex';
                if (window.gsap) {
                    gsap.fromTo(batchActionsPanel,
                        { y: 50, opacity: 0 },
                        { y: 0, opacity: 1, duration: 0.3 }
                    );
                }
            } else {
                // Exit selection mode
                selectAllBtn.textContent = 'Select Multiple';
                selectAllBtn.classList.remove('active');

                // Remove checkboxes
                document.querySelectorAll('.selection-checkbox').forEach(checkbox => {
                    checkbox.remove();
                });

                // Remove selected class
                document.querySelectorAll('.kitty-card.selected').forEach(card => {
                    card.classList.remove('selected');
                    card.removeEventListener('click', selectCardHandler);
                });

                // Hide batch actions panel
                if (window.gsap) {
                    gsap.to(batchActionsPanel, {
                        y: 50, opacity: 0, duration: 0.2,
                        onComplete: () => { batchActionsPanel.style.display = 'none'; }
                    });
                } else {
                    batchActionsPanel.style.display = 'none';
                }
            }
        });

        // Set up batch action buttons
        document.getElementById('batchTransferBtn')?.addEventListener('click', () => {
            const selectedIds = getSelectedNftIds();
            if (selectedIds.length > 0) {
                showBatchTransferDialog(selectedIds);
            } else {
                showToast('Please select NFTs to transfer', 'warning');
            }
        });

        document.getElementById('batchShareBtn')?.addEventListener('click', () => {
            const selectedIds = getSelectedNftIds();
            if (selectedIds.length > 0) {
                shareBatchOfNfts(selectedIds);
            } else {
                showToast('Please select NFTs to share', 'warning');
            }
        });

        document.getElementById('selectAllCardsBtn')?.addEventListener('click', () => {
            const allCards = document.querySelectorAll('.kitty-card');
            const allSelected = Array.from(allCards).every(card => card.classList.contains('selected'));

            allCards.forEach(card => {
                if (allSelected) {
                    card.classList.remove('selected');
                } else {
                    card.classList.add('selected');
                }
            });

            // Update button text
            const btn = document.getElementById('selectAllCardsBtn');
            if (btn) {
                btn.textContent = allSelected ? 'Select All' : 'Deselect All';
            }

            // Update selection count
            updateSelectionCount();
        });
    }
}

// Card selection handler
function selectCardHandler(e) {
    // Prevent regular card click behavior during selection mode
    e.preventDefault();
    e.stopPropagation();

    const card = e.currentTarget;
    card.classList.toggle('selected');

    // Update selection count
    updateSelectionCount();
}

// Update selection count in batch actions panel
function updateSelectionCount() {
    const selectedCount = document.querySelectorAll('.kitty-card.selected').length;
    const countElement = document.getElementById('selectedCount');
    if (countElement) {
        countElement.textContent = selectedCount;
    }
}

// Get IDs of selected NFTs
function getSelectedNftIds() {
    const selectedCards = document.querySelectorAll('.kitty-card.selected');
    return Array.from(selectedCards).map(card => card.dataset.tokenId);
}

// Show batch transfer dialog
function showBatchTransferDialog(selectedIds) {
    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog batch-transfer-dialog">
            <div class="modal-header">
                <h3>Batch Transfer NFTs</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p>You are about to transfer ${selectedIds.length} NFTs:</p>
                <div class="selected-nfts-list">
                    ${selectedIds.map(id => `<div class="selected-nft-item">Ninja Cat #${id}</div>`).join('')}
                </div>
                <div class="form-group">
                    <label for="recipientAddress">Recipient Address:</label>
                    <input type="text" id="recipientAddress" placeholder="0x..." class="form-control">
                </div>
            </div>
            <div class="modal-footer">
                <button class="modal-btn cancel-btn">Cancel</button>
                <button class="modal-btn confirm-btn">Transfer NFTs</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Add animation
    if (window.gsap) {
        gsap.fromTo(modal.querySelector('.modal-dialog'),
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.3 }
        );
    }

    // Close button event
    modal.querySelector('.close-modal').addEventListener('click', () => {
        closeModal(modal);
    });

    // Cancel button event
    modal.querySelector('.cancel-btn').addEventListener('click', () => {
        closeModal(modal);
    });

    // Confirm transfer button
    modal.querySelector('.confirm-btn').addEventListener('click', async () => {
        const recipientAddress = document.getElementById('recipientAddress').value;
        if (!ethers.isAddress(recipientAddress)) {
            showToast('Please enter a valid address', 'error');
            return;
        }

        try {
            closeModal(modal);
            showToast(`This would transfer ${selectedIds.length} NFTs to ${recipientAddress}`, 'info');
            // Note: Actual transfer would be implemented here
        } catch (error) {
            showToast(`Error: ${error.message}`, 'error');
        }
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modal);
        }
    });
}

// Close modal helper
function closeModal(modal) {
    if (window.gsap) {
        gsap.to(modal.querySelector('.modal-dialog'), {
            y: 20,
            opacity: 0,
            duration: 0.2,
            onComplete: () => {
                document.body.removeChild(modal);
            }
        });
    } else {
        document.body.removeChild(modal);
    }
}

// Share a batch of NFTs
function shareBatchOfNfts(selectedIds) {
    // Create share URL with all selected IDs
    const baseUrl = window.location.origin;
    const shareUrl = `${baseUrl}/ninja-gallery.html?ids=${selectedIds.join(',')}`;

    // Create modal dialog
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-dialog share-dialog">
            <div class="modal-header">
                <h3>Share Your Ninja Cats</h3>
                <button class="close-modal">&times;</button>
            </div>
            <div class="modal-body">
                <p>Share this link to showcase your collection of ${selectedIds.length} Ninja Cats:</p>
                <div class="share-url-container">
                    <input type="text" readonly value="${shareUrl}" class="share-url">
                    <button class="copy-share-url" data-tippy-content="Copy to clipboard">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                        </svg>
                    </button>
                </div>
                <div class="social-share-buttons">
                    <button class="share-twitter">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2">
                            <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
                        </svg>
                        Share on Twitter
                    </button>
                    <button class="share-clipboard">
                        <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" fill="none" stroke-width="2">
                            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                        </svg>
                        Copy to Clipboard
                    </button>
                </div>
                <div class="qr-code-container">
                    <div id="shareQrCode"></div>
                    <button class="download-qr">Download QR Code</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    // Generate QR code if library is available
    if (window.QRCode) {
        new QRCode(document.getElementById("shareQrCode"), {
            text: shareUrl,
            width: 128,
            height: 128,
            colorDark: "#8a65ff",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
    }

    // Add animation
    if (window.gsap) {
        gsap.fromTo(modal.querySelector('.modal-dialog'),
            { y: 30, opacity: 0 },
            { y: 0, opacity: 1, duration: 0.3 }
        );
    }

    // Close button event
    modal.querySelector('.close-modal').addEventListener('click', () => {
        closeModal(modal);
    });

    // Copy share URL
    modal.querySelector('.copy-share-url').addEventListener('click', () => {
        const urlInput = modal.querySelector('.share-url');
        urlInput.select();
        navigator.clipboard.writeText(urlInput.value);
        showToast('Share link copied to clipboard!', 'success');
    });

    // Twitter share
    modal.querySelector('.share-twitter').addEventListener('click', () => {
        const tweetText = encodeURIComponent(`Check out my collection of ${selectedIds.length} Ninja Cats NFTs!`);
        window.open(`https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`, '_blank');
    });

    // Copy to clipboard
    modal.querySelector('.share-clipboard').addEventListener('click', () => {
        navigator.clipboard.writeText(shareUrl);
        showToast('Share link copied to clipboard!', 'success');
    });

    // Download QR code
    modal.querySelector('.download-qr').addEventListener('click', () => {
        const qrCanvas = document.querySelector('#shareQrCode canvas');
        if (qrCanvas) {
            const link = document.createElement('a');
            link.download = 'ninja-cats-qr.png';
            link.href = qrCanvas.toDataURL('image/png');
            link.click();
        }
    });

    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modal);
        }
    });
}

// Set up gallery mode
function setupGalleryMode() {
    const galleryModeBtn = document.getElementById('galleryModeBtn');
    if (galleryModeBtn) {
        galleryModeBtn.addEventListener('click', toggleGalleryMode);
    }
}

// Toggle gallery/slideshow mode
function toggleGalleryMode() {
    // Check if we have NFTs to display
    if (filteredNftData.length === 0) {
        showToast('No NFTs to display in gallery mode', 'warning');
        return;
    }

    // Create gallery overlay
    const galleryOverlay = document.createElement('div');
    galleryOverlay.className = 'gallery-overlay';
    galleryOverlay.innerHTML = `
        <div class="gallery-controls">
            <button class="gallery-btn exit-gallery">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
            <button class="gallery-btn prev-slide">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M15 18l-6-6 6-6"></path>
                </svg>
            </button>
            <button class="gallery-btn next-slide">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 18l6-6-6-6"></path>
                </svg>
            </button>
            <button class="gallery-btn toggle-autoplay">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8"></polygon>
                </svg>
            </button>
        </div>
        <div class="gallery-container">
            <div class="gallery-slide">
                <img class="gallery-image" src="">
                <div class="gallery-info">
                    <h2 class="gallery-title"></h2>
                    <div class="gallery-metadata"></div>
                    <div class="gallery-traits"></div>
                </div>
            </div>
        </div>
        <div class="gallery-progress-container">
            <div class="gallery-progress"></div>
        </div>
        <div class="gallery-counter">
            <span class="current-slide">1</span> / <span class="total-slides">${filteredNftData.length}</span>
        </div>
    `;

    document.body.appendChild(galleryOverlay);
    document.body.style.overflow = 'hidden'; // Prevent scrolling

    // Set up gallery state
    let currentIndex = 0;
    let autoplayInterval;
    let isAutoPlaying = false;

    // Update slide with NFT data
    function updateSlide(index) {
        const nft = filteredNftData[index];
        if (!nft) return;

        const galleryImage = galleryOverlay.querySelector('.gallery-image');
        galleryImage.src = nft.image;
        galleryImage.alt = nft.name;

        galleryOverlay.querySelector('.gallery-title').textContent = nft.name;

        // Update metadata
        const metadataEl = galleryOverlay.querySelector('.gallery-metadata');
        metadataEl.innerHTML = `
            <div class="gallery-id">ID: #${nft.id}</div>
            <div class="gallery-breed">${nft.breed}</div>
            ${nft.rarityTier ? `<div class="gallery-rarity ${nft.rarityTier}">${nft.rarityTier}</div>` : ''}
        `;

        // Update traits
        const traitsEl = galleryOverlay.querySelector('.gallery-traits');
        traitsEl.innerHTML = '';

        if (nft.traits && nft.traits.length) {
            nft.traits.slice(0, 6).forEach(trait => {
                const traitEl = document.createElement('div');
                traitEl.className = 'gallery-trait';
                traitEl.innerHTML = `
                    <span class="trait-type">${trait.trait_type || 'Trait'}</span>
                    <span class="trait-value">${trait.value || trait}</span>
                `;
                traitsEl.appendChild(traitEl);
            });
        }

        // Update counter
        galleryOverlay.querySelector('.current-slide').textContent = index + 1;

        // Update progress bar
        const progressBar = galleryOverlay.querySelector('.gallery-progress');
        progressBar.style.width = `${((index + 1) / filteredNftData.length) * 100}%`;

        // Animate slide change
        if (window.gsap) {
            gsap.fromTo('.gallery-slide',
                { opacity: 0, scale: 0.95 },
                { opacity: 1, scale: 1, duration: 0.5, ease: 'power2.out' }
            );
        }
    }

    // Navigate to previous slide
    function prevSlide() {
        currentIndex = (currentIndex - 1 + filteredNftData.length) % filteredNftData.length;
        updateSlide(currentIndex);
    }

    // Navigate to next slide
    function nextSlide() {
        currentIndex = (currentIndex + 1) % filteredNftData.length;
        updateSlide(currentIndex);
    }

    // Toggle autoplay
    function toggleAutoplay() {
        isAutoPlaying = !isAutoPlaying;
        const autoplayBtn = galleryOverlay.querySelector('.toggle-autoplay');

        if (isAutoPlaying) {
            autoplayInterval = setInterval(nextSlide, 3000);
            autoplayBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <rect x="9" y="9" width="6" height="6"></rect>
                </svg>
            `;
        } else {
            clearInterval(autoplayInterval);
            autoplayBtn.innerHTML = `
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <polygon points="10 8 16 12 10 16 10 8"></polygon>
                </svg>
            `;
        }
    }

    // Exit gallery mode
    function exitGalleryMode() {
        // Clear autoplay if active
        if (isAutoPlaying) {
            clearInterval(autoplayInterval);
        }

        // Remove gallery elements
        document.body.removeChild(galleryOverlay);
        document.body.style.overflow = ''; // Restore scrolling
    }

    // Set up event listeners
    galleryOverlay.querySelector('.exit-gallery').addEventListener('click', exitGalleryMode);
    galleryOverlay.querySelector('.prev-slide').addEventListener('click', prevSlide);
    galleryOverlay.querySelector('.next-slide').addEventListener('click', nextSlide);
    galleryOverlay.querySelector('.toggle-autoplay').addEventListener('click', toggleAutoplay);

    // Keyboard navigation
    function galleryKeyHandler(e) {
        if (e.key === 'ArrowLeft') prevSlide();
        if (e.key === 'ArrowRight') nextSlide();
        if (e.key === 'Escape') {
            exitGalleryMode();
            document.removeEventListener('keydown', galleryKeyHandler);
        }
        if (e.key === ' ') toggleAutoplay(); // Space bar
    }
    document.addEventListener('keydown', galleryKeyHandler);

    // Touch navigation for mobile
    let startX, startY;
    galleryOverlay.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    });

    galleryOverlay.addEventListener('touchend', (e) => {
        const diffX = startX - e.changedTouches[0].clientX;
        const diffY = startY - e.changedTouches[0].clientY;

        // Check if horizontal swipe is more significant than vertical
        if (Math.abs(diffX) > Math.abs(diffY)) {
            if (diffX > 50) { // Swipe left
                nextSlide();
            } else if (diffX < -50) { // Swipe right
                prevSlide();
            }
        }
    });

    // Initial slide display
    updateSlide(currentIndex);

    // Add entrance animation
    if (window.gsap) {
        gsap.fromTo(galleryOverlay,
            { opacity: 0 },
            { opacity: 1, duration: 0.5 }
        );
    }
}

// Apply filters and sorting
function applyFiltersAndSort() {
    // Start with all NFTs
    filteredNftData = [...allNftData];

    // Apply each filter if set
    Object.keys(currentFilters).forEach(key => {
        if (currentFilters[key]) {
            filteredNftData = filteredNftData.filter(nft => {
                // Handle direct properties like 'breed'
                if (key === 'breed' && nft.breed) {
                    return nft.breed.toLowerCase() === currentFilters[key].toLowerCase();
                }

                // Handle properties inside traits array
                if (nft.traits) {
                    const trait = nft.traits.find(t =>
                        t.trait_type && t.trait_type.toLowerCase() === key.toLowerCase()
                    );
                    if (trait && trait.value) {
                        return trait.value.toLowerCase() === currentFilters[key].toLowerCase();
                    }
                }

                // For rarity
                if (key === 'rarity' && nft.rarityTier) {
                    return nft.rarityTier.toLowerCase() === currentFilters[key].toLowerCase();
                }

                return false;
            });
        }
    });

    // Apply sorting
    switch (currentSortOption) {
        case 'newest':
            filteredNftData.sort((a, b) => Number(b.id) - Number(a.id));
            break;
        case 'oldest':
            filteredNftData.sort((a, b) => Number(a.id) - Number(b.id));
            break;
        case 'rarity':
            // Higher rarity score = rarer
            filteredNftData.sort((a, b) => (b.rarityScore || 0) - (a.rarityScore || 0));
            break;
        case 'rarityAsc':
            // Lower rarity score = more common
            filteredNftData.sort((a, b) => (a.rarityScore || 0) - (b.rarityScore || 0));
            break;
        case 'breed':
            filteredNftData.sort((a, b) => (a.breed || '').localeCompare(b.breed || ''));
            break;
        case 'custom':
            // Get custom order from localStorage
            const customOrder = JSON.parse(localStorage.getItem('ninja_cats_custom_order') || '[]');
            if (customOrder.length > 0) {
                // Create a map for O(1) lookups of position
                const orderMap = new Map(customOrder.map((id, index) => [id, index]));
                filteredNftData.sort((a, b) => {
                    const posA = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
                    const posB = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
                    return posA - posB;
                });
            }
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
    const itemsPerPage = document.getElementById('itemsPerPage')?.value || 12;
    renderPage(1, parseInt(itemsPerPage));

    // Update filter badges
    updateFilterBadges();

    // Update filter counts
    updateFilterCounts();
}

// Update filter badges to show active filters
function updateFilterBadges() {
    const filterBadgesContainer = document.getElementById('activeFilters');
    if (!filterBadgesContainer) return;

    // Clear existing badges
    filterBadgesContainer.innerHTML = '';

    // Check if any filters are active
    const hasActiveFilters = Object.values(currentFilters).some(v => v !== '');

    // Show or hide the container based on filter state
    filterBadgesContainer.style.display = hasActiveFilters ? 'flex' : 'none';

    if (!hasActiveFilters) return;

    // Add badge for each active filter
    Object.keys(currentFilters).forEach(key => {
        if (currentFilters[key]) {
            const badge = document.createElement('div');
            badge.className = 'filter-badge';
            badge.innerHTML = `
                <span>${key}: ${currentFilters[key]}</span>
                <button class="remove-filter" data-filter="${key}">×</button>
            `;
            filterBadgesContainer.appendChild(badge);

            // Add remove handler
            badge.querySelector('.remove-filter').addEventListener('click', (e) => {
                const filterToRemove = e.target.dataset.filter;
                const filterSelect = document.getElementById(`${filterToRemove}Filter`);
                if (filterSelect) filterSelect.value = '';
                currentFilters[filterToRemove] = '';
                applyFiltersAndSort();
            });
        }
    });

    // Add "Clear All" button if we have filters
    if (hasActiveFilters) {
        const clearAllBtn = document.createElement('button');
        clearAllBtn.className = 'clear-all-filters';
        clearAllBtn.textContent = 'Clear All';
        clearAllBtn.addEventListener('click', () => {
            Object.keys(currentFilters).forEach(key => {
                const filterSelect = document.getElementById(`${key}Filter`);
                if (filterSelect) filterSelect.value = '';
                currentFilters[key] = '';
            });
            applyFiltersAndSort();
        });
        filterBadgesContainer.appendChild(clearAllBtn);
    }
}

// Update filter counts in dropdowns
function updateFilterCounts() {
    // Count frequencies for each filter category
    Object.keys(stats).forEach(statKey => {
        stats[statKey] = {};
    });

    // For all NFTs, count frequencies of each trait value
    allNftData.forEach(nft => {
        // Count breed
        if (nft.breed) {
            stats.breedCount[nft.breed] = (stats.breedCount[nft.breed] || 0) + 1;
        }

        // Count rarity tier
        if (nft.rarityTier) {
            stats.rarityCount[nft.rarityTier] = (stats.rarityCount[nft.rarityTier] || 0) + 1;
        }

        // Count traits
        if (nft.traits) {
            nft.traits.forEach(trait => {
                if (trait.trait_type && trait.value) {
                    const type = trait.trait_type.toLowerCase();
                    const value = trait.value;

                    // Increment the appropriate counter
                    if (type === 'element' || type === 'power') {
                        stats.elementCount[value] = (stats.elementCount[value] || 0) + 1;
                    }
                    else if (type === 'weapon' || type === 'equipment') {
                        stats.weaponCount[value] = (stats.weaponCount[value] || 0) + 1;
                    }
                    else if (type === 'stance') {
                        stats.stanceCount[value] = (stats.stanceCount[value] || 0) + 1;
                    }
                    else if (type === 'rank') {
                        stats.rankCount[value] = (stats.rankCount[value] || 0) + 1;
                    }
                }
            });
        }
    });

    // Update dropdowns with counts
    updateSelectWithCounts('breedFilter', stats.breedCount);
    updateSelectWithCounts('elementFilter', stats.elementCount);
    updateSelectWithCounts('weaponFilter', stats.weaponCount);
    updateSelectWithCounts('stanceFilter', stats.stanceCount);
    updateSelectWithCounts('rarityFilter', stats.rarityCount);
    updateSelectWithCounts('rankFilter', stats.rankCount);
}

// Update a select dropdown with count information
function updateSelectWithCounts(selectId, countData) {
    const select = document.getElementById(selectId);
    if (!select) return;

    // Keep track of the current value
    const currentValue = select.value;

    // Get all options except the first one (which is the "All X" option)
    const options = Array.from(select.options).slice(1);

    options.forEach(option => {
        const value = option.value;
        const count = countData[value] || 0;

        // Update option text to include count
        const baseText = option.textContent.split(' (')[0]; // Remove existing count if any
        option.textContent = `${baseText} (${count})`;
    });

    // Restore the selected value
    select.value = currentValue;
}

// Render NFT card using real blockchain data only
function renderNftCard(nft) {
    // Clone the template
    const template = document.getElementById('kittyCardTemplate');
    if (!template) return;

    const card = template.content.cloneNode(true);

    // Set card class and data
    const cardElement = card.querySelector('.kitty-card');
    if (!cardElement) return;

    cardElement.dataset.tokenId = nft.id;

    // Add drag handle for sortable functionality
    const dragHandle = document.createElement('div');
    dragHandle.className = 'kitty-drag-handle';
    dragHandle.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="8" cy="8" r="2"></circle>
            <circle cx="8" cy="16" r="2"></circle>
            <circle cx="16" cy="8" r="2"></circle>
            <circle cx="16" cy="16" r="2"></circle>
        </svg>
    `;
    cardElement.appendChild(dragHandle);

    // Set rarity badge if we have real rarity data
    const rarityBadge = card.querySelector('.kitty-rarity');
    if (rarityBadge) {
        if (nft.rarityTier) {
            rarityBadge.textContent = nft.rarityTier.charAt(0).toUpperCase() + nft.rarityTier.slice(1);
            rarityBadge.classList.add(nft.rarityTier);

            // Add legendary styling if applicable
            if (nft.rarityTier.toLowerCase() === 'legendary') {
                cardElement.classList.add('legendary-card');
            }
        } else {
            rarityBadge.style.display = 'none';
        }
    }

    // Set image with error handling and loading state
    const image = card.querySelector('.kitty-image');
    if (image) {
        image.dataset.src = nft.image; // Use data-src for lazy loading
        image.src = 'assets/placeholder.svg'; // Start with placeholder
        image.alt = nft.name;

        // Create a loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'image-loading-indicator';
        loadingIndicator.innerHTML = `
            <svg class="spinner" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle>
            </svg>
        `;

        // Add loading indicator
        const imageContainer = card.querySelector('.kitty-image-container');
        if (imageContainer) {
            imageContainer.appendChild(loadingIndicator);

            // Load image when it comes into view
            lazyLoadImage(image, () => {
                if (imageContainer.contains(loadingIndicator)) {
                    imageContainer.removeChild(loadingIndicator);
                }
            });

            // Handle image errors
            image.onerror = function () {
                this.src = 'assets/detailed_ninja_cat_64.png';
                if (imageContainer.contains(loadingIndicator)) {
                    imageContainer.removeChild(loadingIndicator);
                }
            };
        }
    }

    // Set name and ID
    const nameEl = card.querySelector('.kitty-name');
    const idEl = card.querySelector('.kitty-id');

    if (nameEl) nameEl.firstChild.textContent = nft.name;
    if (idEl) idEl.textContent = `#${nft.id}`;

    // Set breed
    const breedEl = card.querySelector('.kitty-breed span');
    if (breedEl) breedEl.textContent = nft.breed || 'Unknown Breed';

    // Get traits from NFT
    const traitsContainer = card.querySelector('.kitty-traits');
    if (traitsContainer) {
        traitsContainer.innerHTML = ''; // Clear default traits

        // Extract key traits
        let keyTraits = [];

        // Element trait
        const elementTrait = nft.traits?.find(t =>
            t.trait_type === 'Element' || t.trait_type === 'Power'
        );
        if (elementTrait) {
            const icon = elementIcons[elementTrait.value] || '';
            const traitEl = document.createElement('span');
            traitEl.className = `trait element-${elementTrait.value.toLowerCase()}`;
            traitEl.innerHTML = `${icon} ${elementTrait.value}`;
            keyTraits.push(traitEl);
        }

        // Weapon trait
        const weaponTrait = nft.traits?.find(t =>
            t.trait_type === 'Weapon' || t.trait_type === 'Equipment'
        );
        if (weaponTrait) {
            const icon = weaponIcons[weaponTrait.value] || '';
            const traitEl = document.createElement('span');
            traitEl.className = 'trait';
            traitEl.innerHTML = `${icon} ${weaponTrait.value}`;
            keyTraits.push(traitEl);
        }

        // Stance trait
        const stanceTrait = nft.traits?.find(t => t.trait_type === 'Stance');
        if (stanceTrait) {
            const traitEl = document.createElement('span');
            traitEl.className = 'trait';
            traitEl.textContent = stanceTrait.value;
            keyTraits.push(traitEl);
        }

        // If we have no key traits, add up to 3 other traits
        if (keyTraits.length === 0 && nft.traits && nft.traits.length) {
            keyTraits = nft.traits.slice(0, 3).map(trait => {
                const traitEl = document.createElement('span');
                traitEl.className = 'trait';
                traitEl.textContent = trait.value || trait;
                return traitEl;
            });
        }

        // Add traits to container
        keyTraits.forEach(trait => traitsContainer.appendChild(trait));
    }

    // Set button actions
    const viewDetailsBtn = card.querySelector('.view-details');
    const listForSaleBtn = card.querySelector('.share-btn');

    if (viewDetailsBtn) {
        viewDetailsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = `kitty.html?id=${nft.id}`;
        });
    }

    if (listForSaleBtn) {
        listForSaleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.location.href = `marketplace.html?list=${nft.id}`;
        });
    }

    // Add the card to the grid
    grid.appendChild(card);

    // Add hover effect
    addCardHoverEffect(cardElement);

    // Add click handler
    cardElement.addEventListener('click', (e) => {
        // Don't navigate if clicking on action buttons or in selection mode
        const isActionButton = e.target.closest('.action-btn') !== null;
        if (!grid.classList.contains('selection-mode') && !isActionButton) {
            window.location.href = `kitty.html?id=${nft.id}`;
        }
    });
}


// Add hover effect to cards
function addCardHoverEffect(card) {
    if (window.gsap) {
        card.addEventListener('mouseenter', function () {
            gsap.to(this, {
                y: -10,
                scale: 1.03,
                boxShadow: '0 15px 35px rgba(138, 101, 255, 0.3), 0 0 25px rgba(255, 152, 0, 0.3)',
                duration: 0.3
            });
        });

        card.addEventListener('mouseleave', function () {
            gsap.to(this, {
                y: 0,
                scale: 1,
                boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
                duration: 0.3
            });
        });
    }
}

// Lazy load image implementation with better error handling
function lazyLoadImage(img, callback) {
    if (!img) return;

    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const image = entry.target;
                    if (image.dataset.src) {
                        image.src = image.dataset.src;
                        image.onload = callback;
                        observer.unobserve(image);
                    }
                }
            });
        });
        observer.observe(img);
    } else {
        // Fallback for browsers that don't support IntersectionObserver
        if (img.dataset.src) {
            img.src = img.dataset.src;
            img.onload = callback;
        }
    }
}

// Render detailed card with real data only
function renderDetailedCard(nft) {
    const template = document.getElementById('detailedCardTemplate');
    if (!template) return;

    const card = template.content.cloneNode(true);

    // Set image with error handling
    const image = card.querySelector('.detailed-image');
    if (image) {
        image.src = nft.image;
        image.alt = nft.name;
        image.onerror = function () {
            this.src = 'assets/detailed_ninja_cat_64.png';
        };
    }

    // Set basic info
    const titleEl = card.querySelector('h2');
    const breedEl = card.querySelector('.cat-breed');

    if (titleEl) titleEl.textContent = nft.name;
    if (breedEl) breedEl.textContent = nft.breed || 'Unknown Breed';

    // Only set real data for mint date
    const mintDateElement = card.querySelector('.mint-date');
    if (mintDateElement) {
        if (nft.mintDate) {
            mintDateElement.textContent = nft.mintDate;
        } else {
            const parent = mintDateElement.parentElement;
            if (parent) parent.style.display = 'none';
        }
    }

    // Only show real rarity data
    const rarityElement = card.querySelector('.rarity-score');
    if (rarityElement) {
        if (nft.rarityScore) {
            rarityElement.textContent = nft.rarityScore;
        } else {
            const parent = rarityElement.parentElement;
            if (parent) parent.style.display = 'none';
        }
    }

    // Set traits
    const traitsContainer = card.querySelector('.detailed-traits');
    if (traitsContainer) {
        traitsContainer.innerHTML = ''; // Clear any existing traits

        if (nft.traits && nft.traits.length) {
            nft.traits.forEach(trait => {
                if (!trait || (!trait.trait_type && !trait.value)) return;

                const traitEl = document.createElement('div');
                traitEl.className = 'detailed-trait';

                const traitType = document.createElement('div');
                traitType.className = 'trait-type';
                traitType.textContent = trait.trait_type || 'Attribute';

                const traitValue = document.createElement('div');
                traitValue.className = 'trait-value';

                // Add icon for element or weapon traits
                if (trait.trait_type === 'Element' || trait.trait_type === 'Power') {
                    const icon = elementIcons[trait.value] || '';
                    traitValue.innerHTML = icon ? `${icon} ${trait.value}` : trait.value;
                }
                else if (trait.trait_type === 'Weapon' || trait.trait_type === 'Equipment') {
                    const icon = weaponIcons[trait.value] || '';
                    traitValue.innerHTML = icon ? `${icon} ${trait.value}` : trait.value;
                }
                else {
                    traitValue.textContent = trait.value || trait;
                }

                traitEl.appendChild(traitType);
                traitEl.appendChild(traitValue);
                traitsContainer.appendChild(traitEl);
            });
        }
    }

    // Set button actions
    const buttons = card.querySelectorAll('.detailed-actions .btn');

    // Vitruveo explorer button
    if (buttons[0]) {
        buttons[0].addEventListener('click', () => {
            window.open(`https://explorer.vitruveo.xyz/tokens/${CONTRACT_ADDRESS}/${nft.id}`, '_blank');
        });
    }

    // List for sale
    if (buttons[1]) {
        buttons[1].addEventListener('click', () => {
            window.location.href = `marketplace.html?list=${nft.id}`;
        });
    }

    // Share button
    if (buttons[2]) {
        buttons[2].addEventListener('click', () => {
            if (navigator.share) {
                navigator.share({
                    title: nft.name,
                    text: `Check out my NFT on Vitruveo!`,
                    url: window.location.origin + `/kitty.html?id=${nft.id}&contract=${CONTRACT_ADDRESS}`
                });
            } else {
                navigator.clipboard.writeText(window.location.origin + `/kitty.html?id=${nft.id}&contract=${CONTRACT_ADDRESS}`);
                showToast('Link copied to clipboard!', 'success');
            }
        });
    }

    // Add the card to the detailed view
    detailedView.appendChild(card);

    // Add hover effects
    if (window.gsap) {
        const detailedImg = card.querySelector('.detailed-image');
        if (detailedImg) {
            detailedImg.addEventListener('mouseenter', function () {
                gsap.to(this, {
                    scale: 1.05,
                    boxShadow: '0 10px 25px rgba(138, 101, 255, 0.4)',
                    duration: 0.3
                });
            });

            detailedImg.addEventListener('mouseleave', function () {
                gsap.to(this, {
                    scale: 1,
                    boxShadow: '0 5px 15px rgba(138, 101, 255, 0.2)',
                    duration: 0.3
                });
            });
        }
    }
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

    // Show message if no results
    if (pageItems.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.innerHTML = `
            <div class="empty-icon">🔍</div>
            <h3>No Ninja Cats Found</h3>
            <p>Try adjusting your filters or search criteria</p>
            <button id="clearAllFiltersBtn" class="action-btn">Clear All Filters</button>
        `;

        grid.appendChild(noResults);

        document.getElementById('clearAllFiltersBtn')?.addEventListener('click', () => {
            // Reset all filters
            Object.keys(currentFilters).forEach(key => {
                const element = document.getElementById(`${key}Filter`);
                if (element) element.value = '';
                currentFilters[key] = '';
            });

            // Clear search input if it exists
            const searchInput = document.getElementById('searchInput');
            if (searchInput) searchInput.value = '';

            // Apply reset filters
            applyFiltersAndSort();
        });

        return;
    }

    // Render each NFT on the page with animation delay
    pageItems.forEach((nft, index) => {
        setTimeout(() => {
            renderNftCard(nft);
            renderDetailedCard(nft);
        }, index * 50); // Staggered loading for visual effect
    });
}

// Update dashboard with real data only
function updateDashboard(nfts) {
    // Total count
    const totalCountEl = document.getElementById('totalCount');
    if (totalCountEl) {
        totalCountEl.textContent = nfts.length;
    }

    // Calculate rarity statistics
    let highestRarityScore = 0;
    let rarestNft = null;

    // Count breeds for distribution
    const breedCounts = {};

    // Count elements for visualization
    const elementCounts = {};

    nfts.forEach(nft => {
        // Track rarity score
        if (nft.rarityScore && nft.rarityScore > highestRarityScore) {
            highestRarityScore = nft.rarityScore;
            rarestNft = nft;
        }

        // Track breed distribution
        if (nft.breed) {
            breedCounts[nft.breed] = (breedCounts[nft.breed] || 0) + 1;
        }

        // Track element distribution
        const elementTrait = nft.traits?.find(t =>
            t.trait_type === 'Element' || t.trait_type === 'Power'
        );
        if (elementTrait && elementTrait.value) {
            elementCounts[elementTrait.value] = (elementCounts[elementTrait.value] || 0) + 1;
        }
    });

    // Update rarest NFT display
    const rarestElement = document.getElementById('rarestRarity');
    if (rarestElement) {
        if (rarestNft) {
            rarestElement.innerHTML = `<a href="kitty.html?id=${rarestNft.id}" class="dashboard-link">#${rarestNft.id}</a>`;
        } else {
            rarestElement.textContent = 'N/A';
        }
    }

    // Find most common breed
    let mostCommonBreed = '';
    let highestCount = 0;
    for (const breed in breedCounts) {
        if (breedCounts[breed] > highestCount) {
            mostCommonBreed = breed;
            highestCount = breedCounts[breed];
        }
    }

    // Update breed distribution display
    const breedElement = document.getElementById('breedDistribution');
    if (breedElement) {
        if (mostCommonBreed) {
            breedElement.textContent = mostCommonBreed;
        } else {
            breedElement.textContent = 'Unknown';
        }
    }

    // Update collection stats visualization if the element exists
    updateCollectionStats(breedCounts, elementCounts);

    // If we have GSAP, animate the stat values for a nice effect
    if (window.gsap && totalCountEl) {
        gsap.from('#totalCount', {
            textContent: 0,
            duration: 1.5,
            ease: "power2.out",
            snap: { textContent: 1 },
            onUpdate: function () {
                this.targets()[0].textContent = Math.round(this.targets()[0].textContent);
            }
        });
    }
}

// Update collection stats visualization
function updateCollectionStats(breedCounts, elementCounts) {
    const statsContainer = document.getElementById('collectionStats');
    if (!statsContainer) return;

    // Show the container
    statsContainer.style.display = 'block';

    // Create a breed distribution chart if Chart.js is available
    const breedCanvas = document.getElementById('breedChart');
    if (window.Chart && breedCanvas) {
        const breedLabels = Object.keys(breedCounts);
        const breedData = breedLabels.map(breed => breedCounts[breed]);

        new Chart(breedCanvas, {
            type: 'doughnut',
            data: {
                labels: breedLabels,
                datasets: [{
                    data: breedData,
                    backgroundColor: [
                        '#8a65ff', '#ff9800', '#42a5f5', '#66bb6a', '#ec407a',
                        '#ab47bc', '#7e57c2', '#26a69a', '#ff7043', '#ffa000'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#e0e0e0',
                            font: {
                                family: 'Poppins',
                                size: 12
                            }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Breed Distribution',
                        color: '#ffffff',
                        font: {
                            family: 'Poppins',
                            size: 16,
                            weight: '500'
                        }
                    }
                }
            }
        });
    }

    // Create element distribution chart
    const elementCanvas = document.getElementById('elementChart');
    if (window.Chart && elementCanvas) {
        const elementLabels = Object.keys(elementCounts);
        const elementData = elementLabels.map(element => elementCounts[element]);

        // Custom colors for elements
        const elementColors = {
            'Fire': '#ff7043',
            'Water': '#42a5f5',
            'Earth': '#66bb6a',
            'Wind': '#b0bec5',
            'Void': '#9c27b0',
            'Lightning': '#ffeb3b',
            'Thunder': '#ffc107',
            'Ice': '#81d4fa',
            'Shadow': '#7e57c2',
            'Light': '#fff176',
            'Cosmic': '#e040fb'
        };

        const colors = elementLabels.map(element => elementColors[element] || '#8a65ff');

        new Chart(elementCanvas, {
            type: 'bar',
            data: {
                labels: elementLabels,
                datasets: [{
                    label: 'Elements',
                    data: elementData,
                    backgroundColor: colors,
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: 'Element Distribution',
                        color: '#ffffff',
                        font: {
                            family: 'Poppins',
                            size: 16,
                            weight: '500'
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            color: '#b0b0b0',
                            font: {
                                family: 'Poppins'
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#b0b0b0',
                            font: {
                                family: 'Poppins'
                            }
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
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
            .toast.warning { background: #FF9800; }
            
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
            setTimeout(() => {
                if (toastContainer.contains(toast)) {
                    toastContainer.removeChild(toast);
                }
            }, 300);
        }, duration);
    }

    return toast;
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
        name: `Ninja Cat #${id}`,
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
        if (count) {
            count.textContent = `You own ${bal} Ninja Cat${bal !== 1 ? 's' : ''}`;
        }

        if (!bal) {
            loading.style.display = 'none';
            emptyState.style.display = 'block';
            return;
        }

        // Fetch all NFT data from Vitruveo
        const progressIndicator = document.createElement('div');
        progressIndicator.className = 'progress-indicator';
        progressIndicator.innerHTML = `<div class="progress-text">Loading your collection: 0/${bal} NFTs</div>
            <div class="progress-bar"><div class="progress-fill"></div></div>`;
        loading.appendChild(progressIndicator);

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
                let rarityTier = null;
                let rarityScore = null;

                if (meta.attributes && meta.attributes.length) {
                    // Copy attributes for manipulation
                    traits = [...meta.attributes];

                    // Find breed attribute
                    const breedAttr = traits.find(attr =>
                        attr.trait_type === "Breed" ||
                        attr.trait_type === "breed"
                    );
                    if (breedAttr) breed = breedAttr.value;
                }

                // Try to extract rarity information
                if (meta.ninja_data && meta.ninja_data.rarity) {
                    rarityTier = meta.ninja_data.rarity.tier;
                    rarityScore = meta.ninja_data.rarity.score;
                } else {
                    // Try to find a rarity trait
                    const rarityAttr = traits.find(attr =>
                        attr.trait_type === "Rarity" ||
                        attr.trait_type === "Rank"
                    );
                    if (rarityAttr) rarityTier = rarityAttr.value;
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
                    name: meta.name || `Ninja Cat #${id}`,
                    image: imageUrl,
                    breed,
                    traits,
                    rarityTier,
                    rarityScore
                });

                // Update progress indicator
                const progressFill = progressIndicator.querySelector('.progress-fill');
                const progressText = progressIndicator.querySelector('.progress-text');

                if (progressFill && progressText) {
                    const progressPercent = ((i + 1) / bal) * 100;
                    progressFill.style.width = `${progressPercent}%`;
                    progressText.textContent = `Loading your collection: ${i + 1}/${bal} NFTs`;
                }

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
        if (count) {
            count.textContent = `Error loading your NFTs: ${error.message}`;
        }
        showToast(`Failed to load your collection: ${error.message}`, 'error');
    } finally {
        loading.style.display = 'none';
    }
}