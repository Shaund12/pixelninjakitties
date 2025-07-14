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

        // Test the connection by making a simple query
        const { error } = await supabase.from('tasks').select('count', { count: 'exact', head: true });

        if (error && error.code !== 'PGRST116') { // PGRST116 is "table not found" which is ok for first run
            throw error;
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
        // Check if tables exist by trying to select from them
        const tables = ['tasks', 'state', 'metrics'];

        for (const table of tables) {
            const { error } = await supabase.from(table).select('*').limit(1);
            if (error && error.code === 'PGRST116') {
                console.log(`ℹ️ Table ${table} needs to be created in Supabase dashboard`);
            } else {
                console.log(`✓ Table ${table} exists`);
            }
        }

        console.log('✅ Database structure check completed');
        console.log('📝 Note: If tables don\'t exist, create them in your Supabase dashboard with the following schema:');
        console.log(`
Tasks table schema:
- id: text (primary key)
- task_id: text (unique)
- token_id: int8
- provider: text
- status: text
- progress: int2
- message: text
- created_at: timestamptz
- updated_at: timestamptz
- history: jsonb
- timeout_at: timestamptz
- priority: text
- provider_options: jsonb
- estimated_completion_time: timestamptz
- result: jsonb
- error: text
- completed_at: timestamptz
- failed_at: timestamptz
- canceled_at: timestamptz

State table schema:
- id: int8 (primary key, auto-increment)
- type: text (unique)
- state: jsonb
- updated_at: timestamptz

Metrics table schema:
- id: int8 (primary key, auto-increment)
- type: text (unique)
- data: jsonb
- updated_at: timestamptz
        `);
    } catch (error) {
        console.error('⚠️ Database structure check failed:', error);
    }
}

/**
 * Get Supabase client instance
 * @returns {SupabaseClient} - Supabase client instance
 */
export function getSupabaseClient() {
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
 * @throws {Error} - If connection fails
 */
export async function ensureConnection() {
    if (!isConnected) {
        const connected = await connectToSupabase();
        if (!connected) {
            throw new Error('Failed to establish Supabase connection');
        }
        return true;
    }

    try {
        // Test the connection
        const { error } = await supabase.from('tasks').select('count', { count: 'exact', head: true });
        if (error && error.code !== 'PGRST116') {
            throw error;
        }
        return true;
    } catch (error) {
        console.error('❌ Supabase connection test failed:', error);
        isConnected = false;
        const connected = await connectToSupabase();
        if (!connected) {
            throw new Error('Failed to re-establish Supabase connection');
        }
        return true;
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
    return await withDatabase(async (client) => {
        const { error } = await client
            .from('state')
            .upsert({
                type,
                state,
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
            .select('state')
            .eq('type', type)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return defaultState;
            }
            throw error;
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
            database: 'supabase',
            tables: {
                tasks: tasksCount || 0,
                state: stateCount || 0,
                metrics: metricsCount || 0
            },
            errors: {
                tasks: tasksError?.message || null,
                state: stateError?.message || null,
                metrics: metricsError?.message || null
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

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('🔄 Shutting down Supabase connection...');
    isConnected = false;
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Shutting down Supabase connection...');
    isConnected = false;
    process.exit(0);
});