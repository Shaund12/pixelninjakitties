/**
 * Supabase Client for Wallet-Based User Management
 * Handles favorites, preferences, and activity logging using Web3 wallet addresses
 */

import { initializeSupabase } from './supabase.js';

// Initialize Supabase client
let supabase = null;
let initializationPromise = null;

async function getSupabaseClient() {
    if (supabase) {
        return supabase;
    }

    if (!initializationPromise) {
        initializationPromise = initializeSupabase();
    }

    supabase = await initializationPromise;
    return supabase;
}

// Ensure user record exists
async function ensureUserExists(walletAddress) {
    if (!walletAddress) {
        throw new Error('Wallet address is required');
    }

    const client = await getSupabaseClient();
    const { data: existingUser } = await client
        .from('users')
        .select('user_id')
        .eq('user_id', walletAddress.toLowerCase())
        .single();

    if (!existingUser) {
        await client
            .from('users')
            .insert([{
                user_id: walletAddress.toLowerCase(),
                created_at: new Date().toISOString(),
                last_activity: new Date().toISOString()
            }]);
    }
}

// Update user activity timestamp
async function updateUserActivity(walletAddress) {
    if (!walletAddress) return;

    try {
        const client = await getSupabaseClient();
        await client
            .from('users')
            .upsert({
                user_id: walletAddress.toLowerCase(),
                last_activity: new Date().toISOString()
            });
    } catch (error) {
        console.warn('Failed to update user activity:', error);
    }
}

// **FAVORITES MANAGEMENT**

export async function getFavorites(walletAddress) {
    if (!walletAddress) {
        console.warn('No wallet address provided for getFavorites');
        return [];
    }

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('favorites')
            .select('token_id')
            .eq('user_id', walletAddress.toLowerCase());
        // Removed the problematic order clause

        if (error) {
            console.error('Error fetching favorites:', error);
            return [];
        }

        return data ? data.map(item => item.token_id) : [];
    } catch (error) {
        console.error('Error in getFavorites:', error);
        return [];
    }
}

export async function toggleFavorite(walletAddress, tokenId) {
    if (!walletAddress || !tokenId) {
        throw new Error('Wallet address and token ID are required');
    }

    try {
        await ensureUserExists(walletAddress);
        const client = await getSupabaseClient();

        // Check if favorite already exists
        const { data: existing } = await client
            .from('favorites')
            .select('id')
            .eq('user_id', walletAddress.toLowerCase())
            .eq('token_id', tokenId)
            .single();

        if (existing) {
            // Remove favorite
            const { error } = await client
                .from('favorites')
                .delete()
                .eq('user_id', walletAddress.toLowerCase())
                .eq('token_id', tokenId);

            if (error) throw error;

            // Log activity
            await logActivity(walletAddress, 'unfavorite', tokenId);
            return { action: 'removed', tokenId };
        } else {
            // Add favorite
            const { error } = await client
                .from('favorites')
                .insert([{
                    user_id: walletAddress.toLowerCase(),
                    token_id: tokenId,
                    created_at: new Date().toISOString()
                }]);

            if (error) throw error;

            // Log activity
            await logActivity(walletAddress, 'favorite', tokenId);
            return { action: 'added', tokenId };
        }
    } catch (error) {
        console.error('Error in toggleFavorite:', error);
        throw error;
    }
}

export async function isFavorite(walletAddress, tokenId) {
    if (!walletAddress || !tokenId) return false;

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('favorites')
            .select('id')
            .eq('user_id', walletAddress.toLowerCase())
            .eq('token_id', tokenId)
            .single();

        return !error && data;
    } catch (error) {
        console.error('Error checking favorite:', error);
        return false;
    }
}

// **PREFERENCES MANAGEMENT**

export async function loadPreferences(walletAddress) {
    if (!walletAddress) {
        return {
            filters: {},
            theme: 'dark',
            notifications: true,
            savedSearches: []
        };
    }

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('preferences')
            .select('*')
            .eq('user_id', walletAddress.toLowerCase())
            .single();

        if (error || !data) {
            // Return default preferences
            return {
                filters: {},
                theme: 'dark',
                notifications: true,
                savedSearches: []
            };
        }

        return {
            filters: data.filters || {},
            theme: data.theme || 'dark',
            notifications: data.notifications !== false,
            savedSearches: data.saved_searches || []
        };
    } catch (error) {
        console.error('Error loading preferences:', error);
        return {
            filters: {},
            theme: 'dark',
            notifications: true,
            savedSearches: []
        };
    }
}

export async function savePreferences(walletAddress, preferences) {
    if (!walletAddress || !preferences) {
        throw new Error('Wallet address and preferences are required');
    }

    try {
        await ensureUserExists(walletAddress);
        const client = await getSupabaseClient();

        const { error } = await client
            .from('preferences')
            .upsert({
                user_id: walletAddress.toLowerCase(),
                filters: preferences.filters || {},
                theme: preferences.theme || 'dark',
                notifications: preferences.notifications !== false,
                saved_searches: preferences.savedSearches || [],
                last_viewed: new Date().toISOString()
            });

        if (error) throw error;

        // Log activity
        await logActivity(walletAddress, 'preferences_updated');
        return true;
    } catch (error) {
        console.error('Error saving preferences:', error);
        throw error;
    }
}

export async function saveSearch(walletAddress, searchName, filterSettings) {
    if (!walletAddress || !searchName || !filterSettings) {
        throw new Error('Wallet address, search name, and filter settings are required');
    }

    try {
        const preferences = await loadPreferences(walletAddress);

        // Check if search already exists
        const existingIndex = preferences.savedSearches.findIndex(
            search => search.name === searchName
        );

        const searchData = {
            name: searchName,
            filters: filterSettings,
            created_at: new Date().toISOString()
        };

        if (existingIndex >= 0) {
            // Update existing search
            preferences.savedSearches[existingIndex] = searchData;
        } else {
            // Add new search
            preferences.savedSearches.push(searchData);
        }

        await savePreferences(walletAddress, preferences);

        // Log activity
        await logActivity(walletAddress, 'search_saved', null, { searchName });
        return true;
    } catch (error) {
        console.error('Error saving search:', error);
        throw error;
    }
}

// **ACTIVITY LOGGING**

export async function logActivity(walletAddress, eventType, tokenId = null, metadata = {}) {
    if (!walletAddress || !eventType) {
        console.warn('Insufficient data for activity logging');
        return;
    }

    try {
        await ensureUserExists(walletAddress);
        const client = await getSupabaseClient();

        const { error } = await client
            .from('activity_logs')
            .insert([{
                user_id: walletAddress.toLowerCase(),
                event_type: eventType,
                token_id: tokenId,
                metadata: metadata,
                timestamp: new Date().toISOString()
            }]);

        if (error) {
            console.error('Error logging activity:', error);
        }

        // Update user activity timestamp
        await updateUserActivity(walletAddress);
    } catch (error) {
        console.error('Error in logActivity:', error);
    }
}

// **ANALYTICS QUERIES**

export async function getTopFavorites(limit = 10) {
    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('favorites')
            .select('token_id, count(*)')
            .groupBy('token_id')
            .order('count', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching top favorites:', error);
        return [];
    }
}

export async function getTrendingTokens(limit = 10) {
    try {
        const client = await getSupabaseClient();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // Process in JavaScript instead of using unsupported groupBy
        const { data, error } = await client
            .from('activity_logs')
            .select('token_id, event_type, timestamp')
            .not('token_id', 'is', null)
            .gte('timestamp', oneDayAgo)
            .in('event_type', ['view', 'favorite', 'purchase']);

        if (error) throw error;

        // Process grouping in JavaScript
        const tokenCounts = {};
        if (data) {
            data.forEach(item => {
                tokenCounts[item.token_id] = (tokenCounts[item.token_id] || 0) + 1;
            });

            const trendingTokens = Object.entries(tokenCounts)
                .map(([token_id, count]) => ({ token_id, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);

            return trendingTokens;
        }
        return [];
    } catch (error) {
        console.error('Error fetching trending tokens:', error);
        return [];
    }
}

export async function getUserActivityStats(walletAddress) {
    if (!walletAddress) return null;

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('activity_logs')
            .select('event_type, count(*)')
            .eq('user_id', walletAddress.toLowerCase())
            .groupBy('event_type')
            .order('count', { ascending: false });

        if (error) throw error;
        return data || [];
    } catch (error) {
        console.error('Error fetching user activity stats:', error);
        return [];
    }
}

// **REAL-TIME SUBSCRIPTIONS**

export async function subscribeToNewListings(callback) {
    try {
        const client = await getSupabaseClient();

        const subscription = client
            .channel('new_listings')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: 'event_type=eq.listing_created' },
                callback
            )
            .subscribe();

        return subscription;
    } catch (error) {
        console.error('Error setting up listing subscription:', error);
        return null;
    }
}

export async function subscribeToUserNotifications(walletAddress, callback) {
    if (!walletAddress) return null;

    try {
        const client = await getSupabaseClient();

        const subscription = client
            .channel(`user_notifications_${walletAddress.toLowerCase()}`)
            .on('postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'activity_logs',
                    filter: `user_id=eq.${walletAddress.toLowerCase()}`
                },
                callback
            )
            .subscribe();

        return subscription;
    } catch (error) {
        console.error('Error setting up user notifications subscription:', error);
        return null;
    }
}

// **UTILITY FUNCTIONS**

export async function healthCheck() {
    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('users')
            .select('count(*)')
            .limit(1);

        return !error;
    } catch (error) {
        console.error('Supabase health check failed:', error);
        return false;
    }
}

export async function clearUserData(walletAddress) {
    if (!walletAddress) {
        throw new Error('Wallet address is required');
    }

    try {
        const client = await getSupabaseClient();
        const userId = walletAddress.toLowerCase();

        // Delete favorites
        await client.from('favorites').delete().eq('user_id', userId);

        // Delete preferences
        await client.from('preferences').delete().eq('user_id', userId);

        // Delete activity logs
        await client.from('activity_logs').delete().eq('user_id', userId);

        // Delete user record
        await client.from('users').delete().eq('user_id', userId);

        return true;
    } catch (error) {
        console.error('Error clearing user data:', error);
        throw error;
    }
}