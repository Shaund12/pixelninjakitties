/**
 * Supabase Connection and Utility Module
 * Handles database connection, task storage, and state persistence
 * Replaces MongoDB functionality with Supabase
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
        supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            },
        });

        // Test the connection with a simple query
        const { error } = await supabase.from('tasks').select('count', { count: 'exact', head: true });

        if (error && error.code !== 'PGRST116') { // PGRST116 is "relation does not exist" - we'll create tables
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
        // For Supabase, we'll create tables using SQL if they don't exist
        // This is a simplified approach - in production, you'd use Supabase migrations

        // Create tasks table
        const { error: tasksError } = await supabase.rpc('create_table_if_not_exists', {
            table_name: 'tasks',
            table_sql: `
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    task_id TEXT UNIQUE NOT NULL,
                    token_id INTEGER NOT NULL,
                    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled', 'timeout')),
                    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
                    message TEXT,
                    provider TEXT,
                    breed TEXT,
                    buyer TEXT,
                    result JSONB,
                    error_message TEXT,
                    history JSONB DEFAULT '[]',
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    completed_at TIMESTAMP WITH TIME ZONE,
                    failed_at TIMESTAMP WITH TIME ZONE,
                    canceled_at TIMESTAMP WITH TIME ZONE,
                    timeout_at TIMESTAMP WITH TIME ZONE,
                    estimated_completion_time TIMESTAMP WITH TIME ZONE,
                    priority TEXT DEFAULT 'normal',
                    provider_options JSONB DEFAULT '{}'
                );
            `
        });

        if (tasksError && tasksError.code !== '42P01') { // 42P01 is "relation already exists"
            console.warn('⚠️ Could not create tasks table:', tasksError);
        }

        // Create state table
        const { error: stateError } = await supabase.rpc('create_table_if_not_exists', {
            table_name: 'state',
            table_sql: `
                CREATE TABLE IF NOT EXISTS state (
                    type TEXT PRIMARY KEY,
                    state_data JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `
        });

        if (stateError && stateError.code !== '42P01') {
            console.warn('⚠️ Could not create state table:', stateError);
        }

        // Create metrics table
        const { error: metricsError } = await supabase.rpc('create_table_if_not_exists', {
            table_name: 'metrics',
            table_sql: `
                CREATE TABLE IF NOT EXISTS metrics (
                    type TEXT PRIMARY KEY,
                    data JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                );
            `
        });

        if (metricsError && metricsError.code !== '42P01') {
            console.warn('⚠️ Could not create metrics table:', metricsError);
        }

        console.log('✅ Database structure initialized successfully');
    } catch (error) {
        console.error('⚠️ Database structure initialization failed:', error);
        // Don't throw error as tables might already exist
    }
}

/**
 * Get Supabase client instance
 * @returns {Object} - Supabase client instance
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
 */
export async function ensureConnection() {
    if (!isConnected) {
        return await connectToSupabase();
    }

    try {
        // Test the connection with a simple query
        const { error } = await supabase.from('tasks').select('count', { count: 'exact', head: true });
        if (error && error.code !== 'PGRST116') { // Table might not exist yet
            throw error;
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
 * @param {Object} stateData - State data to save
 * @returns {Promise<boolean>} - Save success
 */
export async function saveState(type, stateData) {
    return await withDatabase(async (client) => {
        const { error } = await client
            .from('state')
            .upsert({
                type,
                state_data: stateData,
                updated_at: new Date().toISOString()
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
            if (error.code === 'PGRST116') { // No rows returned
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

        // Get counts from each table
        const { data: tasksData, error: tasksError } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true });

        const { data: stateData, error: stateError } = await supabase
            .from('state')
            .select('type', { count: 'exact', head: true });

        const tasksCount = tasksError ? 0 : tasksData?.length || 0;
        const stateCount = stateError ? 0 : stateData?.length || 0;

        return {
            status: 'healthy',
            connected: true,
            database: 'supabase',
            collections: {
                tasks: tasksCount,
                state: stateCount
            },
            url: process.env.SUPABASE_URL ? 'configured' : 'not configured'
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            connected: false,
            error: error.message
        };
    }
}

// Close connection gracefully on shutdown
process.on('SIGINT', async () => {
    console.log('🔄 Closing Supabase connection...');
    isConnected = false;
    supabase = null;
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Closing Supabase connection...');
    isConnected = false;
    supabase = null;
    process.exit(0);
});