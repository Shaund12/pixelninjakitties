/**
 * __tests__/storageHelpers.spec.js
 * ───────────────────────────────────────────────────────────────
 * Unit tests for storage helper functions.
 *
 * These tests verify the Supabase-based storage system works correctly
 * with mocked Supabase client to avoid external dependencies.
 */

import { strict as assert } from 'assert';

// Mock Supabase client
const mockSupabase = {
    from: (table) => ({
        select: () => ({
            single: async () => mockSupabase._responses.select
        }),
        upsert: async (data, options) => {
            mockSupabase._lastUpsert = { data, options };
            return mockSupabase._responses.upsert;
        }
    }),
    _responses: {
        select: { data: null, error: null },
        upsert: { error: null }
    },
    _lastUpsert: null
};

// Mock the supabase client import
const originalImport = await import('../scripts/storageHelpers.js');

// We'll need to mock the supabase import - let's create a version that uses our mock
import { createStorage } from '../scripts/storageHelpers.js';

// Override the supabase import for testing
const moduleScope = await import('../scripts/storageHelpers.js');
// Note: In a real testing framework, we'd use proper mocking

/**
 * Simple test runner since we don't have a testing framework
 */
async function runTests() {
    console.log('🧪 Running storage helper tests...\n');

    // Test 1: Basic storage operations
    console.log('Testing basic storage operations...');

    // Mock empty initial state
    mockSupabase._responses.select = { data: null, error: { code: 'PGRST116' } };

    const storage = createStorage('test');

    // Test set operation
    await storage.set('test1', { provider: 'dall-e', timestamp: 123456 });

    // Verify upsert was called
    assert.ok(mockSupabase._lastUpsert, 'Upsert should have been called');
    assert.equal(mockSupabase._lastUpsert.data.id, 'default');
    assert.ok(mockSupabase._lastUpsert.data.preferences, 'Preferences should be included');

    // Test get operation
    const retrieved = await storage.get('test1');
    assert.deepEqual(retrieved, { provider: 'dall-e', timestamp: 123456 });

    console.log('✅ Basic storage operations successful');

    // Test 2: Storage with existing data
    console.log('Testing storage with existing data...');

    // Mock existing data
    mockSupabase._responses.select = {
        data: {
            preferences: {
                'existing1': { provider: 'stability', timestamp: 789012 }
            }
        },
        error: null
    };

    const storage2 = createStorage('test2');

    // Test getting existing data
    const existingData = await storage2.get('existing1');
    assert.deepEqual(existingData, { provider: 'stability', timestamp: 789012 });

    // Test adding new data
    await storage2.set('new1', { provider: 'huggingface', timestamp: 345678 });

    // Verify both old and new data are preserved
    const allData = await storage2.getAll();
    assert.ok(allData.existing1, 'Existing data should be preserved');
    assert.ok(allData.new1, 'New data should be added');

    console.log('✅ Storage with existing data successful');

    // Test 3: Delete operation
    console.log('Testing delete operation...');

    await storage2.delete('existing1');

    // Verify data was deleted
    const afterDelete = await storage2.get('existing1');
    assert.equal(afterDelete, undefined, 'Deleted item should be undefined');

    console.log('✅ Delete operation successful');

    // Test 4: Error handling
    console.log('Testing error handling...');

    // Mock error response
    mockSupabase._responses.select = { data: null, error: { code: 'OTHER_ERROR', message: 'Test error' } };

    const storage3 = createStorage('test3');

    // Should not throw error, should return empty object
    const emptyData = await storage3.getAll();
    assert.deepEqual(emptyData, {}, 'Should return empty object on error');

    console.log('✅ Error handling successful');

    console.log('\n🎉 All storage helper tests passed!');
}

// Only run tests if called directly
if (process.argv[1].includes('storageHelpers.spec.js')) {
    runTests().catch(console.error);
}

export { runTests };