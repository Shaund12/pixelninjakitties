/**
 * Supabase Database Connection and Utility Module
 * Handles database connection, task storage, and state persistence
 */

import { createClient } from '@supabase/supabase-js';

let supabase = null;
let isConnected = false;

/**
 * Initialize Supabase connection
 * @returns {Promise<boolean>} - Connection success
 */
export async function connectToDatabase() {
    try {
        if (isConnected && supabase) {
            return true;
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY environment variables must be set');
        }

        // Validate Supabase URL format
        if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
            throw new Error('Invalid Supabase URL format - must be a valid Supabase project URL');
        }

        // Create Supabase client
        supabase = createClient(supabaseUrl, supabaseKey);

        // Test the connection
        const { data, error } = await supabase.from('tasks').select('count', { count: 'exact', head: true });

        if (error && error.code !== 'PGRST116') { // PGRST116 is "relation does not exist" - tables might not be created yet
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
        supabase = null;
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
            const { error } = await supabase.from(table).select('*', { count: 'exact', head: true });

            if (error && error.code === 'PGRST116') {
                console.log(`Table ${table} doesn't exist. Please create it manually in Supabase dashboard.`);
                // Log the SQL to create tables
                if (table === 'tasks') {
                    console.log(`
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    token_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled', 'timeout')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    request_data JSONB,
    result_data JSONB,
    error_message TEXT,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3
);

CREATE INDEX idx_tasks_task_id ON tasks(task_id);
CREATE INDEX idx_tasks_token_id ON tasks(token_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
                    `);
                }

                if (table === 'state') {
                    console.log(`
CREATE TABLE state (
    id TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
                    `);
                }

                if (table === 'metrics') {
                    console.log(`
CREATE TABLE metrics (
    type TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
                    `);
                }
            }
        }

        console.log('✅ Database structure initialized');
    } catch (error) {
        console.error('❌ Failed to initialize database structure:', error);
    }
}

/**
 * Get Supabase client instance
 * @returns {Object} - Supabase client
 */
export function getSupabaseClient() {
    if (!supabase) {
        throw new Error('Supabase client not initialized. Call connectToDatabase() first.');
    }
    return supabase;
}

/**
 * Check if database is connected
 * @returns {boolean} - Connection status
 */
export function isConnectedToDatabase() {
    return isConnected && supabase !== null;
}

/**
 * Execute database operations with connection handling
 * @param {Function} operation - Database operation function
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<any>} - Operation result
 */
export async function withDatabase(operation, operationName = 'Database operation') {
    if (!isConnected) {
        const connected = await connectToDatabase();
        if (!connected) {
            throw new Error(`Failed to connect to database for ${operationName}`);
        }
    }

    try {
        return await operation(supabase);
    } catch (error) {
        console.error(`❌ ${operationName} failed:`, error);
        throw error;
    }
}

/**
 * Close database connection
 */
export async function closeConnection() {
    if (supabase) {
        // Supabase client doesn't need explicit closing
        supabase = null;
        isConnected = false;
        console.log('✅ Database connection closed');
    }
}

/**
 * Save state to database
 * @param {string} stateId - State identifier
 * @param {Object} stateData - State data to save
 * @returns {Promise<void>}
 */
export async function saveState(stateId, stateData) {
    return await withDatabase(async (db) => {
        const { error } = await db
            .from('state')
            .upsert({
                id: stateId,
                data: stateData,
                updated_at: new Date().toISOString()
            });

        if (error) {
            throw error;
        }

        console.log(`✅ State saved: ${stateId}`);
    }, `Save state (${stateId})`);
}

/**
 * Load state from database
 * @param {string} stateId - State identifier
 * @param {Object} defaultState - Default state if not found
 * @returns {Promise<Object>} - State data
 */
export async function loadState(stateId, defaultState = {}) {
    return await withDatabase(async (db) => {
        const { data, error } = await db
            .from('state')
            .select('data')
            .eq('id', stateId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log(`State ${stateId} not found, using default state`);
                return defaultState;
            }
            throw error;
        }

        return data ? data.data : defaultState;
    }, `Load state (${stateId})`);
}

/**
 * Ensure database connection is established
 * @returns {Promise<void>}
 */
export async function ensureConnection() {
    if (!isConnected) {
        await connectToDatabase();
    }
}

/**
 * Database health check
 * @returns {Promise<Object>} Health check result
 */
export async function databaseHealthCheck() {
    try {
        if (!isConnected) {
            await connectToDatabase();
        }

        const startTime = Date.now();

        // Test basic connection
        const { data, error } = await supabase.from('tasks').select('count', { count: 'exact', head: true });

        if (error && error.code !== 'PGRST116') {
            throw error;
        }

        const responseTime = Date.now() - startTime;

        return {
            status: 'healthy',
            message: 'Supabase connection successful',
            responseTime,
            connected: true,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            message: error.message,
            connected: false,
            timestamp: new Date().toISOString()
        };
    }
}