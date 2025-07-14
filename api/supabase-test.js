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
        const client = getSupabaseClient();

        // Check required tables
        const requiredTables = ['tasks', 'state', 'metrics'];
        const tableStats = {};

        for (const table of requiredTables) {
            try {
                const { count, error } = await client
                    .from(table)
                    .select('*', { count: 'exact', head: true });

                if (error && error.code === 'PGRST116') {
                    tableStats[table] = {
                        exists: false,
                        error: 'Table does not exist'
                    };
                } else if (error) {
                    tableStats[table] = {
                        exists: false,
                        error: error.message
                    };
                } else {
                    tableStats[table] = {
                        exists: true,
                        documentCount: count || 0
                    };
                }
            } catch (error) {
                tableStats[table] = {
                    exists: false,
                    error: error.message
                };
            }
        }

        // Get health check
        const healthCheck = await supabaseHealthCheck();

        const result = {
            status: 'success',
            timestamp: new Date().toISOString(),
            connection: {
                connected: true,
                database: 'supabase'
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