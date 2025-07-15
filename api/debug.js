import { initializeBlockchain, getEnvVars, setCorsHeaders, handleOptions } from '../scripts/serverlessInit.js';
import { sanitizeForLogging, createSafeErrorResponse } from '../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        // Initialize blockchain components
        const { provider, mintQueue, lastBlock, processedTokens } = await initializeBlockchain();
        const envVars = getEnvVars();

        const currentBlock = await provider.getBlockNumber();
        const contractAddr = envVars.CONTRACT_ADDRESS;

        res.json({
            currentBlock,
            lastProcessedBlock: lastBlock,
            behindBy: currentBlock - lastBlock,
            processedCount: processedTokens.size,
            queueLength: mintQueue.length,
            queueItems: mintQueue.map(item => ({
                tokenId: item.tokenId.toString(),
                breed: item.breed,
                imageProvider: item.imageProvider || envVars.IMAGE_PROVIDER
            })),
            contractAddress: contractAddr,
            defaultImageProvider: envVars.IMAGE_PROVIDER
        });
    } catch (err) {
        console.error('Error in /api/debug:', sanitizeForLogging(err.message));
        res.status(500).json(createSafeErrorResponse(err, process.env.NODE_ENV === 'development'));
    }
}