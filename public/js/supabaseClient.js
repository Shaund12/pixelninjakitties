/**
 * Supabase Client for Frontend
 * Provides Supabase client instance for browser environment
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/+esm';

let supabase;
let initPromise;

// Fetch configuration from server
async function fetchConfig() {
    try {
        const response = await fetch('/api/config');
        if (!response.ok) {
            throw new Error(`Config fetch failed: ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.warn('⚠️ Failed to fetch config from server:', error.message);
        return {
            supabase: { configured: false },
            features: { supabaseEnabled: false }
        };
    }
}

// Initialize client with error handling
async function initializeSupabase() {
    if (supabase) return supabase;
    
    try {
        const config = await fetchConfig();
        
        // Only initialize if we have real values
        if (config.supabase.configured && config.supabase.url && config.supabase.anonKey) {
            supabase = createClient(config.supabase.url, config.supabase.anonKey);
            console.log('✅ Supabase client initialized');
            return supabase;
        } else {
            throw new Error('Supabase configuration not available');
        }
    } catch (error) {
        console.warn('⚠️ Supabase not configured, using fallback mode:', error.message);
        // Create a mock client for development
        supabase = createMockSupabaseClient();
        return supabase;
    }
}

// Create mock client for development/fallback
function createMockSupabaseClient() {
    return {
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

// Get initialized Supabase client
async function getSupabase() {
    if (!initPromise) {
        initPromise = initializeSupabase();
    }
    return await initPromise;
}

export { getSupabase };
