/**
 * Supabase Client for Frontend
 * Provides Supabase client instance for browser environment
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

let supabase;

// Get environment variables from window object (injected by server)
const supabaseUrl = window.SUPABASE_URL;
const supabaseAnonKey = window.SUPABASE_ANON_KEY;

// Initialize Supabase client
if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
}

supabase = createClient(supabaseUrl, supabaseAnonKey);
console.log('✅ Supabase client initialized');

export { supabase };