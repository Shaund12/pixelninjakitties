/* global ethers, gsap */
import { getAddress, connectWallet, disconnectWallet, short, EVENTS as WALLET_EVENTS } from './wallet.js';

document.addEventListener('DOMContentLoaded', function () {
    // Avoid variable redeclaration by using a namespace
    window.SwapConfig = window.SwapConfig || {
        LP_POOL_ADDRESS: "0x8B3808260a058ECfFA9b1d0eaA988A1b4167DDba",
        VTRU_ADDRESS: "0x3ccc3F22462cAe34766820894D04a40381201ef9",
        USDC_ADDRESS: "0xbCfB3FCa16b12C7756CD6C24f1cC0AC0E38569CF",
        LP_POOL_ABI: [
            {
                "inputs": [],
                "name": "getReserves",
                "outputs": [
                    { "internalType": "uint112", "name": "reserve0", "type": "uint112" },
                    { "internalType": "uint112", "name": "reserve1", "type": "uint112" },
                    { "internalType": "uint32", "name": "blockTimestampLast", "type": "uint32" }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "token0",
                "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "token1",
                "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
                "stateMutability": "view",
                "type": "function"
            }
        ]
    };

    // Get the current page filename
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // Create the navbar HTML with enhanced features
    const navbar = document.createElement('nav');
    navbar.className = 'ninja-navbar';
    navbar.innerHTML = `
        <div class="navbar-container">
            <div class="navbar-brand">
                <img src="assets/detailed_ninja_cat_64.png" alt="Ninja Cat Logo" class="nav-logo">
                <span class="brand-name">Ninja Cats</span>
            </div>
            
            <button class="mobile-menu-toggle" aria-label="Toggle menu">
                <span></span><span></span><span></span>
            </button>
            
            <div class="navbar-menu">
                <div class="navbar-start">
                    <a href="index.html" ${currentPage === 'index.html' ? 'class="active"' : ''}>
                        <i class="nav-icon">🏠</i> Mint
                    </a>
                    <a href="lore.html" ${currentPage === 'lore.html' ? 'class="active"' : ''}>
                        <i class="nav-icon">📜</i> Lore
                    </a>
                    <a href="my-kitties.html" ${currentPage === 'my-kitties.html' ? 'class="active"' : ''}>
                        <i class="nav-icon">😺</i> My Kitties
                    </a>
                    <a href="all-kitties.html" ${currentPage === 'all-kitties.html' ? 'class="active"' : ''}>
                        <i class="nav-icon">🖼️</i> Gallery
                    </a>
                    <a href="marketplace.html" ${currentPage === 'marketplace.html' ? 'class="active"' : ''}>
                        <i class="nav-icon">🛒</i> Marketplace
                    </a>
                </div>
                
                <div class="navbar-end">
                    <div class="price-indicator">
                        <div class="token-icon">🪙</div>
                        <div class="price-content">
                            <div class="price-label">VTRU Price</div>
                            <div class="price-value"><span id="vtruPrice">--.--</span> USDC</div>
                        </div>
                    </div>
                    
                    <div class="wallet-container">
                        <button id="connectBtn" class="connect-button">Connect Wallet</button>
                        <div class="wallet-dropdown">
                            <div class="wallet-info">
                                <span class="wallet-network">Vitruveo Network</span>
                                <span class="wallet-address" id="walletAddress"></span>
                            </div>
                            <div class="dropdown-items">
                                <a href="my-kitties.html" class="dropdown-item">
                                    <i class="dropdown-icon">🖼️</i> My NFTs
                                </a>
                                <a href="#" class="dropdown-item" id="copyAddressBtn">
                                    <i class="dropdown-icon">📋</i> Copy Address
                                </a>
                                <a href="#" class="dropdown-item" id="disconnectBtn">
                                    <i class="dropdown-icon">🔌</i> Disconnect
                                </a>
                            </div>
                        </div>
                    </div>
                    
                    <button id="themeToggle" class="theme-toggle" aria-label="Toggle theme">
                        <i class="theme-icon">🌙</i>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Find the navbar container or insert at the beginning of body
    const navbarContainer = document.getElementById('navbar-container');
    if (navbarContainer) {
        navbarContainer.appendChild(navbar);
    } else {
        document.body.insertBefore(navbar, document.body.firstChild);
    }

    // Add the navbar styles
    addNavbarStyles();

    // Setup mobile menu toggle
    setupMobileMenu();

    // Setup wallet functionality
    setupWalletIntegration();

    // Setup price indicator functionality
    setupPriceIndicator();

    // Setup theme toggle
    setupThemeToggle();
});

function setupMobileMenu() {
    const mobileToggle = document.querySelector('.mobile-menu-toggle');
    const navbarMenu = document.querySelector('.navbar-menu');

    if (mobileToggle && navbarMenu) {
        mobileToggle.addEventListener('click', () => {
            mobileToggle.classList.toggle('active');
            navbarMenu.classList.toggle('active');

            // Add animation if GSAP is available
            if (window.gsap) {
                if (navbarMenu.classList.contains('active')) {
                    gsap.fromTo(navbarMenu,
                        { height: 0, opacity: 0 },
                        { height: 'auto', opacity: 1, duration: 0.3 }
                    );
                } else {
                    gsap.to(navbarMenu, { height: 0, opacity: 0, duration: 0.3 });
                }
            }
        });

        // Close menu when clicking on links
        const navLinks = navbarMenu.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                mobileToggle.classList.remove('active');
                navbarMenu.classList.remove('active');
            });
        });
    }
}

function setupWalletIntegration() {
    const connectBtn = document.getElementById('connectBtn');
    const walletDropdown = document.querySelector('.wallet-dropdown');
    const walletAddress = document.getElementById('walletAddress');
    const disconnectBtn = document.getElementById('disconnectBtn');
    const copyAddressBtn = document.getElementById('copyAddressBtn');

    // Check for wallet connection on load
    checkWalletConnection();

    // Setup wallet event listeners
    window.addEventListener(WALLET_EVENTS.CONNECTED, (e) => {
        updateWalletUI(e.detail.address);
    });

    window.addEventListener(WALLET_EVENTS.DISCONNECTED, () => {
        resetWalletUI();
    });

    // Connect button click handler
    if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
            try {
                // If already connected, toggle dropdown
                const address = await getAddress();
                if (address) {
                    toggleWalletDropdown();
                    return;
                }

                // Otherwise connect wallet
                await connectWallet(connectBtn);
            } catch (error) {
                console.error("Error connecting wallet:", error);
                showNotification('Failed to connect wallet', 'error');
            }
        });
    }

    // Disconnect button click handler
    if (disconnectBtn) {
        disconnectBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            try {
                await disconnectWallet(connectBtn);
                hideWalletDropdown();
                showNotification('Wallet disconnected', 'success');
            } catch (error) {
                console.error("Error disconnecting wallet:", error);
            }
        });
    }

    // Copy address button click handler
    if (copyAddressBtn) {
        copyAddressBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const address = await getAddress();
            if (address) {
                navigator.clipboard.writeText(address);
                showNotification('Address copied to clipboard', 'success');
            }
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (walletDropdown &&
            !walletDropdown.contains(e.target) &&
            !connectBtn.contains(e.target) &&
            walletDropdown.classList.contains('active')) {
            hideWalletDropdown();
        }
    });
}

async function checkWalletConnection() {
    try {
        const address = await getAddress();
        if (address) {
            updateWalletUI(address);
        } else {
            resetWalletUI();
        }
    } catch (error) {
        console.error("Error checking wallet connection:", error);
        resetWalletUI();
    }
}

function updateWalletUI(address) {
    const connectBtn = document.getElementById('connectBtn');
    const walletAddress = document.getElementById('walletAddress');

    if (connectBtn) {
        connectBtn.textContent = short(address);
        connectBtn.classList.add('connected');
    }

    if (walletAddress) {
        walletAddress.textContent = short(address);
    }
}

function resetWalletUI() {
    const connectBtn = document.getElementById('connectBtn');

    if (connectBtn) {
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.classList.remove('connected');
    }

    hideWalletDropdown();
}

function toggleWalletDropdown() {
    const dropdown = document.querySelector('.wallet-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('active');

        // Add animation if GSAP is available
        if (window.gsap && dropdown.classList.contains('active')) {
            gsap.fromTo(dropdown,
                { opacity: 0, y: -10 },
                { opacity: 1, y: 0, duration: 0.2 }
            );
        }
    }
}

function hideWalletDropdown() {
    const dropdown = document.querySelector('.wallet-dropdown');
    if (dropdown) {
        dropdown.classList.remove('active');
    }
}

// Function to set up price indicator
function setupPriceIndicator() {
    const vtruPriceElement = document.getElementById('vtruPrice');
    if (!vtruPriceElement) return;

    // Set up global getExchangeRate if it doesn't exist
    if (typeof window.getExchangeRate !== 'function') {
        window.getExchangeRate = getExchangeRateInternal;
    }

    // Initial fetch with retry
    fetchExchangeRate();

    // Update price every 60 seconds
    setInterval(fetchExchangeRate, 60000);
}

// Function to fetch exchange rate with retry logic
async function fetchExchangeRate() {
    try {
        const vtruPriceElement = document.getElementById('vtruPrice');
        if (!vtruPriceElement) return;

        // Try to get exchange rate
        const rate = await window.getExchangeRate();
        if (rate && !isNaN(rate)) {
            // Save old price for animation
            const oldPrice = parseFloat(vtruPriceElement.textContent);
            const newPrice = rate.toFixed(4);

            // Update with animation if price changed
            if (oldPrice !== parseFloat(newPrice)) {
                // Highlight price change with color
                const priceUp = parseFloat(newPrice) > oldPrice;

                // Animate with GSAP if available
                if (window.gsap) {
                    gsap.to(vtruPriceElement, {
                        color: priceUp ? '#4caf50' : '#f44336',
                        duration: 0.3,
                        onComplete: () => {
                            vtruPriceElement.textContent = newPrice;
                            gsap.to(vtruPriceElement, {
                                color: 'inherit',
                                duration: 1.5
                            });
                        }
                    });
                } else {
                    vtruPriceElement.textContent = newPrice;
                }
            } else {
                vtruPriceElement.textContent = newPrice;
            }
        }
    } catch (err) {
        console.warn('Failed to fetch VTRU price:', err);
        // Retry after 5 seconds if it fails
        setTimeout(fetchExchangeRate, 5000);
    }
}

// Setup theme toggle functionality
function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;

    // Check for saved theme
    const savedTheme = localStorage.getItem('ninja_cats_theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        themeToggle.querySelector('.theme-icon').textContent = '☀️';
    }

    // Toggle theme on click
    themeToggle.addEventListener('click', () => {
        const isLightTheme = document.body.classList.toggle('light-theme');
        localStorage.setItem('ninja_cats_theme', isLightTheme ? 'light' : 'dark');
        themeToggle.querySelector('.theme-icon').textContent = isLightTheme ? '☀️' : '🌙';

        // Add a flash animation if GSAP is available
        if (window.gsap) {
            const overlay = document.createElement('div');
            overlay.style.position = 'fixed';
            overlay.style.top = '0';
            overlay.style.left = '0';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.backgroundColor = isLightTheme ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)';
            overlay.style.zIndex = '9999';
            overlay.style.pointerEvents = 'none';
            document.body.appendChild(overlay);

            gsap.to(overlay, {
                opacity: 0,
                duration: 0.5,
                onComplete: () => document.body.removeChild(overlay)
            });
        }
    });
}

// Show notification
function showNotification(message, type = 'info') {
    // Create notification container if it doesn't exist
    let container = document.querySelector('.notification-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'notification-container';
        document.body.appendChild(container);
    }

    // Create notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => container.removeChild(notification);
    notification.appendChild(closeBtn);

    // Add to container
    container.appendChild(notification);

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (container.contains(notification)) {
            notification.classList.add('fade-out');
            setTimeout(() => {
                if (container.contains(notification)) {
                    container.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);

    // Animate if GSAP is available
    if (window.gsap) {
        gsap.fromTo(notification,
            { x: 100, opacity: 0 },
            { x: 0, opacity: 1, duration: 0.3 }
        );
    }
}

// Internal getExchangeRate implementation for navbar
// Modified function to be compatible with both ethers v5 and v6
async function getExchangeRateInternal() {
    try {
        // Check if ethers is available
        if (typeof ethers === 'undefined') {
            console.warn("Ethers.js not found, make sure it's included in your HTML");
            return null;
        }

        const config = window.SwapConfig; // Use the namespace

        // Connect to blockchain - handle both v5 and v6 ethers
        let provider;
        const rpcUrl = window.NFT_CONFIG?.RPC_URL || "https://rpc.vitruveo.xyz";

        // Check which version of ethers is available
        if (ethers.providers && ethers.providers.JsonRpcProvider) {
            // Ethers v5
            provider = new ethers.providers.JsonRpcProvider(rpcUrl);
        } else if (ethers.JsonRpcProvider) {
            // Ethers v6
            provider = new ethers.JsonRpcProvider(rpcUrl);
        } else {
            console.error("Unsupported ethers.js version");
            return null;
        }

        // Ensure we have the right Contract constructor
        const Contract = ethers.Contract || (ethers.ethers && ethers.ethers.Contract);
        if (!Contract) {
            console.error("Could not find ethers.Contract");
            return null;
        }

        const lpPool = new Contract(config.LP_POOL_ADDRESS, config.LP_POOL_ABI, provider);

        // Get token positions in the pool (order matters for reserves)
        const token0 = await lpPool.token0();
        const token1 = await lpPool.token1();

        // Get reserves
        const reserves = await lpPool.getReserves();

        // Determine which reserve is VTRU and which is USDC
        let vtruReserve, usdcReserve;
        const isVtruToken0 = token0.toLowerCase() === config.VTRU_ADDRESS.toLowerCase();

        if (isVtruToken0) {
            vtruReserve = reserves[0];
            usdcReserve = reserves[1];
        } else {
            vtruReserve = reserves[1];
            usdcReserve = reserves[0];
        }

        // Calculate exchange rate (VTRU price in USDC)
        const vtruDecimals = 18;
        const usdcDecimals = 6;

        // Handle BigNumber type differences between v5 and v6
        const vtruAmount = parseFloat(vtruReserve.toString()) / (10 ** vtruDecimals);
        const usdcAmount = parseFloat(usdcReserve.toString()) / (10 ** usdcDecimals);

        // Calculate exchange rate: VTRU price in USDC
        const exchangeRate = usdcAmount / vtruAmount;
        console.log(`LP pool exchange rate: 1 VTRU = ${exchangeRate.toFixed(6)} USDC`);

        return exchangeRate;
    } catch (error) {
        console.error("Failed to fetch exchange rate:", error);
        return null;
    }
}

// Add navbar styles
function addNavbarStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = `
        /* Navbar Base Styles */
        .ninja-navbar {
            background: linear-gradient(90deg, #1a1a2e 0%, #16213e 100%);
            color: #fff;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
            padding: 0;
            position: sticky;
            top: 0;
            z-index: 1000;
            font-family: 'Poppins', sans-serif;
        }

        .navbar-container {
            display: flex;
            align-items: center;
            max-width: 1400px;
            margin: 0 auto;
            padding: 0 20px;
            height: 70px;
        }

        /* Brand/Logo */
        .navbar-brand {
            display: flex;
            align-items: center;
            padding: 0 15px 0 0;
        }

        .nav-logo {
            height: 40px;
            margin-right: 10px;
            filter: drop-shadow(0 0 5px rgba(138, 101, 255, 0.6));
            transition: all 0.3s;
        }

        .navbar-brand:hover .nav-logo {
            transform: scale(1.05);
        }

        .brand-name {
            font-weight: 600;
            font-size: 1.2rem;
            background: linear-gradient(45deg, #8a65ff, #ff9800);
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            display: none; /* Hidden on mobile */
        }

        /* Menu Layout */
        .navbar-menu {
            flex: 1;
            display: flex;
            justify-content: space-between;
            transition: height 0.3s, opacity 0.3s;
        }

        .navbar-start, .navbar-end {
            display: flex;
            align-items: center;
        }

        /* Navigation Links */
        .navbar-start a {
            color: #eee;
            text-decoration: none;
            padding: 0 15px;
            height: 70px;
            display: flex;
            align-items: center;
            position: relative;
            transition: color 0.3s;
        }

        .navbar-start a:hover, .navbar-start a.active {
            color: #8a65ff;
        }

        .navbar-start a.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 15px;
            right: 15px;
            height: 3px;
            background: linear-gradient(45deg, #8a65ff, #ff9800);
            border-radius: 3px 3px 0 0;
        }

        .nav-icon {
            margin-right: 6px;
            font-size: 1.1em;
        }

        /* Price Indicator */
        .price-indicator {
            display: flex;
            align-items: center;
            padding: 0 15px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.05);
            margin-right: 10px;
            height: 40px;
        }

        .token-icon {
            margin-right: 8px;
            font-size: 1.2em;
        }

        .price-content {
            display: flex;
            flex-direction: column;
            line-height: 1.1;
        }

        .price-label {
            font-size: 0.7em;
            opacity: 0.7;
        }

        .price-value {
            font-weight: 500;
        }

        /* Wallet Container */
        .wallet-container {
            position: relative;
            margin: 0 10px;
        }

        .connect-button {
            background: linear-gradient(45deg, #8a65ff, #7450db);
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 20px;
            cursor: pointer;
            font-weight: 500;
            transition: all 0.3s;
            min-width: 140px;
        }

        .connect-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(138, 101, 255, 0.3);
        }

        .connect-button.connected {
            background: linear-gradient(45deg, #66bb6a, #43a047);
        }

        .wallet-dropdown {
            position: absolute;
            top: calc(100% + 10px);
            right: 0;
            background: #1a1a2e;
            border-radius: 8px;
            width: 220px;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.2);
            z-index: 100;
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px);
            transition: all 0.2s;
        }

        .wallet-dropdown.active {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }

        .wallet-info {
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .wallet-network {
            display: block;
            font-size: 0.8em;
            opacity: 0.7;
            margin-bottom: 4px;
        }

        .wallet-address {
            display: block;
            font-weight: 500;
        }

        .dropdown-items {
            padding: 8px 0;
        }

        .dropdown-item {
            padding: 8px 16px;
            display: flex;
            align-items: center;
            color: #eee;
            text-decoration: none;
            transition: background 0.2s;
        }

        .dropdown-item:hover {
            background: rgba(255, 255, 255, 0.05);
        }

        .dropdown-icon {
            margin-right: 8px;
        }

        /* Theme Toggle */
        .theme-toggle {
            background: none;
            border: none;
            color: #eee;
            cursor: pointer;
            font-size: 1.2em;
            padding: 4px;
            margin-left: 5px;
            transition: transform 0.3s;
        }

        .theme-toggle:hover {
            transform: rotate(15deg);
        }

        /* Mobile Menu Toggle */
        .mobile-menu-toggle {
            display: none;
            flex-direction: column;
            justify-content: space-between;
            width: 30px;
            height: 21px;
            background: transparent;
            border: none;
            cursor: pointer;
            padding: 0;
            z-index: 10;
        }

        .mobile-menu-toggle span {
            width: 100%;
            height: 3px;
            background-color: #fff;
            border-radius: 3px;
            transition: all 0.3s;
        }

        .mobile-menu-toggle.active span:nth-child(1) {
            transform: translateY(9px) rotate(45deg);
        }

        .mobile-menu-toggle.active span:nth-child(2) {
            opacity: 0;
        }

        .mobile-menu-toggle.active span:nth-child(3) {
            transform: translateY(-9px) rotate(-45deg);
        }

        /* Notifications */
        .notification-container {
            position: fixed;
            top: 80px;
            right: 20px;
            max-width: 350px;
            z-index: 1001;
        }

        .notification {
            background: #333;
            color: white;
            margin-bottom: 10px;
            padding: 15px 40px 15px 15px;
            border-radius: 4px;
            box-shadow: 0 4px 8px rgba(0,0,0,0.2);
            position: relative;
            animation: notification-slide-in 0.3s ease-out forwards;
        }

        .notification.info {
            background: #2196F3;
        }

        .notification.success {
            background: #4CAF50;
        }

        .notification.warning {
            background: #FF9800;
        }

        .notification.error {
            background: #F44336;
        }

        .notification-close {
            position: absolute;
            top: 8px;
            right: 8px;
            background: none;
            border: none;
            color: white;
            font-size: 1.2em;
            cursor: pointer;
            opacity: 0.7;
        }

        .notification-close:hover {
            opacity: 1;
        }

        .notification.fade-out {
            animation: notification-fade-out 0.3s forwards;
        }

        @keyframes notification-slide-in {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        @keyframes notification-fade-out {
            to { transform: translateX(100%); opacity: 0; }
        }

        /* Light Theme */
        body.light-theme .ninja-navbar {
            background: linear-gradient(90deg, #f8f9fa 0%, #e9ecef 100%);
            color: #333;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
        }

        body.light-theme .navbar-start a {
            color: #333;
        }

        body.light-theme .navbar-start a:hover, 
        body.light-theme .navbar-start a.active {
            color: #8a65ff;
        }

        body.light-theme .price-indicator {
            background: rgba(0, 0, 0, 0.05);
            color: #333;
        }

        body.light-theme .mobile-menu-toggle span {
            background-color: #333;
        }

        body.light-theme .wallet-dropdown {
            background: #f8f9fa;
            box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
        }

        body.light-theme .dropdown-item {
            color: #333;
        }

        body.light-theme .dropdown-item:hover {
            background: rgba(0, 0, 0, 0.05);
        }

        body.light-theme .theme-toggle {
            color: #333;
        }

        /* Responsive Design */
        @media (max-width: 991px) {
            .navbar-menu {
                display: none;
                flex-direction: column;
                position: absolute;
                top: 70px;
                left: 0;
                right: 0;
                background: #1a1a2e;
                height: 0;
                overflow: hidden;
            }
            
            body.light-theme .navbar-menu {
                background: #f8f9fa;
            }

            .navbar-menu.active {
                display: flex;
                height: auto;
            }

            .navbar-start, .navbar-end {
                flex-direction: column;
                width: 100%;
            }

            .navbar-start a {
                width: 100%;
                padding: 15px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            }

            body.light-theme .navbar-start a {
                border-bottom: 1px solid rgba(0, 0, 0, 0.05);
            }

            .navbar-start a.active::after {
                display: none;
            }

            .navbar-end {
                padding: 15px;
            }

            .price-indicator, .wallet-container, .theme-toggle {
                margin: 10px 0;
            }
            
            .price-indicator {
                width: 100%;
                justify-content: center;
            }
            
            .wallet-container {
                width: 100%;
            }
            
            .connect-button {
                width: 100%;
            }
            
            .wallet-dropdown {
                position: relative;
                top: 10px;
                right: auto;
                width: 100%;
            }
            
            .mobile-menu-toggle {
                display: flex;
            }
            
            .brand-name {
                display: block;
            }
        }

        @media (min-width: 992px) {
            .brand-name {
                display: block;
            }
            
            .navbar-container {
                padding: 0 30px;
            }
        }
    `;
    document.head.appendChild(styleEl);
}