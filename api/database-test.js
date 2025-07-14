/**
 * Supabase Database Structure Test
 * Use this endpoint to test Supabase connection and database initialization
 */

import { connectToDatabase, getSupabaseClient, databaseHealthCheck } from '../scripts/database.js';

export default async function handler(req, res) {
    try {
        console.log('🧪 Testing Supabase connection and database structure...');

        // Test connection
        const connected = await connectToDatabase();
        if (!connected) {
            return res.status(500).json({
                error: 'Failed to connect to Supabase',
                timestamp: new Date().toISOString()
            });
        }

        // Get Supabase client
        const supabase = getSupabaseClient();

        // Test table access
        const tableTests = {};
        const requiredTables = ['tasks', 'state', 'metrics'];
        
        for (const table of requiredTables) {
            try {
                const { data, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
                if (error && error.code !== 'PGRST116') {
                    throw error;
                }
                tableTests[table] = error ? 'Table not found' : 'Table accessible';
            } catch (error) {
                tableTests[table] = `Error: ${error.message}`;
            }
        }

        // Run health check
        const healthCheck = await databaseHealthCheck();

        res.json({
            status: 'success',
            connected: true,
            timestamp: new Date().toISOString(),
            tables: tableTests,
            healthCheck,
            message: 'Supabase connection and structure test completed'
        });

    } catch (error) {
        console.error('Database test error:', error);
        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}