/**
 * Supabase Database Connection and Utility Module
 * Handles database connection, task storage, and state persistence
 */

import { createClient } from '@supabase/supabase-js';

let supabase = null;
let isInitialized = false;

/**
 * Initialize Supabase connection
 * @returns {Promise<boolean>} - Connection success
 */
export async function initializeSupabase() {
    try {
        if (isInitialized && supabase) {
            return true;
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set');
        }

        // Create Supabase client
        supabase = createClient(supabaseUrl, supabaseKey);

        // Test the connection
        const { data, error } = await supabase.from('tasks').select('count', { count: 'exact', head: true });
        if (error && error.code !== 'PGRST116') { // PGRST116 means table doesn't exist yet, which is OK
            console.error('Supabase connection test failed:', error);
            return false;
        }

        isInitialized = true;
        console.log('✅ Connected to Supabase successfully');

        return true;
    } catch (error) {
        console.error('❌ Supabase connection failed:', error);
        isInitialized = false;
        return false;
    }
}

/**
 * Get Supabase client instance
 * @returns {Object} - Supabase client instance
 */
export function getSupabaseClient() {
    if (!isInitialized || !supabase) {
        throw new Error('Supabase not initialized. Call initializeSupabase() first.');
    }
    return supabase;
}

/**
 * Check if Supabase is initialized
 * @returns {boolean} - Initialization status
 */
export function isSupabaseInitialized() {
    return isInitialized;
}

/**
 * Ensure Supabase connection is active
 * @returns {Promise<boolean>} - Connection success
 */
export async function ensureConnection() {
    if (!isInitialized) {
        return await initializeSupabase();
    }
    return true;
}

/**
 * Generic database operation with error handling
 * @param {Function} operation - Database operation to execute
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<*>} - Operation result
 */
export async function withDatabase(operation, operationName = 'Database operation') {
    try {
        await ensureConnection();
        return await operation(supabase);
    } catch (error) {
        console.error(`❌ ${operationName} failed:`, error);
        throw error;
    }
}

/**
 * Save application state to Supabase
 * @param {string} type - State type (e.g., 'cron')
 * @param {Object} stateData - State data to save
 * @returns {Promise<boolean>} - Save success
 */
export async function saveState(type, stateData) {
    return await withDatabase(async (client) => {
        const { data, error } = await client
            .from('state')
            .upsert({
                type,
                state_data: stateData,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'type'
            });

        if (error) {
            throw error;
        }

        return true;
    }, `Save state (${type})`);
}

/**
 * Load application state from Supabase
 * @param {string} type - State type to load
 * @param {Object} defaultState - Default state if not found
 * @returns {Promise<Object>} - Loaded state
 */
export async function loadState(type, defaultState = {}) {
    return await withDatabase(async (client) => {
        const { data, error } = await client
            .from('state')
            .select('state_data')
            .eq('type', type)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Row not found, return default state
                return defaultState;
            }
            throw error;
        }

        return data ? data.state_data : defaultState;
    }, `Load state (${type})`);
}

/**
 * Health check for Supabase connection
 * @returns {Promise<Object>} - Health check result
 */
export async function supabaseHealthCheck() {
    try {
        await ensureConnection();

        const { count: tasksCount, error: tasksError } = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true });

        if (tasksError && tasksError.code !== 'PGRST116') {
            throw tasksError;
        }

        const { count: stateCount, error: stateError } = await supabase
            .from('state')
            .select('*', { count: 'exact', head: true });

        if (stateError && stateError.code !== 'PGRST116') {
            throw stateError;
        }

        return {
            status: 'healthy',
            connected: true,
            tables: {
                tasks: tasksCount || 0,
                state: stateCount || 0
            }
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            connected: false,
            error: error.message
        };
    }
}

/**
 * Initialize database tables if they don't exist
 * Note: In production, these tables should be created via Supabase dashboard or migrations
 */
export async function createTablesIfNotExist() {
    try {
        // This would typically be done via Supabase dashboard or SQL migrations
        // For now, we'll just ensure the connection works
        await ensureConnection();
        console.log('✅ Supabase tables should be created via dashboard or migrations');
        return true;
    } catch (error) {
        console.error('❌ Failed to ensure tables exist:', error);
        return false;
    }
}