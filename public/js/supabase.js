/**
 * Supabase Client for Frontend
 * Uses the existing /api/config endpoint and server-side configuration
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

let supabase;
let initializationPromise;

// Initialize Supabase client using configuration from server
async function initializeSupabase() {
    if (supabase) {
        return supabase;
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            console.log('🚀 Initializing Supabase client...');
            
            // Get configuration from server
            const response = await fetch('/api/config');
            if (!response.ok) {
                throw new Error(`Failed to fetch config: ${response.status}`);
            }

            const config = await response.json();
            
            if (!config.supabase.configured) {
                throw new Error('Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.');
            }

            // Initialize Supabase client
            supabase = createClient(config.supabase.url, config.supabase.anonKey);
            console.log('✅ Supabase client initialized successfully');
            
            return supabase;
        } catch (error) {
            console.error('❌ Failed to initialize Supabase client:', error);
            throw error;
        }
    })();

    return initializationPromise;
}

// Export the initialization function
export { initializeSupabase };