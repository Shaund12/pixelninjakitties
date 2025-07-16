/**
 * Supabase Client Configuration
 * Provides a shared Supabase client instance for the application
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

let supabase;

if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ SUPABASE_URL and SUPABASE_ANON_KEY environment variables not set - some features may be disabled');
    
    // Create a mock client for development
    supabase = {
        from: (table) => ({
            select: () => Promise.resolve({ data: [], error: null }),
            insert: () => Promise.resolve({ data: [], error: null }),
            update: () => Promise.resolve({ data: [], error: null }),
            upsert: () => Promise.resolve({ data: [], error: null }),
            delete: () => Promise.resolve({ data: [], error: null })
        })
    };
} else {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized');
}

export { supabase };