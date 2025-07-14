/**
 * Manual Cron Test Endpoint
 * Use this to manually trigger cron job execution for testing
 */

import { default as cronHandler } from './cron.js';

export default async function handler(req, res) {
    // Only allow GET requests for manual testing
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🧪 Manual cron test triggered');

    // Add test headers to identify manual execution
    req.headers['x-test-execution'] = 'true';
    req.headers['x-triggered-by'] = 'manual';

    try {
        // Call the main cron handler
        await cronHandler(req, res);
    } catch (error) {
        console.error('❌ Manual cron test failed:', error);
        return res.status(500).json({
            error: 'Manual cron test failed',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
}