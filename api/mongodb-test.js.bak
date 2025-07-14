/**
 * MongoDB Database Structure Test
 * Use this endpoint to test MongoDB connection and database initialization
 */

import { connectToMongoDB, getDatabase, mongoHealthCheck } from '../scripts/mongodb.js';

export default async function handler(req, res) {
    try {
        console.log('🧪 Testing MongoDB connection and database structure...');

        // Test connection
        const connected = await connectToMongoDB();
        if (!connected) {
            return res.status(500).json({
                error: 'Failed to connect to MongoDB',
                timestamp: new Date().toISOString()
            });
        }

        // Get database instance
        const db = getDatabase();

        // List collections
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(col => col.name);

        // Check if required collections exist
        const requiredCollections = ['tasks', 'state', 'metrics'];
        const missingCollections = requiredCollections.filter(name => !collectionNames.includes(name));

        // Get collection stats
        const collectionStats = {};
        for (const name of requiredCollections) {
            if (collectionNames.includes(name)) {
                try {
                    const count = await db.collection(name).countDocuments();
                    const indexes = await db.collection(name).indexes();
                    collectionStats[name] = {
                        documentCount: count,
                        indexCount: indexes.length,
                        indexes: indexes.map(idx => ({ name: idx.name, keys: idx.key }))
                    };
                } catch (error) {
                    collectionStats[name] = { error: error.message };
                }
            }
        }

        // Get health check
        const healthCheck = await mongoHealthCheck();

        const result = {
            status: 'success',
            timestamp: new Date().toISOString(),
            connection: {
                connected: true,
                database: db.databaseName
            },
            collections: {
                total: collectionNames.length,
                existing: collectionNames,
                required: requiredCollections,
                missing: missingCollections,
                stats: collectionStats
            },
            healthCheck
        };

        console.log('✅ MongoDB test completed successfully');
        return res.status(200).json(result);

    } catch (error) {
        console.error('❌ MongoDB test failed:', error);
        return res.status(500).json({
            status: 'error',
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString(),
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}