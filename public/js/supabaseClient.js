/**
 * Supabase Client for Frontend
 * Provides Supabase client instance for browser environment
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

let supabase;
let initializationPromise;

// Initialize Supabase client with proper error handling
function initializeSupabase() {
    if (supabase) {
        return Promise.resolve(supabase);
    }

    if (initializationPromise) {
        return initializationPromise;
    }

    console.log('🚀 Initializing Supabase client...');

    initializationPromise = new Promise((resolve, reject) => {
        // Wait for DOM to be ready and window variables to be available
        const checkAndInit = () => {
            console.log('🔍 Checking for window variables...');
            console.log('window.SUPABASE_URL:', window.SUPABASE_URL);
            console.log('window.SUPABASE_ANON_KEY:', window.SUPABASE_ANON_KEY ? '***' : undefined);
            
            // Get environment variables from window object (injected by server)
            const supabaseUrl = window.SUPABASE_URL;
            const supabaseAnonKey = window.SUPABASE_ANON_KEY;

            // Initialize Supabase client
            if (!supabaseUrl || !supabaseAnonKey) {
                console.error('❌ Supabase configuration is missing');
                reject(new Error('Supabase configuration is missing. Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables.'));
                return;
            }

            try {
                supabase = createClient(supabaseUrl, supabaseAnonKey);
                console.log('✅ Supabase client initialized successfully');
                resolve(supabase);
            } catch (error) {
                console.error('❌ Failed to create Supabase client:', error);
                reject(error);
            }
        };

        // Check if DOM is ready and window variables are available
        if (document.readyState === 'loading') {
            console.log('⏳ DOM is still loading, waiting for DOMContentLoaded...');
            document.addEventListener('DOMContentLoaded', checkAndInit);
        } else {
            // DOM is ready, check if window variables are available
            if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
                checkAndInit();
            } else {
                console.log('⏳ Window variables not available yet, waiting...');
                // Wait a bit for the server to inject the variables
                setTimeout(() => {
                    if (window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
                        checkAndInit();
                    } else {
                        console.error('❌ Timeout waiting for window variables');
                        reject(new Error('Timeout waiting for Supabase configuration'));
                    }
                }, 1000);
            }
        }
    });

    return initializationPromise;
}

// Export both the client and initialization function
export { supabase, initializeSupabase };