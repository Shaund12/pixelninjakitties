/**
 * Favorites Manager
 * Handles favorite tokens storage and retrieval via Supabase
 */

import { initializeSupabase } from './supabase.js';

class FavoritesManager {
    constructor() {
        this.currentUser = null;
        this.favorites = new Set();
        this.supabase = null;
        this.init();
    }

    async init() {
        try {
            // Initialize Supabase client
            this.supabase = await initializeSupabase();

            // Try to get current user, but don't require authentication
            try {
                const { data: { user } } = await this.supabase.auth.getUser();
                this.currentUser = user || { id: 'anonymous_' + Date.now() };
            } catch (error) {
                // If auth fails, use anonymous session
                this.currentUser = { id: 'anonymous_' + Date.now() };
            }

            // Load favorites
            await this.loadFavorites();
        } catch (error) {
            console.error('Error initializing favorites:', error);
            // Fallback to anonymous session if initialization fails
            this.currentUser = { id: 'anonymous_' + Date.now() };
            this.favorites = new Set();
        }
    }

    async loadFavorites() {
        if (!this.currentUser || !this.supabase) return;

        try {
            const { data, error } = await this.supabase
                .from('favorites')
                .select('token_id')
                .eq('user_id', this.currentUser.id);

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

        if (!this.currentUser || !this.supabase) return;

        try {
            const { error } = await this.supabase
                .from('favorites')
                .insert({
                    user_id: this.currentUser.id,
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

        if (!this.currentUser || !this.supabase) return;

        try {
            const { error } = await this.supabase
                .from('favorites')
                .delete()
                .eq('user_id', this.currentUser.id)
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
        if (!this.currentUser || !this.supabase) return;

        try {
            await this.supabase
                .from('gallery_analytics')
                .insert({
                    user_id: this.currentUser.id,
                    event_type: eventType,
                    event_data: eventData
                });
        } catch (error) {
            console.error('Error logging analytics:', error);
        }
    }

    // Get favorites with metadata (for displaying favorites page)
    async getFavoritesWithMetadata() {
        if (!this.currentUser || !this.supabase) return [];

        try {
            const { data, error } = await this.supabase
                .from('favorites')
                .select('token_id, added_at')
                .eq('user_id', this.currentUser.id)
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
        if (!this.currentUser || !this.supabase) return;

        try {
            const { error } = await this.supabase
                .from('favorites')
                .delete()
                .eq('user_id', this.currentUser.id);

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