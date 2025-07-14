/**
 * Test endpoint for breed selection debugging
 * Call this to test breed selection without running the full cron job
 */

export default async function handler(req, res) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Get parameters from query
        const breed = req.query.breed || 'Calico';
        const tokenId = req.query.tokenId || '999';

        console.log(`🧪 Testing breed selection for: "${breed}" (Token ID: ${tokenId})`);

        // Import finalizeMint function
        const { finalizeMint } = await import('../scripts/finalizeMint.js');

        // Test the breed selection
        const result = await finalizeMint({
            breed: breed,
            tokenId: parseInt(tokenId),
            imageProvider: 'dall-e'
        });

        // Extract relevant information
        const breedAttribute = result.metadata?.attributes?.find(a => a.trait_type === 'Breed');

        const testResult = {
            status: 'success',
            test: {
                expected: breed,
                actual: breedAttribute?.value,
                success: breedAttribute?.value === breed
            },
            tokenURI: result.tokenURI,
            provider: result.provider,
            metadata: result.metadata,
            timestamp: new Date().toISOString()
        };

        console.log('🧪 Test Result:', testResult);

        return res.status(200).json(testResult);

    } catch (error) {
        console.error('❌ Breed selection test failed:', error);

        return res.status(500).json({
            status: 'error',
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            timestamp: new Date().toISOString()
        });
    }
}