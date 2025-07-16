/**
 * Supabase Client for Frontend
 * Provides Supabase client instance for browser environment
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

// Initialize Supabase client for frontend
const supabaseUrl = 'https://your-project.supabase.co'; // Replace with your actual URL
const supabaseKey = 'your-anon-key'; // Replace with your actual anon key

let supabase;

// Initialize client with error handling
try {
    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Supabase client initialized');
} catch (error) {
    console.error('❌ Failed to initialize Supabase client:', error);
    // Create a mock client for development
    supabase = {
        auth: {
            getUser: () => Promise.resolve({ data: { user: null } }),
            signInAnonymously: () => Promise.resolve({ data: { user: { id: 'anonymous' } } })
        },
        from: () => ({
            select: () => Promise.resolve({ data: [], error: null }),
            insert: () => Promise.resolve({ data: [], error: null }),
            update: () => Promise.resolve({ data: [], error: null }),
            upsert: () => Promise.resolve({ data: [], error: null }),
            delete: () => Promise.resolve({ data: [], error: null })
        })
    };
}

export { supabase };