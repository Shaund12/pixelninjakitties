/**
 * Wallet Connector for Supabase Integration
 * Handles Web3 wallet connection and provides user context for Supabase operations
 */

// Global wallet state
let currentWalletAddress = null;
let walletConnection = null;
let connectionListeners = [];

// Check if wallet is connected
export function isWalletConnected() {
    return currentWalletAddress !== null;
}

// Get current wallet address
export function getCurrentWalletAddress() {
    return currentWalletAddress;
}

// Initialize wallet connection from existing wallet system
export async function initializeWalletConnection() {
    try {
        // Check if we have the unified wallet system
        if (window.getWalletConnection) {
            const connection = await window.getWalletConnection();
            if (connection && connection.address) {
                currentWalletAddress = connection.address;
                walletConnection = connection;
                notifyConnectionListeners(currentWalletAddress);
                return connection;
            }
        }

        // Fallback to direct MetaMask check
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts && accounts.length > 0) {
                currentWalletAddress = accounts[0];
                walletConnection = { address: accounts[0] };
                notifyConnectionListeners(currentWalletAddress);
                return walletConnection;
            }
        }

        return null;
    } catch (error) {
        console.error('Error initializing wallet connection:', error);
        return null;
    }
}

// Connect wallet
export async function connectWallet() {
    try {
        // Use unified wallet system if available
        if (window.connectWallet) {
            const result = await window.connectWallet();
            if (result && result.address) {
                currentWalletAddress = result.address;
                walletConnection = result;
                notifyConnectionListeners(currentWalletAddress);
                return result;
            }
        }

        // Fallback to direct MetaMask connection
        if (window.ethereum) {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            if (accounts && accounts.length > 0) {
                currentWalletAddress = accounts[0];
                walletConnection = { address: accounts[0] };
                notifyConnectionListeners(currentWalletAddress);
                return walletConnection;
            }
        }

        throw new Error('No wallet found');
    } catch (error) {
        console.error('Error connecting wallet:', error);
        throw error;
    }
}

// Disconnect wallet
export function disconnectWallet() {
    currentWalletAddress = null;
    walletConnection = null;
    notifyConnectionListeners(null);
}

// Add connection listener
export function addConnectionListener(callback) {
    connectionListeners.push(callback);
}

// Remove connection listener
export function removeConnectionListener(callback) {
    connectionListeners = connectionListeners.filter(listener => listener !== callback);
}

// Notify all listeners of connection changes
function notifyConnectionListeners(address) {
    connectionListeners.forEach(callback => {
        try {
            callback(address);
        } catch (error) {
            console.error('Error in connection listener:', error);
        }
    });
}

// Listen for wallet changes
export function setupWalletListeners() {
    // Listen for unified wallet system events
    if (window.addEventListener) {
        window.addEventListener('walletChanged', async (event) => {
            const address = event.detail?.address;
            if (address !== currentWalletAddress) {
                currentWalletAddress = address;
                walletConnection = address ? { address } : null;
                notifyConnectionListeners(currentWalletAddress);
            }
        });
    }

    // Listen for MetaMask account changes
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length > 0) {
                const newAddress = accounts[0];
                if (newAddress !== currentWalletAddress) {
                    currentWalletAddress = newAddress;
                    walletConnection = { address: newAddress };
                    notifyConnectionListeners(currentWalletAddress);
                }
            } else {
                disconnectWallet();
            }
        });

        window.ethereum.on('chainChanged', (chainId) => {
            console.log('Chain changed:', chainId);
            // Optionally reload the page or update UI
        });
    }
}

// Utility function to ensure wallet is connected
export async function ensureWalletConnected() {
    if (!currentWalletAddress) {
        const connection = await initializeWalletConnection();
        if (!connection) {
            throw new Error('Wallet not connected');
        }
    }
    return currentWalletAddress;
}

// Utility function to get wallet address with user-friendly error
export function getWalletAddressOrThrow() {
    if (!currentWalletAddress) {
        throw new Error('Please connect your wallet first');
    }
    return currentWalletAddress;
}

// Initialize on load
document.addEventListener('DOMContentLoaded', async () => {
    setupWalletListeners();
    await initializeWalletConnection();
});