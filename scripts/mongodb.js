/**
 * Database Connection and Utility Module
 * Handles database connection, task storage, and state persistence
 * Supports both MongoDB and Supabase/PostgreSQL
 */

import { MongoClient } from 'mongodb';
import { createClient } from '@supabase/supabase-js';

let client = null;
let db = null;
let isConnected = false;

// Supabase client
let supabase = null;
let useSupabase = false;

/**
 * Initialize database connection (MongoDB or Supabase)
 * @returns {Promise<boolean>} - Connection success
 */
export async function ensureConnection() {
    // Check if we should use Supabase
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    const mongoUri = process.env.MONGODB_URI;
    
    if (supabaseUrl && supabaseKey) {
        useSupabase = true;
        if (!isConnected) {
            return await connectToSupabase();
        }
        // Test existing connection
        try {
            const { data, error } = await supabase
                .from('state')
                .select('type')
                .limit(1);
            
            if (error && error.code === '42P01') {
                // Table doesn't exist, create it
                await createSupabaseStateTable();
            } else if (error) {
                throw error;
            }
            
            return true;
        } catch (error) {
            console.error('❌ Supabase connection test failed:', error);
            isConnected = false;
            return await connectToSupabase();
        }
    } else if (mongoUri) {
        useSupabase = false;
        if (!isConnected) {
            return await connectToMongoDB();
        }
        // Test existing MongoDB connection
        try {
            await client.db('admin').command({ ping: 1 });
            return true;
        } catch (error) {
            console.error('❌ MongoDB connection test failed:', error);
            isConnected = false;
            return await connectToMongoDB();
        }
    } else {
        throw new Error('No database configuration found. Please set either SUPABASE_URL/SUPABASE_ANON_KEY or MONGODB_URI');
    }
}

/**
 * Initialize Supabase connection
 * @returns {Promise<boolean>} - Connection success
 */
async function connectToSupabase() {
    try {
        if (supabase && isConnected) {
            return true;
        }
        
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_ANON_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY environment variables not set');
        }
        
        supabase = createClient(supabaseUrl, supabaseKey);
        
        // Test connection by trying to access the state table
        const { data, error } = await supabase
            .from('state')
            .select('type')
            .limit(1);
        
        if (error && error.code === '42P01') {
            // Table doesn't exist, create it
            console.log('📋 Creating missing Supabase tables...');
            await createSupabaseStateTable();
            console.log('✅ Supabase tables created');
        } else if (error) {
            throw error;
        }
        
        isConnected = true;
        console.log('✅ Connected to Supabase successfully');
        
        // Initialize database structure
        await initializeDatabaseStructure();
        
        return true;
    } catch (error) {
        console.error('❌ Supabase connection failed:', error);
        isConnected = false;
        return false;
    }
}

/**
 * Create Supabase state table if it doesn't exist
 */
async function createSupabaseStateTable() {
    try {
        // Try to create the table by inserting a test record
        // This will fail if the table doesn't exist
        const { data: testData, error: testError } = await supabase
            .from('state')
            .insert({ type: 'test_table_exists', state: {}, updated_at: new Date() })
            .select();
        
        if (testError && testError.code === '42P01') {
            // Table doesn't exist, we need to create it
            console.log('📋 Table "state" does not exist, providing creation instructions...');
            
            const createTableSQL = `
-- Run this SQL in your Supabase SQL editor to create the missing table:

CREATE TABLE IF NOT EXISTS public.state (
    type VARCHAR(50) PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_state_updated_at ON public.state(updated_at);

-- Insert initial cron state
INSERT INTO public.state (type, state, updated_at) 
VALUES ('cron', '{"lastProcessedBlock": 0, "processedTokens": [], "pendingTasks": []}', NOW())
ON CONFLICT (type) DO NOTHING;
            `;
            
            console.log(createTableSQL);
            
            throw new Error(`Supabase table 'public.state' does not exist. Please run the SQL above in your Supabase dashboard's SQL editor to create it.`);
        } else if (testError) {
            throw testError;
        }
        
        // Clean up test record if successful
        if (testData && testData.length > 0) {
            await supabase.from('state').delete().eq('type', 'test_table_exists');
        }
        
        console.log('✅ Supabase state table verified');
        return true;
    } catch (error) {
        console.error('❌ Failed to create/verify Supabase state table:', error);
        throw error;
    }
}

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
 * Initialize database structure and create collections/tables if they don't exist
 */
async function initializeDatabaseStructure() {
    if (useSupabase) {
        // For Supabase, we've already created the state table
        console.log('✅ Database structure initialized');
        return;
    }
    
    // MongoDB initialization (existing code)
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
    if (useSupabase) {
        // For Supabase, indexes are typically created via SQL or dashboard
        console.log('✅ Database indexes handled by Supabase');
        return;
    }
    
    // MongoDB indexes (existing code)
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
 * Check if database is connected
 * @returns {boolean} - Connection status
 */
export function isMongoConnected() {
    return isConnected;
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
        if (useSupabase) {
            return await operation();
        } else {
            return await operation(db);
        }
    } catch (error) {
        console.error(`❌ ${operationName} failed:`, error);
        throw error;
    }
}

/**
 * Save application state to database
 * @param {string} type - State type (e.g., 'cron')
 * @param {Object} state - State data to save
 * @returns {Promise<boolean>} - Save success
 */
export async function saveState(type, state) {
    if (useSupabase) {
        return await withDatabase(async () => {
            const { data, error } = await supabase
                .from('state')
                .upsert({
                    type,
                    state,
                    updated_at: new Date()
                });
            
            if (error) {
                console.error(`❌ Save state (${type}) failed:`, error);
                throw error;
            }
            
            return true;
        }, `Save state (${type})`);
    } else {
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
}

/**
 * Load application state from database
 * @param {string} type - State type to load
 * @param {Object} defaultState - Default state if not found
 * @returns {Promise<Object>} - Loaded state
 */
export async function loadState(type, defaultState = {}) {
    if (useSupabase) {
        return await withDatabase(async () => {
            const { data, error } = await supabase
                .from('state')
                .select('state')
                .eq('type', type)
                .single();
            
            if (error) {
                if (error.code === 'PGRST116') {
                    // No rows found, return default state
                    return defaultState;
                }
                console.error(`❌ Load state (${type}) failed:`, error);
                throw error;
            }
            
            return data?.state || defaultState;
        }, `Load state (${type})`);
    } else {
        return await withDatabase(async (database) => {
            const doc = await database.collection('state').findOne({ type });
            return doc ? doc.state : defaultState;
        }, `Load state (${type})`);
    }
}

/**
 * Health check for database connection
 * @returns {Promise<Object>} - Health check result
 */
export async function mongoHealthCheck() {
    try {
        await ensureConnection();

        if (useSupabase) {
            const { data, error } = await supabase
                .from('state')
                .select('type')
                .limit(1);
            
            if (error && error.code !== 'PGRST116') {
                throw error;
            }
            
            return {
                status: 'healthy',
                connected: true,
                database: 'supabase',
                type: 'postgresql'
            };
        } else {
            const stats = await db.stats();
            const tasksCount = await db.collection('tasks').countDocuments();
            const stateCount = await db.collection('state').countDocuments();

            return {
                status: 'healthy',
                connected: true,
                database: db.databaseName,
                type: 'mongodb',
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
        }
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
    console.log('🔄 Shutting down database connection...');
    if (useSupabase) {
        // Supabase doesn't need explicit closing
        console.log('✅ Supabase connection closed');
    } else {
        await closeMongoDB();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('🔄 Shutting down database connection...');
    if (useSupabase) {
        // Supabase doesn't need explicit closing
        console.log('✅ Supabase connection closed');
    } else {
        await closeMongoDB();
    }
    process.exit(0);
});