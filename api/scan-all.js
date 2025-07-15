import { initializeBlockchain, saveState, setCorsHeaders, handleOptions } from '../scripts/serverlessInit.js';
import { sanitizeForLogging, createSafeErrorResponse } from '../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        console.log('🔍 Resetting block pointer to scan from genesis block');

        // Initialize blockchain components
        const blockchain = await initializeBlockchain();

        // Reset lastBlock to 0 to scan from genesis
        blockchain.lastBlock = 0;
        await saveState();

        // Note: In serverless functions, we can't directly trigger the polling
        // This would need to be handled by the cron job or other mechanism

        res.json({
            success: true,
            message: 'Reset block pointer to genesis block. Scanning will be handled by the cron job.'
        });
    } catch (err) {
        console.error('Error in /api/scan-all:', sanitizeForLogging(err.message));
        res.status(500).json(createSafeErrorResponse(err, process.env.NODE_ENV === 'development'));
    }
}