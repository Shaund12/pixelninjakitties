#!/usr/bin/env node

/**
 * Test the Supabase integration
 */

import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSupabaseIntegration() {
    console.log('🧪 Testing Supabase integration...');
    
    try {
        // Test 1: Check if required environment variables are set
        console.log('1. Checking environment variables...');
        const requiredEnvVars = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
        
        if (missingVars.length > 0) {
            console.log(`❌ Missing environment variables: ${missingVars.join(', ')}`);
            console.log('Set these variables and try again:');
            console.log('  SUPABASE_URL=https://your-project.supabase.co');
            console.log('  SUPABASE_ANON_KEY=your-anon-key-here');
            console.log('');
            console.log('ℹ️  Note: This test requires a configured Supabase project');
            return false;
        }
        
        console.log('✅ Environment variables are set');
        
        // Test 2: Import and test Supabase connection
        console.log('2. Testing Supabase connection...');
        
        try {
            const { connectToSupabase, isSupabaseConnected } = await import('./supabase.js');
            
            const connected = await connectToSupabase();
            
            if (connected && isSupabaseConnected()) {
                console.log('✅ Supabase connection successful');
            } else {
                console.log('❌ Supabase connection failed');
                return false;
            }
        } catch (connectionError) {
            console.log('❌ Supabase connection error:', connectionError.message);
            console.log('ℹ️  This is expected if you haven\'t set up the Supabase database yet');
            console.log('ℹ️  Run: npm run setup-supabase');
            return false;
        }
        
        // Test 3: Test database operations
        console.log('3. Testing database operations...');
        
        try {
            const { saveState, loadState } = await import('./supabase.js');
            
            // Test save state
            const testState = { test: true, timestamp: Date.now() };
            await saveState('test', testState);
            console.log('✅ State save successful');
            
            // Test load state
            const loadedState = await loadState('test');
            if (loadedState && loadedState.test === true) {
                console.log('✅ State load successful');
            } else {
                console.log('❌ State load failed - data mismatch');
                return false;
            }
        } catch (dbError) {
            console.log('❌ Database operations error:', dbError.message);
            console.log('ℹ️  This likely means the database schema is not set up');
            console.log('ℹ️  Run: npm run setup-supabase');
            return false;
        }
        
        // Test 4: Test task manager
        console.log('4. Testing task manager...');
        
        try {
            const { createTask, getTaskStatus, updateTask } = await import('./supabaseTaskManager.js');
            
            // Create a test task
            const taskId = await createTask(999, 'test-provider', {
                test: true,
                createdFrom: 'test'
            });
            console.log(`✅ Task creation successful: ${taskId}`);
            
            // Get task status
            const taskStatus = await getTaskStatus(taskId);
            if (taskStatus && taskStatus.status === 'pending') {
                console.log('✅ Task status retrieval successful');
            } else {
                console.log('❌ Task status retrieval failed');
                return false;
            }
            
            // Update task
            await updateTask(taskId, {
                progress: 50,
                message: 'Test update'
            });
            console.log('✅ Task update successful');
            
        } catch (taskError) {
            console.log('❌ Task manager error:', taskError.message);
            console.log('ℹ️  This likely means the database schema is not set up');
            console.log('ℹ️  Run: npm run setup-supabase');
            return false;
        }
        
        console.log('');
        console.log('🎉 All tests passed! Supabase integration is working correctly.');
        console.log('');
        console.log('Next steps:');
        console.log('1. Update your cron job to use the Supabase version');
        console.log('2. Set up proper environment variables in production');
        console.log('3. Configure Row Level Security (RLS) policies if needed');
        
        return true;
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Run the test
testSupabaseIntegration().then(success => {
    process.exit(success ? 0 : 1);
}).catch(error => {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
});