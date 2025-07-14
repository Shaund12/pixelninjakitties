/**
 * Supabase Connection and Utility Module
 * Handles database connection, task storage, and state persistence
 * NO MONGODB ALLOWED - Uses Supabase exclusively
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
        const { error } = await supabase.from('state').select('count', { count: 'exact', head: true });

        if (error && error.code !== 'PGRST116') { // PGRST116 is "table doesn't exist" - that's ok, we'll create it
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
        // Check if state table exists and create if it doesn't
        const { error: stateError } = await supabase.from('state').select('count', { count: 'exact', head: true });

        if (stateError && stateError.code === 'PGRST116') {
            console.log('📋 State table does not exist - ensure it is created in Supabase dashboard');
            console.log('Required schema: state (id: uuid, type: text, state: jsonb, updated_at: timestamp)');
        }

        // Check if tasks table exists
        const { error: tasksError } = await supabase.from('tasks').select('count', { count: 'exact', head: true });

        if (tasksError && tasksError.code === 'PGRST116') {
            console.log('📋 Tasks table does not exist - ensure it is created in Supabase dashboard');
            console.log('Required schema: tasks (id: uuid, task_id: text, token_id: integer, status: text, progress: integer, created_at: timestamp, updated_at: timestamp, metadata: jsonb)');
        }

        console.log('✅ Database structure validation completed');
    } catch (error) {
        console.error('⚠️ Database structure validation failed:', error);
        throw error;
    }
}

/**
 * Get Supabase client instance
 * @returns {object} - Supabase client instance
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
        const { error } = await supabase.from('state').select('count', { count: 'exact', head: true });

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
export async function withSupabase(operation, operationName = 'Supabase operation') {
    try {
        await ensureConnection();
        return await operation(supabase);
    } catch (error) {
        console.error(`❌ ${operationName} failed:`, error);
        throw error;
    }
}

/**
 * Validate state object structure
 * @param {Object} state - State object to validate
 * @returns {Object} - Validated state object
 */
function validateState(state) {
    // Default state structure
    const defaultState = {
        lastProcessedBlock: 0,
        processedTokens: [],
        pendingTasks: []
    };

    if (!state || typeof state !== 'object') {
        console.warn('⚠️ Invalid state object, using default state');
        return defaultState;
    }

    // Validate and fix processedTokens
    if (!Array.isArray(state.processedTokens)) {
        console.warn('⚠️ processedTokens is not an array, resetting to empty array');
        state.processedTokens = [];
    }

    // Validate and fix pendingTasks
    if (!Array.isArray(state.pendingTasks)) {
        console.warn('⚠️ pendingTasks is not an array, resetting to empty array');
        state.pendingTasks = [];
    }

    // Validate lastProcessedBlock
    if (typeof state.lastProcessedBlock !== 'number' || state.lastProcessedBlock < 0) {
        console.warn('⚠️ lastProcessedBlock is invalid, resetting to 0');
        state.lastProcessedBlock = 0;
    }

    return {
        lastProcessedBlock: state.lastProcessedBlock,
        processedTokens: state.processedTokens,
        pendingTasks: state.pendingTasks
    };
}

/**
 * Save application state to Supabase
 * @param {string} type - State type (e.g., 'cron')
 * @param {Object} state - State data to save
 * @returns {Promise<boolean>} - Save success
 */
export async function saveState(type, state) {
    return await withSupabase(async (client) => {
        // Validate state before saving
        const validatedState = validateState(state);

        const { error } = await client
            .from('state')
            .upsert({
                type,
                state: validatedState,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'type'
            });

        if (error) {
            throw error;
        }

        console.log(`💾 State saved successfully for type: ${type}`);
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
        const { data, error } = await client
            .from('state')
            .select('state')
            .eq('type', type)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log(`📂 No state found for type: ${type}, using default state`);
                return validateState(defaultState);
            }
            throw error;
        }

        if (!data || !data.state) {
            console.log(`📂 No state data found for type: ${type}, using default state`);
            return validateState(defaultState);
        }

        console.log(`📂 State loaded successfully for type: ${type}`);
        return validateState(data.state);
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

        return {
            status: 'healthy',
            connected: true,
            database: 'supabase',
            collections: {
                tasks: tasksError ? 0 : tasksCount,
                state: stateError ? 0 : stateCount
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

// Export legacy MongoDB function names for compatibility
export const mongoHealthCheck = supabaseHealthCheck;