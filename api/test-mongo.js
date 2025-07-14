/**
 * Simple MongoDB connection test
 * This tests basic MongoDB connectivity without requiring full database setup
 */

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🧪 Testing MongoDB connectivity...');

    try {
        const { MONGODB_URI } = process.env;

        const result = {
            status: 'success',
            timestamp: new Date().toISOString(),
            tests: {}
        };

        // Test 1: Environment Variable
        console.log('🧪 Test 1: Environment Variable');
        result.tests.environment = {
            MONGODB_URI: MONGODB_URI ? '✅ Set' : '❌ Missing'
        };

        if (!MONGODB_URI) {
            result.tests.environment.status = '❌ MONGODB_URI not configured';
            return res.status(500).json(result);
        }

        // Test 2: MongoDB Connection
        console.log('🧪 Test 2: MongoDB Connection');
        try {
            const { MongoClient } = await import('mongodb');
            
            const client = new MongoClient(MONGODB_URI, {
                serverSelectionTimeoutMS: 5000,
                connectTimeoutMS: 10000
            });
            
            await client.connect();
            
            // Test the connection
            await client.db('admin').command({ ping: 1 });
            
            const db = client.db('pixelninjakitties');
            const collections = await db.listCollections().toArray();
            
            result.tests.mongodb = {
                status: '✅ Connected',
                database: 'pixelninjakitties',
                collections: collections.map(c => c.name)
            };
            
            await client.close();
            console.log('✅ MongoDB connection successful');
        } catch (mongoError) {
            result.tests.mongodb = {
                status: '❌ Failed',
                error: mongoError.message
            };
            console.error('❌ MongoDB connection failed:', mongoError);
        }

        // Test 3: MongoDB Helper Functions
        console.log('🧪 Test 3: MongoDB Helper Functions');
        try {
            const { ensureConnection } = await import('../scripts/mongodb.js');
            
            await ensureConnection();
            
            result.tests.helpers = {
                status: '✅ Working',
                message: 'MongoDB helper functions work'
            };
            
            console.log('✅ MongoDB helper functions work');
        } catch (helperError) {
            result.tests.helpers = {
                status: '❌ Failed',
                error: helperError.message
            };
            console.error('❌ MongoDB helper functions failed:', helperError);
        }

        console.log('🧪 MongoDB test completed:', result);
        return res.status(200).json(result);

    } catch (error) {
        console.error('❌ MongoDB test failed:', error);
        return res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}