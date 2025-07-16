/**
 * Supabase Client for Frontend
 * Provides Supabase client instance for browser environment
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

// For development, use placeholder values
const supabaseUrl = 'https://your-project.supabase.co';
const supabaseKey = 'your-anon-key';

let supabase;

// Initialize client with error handling
try {
    // Only initialize if we have real values
    if (supabaseUrl !== 'https://your-project.supabase.co' && supabaseKey !== 'your-anon-key') {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log('✅ Supabase client initialized');
    } else {
        throw new Error('Supabase configuration not set');
    }
} catch (error) {
    console.warn('⚠️ Supabase not configured, using fallback mode:', error.message);
    // Create a mock client for development
    supabase = {
        auth: {
            getUser: () => Promise.resolve({ data: { user: { id: 'dev-user' } } }),
            signInAnonymously: () => Promise.resolve({ data: { user: { id: 'dev-user' } } })
        },
        from: (table) => ({
            select: (columns) => ({
                eq: (column, value) => ({
                    single: () => Promise.resolve({ data: null, error: { code: 'PGRST116' } }),
                    order: (column, options) => ({
                        limit: (count) => Promise.resolve({ data: [], error: null })
                    }),
                    gte: (column, value) => ({
                        order: (column, options) => Promise.resolve({ data: [], error: null })
                    })
                }),
                gte: (column, value) => ({
                    order: (column, options) => Promise.resolve({ data: [], error: null })
                }),
                order: (column, options) => ({
                    limit: (count) => Promise.resolve({ data: [], error: null })
                })
            }),
            insert: (data) => Promise.resolve({ data: [], error: null }),
            update: (data) => ({
                eq: (column, value) => Promise.resolve({ data: [], error: null })
            }),
            upsert: (data) => Promise.resolve({ data: [], error: null }),
            delete: () => ({
                eq: (column, value) => Promise.resolve({ data: [], error: null })
            })
        })
    };
}

export { supabase };