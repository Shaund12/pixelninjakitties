/**
 * Centralized API Client
 * Consolidates Supabase client initialization and common database operations
 */

// Environment detection
const isServerSide = typeof window === 'undefined';

// Dynamic imports based on environment
let createClient, initializeSupabase;

if (isServerSide) {
    // Server-side: use npm package
    const { createClient: createClientNpm } = await import('@supabase/supabase-js');
    createClient = createClientNpm;
} else {
    // Client-side: use CDN or local supabase.js
    try {
        const supabaseModule = await import('/js/supabase.js');
        initializeSupabase = supabaseModule.initializeSupabase;
    } catch (error) {
        console.warn('Failed to load supabase.js, falling back to CDN');
        const { createClient: createClientCdn } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm');
        createClient = createClientCdn;
    }
}

// Singleton client instance
let supabaseClient = null;
let initializationPromise = null;

/**
 * Get or create Supabase client instance
 * @returns {Promise<Object>} Supabase client
 */
async function getSupabaseClient() {
    if (supabaseClient) {
        return supabaseClient;
    }

    if (!initializationPromise) {
        initializationPromise = initializeClient();
    }

    supabaseClient = await initializationPromise;
    return supabaseClient;
}

/**
 * Initialize Supabase client based on environment
 * @returns {Promise<Object>} Initialized Supabase client
 */
async function initializeClient() {
    try {
        if (!isServerSide && initializeSupabase) {
            // Use existing client-side initialization
            return await initializeSupabase();
        } else {
            // Initialize directly
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_ANON_KEY;

            if (!supabaseUrl || !supabaseKey) {
                console.warn('⚠️ SUPABASE_URL and SUPABASE_ANON_KEY environment variables not set - using mock client');
                return createMockClient();
            }

            const client = createClient(supabaseUrl, supabaseKey);
            console.log('✅ Supabase client initialized');
            return client;
        }
    } catch (error) {
        console.error('Failed to initialize Supabase client:', error);
        return createMockClient();
    }
}

/**
 * Create a mock client for development/fallback
 * @returns {Object} Mock Supabase client
 */
function createMockClient() {
    return {
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            insert: () => Promise.resolve({ data: [], error: null }),
            update: () => Promise.resolve({ data: [], error: null }),
            upsert: () => Promise.resolve({ data: [], error: null }),
            delete: () => Promise.resolve({ data: [], error: null }),
            eq: function() { return this; },
            order: function() { return this; },
            limit: function() { return this; },
            single: function() { return this; },
            not: function() { return this; },
            gte: function() { return this; },
            in: function() { return this; }
        }),
        channel: () => ({
            on: () => ({ subscribe: () => ({}) })
        })
    };
}

/**
 * Ensure user record exists in the database
 * @param {string} walletAddress - User's wallet address
 */
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

/**
 * Update user activity timestamp
 * @param {string} walletAddress - User's wallet address
 */
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

/**
 * Get user's favorite tokens
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Array>} Array of token IDs
 */
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

/**
 * Toggle favorite status for a token
 * @param {string} walletAddress - User's wallet address
 * @param {string|number} tokenId - Token ID to toggle
 * @returns {Promise<Object>} Result object with action and tokenId
 */
export async function toggleFavorite(walletAddress, tokenId) {
    if (!walletAddress) {
        throw new Error('Wallet address is required for toggleFavorite');
    }

    if (!tokenId) {
        throw new Error('Token ID is required for toggleFavorite');
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

/**
 * Check if a token is favorited by user
 * @param {string} walletAddress - User's wallet address
 * @param {string|number} tokenId - Token ID to check
 * @returns {Promise<boolean>} True if favorited
 */
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

/**
 * Load user preferences with defaults
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object>} User preferences
 */
export async function loadPreferences(walletAddress) {
    const defaultPreferences = {
        filters: {},
        theme: 'dark',
        notifications: true,
        savedSearches: []
    };

    if (!walletAddress) {
        return defaultPreferences;
    }

    try {
        const client = await getSupabaseClient();
        const { data, error } = await client
            .from('preferences')
            .select('*')
            .eq('user_id', walletAddress.toLowerCase())
            .single();

        if (error || !data) {
            return defaultPreferences;
        }

        return {
            filters: data.filters || {},
            theme: data.theme || 'dark',
            notifications: data.notifications !== false,
            savedSearches: data.saved_searches || []
        };
    } catch (error) {
        console.error('Error loading preferences:', error);
        return defaultPreferences;
    }
}

/**
 * Save user preferences
 * @param {string} walletAddress - User's wallet address
 * @param {Object} preferences - Preferences to save
 * @returns {Promise<boolean>} Success status
 */
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

/**
 * Save a search query for later use
 * @param {string} walletAddress - User's wallet address
 * @param {string} searchName - Name for the saved search
 * @param {Object} filterSettings - Search filter settings
 * @returns {Promise<boolean>} Success status
 */
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

/**
 * Log user activity to the database
 * @param {string} walletAddress - User's wallet address
 * @param {string} eventType - Type of event
 * @param {string|number} tokenId - Optional token ID
 * @param {Object} metadata - Optional metadata
 */
export async function logActivity(walletAddress, eventType, tokenId = null, metadata = {}) {
    if (!walletAddress || !eventType) {
        console.warn('Insufficient data for activity logging');
        return;
    }

    try {
        await ensureUserExists(walletAddress);
        const client = await getSupabaseClient();

        // Handle BigInt serialization issue by converting BigInts to strings
        const safeMetadata = JSON.parse(JSON.stringify(metadata, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value
        ));

        const { error } = await client
            .from('activity_logs')
            .insert([{
                user_id: walletAddress.toLowerCase(),
                event_type: eventType,
                token_id: tokenId,
                metadata: safeMetadata,
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

/**
 * Get most favorited tokens
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array>} Array of top favorites
 */
export async function getTopFavorites(limit = 10) {
    try {
        const client = await getSupabaseClient();

        // Get all favorites and process in JavaScript (groupBy not supported in all Supabase versions)
        const { data, error } = await client
            .from('favorites')
            .select('token_id');

        if (error) throw error;

        // Process grouping in JavaScript
        const tokenCounts = {};
        if (data) {
            data.forEach(item => {
                tokenCounts[item.token_id] = (tokenCounts[item.token_id] || 0) + 1;
            });

            const topFavorites = Object.entries(tokenCounts)
                .map(([token_id, count]) => ({ token_id, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, limit);

            return topFavorites;
        }
        return [];
    } catch (error) {
        console.error('Error fetching top favorites:', error);
        return [];
    }
}

/**
 * Get trending tokens based on recent activity
 * @param {number} limit - Number of results to return
 * @returns {Promise<Array>} Array of trending tokens
 */
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

/**
 * Get user activity statistics
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Array|null>} Activity stats or null
 */
export async function getUserActivityStats(walletAddress) {
    if (!walletAddress) return null;

    try {
        const client = await getSupabaseClient();

        // Get all activity and process in JavaScript
        const { data, error } = await client
            .from('activity_logs')
            .select('event_type')
            .eq('user_id', walletAddress.toLowerCase());

        if (error) throw error;

        // Process grouping in JavaScript
        const eventCounts = {};
        if (data) {
            data.forEach(item => {
                eventCounts[item.event_type] = (eventCounts[item.event_type] || 0) + 1;
            });

            const stats = Object.entries(eventCounts)
                .map(([event_type, count]) => ({ event_type, count }))
                .sort((a, b) => b.count - a.count);

            return stats;
        }
        return [];
    } catch (error) {
        console.error('Error fetching user activity stats:', error);
        return [];
    }
}

// **REAL-TIME SUBSCRIPTIONS**

/**
 * Subscribe to new marketplace listings
 * @param {Function} callback - Callback function for new listings
 * @returns {Promise<Object|null>} Subscription object or null
 */
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

/**
 * Subscribe to user-specific notifications
 * @param {string} walletAddress - User's wallet address
 * @param {Function} callback - Callback function for notifications
 * @returns {Promise<Object|null>} Subscription object or null
 */
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

/**
 * Health check for Supabase connection
 * @returns {Promise<boolean>} True if healthy
 */
export async function healthCheck() {
    try {
        const client = await getSupabaseClient();
        const { error } = await client
            .from('users')
            .select('count(*)')
            .limit(1);

        return !error;
    } catch (error) {
        console.error('Supabase health check failed:', error);
        return false;
    }
}

/**
 * Clear all user data from database
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<boolean>} Success status
 */
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

// Export the client getter for direct access when needed
export { getSupabaseClient };