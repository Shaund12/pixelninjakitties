import { initializeBlockchain, getEnvVars, setCorsHeaders, handleOptions } from '../scripts/serverlessInit.js';
import { sanitizeForLogging, createSafeErrorResponse } from '../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        // Initialize blockchain components
        const { provider } = await initializeBlockchain();
        const envVars = getEnvVars();

        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 10000);

        console.log(`Checking for all events from block ${fromBlock} to ${currentBlock}`);

        const logs = await provider.getLogs({
            address: envVars.CONTRACT_ADDRESS,
            fromBlock,
            toBlock: currentBlock
        });

        const eventTypes = {};
        logs.forEach(log => {
            const topic = log.topics[0];
            eventTypes[topic] = (eventTypes[topic] || 0) + 1;
        });

        res.json({
            success: true,
            totalEvents: logs.length,
            eventTypes,
            recentBlocks: {
                from: fromBlock,
                to: currentBlock,
                range: currentBlock - fromBlock
            },
            sampleEvents: logs.slice(0, 5)
        });
    } catch (err) {
        console.error('Error in /api/recent-events:', sanitizeForLogging(err.message));
        res.status(500).json(createSafeErrorResponse(err, process.env.NODE_ENV === 'development'));
    }
}