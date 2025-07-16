/**
 * Frontend Configuration API
 * Provides safe client-side configuration including Supabase settings
 */

export default function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // CORS headers for frontend access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    try {
        // Only expose public/safe environment variables
        const config = {
            supabase: {
                url: process.env.SUPABASE_URL || null,
                anonKey: process.env.SUPABASE_ANON_KEY || null,
                configured: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY)
            },
            blockchain: {
                rpcUrl: process.env.RPC_URL || 'https://rpc.vitruveo.xyz',
                contractAddress: process.env.CONTRACT_ADDRESS || '0x2D732b0Bb33566A13E586aE83fB21d2feE34e906'
            },
            features: {
                supabaseEnabled: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
                debugMode: process.env.NODE_ENV === 'development'
            }
        };

        res.status(200).json(config);
    } catch (error) {
        console.error('Error serving config:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
}