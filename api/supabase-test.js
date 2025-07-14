/**
 * Supabase Database Structure Test
 * Use this endpoint to test Supabase connection and database initialization
 */

import { connectToSupabase, getSupabaseClient, supabaseHealthCheck } from '../scripts/supabase.js';

export default async function handler(req, res) {
    try {
        console.log('🧪 Testing Supabase connection and database structure...');

        // Test connection
        const connected = await connectToSupabase();
        if (!connected) {
            return res.status(500).json({
                error: 'Failed to connect to Supabase',
                timestamp: new Date().toISOString()
            });
        }

        // Get Supabase client
        const supabase = getSupabaseClient();

        // Check if required tables exist and get their structure
        const requiredTables = ['tasks', 'state', 'metrics'];
        const tableStats = {};

        for (const tableName of requiredTables) {
            try {
                // Get table count
                const { error, count } = await supabase
                    .from(tableName)
                    .select('*', { count: 'exact', head: true });

                if (error && error.code !== 'PGRST116') {
                    tableStats[tableName] = { error: error.message };
                } else if (error && error.code === 'PGRST116') {
                    tableStats[tableName] = {
                        exists: false,
                        message: 'Table does not exist'
                    };
                } else {
                    tableStats[tableName] = {
                        exists: true,
                        documentCount: count || 0
                    };
                }
            } catch (error) {
                tableStats[tableName] = { error: error.message };
            }
        }

        // Get health check
        const healthCheck = await supabaseHealthCheck();

        const result = {
            status: 'success',
            timestamp: new Date().toISOString(),
            connection: {
                connected: true,
                database: 'Supabase',
                url: process.env.SUPABASE_URL
            },
            tables: {
                required: requiredTables,
                stats: tableStats
            },
            healthCheck
        };

        console.log('✅ Supabase test completed successfully');
        return res.status(200).json(result);

    } catch (error) {
        console.error('❌ Supabase test failed:', error);
        return res.status(500).json({
            status: 'error',
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString(),
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}