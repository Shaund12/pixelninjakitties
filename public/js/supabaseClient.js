/**
 * Supabase Client for Browser-side Operations
 * This file now delegates to the centralized API client for consistency
 */

// Import the centralized API client
import {
    getFavorites,
    toggleFavorite,
    isFavorite,
    loadPreferences,
    savePreferences,
    saveSearch,
    logActivity,
    getTopFavorites,
    getTrendingTokens,
    getUserActivityStats,
    subscribeToNewListings,
    subscribeToUserNotifications,
    healthCheck,
    clearUserData,
    getSupabaseClient
} from './utils/apiClient.js';

// Re-export all functions from the centralized API client
export {
    getFavorites,
    toggleFavorite,
    isFavorite,
    loadPreferences,
    savePreferences,
    saveSearch,
    logActivity,
    getTopFavorites,
    getTrendingTokens,
    getUserActivityStats,
    subscribeToNewListings,
    subscribeToUserNotifications,
    healthCheck,
    clearUserData,
    getSupabaseClient
};