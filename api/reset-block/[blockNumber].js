import { initializeBlockchain, saveState, setCorsHeaders, handleOptions } from '../../scripts/serverlessInit.js';
import { validateBlockNumber, sanitizeForLogging, createSafeErrorResponse } from '../../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        // Get blockNumber from URL (Next.js style)
        const { blockNumber: blockNumberParam } = req.query;

        if (!blockNumberParam) {
            return res.status(400).json({ error: 'Block number is required' });
        }

        const blockNumber = validateBlockNumber(blockNumberParam);

        // Initialize blockchain components
        const blockchain = await initializeBlockchain();

        // Update the last processed block
        blockchain.lastBlock = blockNumber;
        await saveState();

        res.json({
            success: true,
            message: `Last processed block reset to ${blockNumber}`,
            lastBlock: blockNumber
        });

        // Note: In serverless functions, we can't directly trigger checkForEvents
        // This would need to be handled by the cron job or other mechanism
    } catch (err) {
        console.error('Error in /api/reset-block:', sanitizeForLogging(err.message));
        res.status(400).json(createSafeErrorResponse(err, process.env.NODE_ENV === 'development'));
    }
}