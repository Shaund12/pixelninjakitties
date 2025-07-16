/**
 * Favorites Manager
 * Handles favorite tokens storage and retrieval via Supabase using wallet authentication
 */

import { initializeSupabase } from './supabase.js';
import { walletAuth } from './walletAuth.js';

class FavoritesManager {
    constructor() {
        this.walletAddress = null;
        this.favorites = new Set();
        this.supabase = null;
        this.init();
    }

    async init() {
        try {
            // Initialize Supabase client
            this.supabase = await initializeSupabase();

            // Get wallet address for authentication
            this.walletAddress = await walletAuth.getWalletAddress();
            
            if (!this.walletAddress) {
                console.warn('⚠️ No wallet connected, favorites will not be persisted');
                this.favorites = new Set();
                return;
            }

            // Load favorites
            await this.loadFavorites();
        } catch (error) {
            console.error('Error initializing favorites:', error);
            // Use empty favorites set if initialization fails
            this.favorites = new Set();
        }
    }

    async loadFavorites() {
        if (!this.walletAddress || !this.supabase) return;

        try {
            const { data, error } = await this.supabase
                .from('favorites')
                .select('token_id')
                .eq('user_id', this.walletAddress);

            if (error) {
                console.error('Error loading favorites:', error);
                return;
            }

            // Handle null/undefined data gracefully
            if (data && Array.isArray(data)) {
                this.favorites = new Set(data.map(item => item.token_id));
            } else {
                this.favorites = new Set();
            }
        } catch (error) {
            console.error('Error loading favorites:', error);
        }
    }

    // Check if token is favorite
    isFavorite(tokenId) {
        return this.favorites.has(tokenId.toString());
    }

    // Add token to favorites
    async addFavorite(tokenId) {
        const tokenIdStr = tokenId.toString();

        if (!this.walletAddress || !this.supabase) return;

        try {
            const { error } = await this.supabase
                .from('favorites')
                .insert({
                    user_id: this.walletAddress,
                    token_id: tokenIdStr
                });

            if (error) {
                console.error('Error adding favorite:', error);
                return;
            }

            this.favorites.add(tokenIdStr);
            this.logAnalytics('favorite_added', { token_id: tokenIdStr });
        } catch (error) {
            console.error('Error adding favorite:', error);
        }
    }

    // Remove token from favorites
    async removeFavorite(tokenId) {
        const tokenIdStr = tokenId.toString();

        if (!this.walletAddress || !this.supabase) return;

        try {
            const { error } = await this.supabase
                .from('favorites')
                .delete()
                .eq('user_id', this.walletAddress)
                .eq('token_id', tokenIdStr);

            if (error) {
                console.error('Error removing favorite:', error);
                return;
            }

            this.favorites.delete(tokenIdStr);
            this.logAnalytics('favorite_removed', { token_id: tokenIdStr });
        } catch (error) {
            console.error('Error removing favorite:', error);
        }
    }

    // Toggle favorite status
    async toggleFavorite(tokenId) {
        if (this.isFavorite(tokenId)) {
            await this.removeFavorite(tokenId);
        } else {
            await this.addFavorite(tokenId);
        }
    }

    // Get all favorite token IDs
    getFavorites() {
        return [...this.favorites];
    }

    // Get favorite count
    getFavoriteCount() {
        return this.favorites.size;
    }

    // Log analytics event
    async logAnalytics(eventType, eventData) {
        if (!this.walletAddress || !this.supabase) return;

        try {
            await this.supabase
                .from('gallery_analytics')
                .insert({
                    user_id: this.walletAddress,
                    event_type: eventType,
                    event_data: eventData
                });
        } catch (error) {
            console.error('Error logging analytics:', error);
        }
    }

    // Get favorites with metadata (for displaying favorites page)
    async getFavoritesWithMetadata() {
        if (!this.walletAddress || !this.supabase) return [];

        try {
            const { data, error } = await this.supabase
                .from('favorites')
                .select('token_id, added_at')
                .eq('user_id', this.walletAddress)
                .order('added_at', { ascending: false });

            if (error) {
                console.error('Error getting favorites with metadata:', error);
                return [];
            }

            return data || [];
        } catch (error) {
            console.error('Error getting favorites with metadata:', error);
            return [];
        }
    }

    // Clear all favorites
    async clearFavorites() {
        if (!this.walletAddress || !this.supabase) return;

        try {
            const { error } = await this.supabase
                .from('favorites')
                .delete()
                .eq('user_id', this.walletAddress);

            if (error) {
                console.error('Error clearing favorites:', error);
                return;
            }

            this.favorites.clear();
            this.logAnalytics('favorites_cleared', {});
        } catch (error) {
            console.error('Error clearing favorites:', error);
        }
    }
}

// Create singleton instance
const favoritesManager = new FavoritesManager();

export { favoritesManager };