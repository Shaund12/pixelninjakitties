/**
 * MongoDB Connection and Utility Module
 * Handles database connection, task storage, and state persistence
 */

import { MongoClient } from 'mongodb';

let client = null;
let db = null;
let isConnected = false;

/**
 * Initialize MongoDB connection
 * @returns {Promise<boolean>} - Connection success
 */
export async function connectToMongoDB() {
    try {
        if (isConnected && client) {
            return true;
        }

        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI environment variable not set');
        }

        // Create MongoDB client with proper options
        client = new MongoClient(mongoUri, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            bufferMaxEntries: 0,
            useUnifiedTopology: true
        });

        // Connect to MongoDB
        await client.connect();

        // Test the connection
        await client.db('admin').command({ ping: 1 });

        db = client.db('pixelninjakitties');
        isConnected = true;

        console.log('✅ Connected to MongoDB successfully');

        // Initialize database structure and create indexes
        await initializeDatabaseStructure();
        await createIndexes();

        return true;
    } catch (error) {
        console.error('❌ MongoDB connection failed:', error);
        isConnected = false;
        return false;
    }
}

/**
 * Initialize database structure and create collections if they don't exist
 */
async function initializeDatabaseStructure() {
    try {
        // List existing collections
        const collections = await db.listCollections().toArray();
        const existingCollections = collections.map(col => col.name);

        // Define required collections with their initial structure
        const requiredCollections = [
            {
                name: 'tasks',
                validator: {
                    $jsonSchema: {
                        bsonType: 'object',
                        required: ['_id', 'taskId', 'tokenId', 'status', 'createdAt'],
                        properties: {
                            _id: { bsonType: 'string' },
                            taskId: { bsonType: 'string' },
                            tokenId: { bsonType: 'number' },
                            status: {
                                bsonType: 'string',
                                enum: ['pending', 'processing', 'completed', 'failed', 'canceled', 'timeout']
                            },
                            progress: { bsonType: 'number', minimum: 0, maximum: 100 },
                            createdAt: { bsonType: 'date' },
                            updatedAt: { bsonType: 'date' }
                        }
                    }
                }
            },
            {
                name: 'state',
                validator: {
                    $jsonSchema: {
                        bsonType: 'object',
                        required: ['type', 'updatedAt'],
                        properties: {
                            type: { bsonType: 'string' },
                            state: { bsonType: 'object' },
                            updatedAt: { bsonType: 'date' }
                        }
                    }
                }
            },
            {
                name: 'metrics',
                validator: {
                    $jsonSchema: {
                        bsonType: 'object',
                        required: ['type', 'updatedAt'],
                        properties: {
                            type: { bsonType: 'string' },
                            data: { bsonType: 'object' },
                            updatedAt: { bsonType: 'date' }
                        }
                    }
                }
            }
        ];

        // Create collections if they don't exist
        for (const collection of requiredCollections) {
            if (!existingCollections.includes(collection.name)) {
                await db.createCollection(collection.name, {
                    validator: collection.validator
                });
                console.log(`✅ Created collection: ${collection.name}`);
            } else {
                console.log(`✓ Collection already exists: ${collection.name}`);
            }
        }

        console.log('✅ Database structure initialized successfully');
    } catch (error) {
        console.error('⚠️ Database structure initialization failed:', error);
        throw error;
    }
}

/**
 * Create database indexes for optimal performance
 */
async function createIndexes() {
    try {
        // Tasks collection indexes
        await db.collection('tasks').createIndex({ tokenId: 1 });
        await db.collection('tasks').createIndex({ status: 1 });
        await db.collection('tasks').createIndex({ createdAt: 1 });
        await db.collection('tasks').createIndex({ updatedAt: 1 });
        await db.collection('tasks').createIndex({ taskId: 1 }, { unique: true });

        // State collection indexes
        await db.collection('state').createIndex({ type: 1 }, { unique: true });

        // Metrics collection indexes
        await db.collection('metrics').createIndex({ type: 1 }, { unique: true });

        console.log('✅ Database indexes created successfully');
    } catch (error) {
        console.error('⚠️ Index creation failed:', error);
    }
}

/**
 * Get MongoDB database instance
 * @returns {Db} - MongoDB database instance
 */
export function getDatabase() {
    if (!isConnected || !db) {
        throw new Error('MongoDB not connected. Call connectToMongoDB() first.');
    }
    return db;
}

/**
 * Get MongoDB client instance
 * @returns {MongoClient} - MongoDB client instance
 */
export function getClient() {
    if (!isConnected || !client) {
        throw new Error('MongoDB not connected. Call connectToMongoDB() first.');
    }
    return client;
}

/**
 * Close MongoDB connection
 */
export async function closeMongoDB() {
    try {
        if (client) {
            await client.close();
            client = null;
            db = null;
            isConnected = false;
            console.log('✅ MongoDB connection closed');
        }
    } catch (error) {
        console.error('❌ Error closing MongoDB connection:', error);
    }
}

/**
 * Check if MongoDB is connected
 * @returns {boolean} - Connection status
 */
export function isMongoConnected() {
    return isConnected;
}

/**
 * Ensure MongoDB connection is active
 * @returns {Promise<boolean>} - Connection success
 */
export async function ensureConnection() {
    if (!isConnected) {
        return await connectToMongoDB();
    }

    try {
        // Test the connection
        await client.db('admin').command({ ping: 1 });
        return true;
    } catch (error) {
        console.error('❌ MongoDB connection test failed:', error);
        isConnected = false;
        return await connectToMongoDB();
    }
}

/**
 * Generic database operation with error handling
 * @param {Function} operation - Database operation to execute
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<*>} - Operation result
 */
export async function withDatabase(operation, operationName = 'Database operation') {
    try {
        await ensureConnection();
        return await operation(db);
    } catch (error) {
        console.error(`❌ ${operationName} failed:`, error);
        throw error;
    }
}

/**
 * Save application state to MongoDB
 * @param {string} type - State type (e.g., 'cron')
 * @param {Object} state - State data to save
 * @returns {Promise<boolean>} - Save success
 */
export async function saveState(type, state) {
    return await withDatabase(async (database) => {
        const result = await database.collection('state').replaceOne(
            { type },
            {
                type,
                state,
                updatedAt: new Date()
            },
            { upsert: true }
        );
        return result.acknowledged;
    }, `Save state (${type})`);
}

/**
 * Load application state from MongoDB
 * @param {string} type - State type to load
 * @param {Object} defaultState - Default state if not found
 * @returns {Promise<Object>} - Loaded state
 */
export async function loadState(type, defaultState = {}) {
    return await withDatabase(async (database) => {
        const doc = await database.collection('state').findOne({ type });
        return doc ? doc.state : defaultState;
    }, `Load state (${type})`);
}

/**
 * Health check for MongoDB connection
 * @returns {Promise<Object>} - Health check result
 */
export async function mongoHealthCheck() {
    try {
        await ensureConnection();

        const stats = await db.stats();
        const tasksCount = await db.collection('tasks').countDocuments();
        const stateCount = await db.collection('state').countDocuments();

        return {
            status: 'healthy',
            connected: true,
            database: db.databaseName,
            collections: {
                tasks: tasksCount,
                state: stateCount
            },
            dbStats: {
                storageSize: stats.storageSize,
                dataSize: stats.dataSize,
                indexes: stats.indexes
            }
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            connected: false,
            error: error.message
        };
    }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
    console.log('🔄 Shutting down MongoDB connection...');
    await closeMongoDB();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Shutting down MongoDB connection...');
    await closeMongoDB();
    process.exit(0);
});