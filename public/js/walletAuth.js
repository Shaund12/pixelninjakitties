/**
 * Wallet Authentication Helper
 * Provides wallet address-based authentication for Supabase persistence
 */

import { getAddress, connectWallet } from './wallet.js';

class WalletAuth {
    constructor() {
        this.walletAddress = null;
        this.initialized = false;
        this.initializationPromise = null;
    }

    /**
     * Initialize wallet authentication
     * Prompts for wallet connection if not already connected
     */
    async init() {
        if (this.initialized) return this.walletAddress;
        
        // If already initializing, wait for that to complete
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = this._performInit();
        return this.initializationPromise;
    }

    async _performInit() {
        try {
            // First, try to get existing wallet address
            this.walletAddress = await getAddress();
            
            // If no wallet address, prompt user to connect
            if (!this.walletAddress) {
                console.log('🔗 No wallet connected, prompting user to connect...');
                const connection = await connectWallet();
                this.walletAddress = connection?.address;
            }

            // Normalize to lowercase for consistency
            if (this.walletAddress) {
                this.walletAddress = this.walletAddress.toLowerCase();
                console.log('✅ Wallet authenticated:', this.walletAddress);
                this.initialized = true;
                return this.walletAddress;
            } else {
                console.warn('⚠️ No wallet address available, continuing without authentication');
                return null;
            }
        } catch (error) {
            console.error('❌ Failed to initialize wallet authentication:', error);
            // Don't throw error, just return null to allow fallback behavior
            return null;
        }
    }

    /**
     * Get the current wallet address (normalized to lowercase)
     * @returns {string|null} The wallet address or null if not connected
     */
    async getWalletAddress() {
        if (!this.initialized) {
            await this.init();
        }
        return this.walletAddress;
    }

    /**
     * Check if wallet is connected
     * @returns {boolean} True if wallet is connected
     */
    isConnected() {
        return !!this.walletAddress;
    }

    /**
     * Clear wallet authentication state
     */
    disconnect() {
        this.walletAddress = null;
        this.initialized = false;
        this.initializationPromise = null;
    }
}

// Create singleton instance
const walletAuth = new WalletAuth();

// Export global helper function for easy access
export function getWalletAddress() {
    return walletAuth.getWalletAddress();
}

// Export both the class and singleton
export { WalletAuth, walletAuth };