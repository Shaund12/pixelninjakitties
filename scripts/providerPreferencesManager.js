/**
 * Supabase-based Provider Preferences Manager
 * Manages provider preferences using Supabase instead of file storage
 */

import { createClient } from '@supabase/supabase-js';

/**
 * Provider preferences storage using Supabase
 */
export class ProviderPreferencesManager {
    constructor() {
        this.tableName = 'provider_preferences';
        this.supabase = null;
        this.initialized = false;
    }

    /**
     * Initialize the Supabase client
     */
    initialize() {
        if (this.initialized) {
            return;
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
            throw new Error('Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY');
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
        this.initialized = true;
    }

    /**
     * Get provider preference for a token
     * @param {string} tokenId - Token ID
     * @returns {Promise<Object|null>} Provider preference object or null if not found
     */
    async get(tokenId) {
        this.initialize();
        
        try {
            const { data, error } = await this.supabase
                .from(this.tableName)
                .select('*')
                .eq('token_id', tokenId.toString())
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error(`❌ Error getting provider preference for token ${tokenId}:`, error);
                return null;
            }

            return data ? {
                provider: data.provider,
                timestamp: data.timestamp,
                options: data.options
            } : null;
        } catch (err) {
            console.error(`❌ Error getting provider preference for token ${tokenId}:`, err);
            return null;
        }
    }

    /**
     * Set provider preference for a token
     * @param {string} tokenId - Token ID
     * @param {Object} preference - Preference object with provider, timestamp, options
     * @returns {Promise<Object>} The saved preference
     */
    async set(tokenId, preference) {
        this.initialize();
        
        try {
            const record = {
                token_id: tokenId.toString(),
                provider: preference.provider,
                timestamp: preference.timestamp || Date.now(),
                options: preference.options || {},
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from(this.tableName)
                .upsert(record, { onConflict: 'token_id' })
                .select()
                .single();

            if (error) {
                console.error(`❌ Error setting provider preference for token ${tokenId}:`, error);
                throw error;
            }

            console.log(`✅ Provider preference saved for token ${tokenId}: ${preference.provider}`);
            return {
                provider: data.provider,
                timestamp: data.timestamp,
                options: data.options
            };
        } catch (err) {
            console.error(`❌ Error setting provider preference for token ${tokenId}:`, err);
            throw err;
        }
    }

    /**
     * Delete provider preference for a token
     * @param {string} tokenId - Token ID
     * @returns {Promise<boolean>} True if deleted successfully
     */
    async delete(tokenId) {
        this.initialize();
        
        try {
            const { error } = await this.supabase
                .from(this.tableName)
                .delete()
                .eq('token_id', tokenId.toString());

            if (error) {
                console.error(`❌ Error deleting provider preference for token ${tokenId}:`, error);
                return false;
            }

            console.log(`✅ Provider preference deleted for token ${tokenId}`);
            return true;
        } catch (err) {
            console.error(`❌ Error deleting provider preference for token ${tokenId}:`, err);
            return false;
        }
    }

    /**
     * Get all provider preferences
     * @returns {Promise<Object>} All preferences as an object keyed by token ID
     */
    async getAll() {
        this.initialize();
        
        try {
            const { data, error } = await this.supabase
                .from(this.tableName)
                .select('*');

            if (error) {
                console.error('❌ Error getting all provider preferences:', error);
                return {};
            }

            const preferences = {};
            for (const record of data || []) {
                preferences[record.token_id] = {
                    provider: record.provider,
                    timestamp: record.timestamp,
                    options: record.options
                };
            }

            return preferences;
        } catch (err) {
            console.error('❌ Error getting all provider preferences:', err);
            return {};
        }
    }

    /**
     * Initialize the provider preferences table in Supabase
     * @returns {Promise<boolean>} True if table exists or was created
     */
    async initializeTable() {
        this.initialize();
        
        try {
            // Try to query the table to see if it exists
            const { error } = await this.supabase
                .from(this.tableName)
                .select('token_id')
                .limit(1);

            if (error && error.code === '42P01') {
                console.log('⚠️ Provider preferences table missing. Please run:');
                console.log(`
CREATE TABLE provider_preferences (
  token_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  timestamp BIGINT NOT NULL,
  options JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_provider_preferences_provider ON provider_preferences(provider);
CREATE INDEX idx_provider_preferences_timestamp ON provider_preferences(timestamp);
                `);
                return false;
            }

            if (error) {
                console.error('❌ Error checking provider preferences table:', error);
                return false;
            }

            console.log('✅ Provider preferences table is available');
            return true;
        } catch (err) {
            console.error('❌ Error initializing provider preferences table:', err);
            return false;
        }
    }
}

// Export singleton instance
export const providerPreferences = new ProviderPreferencesManager();