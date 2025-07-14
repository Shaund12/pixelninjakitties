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

        // Test queries on each table
        const tables = ['tasks', 'state', 'metrics'];
        const tableInfo = {};

        for (const tableName of tables) {
            try {
                // Get row count
                const { count, error: countError } = await supabase
                    .from(tableName)
                    .select('*', { count: 'exact', head: true });

                if (countError) {
                    tableInfo[tableName] = {
                        exists: false,
                        error: countError.message
                    };
                } else {
                    tableInfo[tableName] = {
                        exists: true,
                        documentCount: count || 0
                    };
                }
            } catch (error) {
                tableInfo[tableName] = {
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
                url: process.env.SUPABASE_URL ? 'configured' : 'not configured',
                database: 'supabase'
            },
            tables: {
                total: tables.length,
                required: tables,
                info: tableInfo
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