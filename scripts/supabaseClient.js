/**
 * Supabase Client Configuration
 * Provides a shared Supabase client instance for the application
 */

import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
    process.exit(1);
}

export const supabase = createClient(supabaseUrl, supabaseKey);