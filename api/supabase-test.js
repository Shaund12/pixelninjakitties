/**
 * Supabase Database Structure Test
 * Use this endpoint to test Supabase connection and database initialization
 */

import { connectToSupabase, getSupabase, supabaseHealthCheck } from '../scripts/supabase.js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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

        // Perform health check
        const healthCheck = await supabaseHealthCheck();

        // Test basic operations
        const supabase = getSupabase();

        // Test state operations
        const testState = {
            test: true,
            timestamp: new Date().toISOString(),
            data: { message: 'This is a test state' }
        };

        // Try to save test state
        const { error: saveError } = await supabase
            .from('state')
            .upsert({
                type: 'test_state',
                state: testState,
                updated_at: new Date().toISOString()
            });

        // Try to load test state
        const { data: loadedState, error: loadError } = await supabase
            .from('state')
            .select('state')
            .eq('type', 'test_state')
            .single();

        const stateReadSuccess = loadedState && loadedState.state.test === true;

        // Clean up test state
        const { error: deleteError } = await supabase
            .from('state')
            .delete()
            .eq('type', 'test_state');

        console.log('✅ Supabase test completed successfully');

        return res.status(200).json({
            status: 'success',
            timestamp: new Date().toISOString(),
            connection: {
                connected: true,
                healthCheck
            },
            tests: {
                stateWrite: saveError ? `❌ Failed: ${saveError.message}` : '✅ Success',
                stateRead: loadError ? `❌ Failed: ${loadError.message}` : (stateReadSuccess ? '✅ Success' : '❌ Data mismatch'),
                stateDelete: deleteError ? `❌ Failed: ${deleteError.message}` : '✅ Success'
            },
            environment: {
                supabaseUrl: process.env.SUPABASE_URL ? '✅ Set' : '❌ Missing',
                supabaseKey: process.env.SUPABASE_ANON_KEY ? '✅ Set' : '❌ Missing'
            }
        });

    } catch (error) {
        console.error('❌ Supabase test failed:', error);
        return res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}