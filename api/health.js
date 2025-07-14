// Simple health check API for Vercel
export default async function handler(req, res) {
    // Allow CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        return res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'Vercel API is working'
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}