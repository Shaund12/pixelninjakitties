/**
 * Supabase Connection and Utility Module
 * Handles database connection, task storage, and state persistence
 */

import { createClient } from '@supabase/supabase-js';

let supabase = null;
let isConnected = false;

/**
 * Initialize Supabase connection
 * @returns {Promise<boolean>} - Connection success
 */
export async function connectToSupabase() {
    try {
        if (isConnected && supabase) {
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
        const { error } = await supabase
            .from('tasks')
            .select('count', { count: 'exact', head: true });

        if (error && error.code !== 'PGRST116') { // PGRST116 is "relation does not exist" which is expected for new DBs
            throw new Error(`Supabase connection test failed: ${error.message}`);
        }

        isConnected = true;
        console.log('✅ Connected to Supabase successfully');

        // Initialize database structure
        await initializeDatabaseStructure();

        return true;
    } catch (error) {
        console.error('❌ Supabase connection failed:', error);
        isConnected = false;
        return false;
    }
}

/**
 * Initialize database structure and create tables if they don't exist
 */
async function initializeDatabaseStructure() {
    try {
        // Note: In a real application, you would create these tables through Supabase dashboard
        // or migration scripts. This is a simplified approach for demonstration.

        // Check if tables exist by trying to query them
        const tables = ['tasks', 'state', 'metrics'];

        for (const table of tables) {
            const { error } = await supabase
                .from(table)
                .select('*', { count: 'exact', head: true });

            if (error && error.code === 'PGRST116') {
                console.log(`⚠️ Table '${table}' does not exist. Please create it in Supabase dashboard.`);
                // In a real application, you would create tables here or through migrations
            } else if (error) {
                console.error(`⚠️ Error checking table '${table}':`, error);
            } else {
                console.log(`✓ Table '${table}' exists`);
            }
        }

        console.log('✅ Database structure check completed');
    } catch (error) {
        console.error('⚠️ Database structure initialization failed:', error);
        throw error;
    }
}

/**
 * Get Supabase client instance
 * @returns {Object} - Supabase client instance
 */
export function getSupabase() {
    if (!isConnected || !supabase) {
        throw new Error('Supabase not connected. Call connectToSupabase() first.');
    }
    return supabase;
}

/**
 * Check if Supabase is connected
 * @returns {boolean} - Connection status
 */
export function isSupabaseConnected() {
    return isConnected;
}

/**
 * Ensure Supabase connection is active
 * @returns {Promise<boolean>} - Connection success
 */
export async function ensureConnection() {
    if (!isConnected) {
        return await connectToSupabase();
    }

    try {
        // Test the connection
        const { error } = await supabase
            .from('tasks')
            .select('count', { count: 'exact', head: true });

        if (error && error.code !== 'PGRST116') {
            throw new Error(`Connection test failed: ${error.message}`);
        }

        return true;
    } catch (error) {
        console.error('❌ Supabase connection test failed:', error);
        isConnected = false;
        return await connectToSupabase();
    }
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
 * @param {Object} state - State data to save
 * @returns {Promise<boolean>} - Save success
 */
export async function saveState(type, state) {
    return await withDatabase(async (db) => {
        const { error } = await db
            .from('state')
            .upsert({
                type,
                state,
                updated_at: new Date().toISOString()
            });

        if (error) {
            throw new Error(`Failed to save state: ${error.message}`);
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
    return await withDatabase(async (db) => {
        const { data, error } = await db
            .from('state')
            .select('state')
            .eq('type', type)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Table doesn't exist, return default state
                return defaultState;
            }
            if (error.code === 'PGRST105') {
                // No rows found, return default state
                return defaultState;
            }
            throw new Error(`Failed to load state: ${error.message}`);
        }

        return data ? data.state : defaultState;
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

        const { count: stateCount, error: stateError } = await supabase
            .from('state')
            .select('*', { count: 'exact', head: true });

        const { count: metricsCount, error: metricsError } = await supabase
            .from('metrics')
            .select('*', { count: 'exact', head: true });

        return {
            status: 'healthy',
            connected: true,
            database: 'Supabase',
            collections: {
                tasks: tasksCount || 0,
                state: stateCount || 0,
                metrics: metricsCount || 0
            },
            errors: {
                tasks: tasksError ? tasksError.message : null,
                state: stateError ? stateError.message : null,
                metrics: metricsError ? metricsError.message : null
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
 * Close Supabase connection (not needed for Supabase client)
 */
export async function closeSupabase() {
    // Supabase client doesn't need explicit closing
    isConnected = false;
    console.log('✅ Supabase connection closed');
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('🔄 Shutting down Supabase connection...');
    await closeSupabase();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Shutting down Supabase connection...');
    await closeSupabase();
    process.exit(0);
});