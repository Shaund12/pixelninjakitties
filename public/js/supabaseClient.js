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
            .eq('user_id', walletAddress.toLowerCase())
            .order('created_at', { ascending: false });

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
            savedSearches: [],
            layoutMode: 'grid',
            itemsPerPage: 20
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
                savedSearches: [],
                layoutMode: 'grid',
                itemsPerPage: 20
            };
        }

        return {
            filters: data.filters || {},
            theme: data.theme || 'dark',
            notifications: data.notifications !== false,
            savedSearches: data.saved_searches || [],
            layoutMode: data.layout_mode || 'grid',
            itemsPerPage: data.items_per_page || 20
        };
    } catch (error) {
        console.error('Error loading preferences:', error);
        return {
            filters: {},
            theme: 'dark',
            notifications: true,
            savedSearches: [],
            layoutMode: 'grid',
            itemsPerPage: 20
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
                layout_mode: preferences.layoutMode || 'grid',
                items_per_page: preferences.itemsPerPage || 20,
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

        const { data, error } = await client
            .from('activity_logs')
            .select('token_id, count(*)')
            .not('token_id', 'is', null)
            .gte('timestamp', oneDayAgo)
            .in('event_type', ['view', 'favorite', 'purchase'])
            .groupBy('token_id')
            .order('count', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
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

// **WATCHLIST MANAGEMENT**

export async function getWatchlist(walletAddress) {
    if (!walletAddress) {
        console.warn('No wallet address provided for getWatchlist');
        return [];
    }

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('watchlists')
            .select('*')
            .eq('user_id', walletAddress.toLowerCase())
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching watchlist:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getWatchlist:', error);
        return [];
    }
}

export async function addWatchlist(walletAddress, tokenId, targetPrice = null, currencyAddress = '0x0000000000000000000000000000000000000000') {
    if (!walletAddress || !tokenId) {
        throw new Error('Wallet address and token ID are required');
    }

    try {
        await ensureUserExists(walletAddress);
        const client = await getSupabaseClient();

        // Check if watchlist item already exists
        const { data: existing } = await client
            .from('watchlists')
            .select('id')
            .eq('user_id', walletAddress.toLowerCase())
            .eq('token_id', tokenId)
            .eq('is_active', true)
            .single();

        if (existing) {
            // Update existing watchlist item
            const { error } = await client
                .from('watchlists')
                .update({
                    target_price: targetPrice,
                    currency_address: currencyAddress,
                    created_at: new Date().toISOString()
                })
                .eq('id', existing.id);

            if (error) throw error;
        } else {
            // Create new watchlist item
            const { error } = await client
                .from('watchlists')
                .insert([{
                    user_id: walletAddress.toLowerCase(),
                    token_id: tokenId,
                    target_price: targetPrice,
                    currency_address: currencyAddress,
                    is_active: true,
                    created_at: new Date().toISOString()
                }]);

            if (error) throw error;
        }

        // Log activity
        await logActivity(walletAddress, 'watchlist_added', tokenId, { targetPrice, currencyAddress });
        return { success: true, tokenId };
    } catch (error) {
        console.error('Error in addWatchlist:', error);
        throw error;
    }
}

export async function removeWatchlist(walletAddress, tokenId) {
    if (!walletAddress || !tokenId) {
        throw new Error('Wallet address and token ID are required');
    }

    try {
        const client = await getSupabaseClient();
        const { error } = await client
            .from('watchlists')
            .update({ is_active: false })
            .eq('user_id', walletAddress.toLowerCase())
            .eq('token_id', tokenId)
            .eq('is_active', true);

        if (error) throw error;

        // Log activity
        await logActivity(walletAddress, 'watchlist_removed', tokenId);
        return { success: true, tokenId };
    } catch (error) {
        console.error('Error in removeWatchlist:', error);
        throw error;
    }
}

export async function isWatchlisted(walletAddress, tokenId) {
    if (!walletAddress || !tokenId) return false;

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('watchlists')
            .select('id')
            .eq('user_id', walletAddress.toLowerCase())
            .eq('token_id', tokenId)
            .eq('is_active', true)
            .single();

        return !error && data;
    } catch (error) {
        console.error('Error checking watchlist:', error);
        return false;
    }
}

// **COMMENTS MANAGEMENT**

export async function getComments(tokenId) {
    if (!tokenId) {
        throw new Error('Token ID is required');
    }

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('comments')
            .select('*')
            .eq('token_id', tokenId)
            .eq('is_deleted', false)
            .order('created_at', { ascending: true });

        if (error) {
            console.error('Error fetching comments:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getComments:', error);
        return [];
    }
}

export async function postComment(walletAddress, tokenId, body) {
    if (!walletAddress || !tokenId || !body) {
        throw new Error('Wallet address, token ID, and comment body are required');
    }

    if (body.length > 1000) {
        throw new Error('Comment body cannot exceed 1000 characters');
    }

    try {
        await ensureUserExists(walletAddress);
        const client = await getSupabaseClient();

        const { data, error } = await client
            .from('comments')
            .insert([{
                user_id: walletAddress.toLowerCase(),
                token_id: tokenId,
                body: body.trim(),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }])
            .select()
            .single();

        if (error) throw error;

        // Log activity
        await logActivity(walletAddress, 'comment_posted', tokenId, { commentLength: body.length });
        return data;
    } catch (error) {
        console.error('Error in postComment:', error);
        throw error;
    }
}

export async function deleteComment(walletAddress, commentId) {
    if (!walletAddress || !commentId) {
        throw new Error('Wallet address and comment ID are required');
    }

    try {
        const client = await getSupabaseClient();
        const { error } = await client
            .from('comments')
            .update({ 
                is_deleted: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', commentId)
            .eq('user_id', walletAddress.toLowerCase());

        if (error) throw error;

        // Log activity
        await logActivity(walletAddress, 'comment_deleted', null, { commentId });
        return { success: true };
    } catch (error) {
        console.error('Error in deleteComment:', error);
        throw error;
    }
}

// **LISTINGS MANAGEMENT**

export async function getActiveListings() {
    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('listings')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching active listings:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getActiveListings:', error);
        return [];
    }
}

// **FLOOR STATS MANAGEMENT**

export async function getFloorStats() {
    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('floor_stats')
            .select('*')
            .order('last_updated', { ascending: false });

        if (error) {
            console.error('Error fetching floor stats:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getFloorStats:', error);
        return [];
    }
}

// **ENHANCED REAL-TIME SUBSCRIPTIONS**

export async function subscribeToListings(callback) {
    try {
        const client = await getSupabaseClient();

        const subscription = client
            .channel('listings_feed')
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'listings' },
                (payload) => callback('listing_created', payload.new)
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'listings' },
                (payload) => {
                    if (payload.new.cancelled_at && !payload.old.cancelled_at) {
                        callback('listing_cancelled', payload.new);
                    } else if (payload.new.sold_at && !payload.old.sold_at) {
                        callback('item_sold', payload.new);
                    }
                }
            )
            .subscribe();

        return subscription;
    } catch (error) {
        console.error('Error setting up listings subscription:', error);
        return null;
    }
}

export async function subscribeToComments(tokenId, callback) {
    if (!tokenId) return null;

    try {
        const client = await getSupabaseClient();

        const subscription = client
            .channel(`comments_${tokenId}`)
            .on('postgres_changes',
                { 
                    event: 'INSERT', 
                    schema: 'public', 
                    table: 'comments',
                    filter: `token_id=eq.${tokenId}`
                },
                (payload) => callback('comment_added', payload.new)
            )
            .on('postgres_changes',
                { 
                    event: 'UPDATE', 
                    schema: 'public', 
                    table: 'comments',
                    filter: `token_id=eq.${tokenId}`
                },
                (payload) => {
                    if (payload.new.is_deleted && !payload.old.is_deleted) {
                        callback('comment_deleted', payload.new);
                    }
                }
            )
            .subscribe();

        return subscription;
    } catch (error) {
        console.error('Error setting up comments subscription:', error);
        return null;
    }
}

export async function subscribeToWatchlistAlerts(walletAddress, callback) {
    if (!walletAddress) return null;

    try {
        const client = await getSupabaseClient();

        const subscription = client
            .channel(`watchlist_alerts_${walletAddress.toLowerCase()}`)
            .on('postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'watchlists',
                    filter: `user_id=eq.${walletAddress.toLowerCase()}`
                },
                (payload) => {
                    if (payload.new.triggered_at && !payload.old.triggered_at) {
                        callback('price_alert', payload.new);
                    }
                }
            )
            .subscribe();

        return subscription;
    } catch (error) {
        console.error('Error setting up watchlist alerts subscription:', error);
        return null;
    }
}

// **ENHANCED ANALYTICS**

export async function getActivityLogs(walletAddress, limit = 50) {
    if (!walletAddress) {
        throw new Error('Wallet address is required');
    }

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('activity_logs')
            .select('*')
            .eq('user_id', walletAddress.toLowerCase())
            .order('timestamp', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching activity logs:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error in getActivityLogs:', error);
        return [];
    }
}

export async function getMarketplaceAnalytics(timeframe = '24h') {
    try {
        const client = await getSupabaseClient();
        const timeMap = {
            '24h': 24,
            '7d': 168,
            '30d': 720
        };
        
        const hours = timeMap[timeframe] || 24;
        const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

        // Get various metrics
        const [userStats, viewStats, listingStats, salesStats] = await Promise.all([
            client.from('users').select('count(*)', { count: 'exact' }).gte('last_activity', since),
            client.from('activity_logs').select('count(*)', { count: 'exact' }).eq('event_type', 'view').gte('timestamp', since),
            client.from('activity_logs').select('count(*)', { count: 'exact' }).eq('event_type', 'listing_created').gte('timestamp', since),
            client.from('activity_logs').select('count(*)', { count: 'exact' }).eq('event_type', 'purchase_completed').gte('timestamp', since)
        ]);

        return {
            activeUsers: userStats.count || 0,
            totalViews: viewStats.count || 0,
            newListings: listingStats.count || 0,
            totalSales: salesStats.count || 0,
            timeframe
        };
    } catch (error) {
        console.error('Error in getMarketplaceAnalytics:', error);
        return {
            activeUsers: 0,
            totalViews: 0,
            newListings: 0,
            totalSales: 0,
            timeframe
        };
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