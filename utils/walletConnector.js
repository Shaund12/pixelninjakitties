/**
 * Wallet Connector for Supabase Integration
 * This file now delegates to the centralized wallet helpers for consistency
 */

// Import the centralized wallet utilities
import {
    initializeWallet,
    connectWallet,
    disconnectWallet,
    getAddress,
    getWalletConnection,
    isWalletConnected,
    WALLET_EVENTS
} from './src/utils/walletHelpers.js';

// Re-export functions with legacy naming for backwards compatibility
export {
    isWalletConnected,
    getAddress as getCurrentWalletAddress,
    getWalletConnection,
    connectWallet,
    disconnectWallet,
    initializeWallet as initializeWalletConnection
};

// Legacy event handling - map new events to old function names
let connectionListeners = [];

export function addConnectionListener(callback) {
    connectionListeners.push(callback);
    
    // Set up event listeners for the new centralized events
    const eventHandler = (event) => {
        callback(event.detail?.address || null);
    };
    
    window.addEventListener(WALLET_EVENTS.CONNECTED, eventHandler);
    window.addEventListener(WALLET_EVENTS.DISCONNECTED, () => callback(null));
}

export function removeConnectionListener(callback) {
    connectionListeners = connectionListeners.filter(listener => listener !== callback);
}

// Notify listeners (for backwards compatibility)
function notifyConnectionListeners(address) {
    connectionListeners.forEach(callback => {
        try {
            callback(address);
        } catch (error) {
            console.error('Error in connection listener:', error);
        }
    });
}