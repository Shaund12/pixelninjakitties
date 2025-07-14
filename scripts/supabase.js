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

        // Test the connection by attempting to query a table
        const { error } = await supabase
            .from('tasks')
            .select('count')
            .limit(1);

        if (error && error.code !== 'PGRST116') { // PGRST116 is "table doesn't exist" which is fine for setup
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
 * Initialize database structure by creating tables if they don't exist
 * Note: In production, these would be handled by Supabase migrations
 */
async function initializeDatabaseStructure() {
    try {
        // Check if tables exist, if not, we need to create them
        const tables = ['tasks', 'state', 'metrics'];

        for (const table of tables) {
            const { data, error } = await supabase
                .from(table)
                .select('*')
                .limit(1);

            if (error && error.code === 'PGRST116') {
                console.log(`⚠️ Table "${table}" does not exist. Please create it in Supabase dashboard.`);
                console.log(`SQL for ${table} table:`);

                if (table === 'tasks') {
                    console.log(`
CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id TEXT UNIQUE NOT NULL,
    token_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled', 'timeout')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    message TEXT,
    provider TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    history JSONB DEFAULT '[]'::jsonb,
    timeout_at TIMESTAMP WITH TIME ZONE,
    priority TEXT DEFAULT 'normal',
    provider_options JSONB DEFAULT '{}'::jsonb,
    estimated_completion_time TIMESTAMP WITH TIME ZONE,
    result JSONB,
    error_message TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    canceled_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_tasks_token_id ON tasks(token_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
                    `);
                } else if (table === 'state') {
                    console.log(`
CREATE TABLE state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT UNIQUE NOT NULL,
    state_data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
                    `);
                } else if (table === 'metrics') {
                    console.log(`
CREATE TABLE metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type TEXT UNIQUE NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
                    `);
                }
            } else if (!error) {
                console.log(`✓ Table "${table}" exists and is accessible`);
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
 */
export async function ensureConnection() {
    if (!isConnected) {
        return await connectToSupabase();
    }

    try {
        // Test the connection with a simple query
        const { error } = await supabase
            .from('tasks')
            .select('count')
            .limit(1);

        if (error && error.code !== 'PGRST116') {
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
 * @param {Object} state - State data to save
 * @returns {Promise<boolean>} - Save success
 */
export async function saveState(type, state) {
    return await withDatabase(async (client) => {
        const { error } = await client
            .from('state')
            .upsert({
                type,
                state_data: state,
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

        if (error && error.code !== 'PGRST116') {
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

        // Get counts from various tables
        const tasksResult = await supabase
            .from('tasks')
            .select('*', { count: 'exact', head: true });

        const stateResult = await supabase
            .from('state')
            .select('*', { count: 'exact', head: true });

        const tasksCount = tasksResult.count || 0;
        const stateCount = stateResult.count || 0;

        return {
            status: 'healthy',
            connected: true,
            database: 'Supabase',
            collections: {
                tasks: tasksCount,
                state: stateCount
            },
            supabaseUrl: process.env.SUPABASE_URL
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            connected: false,
            error: error.message
        };
    }
}

// Close connection is not needed for Supabase client
export async function closeSupabase() {
    // Supabase client doesn't need explicit closing
    isConnected = false;
    supabase = null;
    console.log('✅ Supabase connection closed');
}