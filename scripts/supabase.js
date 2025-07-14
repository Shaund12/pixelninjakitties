/**
 * Supabase Database Connection and Utility Module
 * Handles database connection, table creation, and data operations
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
        const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY environment variables not set');
        }

        // Create Supabase client
        supabase = createClient(supabaseUrl, supabaseAnonKey);

        // Test the connection by checking if we can access the database
        const { error } = await supabase.from('state').select('count', { count: 'exact', head: true });

        if (error && error.code !== 'PGRST116') { // PGRST116 is "table not found" which is expected initially
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
 * Initialize database structure by creating tables and functions
 */
async function initializeDatabaseStructure() {
    try {
        // Try to create the tasks table
        await createTasksTable();

        // Try to create the state table
        await createStateTable();

        // Try to create the metrics table
        await createMetricsTable();

        console.log('✅ Database structure initialized successfully');
    } catch (error) {
        console.warn('⚠️ Database structure initialization warning:', error.message);
        // Don't throw here as tables might already exist
    }
}

/**
 * Create tasks table using the create_table_if_not_exists function
 */
async function createTasksTable() {
    try {
        const { error } = await supabase.rpc('create_table_if_not_exists', {
            table_name: 'tasks',
            table_sql: `
                CREATE TABLE tasks (
                    id VARCHAR PRIMARY KEY,
                    task_id VARCHAR UNIQUE NOT NULL,
                    token_id INTEGER NOT NULL,
                    status VARCHAR NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled', 'timeout')),
                    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
                    message TEXT,
                    metadata JSONB,
                    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                    completed_at TIMESTAMP WITH TIME ZONE,
                    error_message TEXT,
                    result JSONB
                )
            `
        });

        if (error) {
            console.warn('⚠️ Could not create tasks table:', error);
        } else {
            console.log('✅ Tasks table ready');
        }
    } catch (error) {
        console.warn('⚠️ Could not create tasks table:', error);
    }
}

/**
 * Create state table using the create_table_if_not_exists function
 */
async function createStateTable() {
    try {
        const { error } = await supabase.rpc('create_table_if_not_exists', {
            table_name: 'state',
            table_sql: `
                CREATE TABLE state (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR UNIQUE NOT NULL,
                    state_data JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `
        });

        if (error) {
            console.warn('⚠️ Could not create state table:', error);
        } else {
            console.log('✅ State table ready');
        }
    } catch (error) {
        console.warn('⚠️ Could not create state table:', error);
    }
}

/**
 * Create metrics table using the create_table_if_not_exists function
 */
async function createMetricsTable() {
    try {
        const { error } = await supabase.rpc('create_table_if_not_exists', {
            table_name: 'metrics',
            table_sql: `
                CREATE TABLE metrics (
                    id SERIAL PRIMARY KEY,
                    type VARCHAR UNIQUE NOT NULL,
                    data JSONB NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
                )
            `
        });

        if (error) {
            console.warn('⚠️ Could not create metrics table:', error);
        } else {
            console.log('✅ Metrics table ready');
        }
    } catch (error) {
        console.warn('⚠️ Could not create metrics table:', error);
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
    return true;
}

/**
 * Generic database operation with error handling
 * @param {Function} operation - Database operation to execute
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<*>} - Operation result
 */
export async function withSupabase(operation, operationName = 'Database operation') {
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
    return await withSupabase(async (client) => {
        const { error } = await client.rpc('upsert_state_data', {
            state_type: type,
            state_data_json: state
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
    return await withSupabase(async (client) => {
        const { data, error } = await client.rpc('get_state_data', {
            state_type: type
        });

        if (error) {
            throw error;
        }

        return data && Object.keys(data).length > 0 ? data : defaultState;
    }, `Load state (${type})`);
}

/**
 * Save metrics data to Supabase
 * @param {string} type - Metrics type
 * @param {Object} metricsData - Metrics data to save
 * @returns {Promise<boolean>} - Save success
 */
export async function saveMetrics(type, metricsData) {
    return await withSupabase(async (client) => {
        const { error } = await client.rpc('upsert_metrics_data', {
            metrics_type: type,
            metrics_data_json: metricsData
        });

        if (error) {
            throw error;
        }

        return true;
    }, `Save metrics (${type})`);
}

/**
 * Health check for Supabase connection
 * @returns {Promise<Object>} - Health check result
 */
export async function supabaseHealthCheck() {
    try {
        await ensureConnection();

        // Test basic operations
        const { data: stateData, error: stateError } = await supabase
            .from('state')
            .select('count', { count: 'exact', head: true });

        const { data: tasksData, error: tasksError } = await supabase
            .from('tasks')
            .select('count', { count: 'exact', head: true });

        return {
            status: 'healthy',
            connected: true,
            tables: {
                state: stateError ? 'error' : 'accessible',
                tasks: tasksError ? 'error' : 'accessible',
                stateCount: stateData ? stateData.length : 0,
                tasksCount: tasksData ? tasksData.length : 0
            },
            errors: {
                state: stateError?.message || null,
                tasks: tasksError?.message || null
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

// Export the client for direct access if needed
export { supabase };