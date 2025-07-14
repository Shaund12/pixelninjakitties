/**
 * Supabase Migration Script
 * Creates missing tables for PostgreSQL/Supabase deployments
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Initialize Supabase client
 */
function initializeSupabase() {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables');
    }

    return createClient(supabaseUrl, supabaseKey);
}

/**
 * Create the missing state table in Supabase
 */
export async function createStateTable() {
    console.log('🔄 Creating Supabase state table...');

    const supabase = initializeSupabase();

    // Create state table if it doesn't exist
    const { data, error } = await supabase.rpc('create_state_table', {
        sql: `
            CREATE TABLE IF NOT EXISTS public.state (
                type VARCHAR(50) PRIMARY KEY,
                state JSONB NOT NULL,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
            
            -- Create index for faster lookups
            CREATE INDEX IF NOT EXISTS idx_state_updated_at ON public.state(updated_at);
        `
    });

    if (error) {
        console.error('❌ Failed to create state table:', error);
        throw error;
    }

    console.log('✅ State table created successfully');
    return true;
}

/**
 * Save state to Supabase
 */
export async function saveStateToSupabase(type, state) {
    const supabase = initializeSupabase();

    const { data, error } = await supabase
        .from('state')
        .upsert({
            type,
            state,
            updated_at: new Date()
        });

    if (error) {
        console.error(`❌ Save state (${type}) failed:`, error);
        throw error;
    }

    console.log(`✅ Saved state (${type}) to Supabase`);
    return data;
}

/**
 * Load state from Supabase
 */
export async function loadStateFromSupabase(type, defaultState = {}) {
    const supabase = initializeSupabase();

    const { data, error } = await supabase
        .from('state')
        .select('state')
        .eq('type', type)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            // No rows found, return default state
            console.log(`📊 No state found for type ${type}, using default`);
            return defaultState;
        }
        console.error(`❌ Load state (${type}) failed:`, error);
        throw error;
    }

    return data?.state || defaultState;
}

/**
 * Test Supabase connection
 */
export async function testSupabaseConnection() {
    try {
        const supabase = initializeSupabase();

        // Test connection by trying to fetch from state table
        const { data, error } = await supabase
            .from('state')
            .select('type')
            .limit(1);

        if (error && error.code === '42P01') {
            // Table doesn't exist, create it
            await createStateTable();
            console.log('✅ Connected to Supabase and created missing tables');
            return true;
        }

        if (error) {
            throw error;
        }

        console.log('✅ Connected to Supabase successfully');
        return true;
    } catch (error) {
        console.error('❌ Supabase connection test failed:', error);
        throw error;
    }
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        console.log('🚀 Starting Supabase migration...');
        await testSupabaseConnection();
        console.log('✅ Supabase migration completed successfully');
    } catch (error) {
        console.error('❌ Supabase migration failed:', error);
        process.exit(1);
    }
}