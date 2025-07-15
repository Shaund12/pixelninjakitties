import { supabase } from './supabaseClient.js';

/**
 * Load provider preferences from Supabase
 * @returns {Promise<Object>} Provider preferences object
 */
export async function loadProviderPreferences() {
    try {
        const { data, error } = await supabase
            .from('provider_preferences')
            .select('*')
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No data found, return empty object
                return {};
            }
            throw error;
        }

        return data?.preferences || {};
    } catch (error) {
        console.error('Error loading provider preferences:', error);
        // Return empty object as fallback
        return {};
    }
}

/**
 * Save provider preferences to Supabase
 * @param {Object} prefs - Provider preferences object
 * @returns {Promise<void>}
 */
export async function saveProviderPreferences(prefs) {
    try {
        const { error } = await supabase
            .from('provider_preferences')
            .upsert({
                id: 'default',
                preferences: prefs,
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (error) {
            throw error;
        }
    } catch (error) {
        console.error('Error saving provider preferences:', error);
        throw error;
    }
}

/**
 * Creates a Supabase-based storage system
 * @param {string} _tableName - The table name to use for storage (for compatibility, currently ignored)
 * @returns {Object} Storage API
 */
export function createStorage(_tableName) {
    // Initialize cache
    let cache = {};
    let isInitialized = false;

    // Load initial data
    const initialize = async () => {
        if (isInitialized) return;

        try {
            cache = await loadProviderPreferences();
            console.log(`Storage loaded: ${Object.keys(cache).length} items from Supabase`);
            isInitialized = true;
        } catch (error) {
            console.log('Creating new storage in Supabase');
            cache = {};
            isInitialized = true;
        }
    };

    return {
        async get(key) {
            await initialize();
            return cache[key];
        },

        async set(key, value) {
            await initialize();
            cache[key] = value;
            await saveProviderPreferences(cache);
            return value;
        },

        async delete(key) {
            await initialize();
            delete cache[key];
            await saveProviderPreferences(cache);
        },

        async getAll() {
            await initialize();
            return { ...cache };
        }
    };
}