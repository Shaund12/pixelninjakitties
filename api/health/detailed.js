import { performHealthCheck } from '../../scripts/healthCheck.js';
import { initializeBlockchain, getUptimeTracker, setCorsHeaders, handleOptions } from '../../scripts/serverlessInit.js';
import { sanitizeForLogging, createSafeErrorResponse } from '../../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        const uptimeTracker = getUptimeTracker();
        uptimeTracker.recordRequest();

        // Initialize blockchain components
        const { mintQueue, lastBlock, processingQueue, processedTokens } = await initializeBlockchain();

        const healthCheck = await performHealthCheck();
        const uptimeStats = uptimeTracker.getStats();

        res.json({
            ...healthCheck,
            uptime: uptimeStats,
            queueStatus: {
                length: mintQueue.length,
                processing: processingQueue,
                lastProcessedBlock: lastBlock,
                processedTokensCount: processedTokens.size
            }
        });
    } catch (error) {
        const uptimeTracker = getUptimeTracker();
        uptimeTracker.recordError();
        console.error('Error in /api/health/detailed:', sanitizeForLogging(error.message));
        res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
}