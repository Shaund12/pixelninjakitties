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

    // Create the navbar HTML
    const navbar = document.createElement('nav');
    navbar.innerHTML = `
        <img src="assets/detailed_ninja_cat_64.png" alt="Ninja Cat Logo">
        <a href="index.html" ${currentPage === 'index.html' ? 'class="active"' : ''}>Mint</a>
        <a href="lore.html" ${currentPage === 'lore.html' ? 'class="active"' : ''}>Lore</a>
        <a href="my-kitties.html" ${currentPage === 'my-kitties.html' ? 'class="active"' : ''}>My Kitties</a>
        <a href="all-kitties.html" ${currentPage === 'all-kitties.html' ? 'class="active"' : ''}>Gallery</a>
        <a href="marketplace.html" ${currentPage === 'marketplace.html' ? 'class="active"' : ''}>Marketplace</a>
        
        <span class="spacer"></span>
        <div class="price-indicator">VTRU: <span id="vtruPrice">--.--</span> USDC</div>
        <button id="connectBtn">Connect Wallet</button>
    `;

    // Find the navbar container or insert at the beginning of body
    const navbarContainer = document.getElementById('navbar-container');
    if (navbarContainer) {
        navbarContainer.appendChild(navbar);
    } else {
        document.body.insertBefore(navbar, document.body.firstChild);
    }

    // Setup price indicator functionality
    setupPriceIndicator();

    // Connect wallet button functionality
    const connectBtn = document.getElementById('connectBtn');
    if (connectBtn) {
        if (!connectBtn.onclick) {
            connectBtn.addEventListener('click', async function () {
                if (typeof window.connectWallet === 'function') {
                    await window.connectWallet();
                } else {
                    if (window.ethereum) {
                        try {
                            await window.ethereum.request({ method: 'eth_requestAccounts' });
                            connectBtn.textContent = 'Connected';
                        } catch (error) {
                            console.error('User denied account access', error);
                        }
                    } else {
                        alert('Please install MetaMask or another Ethereum wallet');
                    }
                }
            });
        }
    }
});

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
            vtruPriceElement.textContent = rate.toFixed(4);
        }
    } catch (err) {
        console.warn('Failed to fetch VTRU price:', err);
        // Retry after 5 seconds if it fails
        setTimeout(fetchExchangeRate, 5000);
    }
}