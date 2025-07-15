import { performHealthCheck } from '../scripts/healthCheck.js';
import { initializeBlockchain, getUptimeTracker, getEnvVars, setCorsHeaders, handleOptions } from '../scripts/serverlessInit.js';
import { sanitizeForLogging, createSafeErrorResponse } from '../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        const uptimeTracker = getUptimeTracker();
        const envVars = getEnvVars();
        uptimeTracker.recordRequest();

        // Initialize blockchain components
        const { mintQueue, lastBlock } = await initializeBlockchain();

        const healthCheck = await performHealthCheck();
        const uptimeStats = uptimeTracker.getStats();

        const response = {
            status: healthCheck.status,
            timestamp: healthCheck.timestamp,
            uptime: uptimeStats.uptime,
            queueLength: mintQueue.length,
            lastProcessed: lastBlock,
            defaultImageProvider: envVars.IMAGE_PROVIDER,
            availableProviders: {
                'dall-e': !!process.env.OPENAI_API_KEY,
                'huggingface': !!process.env.HUGGING_FACE_TOKEN,
                'stability': !!process.env.STABILITY_API_KEY
            },
            checks: healthCheck.checks,
            stats: {
                requests: uptimeStats.requests,
                errors: uptimeStats.errors,
                errorRate: uptimeStats.errorRate
            }
        };

        res.json(response);
    } catch (error) {
        const uptimeTracker = getUptimeTracker();
        uptimeTracker.recordError();
        console.error('Error in /api/health:', sanitizeForLogging(error.message));
        res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
}