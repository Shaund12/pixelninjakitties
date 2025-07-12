/* ------------------------------------------------------------ *
 *  wallet.js – centralized wallet system for all pages         *
 * ------------------------------------------------------------ */

/* global ethers */
// Configurable constants
const RPC_URL = "https://rpc.vitruveo.xyz";
const CHAIN_ID = null; // Set to specific chain ID if needed
const NETWORK_NAME = "Vitruveo";

// ALL storage keys used across the site
const STORAGE_KEYS = {
    MAIN: 'ninja_cats_wallet',
    LEGACY: 'pnc_addr',
    ALT_LEGACY: 'wallet_address'
};

/* ---------- 1. Providers & Constants ------------------------ */
export const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
// Create browser provider if available for mint.js to use
export const browserProvider = window.ethereum ?
    new ethers.BrowserProvider(window.ethereum) : null;

// CRITICAL: Export providers to window.walletModule for mint.js
window.walletModule = {
    rpcProvider,
    browserProvider
};

const EVENTS = {
    CONNECTED: 'wallet:connected',
    DISCONNECTED: 'wallet:disconnected',
    NETWORK_CHANGED: 'wallet:networkChanged',
    ERROR: 'wallet:error',
    LEGACY: 'walletChanged' // Legacy event name
};

/* ---------- 2. Utils --------------------------------------- */
export const short = a => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

function dispatchWalletEvent(eventName, detail = {}) {
    // Dispatch the standard event
    window.dispatchEvent(new CustomEvent(eventName, { detail }));

    // ALWAYS dispatch legacy walletChanged event for marketplace.js compatibility
    if (eventName === EVENTS.CONNECTED) {
        window.dispatchEvent(new CustomEvent(EVENTS.LEGACY, { detail }));
    }
    console.log(`Event dispatched: ${eventName}`, detail);
}

/* ---------- 3. Wallet state and storage -------------------- */
// Global state shared across all modules
const walletState = {
    address: null,
    chainId: null,
    provider: null,
    connecting: false,
    initialized: false
};

// Initialize the global wallet object needed by marketplace.js
window.wallet = window.wallet || {};

function loadStoredState() {
    try {
        // Try all possible storage keys to get an address
        // Order of priority: MAIN, LEGACY, ALT_LEGACY
        let address = null;
        let chainId = null;

        // Try main storage
        const mainStored = localStorage.getItem(STORAGE_KEYS.MAIN);
        if (mainStored) {
            try {
                const parsed = JSON.parse(mainStored);
                address = parsed.address;
                chainId = parsed.chainId;
            } catch (e) {
                console.warn("Error parsing main storage:", e);
            }
        }

        // If no address found, try legacy storage
        if (!address) {
            address = localStorage.getItem(STORAGE_KEYS.LEGACY) ||
                localStorage.getItem(STORAGE_KEYS.ALT_LEGACY);
        }

        // Update state if we found an address
        if (address) {
            walletState.address = address;
            walletState.chainId = chainId;

            // Sync the address to all storage locations immediately
            syncAddressToAllStorages(address, chainId);

            console.log("Loaded wallet state:", { address });
        }
    } catch (err) {
        console.warn('Failed to load wallet state:', err);
    }
}

function syncAddressToAllStorages(address, chainId = null) {
    // Only proceed if we have a valid address
    if (!address) {
        clearAllStorage();
        return;
    }

    try {
        // Update main storage
        localStorage.setItem(STORAGE_KEYS.MAIN, JSON.stringify({
            address: address,
            chainId: chainId
        }));

        // Update legacy storage keys
        localStorage.setItem(STORAGE_KEYS.LEGACY, address);
        localStorage.setItem(STORAGE_KEYS.ALT_LEGACY, address);

        // Update global objects needed by marketplace.js
        window.wallet = window.wallet || {};
        window.wallet.address = address;
        window.currentWalletAddress = address; // For some implementations

        console.log("Synchronized wallet address across all storage:", address);
    } catch (err) {
        console.error("Error syncing address to storage:", err);
    }
}

function clearAllStorage() {
    // Clear all storage formats
    localStorage.removeItem(STORAGE_KEYS.MAIN);
    localStorage.removeItem(STORAGE_KEYS.LEGACY);
    localStorage.removeItem(STORAGE_KEYS.ALT_LEGACY);

    // Clear global objects
    if (window.wallet) window.wallet.address = null;
    window.currentWalletAddress = null;

    console.log("Cleared all wallet storage");
}

function saveState() {
    syncAddressToAllStorages(walletState.address, walletState.chainId);
}

function clearState() {
    walletState.address = null;
    walletState.chainId = null;
    clearAllStorage();
}

/* ---------- 4. Provider detection and initialization ------- */
function detectProvider() {
    // Support for multiple wallet providers
    const provider = window.ethereum ||
        window.web3?.currentProvider ||
        (window.ethereum?.providers &&
            window.ethereum.providers.find(p => p.isMetaMask)) ||
        null;

    if (!provider) {
        throw new Error('No wallet detected! Please install MetaMask or another web3 wallet.');
    }

    walletState.provider = provider;
    return new ethers.BrowserProvider(provider);
}

/* ---------- 5. Network validation and switching ------------ */
async function validateNetwork(provider) {
    if (!CHAIN_ID) return true; // Skip validation if no target chain configured

    const network = await provider.getNetwork();
    const currentChainId = network.chainId.toString();

    if (currentChainId !== CHAIN_ID.toString()) {
        try {
            await window.ethereum.request({
                method: 'wallet_switchEthereumChain',
                params: [{ chainId: `0x${parseInt(CHAIN_ID).toString(16)}` }]
            });
            return true;
        } catch (error) {
            if (error.code === 4902) {
                dispatchWalletEvent(EVENTS.ERROR, {
                    message: `Please add ${NETWORK_NAME} to your wallet and try again.`
                });
            } else {
                dispatchWalletEvent(EVENTS.ERROR, {
                    message: `Please switch to ${NETWORK_NAME} network.`
                });
            }
            return false;
        }
    }
    return true;
}

/* ---------- 6. Core connection functions ------------------ */
export async function getAddress({ prompt = false } = {}) {
    if (!walletState.initialized) {
        loadStoredState();
        walletState.initialized = true;
    }

    // If we have an address and are not being prompted for a new one, return it
    if (walletState.address && !prompt) return walletState.address;

    try {
        const provider = detectProvider();
        const method = prompt ? 'eth_requestAccounts' : 'eth_accounts';
        const accounts = await window.ethereum.request({ method }).catch(() => []);

        // Update with the new address if we got one
        if (accounts[0]) {
            walletState.address = accounts[0];

            // Get chainId
            try {
                const network = await provider.getNetwork();
                walletState.chainId = network.chainId.toString();
            } catch (e) {
                console.warn("Error getting network:", e);
            }

            // Save to all storage locations
            saveState();
        }

        return walletState.address;
    } catch (err) {
        console.error('Error getting address:', err);
        return null;
    }
}

/**
 * Connect wallet with enhanced error handling and network validation
 * @param {HTMLButtonElement=} btn Optional UI button to update
 */
export async function connectWallet(btn) {
    if (walletState.connecting) return;

    try {
        walletState.connecting = true;

        if (btn) {
            btn.textContent = 'Connecting...';
            btn.disabled = true;
        }

        const provider = detectProvider();
        const addr = await getAddress({ prompt: true });

        if (!addr) {
            throw new Error('Connection rejected by user');
        }

        // Validate network and prompt to switch if needed
        const validNetwork = await validateNetwork(provider);
        if (!validNetwork) {
            throw new Error(`Please connect to ${NETWORK_NAME} network`);
        }

        const signer = await provider.getSigner(addr);

        if (btn) {
            btn.textContent = short(addr);
            btn.classList.add('connected');
            btn.disabled = false;
        }

        // Update all storage locations one more time for certainty
        saveState();

        // Update page-specific UI elements if they exist
        updatePageUI(addr);

        // Dispatch events
        dispatchWalletEvent(EVENTS.CONNECTED, { address: addr, signer });
        return { address: addr, signer };
    } catch (error) {
        console.error("Wallet connection error:", error);
        dispatchWalletEvent(EVENTS.ERROR, { message: error.message });

        if (btn) {
            btn.textContent = 'Connect Wallet';
            btn.disabled = false;
        }

        throw error;
    } finally {
        walletState.connecting = false;
    }
}

/**
 * Generic function to update UI elements across different pages
 */
function updatePageUI(address) {
    // Check for marketplace UI elements
    const walletPrompt = document.getElementById('walletPrompt');
    const sellContent = document.getElementById('sellContent');
    const walletAddressEl = document.getElementById('walletAddress');

    // Update marketplace UI if those elements exist
    if (walletPrompt && sellContent) {
        walletPrompt.style.display = 'none';
        sellContent.style.display = 'block';
    }

    // Update any wallet address displays
    if (walletAddressEl) {
        walletAddressEl.textContent = short(address);
    }

    // Update any connect buttons to show the address
    document.querySelectorAll('[id^="connectBtn"]').forEach(btn => {
        btn.textContent = short(address);
        btn.classList.add('connected');
    });

    // Mint page specific updates
    const mintBtn = document.getElementById('mintBtn');
    if (mintBtn && mintBtn.disabled) {
        mintBtn.disabled = false;
    }
}

/**
 * Disconnect wallet and clear state
 */
export async function disconnectWallet(btn) {
    clearState();

    if (btn) {
        btn.textContent = 'Connect Wallet';
        btn.classList.remove('connected');
    }

    dispatchWalletEvent(EVENTS.DISCONNECTED);
}

/**
 * Get current connection info (address and signer if available)
 */
export async function getConnection() {
    if (!walletState.initialized) {
        loadStoredState();
        walletState.initialized = true;
    }

    const addr = walletState.address;
    if (!addr) return null;

    try {
        const provider = detectProvider();
        const signer = await provider.getSigner(addr);
        return { address: addr, signer, provider };
    } catch (err) {
        console.error("Failed to get signer:", err);
        return { address: addr };
    }
}

/* ---------- 7. Auto-initialize buttons on page load ------- */
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize buttons
        const allButtons = document.querySelectorAll('[id^="connectBtn"]');
        const addr = await getAddress();

        if (addr) {
            // We're already connected - update UI
            updatePageUI(addr);
        }

        // Handle wallet prompt on marketplace (if it exists)
        const walletPromptBtn = document.getElementById('walletPromptConnectBtn');
        if (walletPromptBtn && !walletPromptBtn.onclick) {
            walletPromptBtn.onclick = async () => {
                try {
                    await connectWallet();
                } catch (err) {
                    console.error(err);
                }
            };
        }

        // Set up click handlers for connect buttons
        allButtons.forEach(btn => {
            // Set click handler if not already set
            if (!btn.onclick) {
                btn.onclick = async () => {
                    try {
                        const conn = await getConnection();
                        if (conn?.address) {
                            // Already connected - show disconnect option
                            if (confirm("Disconnect wallet?")) {
                                await disconnectWallet(btn);
                                // Refresh the page to reset UI
                                window.location.reload();
                            }
                        } else {
                            await connectWallet(btn);
                        }
                    } catch (err) {
                        console.error(err);
                    }
                };
            }
        });
    } catch (err) {
        console.warn('Error during wallet initialization:', err);
    }
});

/* ---------- 8. Event listeners for wallet changes --------- */
if (window.ethereum?.on) {
    // Account changes
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            clearState();
            dispatchWalletEvent(EVENTS.DISCONNECTED);
        } else {
            const newAddress = accounts[0];
            walletState.address = newAddress;
            saveState();
            updatePageUI(newAddress);
            dispatchWalletEvent(EVENTS.CONNECTED, { address: newAddress });
        }
        // Reload to ensure consistent state
        window.location.reload();
    });

    // Network changes
    window.ethereum.on('chainChanged', (chainId) => {
        walletState.chainId = chainId;
        saveState();
        dispatchWalletEvent(EVENTS.NETWORK_CHANGED, { chainId });
        window.location.reload();
    });

    // Disconnection
    window.ethereum.on('disconnect', () => {
        clearState();
        dispatchWalletEvent(EVENTS.DISCONNECTED);
        window.location.reload();
    });
}

/* ---------- 9. Export functions to window for global access -- */
window.connectWallet = connectWallet;
window.getWalletAddress = getAddress;
window.disconnectWallet = disconnectWallet;
window.getWalletConnection = getConnection;
window.formatAddress = short;
window.isWalletConnected = () => !!walletState.address;
window.wallet = window.wallet || { address: walletState.address };

// Initialize immediately to ensure marketplace.js has access to wallet info
loadStoredState();

// Special log to confirm proper initialization
console.log("%c🐱 Ninja Cat Wallet System Initialized",
    "background: #8a65ff; color: white; padding: 8px; border-radius: 4px; font-weight: bold",
    { address: walletState.address || "Not connected" });

/* ---------- 10. Export events for app-wide usage ----------- */
export { EVENTS };