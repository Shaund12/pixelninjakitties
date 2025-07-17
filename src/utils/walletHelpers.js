/**
 * Centralized Wallet Utilities
 * Consolidates wallet connection, address formatting, and validation logic
 */

/* global ethers, window, localStorage, CustomEvent */

// Configurable constants
const RPC_URL = 'https://rpc.vitruveo.xyz';

// Storage keys for wallet state persistence
const STORAGE_KEYS = {
    MAIN: 'ninja_cats_wallet',
    LEGACY: 'pnc_addr',
    ALT_LEGACY: 'wallet_address'
};

// Event names for wallet state changes
export const WALLET_EVENTS = {
    CONNECTED: 'wallet:connected',
    DISCONNECTED: 'wallet:disconnected',
    NETWORK_CHANGED: 'wallet:networkChanged',
    ERROR: 'wallet:error',
    LEGACY: 'walletChanged' // Legacy event name for compatibility
};

// Providers
export const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);
export const browserProvider = window.ethereum ?
    new ethers.BrowserProvider(window.ethereum) : null;

// Global wallet state
const walletState = {
    address: null,
    chainId: null,
    provider: null,
    connecting: false,
    initialized: false
};

/**
 * Format address for display (e.g., 0x1234...5678)
 * @param {string} address - Ethereum address
 * @returns {string} Formatted address or empty string
 */
export const short = (address) => {
    return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
};

/**
 * Validate Ethereum address format and normalize to lowercase
 * @param {string} address - Address to validate
 * @returns {string} Validated and normalized address
 * @throws {Error} If address is invalid
 */
export const validateAddress = (address) => {
    if (!address || typeof address !== 'string') {
        throw new Error('Invalid address: must be a non-empty string');
    }

    // Basic Ethereum address validation
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
        throw new Error('Invalid Ethereum address format');
    }

    return address.toLowerCase();
};

/**
 * Secure logging function that sanitizes wallet addresses
 * @param {string} message - Log message
 * @param {*} data - Optional data to log
 */
export const secureLog = (message, data = null) => {
    const timestamp = new Date().toISOString();
    if (data) {
        // Remove sensitive data before logging
        const sanitizedData = JSON.stringify(data).replace(/0x[a-fA-F0-9]{40}/g, '[ADDRESS]');
        console.log(`[${timestamp}] ${message}:`, sanitizedData);
    } else {
        console.log(`[${timestamp}] ${message}`);
    }
};

/**
 * Dispatch wallet-related events with proper legacy compatibility
 * @param {string} eventName - Event name from WALLET_EVENTS
 * @param {Object} detail - Event detail data
 */
export function dispatchWalletEvent(eventName, detail = {}) {
    try {
        // Dispatch the standard event
        window.dispatchEvent(new CustomEvent(eventName, { detail }));

        // ALWAYS dispatch legacy walletChanged event for marketplace.js compatibility
        if (eventName === WALLET_EVENTS.CONNECTED) {
            window.dispatchEvent(new CustomEvent(WALLET_EVENTS.LEGACY, { detail }));
        }
        secureLog(`Event dispatched: ${eventName}`);
    } catch (error) {
        console.error('Error dispatching wallet event:', error);
    }
}

/**
 * Load wallet state from localStorage
 * @returns {Object|null} Stored wallet state or null
 */
function loadStoredState() {
    try {
        // Try all possible storage keys to get an address
        // Order of priority: MAIN, LEGACY, ALT_LEGACY
        let address = null;
        let chainId = null;

        for (const key of Object.values(STORAGE_KEYS)) {
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    if (parsed && parsed.address) {
                        address = parsed.address;
                        chainId = parsed.chainId;
                        break;
                    }
                } catch {
                    // If JSON parsing fails, treat as a plain address string
                    if (stored.match(/^0x[a-fA-F0-9]{40}$/)) {
                        address = stored;
                        break;
                    }
                }
            }
        }

        return address ? { address, chainId } : null;
    } catch (error) {
        console.error('Error loading stored wallet state:', error);
        return null;
    }
}

/**
 * Save wallet state to localStorage
 * @param {string} address - Wallet address
 * @param {string} chainId - Chain ID
 */
function saveStoredState(address, chainId) {
    try {
        const state = { address, chainId, timestamp: Date.now() };
        localStorage.setItem(STORAGE_KEYS.MAIN, JSON.stringify(state));

        // Also save to legacy keys for compatibility
        localStorage.setItem(STORAGE_KEYS.LEGACY, address);
        localStorage.setItem(STORAGE_KEYS.ALT_LEGACY, address);
    } catch (error) {
        console.error('Error saving wallet state:', error);
    }
}

/**
 * Clear all wallet state from localStorage
 */
function clearStoredState() {
    try {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
    } catch (error) {
        console.error('Error clearing wallet state:', error);
    }
}

/**
 * Connect to wallet and return connection details
 * @returns {Promise<Object|null>} Connection result or null
 */
export async function connectWallet() {
    if (walletState.connecting) {
        console.log('Connection already in progress...');
        return null;
    }

    if (!browserProvider) {
        const error = 'No Ethereum wallet detected. Please install MetaMask or another Web3 wallet.';
        dispatchWalletEvent(WALLET_EVENTS.ERROR, { error });
        throw new Error(error);
    }

    try {
        walletState.connecting = true;
        secureLog('Attempting wallet connection...');

        // Request account access
        const accounts = await window.ethereum.request({
            method: 'eth_requestAccounts'
        });

        if (!accounts || accounts.length === 0) {
            throw new Error('No accounts returned from wallet');
        }

        const address = validateAddress(accounts[0]);
        const network = await browserProvider.getNetwork();
        const chainId = network.chainId.toString();

        // Update global state
        walletState.address = address;
        walletState.chainId = chainId;
        walletState.provider = browserProvider;
        walletState.initialized = true;

        // Save to localStorage
        saveStoredState(address, chainId);

        // Dispatch events
        const connectionData = { address, chainId, provider: browserProvider };
        dispatchWalletEvent(WALLET_EVENTS.CONNECTED, connectionData);

        secureLog('Wallet connected successfully', { chainId });
        return connectionData;

    } catch (error) {
        console.error('Wallet connection failed:', error);
        dispatchWalletEvent(WALLET_EVENTS.ERROR, { error: error.message });
        throw error;
    } finally {
        walletState.connecting = false;
    }
}

/**
 * Disconnect wallet and clear state
 */
export function disconnectWallet() {
    try {
        // Clear state
        walletState.address = null;
        walletState.chainId = null;
        walletState.provider = null;
        walletState.initialized = false;

        // Clear storage
        clearStoredState();

        // Dispatch event
        dispatchWalletEvent(WALLET_EVENTS.DISCONNECTED);

        secureLog('Wallet disconnected');
    } catch (error) {
        console.error('Error during wallet disconnection:', error);
    }
}

/**
 * Get current wallet address
 * @returns {string|null} Current wallet address or null
 */
export function getAddress() {
    return walletState.address;
}

/**
 * Get current wallet connection details
 * @returns {Object|null} Connection details or null
 */
export function getWalletConnection() {
    if (!walletState.address) return null;

    return {
        address: walletState.address,
        chainId: walletState.chainId,
        provider: walletState.provider
    };
}

/**
 * Check if wallet is currently connected
 * @returns {boolean} True if wallet is connected
 */
export function isWalletConnected() {
    return walletState.address !== null;
}

/**
 * Initialize wallet system and attempt silent connection
 * @returns {Promise<Object|null>} Connection details or null
 */
export async function initializeWallet() {
    try {
        // Try to restore from storage first
        const stored = loadStoredState();
        if (stored && stored.address) {
            // Verify with provider if available
            if (browserProvider) {
                try {
                    const accounts = await window.ethereum.request({
                        method: 'eth_accounts'
                    });

                    if (accounts && accounts.length > 0 &&
                        accounts[0].toLowerCase() === stored.address.toLowerCase()) {

                        const network = await browserProvider.getNetwork();
                        const chainId = network.chainId.toString();

                        // Restore state
                        walletState.address = stored.address;
                        walletState.chainId = chainId;
                        walletState.provider = browserProvider;
                        walletState.initialized = true;

                        const connectionData = {
                            address: stored.address,
                            chainId,
                            provider: browserProvider
                        };

                        dispatchWalletEvent(WALLET_EVENTS.CONNECTED, connectionData);
                        secureLog('Wallet connection restored from storage');
                        return connectionData;
                    }
                } catch (error) {
                    console.warn('Failed to verify stored wallet connection:', error);
                }
            }
        }

        walletState.initialized = true;
        secureLog('Wallet system initialized');
        return null;

    } catch (error) {
        console.error('Error initializing wallet:', error);
        walletState.initialized = true; // Mark as initialized even on error
        return null;
    }
}

/**
 * Set up wallet event listeners for account and network changes
 */
export function setupWalletListeners() {
    if (!window.ethereum) return;

    // Handle account changes
    window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length === 0) {
            disconnectWallet();
        } else {
            const newAddress = accounts[0];
            if (walletState.address &&
                newAddress.toLowerCase() !== walletState.address.toLowerCase()) {
                // Account changed, reconnect
                connectWallet().catch(console.error);
            }
        }
    });

    // Handle network changes
    window.ethereum.on('chainChanged', (chainId) => {
        if (walletState.address) {
            walletState.chainId = chainId;
            dispatchWalletEvent(WALLET_EVENTS.NETWORK_CHANGED, { chainId });
            secureLog('Network changed', { chainId });
        }
    });
}

// Auto-initialize listeners when module loads
if (typeof window !== 'undefined') {
    setupWalletListeners();
}