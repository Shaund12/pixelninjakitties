#!/usr/bin/env node

/**
 * Simple test to verify Supabase task management works
 */

import { createTask, getTaskStatus, updateTask, completeTask } from './scripts/supabaseTaskManager.js';

async function testSupabaseTaskManager() {
    console.log('🧪 Testing Supabase Task Manager...');

    try {
        // Test 1: Create a task
        console.log('📝 Test 1: Creating a task...');
        const taskId = await createTask('12345', 'dall-e', {
            breed: 'Bengal',
            owner: '0x1234567890123456789012345678901234567890',
            timeout: 300000
        });
        console.log(`✅ Task created with ID: ${taskId}`);

        // Test 2: Get task status
        console.log('📊 Test 2: Getting task status...');
        const status = await getTaskStatus(taskId);
        console.log(`✅ Task status: ${status.status}`);

        // Test 3: Update task
        console.log('🔄 Test 3: Updating task...');
        await updateTask(taskId, {
            status: 'IN_PROGRESS',
            progress: 50,
            message: 'Processing image...'
        });
        console.log('✅ Task updated successfully');

        // Test 4: Complete task
        console.log('🎉 Test 4: Completing task...');
        await completeTask(taskId, {
            tokenURI: 'https://example.com/token/12345',
            metadata: { name: 'Test NFT' }
        });
        console.log('✅ Task completed successfully');

        // Test 5: Check final status
        console.log('🔍 Test 5: Checking final status...');
        const finalStatus = await getTaskStatus(taskId);
        console.log(`✅ Final status: ${finalStatus.status}`);
        console.log(`✅ Token URI: ${finalStatus.token_uri}`);

        console.log('\n🎉 All tests passed! Supabase task management is working correctly.');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

// Run the test
testSupabaseTaskManager();