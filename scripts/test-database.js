#!/usr/bin/env node

/**
 * Simple test script to verify database connection logic
 */

async function testDatabaseConfiguration() {
    console.log('🔄 Testing database configuration detection...');
    
    // Test 1: No configuration
    console.log('\n1. Testing no configuration:');
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.MONGODB_URI;
    
    try {
        const { ensureConnection } = await import('./mongodb.js');
        await ensureConnection();
        console.log('❌ Expected error but connection succeeded');
    } catch (error) {
        if (error.message.includes('No database configuration found')) {
            console.log('✅ Correctly detected missing database configuration');
        } else {
            console.log('❌ Unexpected error:', error.message);
        }
    }
    
    // Test 2: MongoDB configuration
    console.log('\n2. Testing MongoDB configuration:');
    process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
    
    try {
        // Need to re-import to get fresh module state
        const { ensureConnection } = await import('./mongodb.js?' + Date.now());
        await ensureConnection();
        console.log('✅ MongoDB connection attempted (expected to fail without server)');
    } catch (error) {
        if (error.message.includes('MongoDB') || error.message.includes('ECONNREFUSED')) {
            console.log('✅ Correctly attempted MongoDB connection');
        } else {
            console.log('❌ Unexpected MongoDB error:', error.message);
        }
    }
    
    // Test 3: Supabase configuration
    console.log('\n3. Testing Supabase configuration:');
    delete process.env.MONGODB_URI;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'mock_key';
    
    try {
        // Need to re-import to get fresh module state
        const { ensureConnection } = await import('./mongodb.js?' + Date.now());
        await ensureConnection();
        console.log('✅ Supabase connection attempted (expected to fail with mock credentials)');
    } catch (error) {
        if (error.message.includes('Supabase') || error.message.includes('Failed to parse')) {
            console.log('✅ Correctly attempted Supabase connection');
        } else {
            console.log('❌ Unexpected Supabase error:', error.message);
        }
    }
}

async function testCodeSyntax() {
    console.log('🔄 Testing code syntax and imports...');
    
    try {
        const mongoModule = await import('./mongodb.js');
        console.log('✅ mongodb.js imports successfully');
        
        // Test that all expected functions are exported
        const expectedExports = ['ensureConnection', 'saveState', 'loadState', 'mongoHealthCheck'];
        for (const exportName of expectedExports) {
            if (typeof mongoModule[exportName] === 'function') {
                console.log(`✅ ${exportName} is exported as function`);
            } else {
                console.log(`❌ ${exportName} is not exported or not a function`);
            }
        }
    } catch (error) {
        console.log('❌ Failed to import mongodb.js:', error.message);
    }
}

async function runTests() {
    console.log('🚀 Starting database configuration tests...\n');
    
    await testCodeSyntax();
    console.log('');
    
    await testDatabaseConfiguration();
    console.log('');
    
    console.log('✅ All tests completed');
}

runTests().catch(console.error);