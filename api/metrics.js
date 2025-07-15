import { initializeBlockchain, getUptimeTracker, setCorsHeaders, handleOptions } from '../scripts/serverlessInit.js';
import { sanitizeForLogging, createSafeErrorResponse } from '../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        const uptimeTracker = getUptimeTracker();

        // Initialize blockchain components
        const { mintQueue, lastBlock, processingQueue, processedTokens } = await initializeBlockchain();

        const uptimeStats = uptimeTracker.getStats();
        const memoryUsage = process.memoryUsage();

        res.json({
            uptime: uptimeStats,
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                external: Math.round(memoryUsage.external / 1024 / 1024),
                rss: Math.round(memoryUsage.rss / 1024 / 1024),
                unit: 'MB'
            },
            process: {
                pid: process.pid,
                version: process.version,
                platform: process.platform,
                arch: process.arch
            },
            queue: {
                length: mintQueue.length,
                processing: processingQueue,
                lastProcessedBlock: lastBlock,
                processedTokensCount: processedTokens.size
            }
        });
    } catch (error) {
        console.error('Error in /api/metrics:', sanitizeForLogging(error.message));
        res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
}