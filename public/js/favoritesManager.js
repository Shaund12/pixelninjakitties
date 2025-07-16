/**
 * Favorites Manager
 * Handles favorite tokens storage and retrieval via Supabase
 */

import { supabase } from './supabaseClient.js';

class FavoritesManager {
    constructor() {
        this.currentUser = null;
        this.favorites = new Set();
        this.init();
    }

    async init() {
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                // Sign in anonymously if no user
                const { data: { user: anonUser } } = await supabase.auth.signInAnonymously();
                this.currentUser = anonUser;
            } else {
                this.currentUser = user;
            }

            // Load favorites
            await this.loadFavorites();
        } catch (error) {
            console.error('Error initializing favorites:', error);
            // Fallback to localStorage
            this.useFallback = true;
            this.loadFallbackFavorites();
        }
    }

    async loadFavorites() {
        if (!this.currentUser) return;

        try {
            const { data, error } = await supabase
                .from('favorites')
                .select('token_id')
                .eq('user_id', this.currentUser.id);

            if (error) {
                console.error('Error loading favorites:', error);
                return;
            }

            this.favorites = new Set(data.map(item => item.token_id));
        } catch (error) {
            console.error('Error loading favorites:', error);
        }
    }

    loadFallbackFavorites() {
        try {
            const stored = localStorage.getItem('ninjacat_favorites');
            if (stored) {
                this.favorites = new Set(JSON.parse(stored));
            }
        } catch (error) {
            console.error('Error loading fallback favorites:', error);
        }
    }

    saveFallbackFavorites() {
        try {
            localStorage.setItem('ninjacat_favorites', JSON.stringify([...this.favorites]));
        } catch (error) {
            console.error('Error saving fallback favorites:', error);
        }
    }

    // Check if token is favorite
    isFavorite(tokenId) {
        return this.favorites.has(tokenId.toString());
    }

    // Add token to favorites
    async addFavorite(tokenId) {
        const tokenIdStr = tokenId.toString();
        
        if (this.useFallback) {
            this.favorites.add(tokenIdStr);
            this.saveFallbackFavorites();
            return;
        }

        if (!this.currentUser) return;

        try {
            const { error } = await supabase
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
        
        if (this.useFallback) {
            this.favorites.delete(tokenIdStr);
            this.saveFallbackFavorites();
            return;
        }

        if (!this.currentUser) return;

        try {
            const { error } = await supabase
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
        if (!this.currentUser || this.useFallback) return;

        try {
            await supabase
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
        if (!this.currentUser) return [];

        try {
            const { data, error } = await supabase
                .from('favorites')
                .select('token_id, added_at')
                .eq('user_id', this.currentUser.id)
                .order('added_at', { ascending: false });

            if (error) {
                console.error('Error getting favorites with metadata:', error);
                return [];
            }

            return data;
        } catch (error) {
            console.error('Error getting favorites with metadata:', error);
            return [];
        }
    }

    // Clear all favorites
    async clearFavorites() {
        if (this.useFallback) {
            this.favorites.clear();
            this.saveFallbackFavorites();
            return;
        }

        if (!this.currentUser) return;

        try {
            const { error } = await supabase
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