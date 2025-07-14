/**
 * Test script to verify Supabase integration
 * This will verify all the core functionality works with Supabase
 */

import {
    createTask,
    updateTask,
    getTaskStatus,
    completeTask,
    failTask,
    cancelTask,
    getTasks,
    getTaskMetrics,
    cleanupTasks,
    TASK_STATES
} from './scripts/taskManager.js';

import {
    saveState,
    loadState,
    ensureConnection,
    supabaseHealthCheck
} from './scripts/supabase.js';

// Test configuration
const TEST_CONFIG = {
    skipTests: !process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY,
    testTokenId: 999999,
    testProvider: 'dall-e'
};

console.log('🧪 Starting Supabase Integration Test');

if (TEST_CONFIG.skipTests) {
    console.log('⏭️ Skipping tests - SUPABASE_URL and SUPABASE_ANON_KEY must be set');
    process.exit(0);
}

async function runTests() {
    let testsPassed = 0;
    let testsFailed = 0;
    let taskId = null;

    try {
        // Test 1: Connection
        console.log('\n🔍 Test 1: Supabase Connection');
        const healthResult = await supabaseHealthCheck();
        if (healthResult.status === 'healthy') {
            console.log('✅ Supabase connection successful');
            testsPassed++;
        } else {
            console.log('❌ Supabase connection failed:', healthResult.error);
            testsFailed++;
        }

        // Test 2: State Operations
        console.log('\n🔍 Test 2: State Operations');
        const testStateData = { test: true, timestamp: Date.now() };
        await saveState('test_state', testStateData);
        const loadedState = await loadState('test_state');

        if (loadedState.test === true && loadedState.timestamp === testStateData.timestamp) {
            console.log('✅ State save/load successful');
            testsPassed++;
        } else {
            console.log('❌ State save/load failed');
            testsFailed++;
        }

        // Test 3: Task Creation
        console.log('\n🔍 Test 3: Task Creation');
        taskId = await createTask(TEST_CONFIG.testTokenId, TEST_CONFIG.testProvider, {
            breed: 'Shadow',
            buyer: '0x1234567890123456789012345678901234567890',
            createdFrom: 'test',
            priority: 'high'
        });

        if (taskId && taskId.startsWith('task_')) {
            console.log('✅ Task creation successful:', taskId);
            testsPassed++;
        } else {
            console.log('❌ Task creation failed');
            testsFailed++;
        }

        // Test 4: Task Status Retrieval
        console.log('\n🔍 Test 4: Task Status Retrieval');
        const taskStatus = await getTaskStatus(taskId);

        if (taskStatus && taskStatus.status === TASK_STATES.PENDING) {
            console.log('✅ Task status retrieval successful');
            testsPassed++;
        } else {
            console.log('❌ Task status retrieval failed');
            testsFailed++;
        }

        // Test 5: Task Update
        console.log('\n🔍 Test 5: Task Update');
        const updatedTask = await updateTask(taskId, {
            status: TASK_STATES.PROCESSING,
            progress: 50,
            message: 'Test update'
        });

        if (updatedTask && updatedTask.status === TASK_STATES.PROCESSING && updatedTask.progress === 50) {
            console.log('✅ Task update successful');
            testsPassed++;
        } else {
            console.log('❌ Task update failed');
            testsFailed++;
        }

        // Test 6: Task Completion
        console.log('\n🔍 Test 6: Task Completion');
        const completedTask = await completeTask(taskId, {
            tokenURI: 'ipfs://test-hash',
            provider: TEST_CONFIG.testProvider
        });

        if (completedTask && completedTask.status === TASK_STATES.COMPLETED) {
            console.log('✅ Task completion successful');
            testsPassed++;
        } else {
            console.log('❌ Task completion failed');
            testsFailed++;
        }

        // Test 7: Task Retrieval with Filters
        console.log('\n🔍 Test 7: Task Retrieval with Filters');
        const tasks = await getTasks({
            status: TASK_STATES.COMPLETED,
            tokenId: TEST_CONFIG.testTokenId
        });

        if (tasks && tasks.length > 0 && tasks[0].taskId === taskId) {
            console.log('✅ Task retrieval with filters successful');
            testsPassed++;
        } else {
            console.log('❌ Task retrieval with filters failed');
            testsFailed++;
        }

        // Test 8: Metrics Retrieval
        console.log('\n🔍 Test 8: Metrics Retrieval');
        const metrics = await getTaskMetrics();

        if (metrics && typeof metrics.totalTasks === 'number') {
            console.log('✅ Metrics retrieval successful');
            testsPassed++;
        } else {
            console.log('❌ Metrics retrieval failed');
            testsFailed++;
        }

        // Test 9: Cleanup
        console.log('\n🔍 Test 9: Cleanup');
        // This should cleanup the test task since it's completed
        const cleanupCount = await cleanupTasks(0); // 0 age = cleanup all completed tasks

        if (typeof cleanupCount === 'number') {
            console.log('✅ Cleanup successful, cleaned up:', cleanupCount);
            testsPassed++;
        } else {
            console.log('❌ Cleanup failed');
            testsFailed++;
        }

    } catch (error) {
        console.error('❌ Test suite failed:', error);
        testsFailed++;
    }

    // Summary
    console.log('\n📊 Test Summary:');
    console.log(`✅ Passed: ${testsPassed}`);
    console.log(`❌ Failed: ${testsFailed}`);
    console.log(`🎯 Total: ${testsPassed + testsFailed}`);

    if (testsFailed === 0) {
        console.log('🎉 All tests passed! Supabase integration is working correctly.');
    } else {
        console.log('⚠️ Some tests failed. Please review the Supabase configuration.');
    }

    process.exit(testsFailed > 0 ? 1 : 0);
}

runTests().catch(console.error);