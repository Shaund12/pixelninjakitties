import { setCorsHeaders, handleOptions } from '../scripts/serverlessInit.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    res.json({
        name: 'Ninja Kitty NFT API',
        version: '1.0',
        description: 'API for minting and processing pixel art ninja cat NFTs',
        endpoints: [
            {
                path: '/api/health',
                method: 'GET',
                description: 'Check server health status'
            },
            {
                path: '/api/health/detailed',
                method: 'GET',
                description: 'Get detailed health check with queue status'
            },
            {
                path: '/api/metrics',
                method: 'GET',
                description: 'Get system metrics and performance data'
            },
            {
                path: '/api/task/:taskId',
                method: 'GET',
                description: 'Check status of a specific generation task'
            },
            {
                path: '/api/debug',
                method: 'GET',
                description: 'Get debugging information about the server state'
            },
            {
                path: '/api/scan-all',
                method: 'GET',
                description: 'Reset block pointer and scan all blocks for events'
            },
            {
                path: '/api/recent-events',
                method: 'GET',
                description: 'Get recent events from the contract'
            },
            {
                path: '/api/reset-block/:blockNumber',
                method: 'GET',
                description: 'Reset the last processed block to a specific number'
            },
            {
                path: '/api/process/:tokenId',
                method: 'GET',
                description: 'Process a specific token ID',
                query: {
                    breed: "Cat breed (e.g., 'Tabby', 'Bengal')",
                    imageProvider: 'AI provider to use (dall-e, huggingface, stability)',
                    promptExtras: 'Additional prompt instructions',
                    negativePrompt: 'Things to exclude from the image'
                }
            },
            {
                path: '/api/status/:taskId',
                method: 'GET',
                description: 'Get detailed status of a specific task'
            },
            {
                path: '/api/docs',
                method: 'GET',
                description: 'This documentation'
            }
        ],
        imageProviders: [
            {
                id: 'dall-e',
                name: 'DALL-E 3',
                description: "OpenAI's high-quality image generation model"
            },
            {
                id: 'huggingface',
                name: 'Hugging Face (Stable Diffusion)',
                description: 'Free open-source model with good quality'
            },
            {
                id: 'stability',
                name: 'Stability AI',
                description: 'Professional quality image generation'
            }
        ]
    });
}