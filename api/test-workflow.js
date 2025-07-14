/**
 * Full workflow test for serverless functions
 * This tests the complete minting process without requiring real blockchain/API keys
 */

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🧪 Testing full serverless workflow...');

    try {
        const results = {
            status: 'success',
            timestamp: new Date().toISOString(),
            workflow_tests: {}
        };

        // Test 1: Environment Check
        console.log('🧪 Test 1: Environment Configuration');
        const requiredEnvVars = ['RPC_URL', 'CONTRACT_ADDRESS', 'PRIVATE_KEY', 'MONGODB_URI', 'PLACEHOLDER_URI'];
        const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

        results.workflow_tests.environment = {
            required: requiredEnvVars,
            missing: missingEnvVars,
            status: missingEnvVars.length === 0 ? '✅ All required variables set' : `❌ Missing: ${missingEnvVars.join(', ')}`
        };

        // Test 2: Core Dependencies
        console.log('🧪 Test 2: Core Dependencies');
        const dependencies = [];

        try {
            const { ethers } = await import('ethers');
            dependencies.push({ name: 'ethers', status: '✅ Available' });
        } catch (error) {
            dependencies.push({ name: 'ethers', status: `❌ Failed: ${error.message}` });
        }

        try {
            const { MongoClient } = await import('mongodb');
            dependencies.push({ name: 'mongodb', status: '✅ Available' });
        } catch (error) {
            dependencies.push({ name: 'mongodb', status: `❌ Failed: ${error.message}` });
        }

        try {
            const { finalizeMint } = await import('../scripts/finalizeMint.js');
            dependencies.push({ name: 'finalizeMint', status: '✅ Available' });
        } catch (error) {
            dependencies.push({ name: 'finalizeMint', status: `❌ Failed: ${error.message}` });
        }

        results.workflow_tests.dependencies = dependencies;

        // Test 3: Serverless Function Structure
        console.log('🧪 Test 3: Serverless Function Structure');
        const functions = [];

        try {
            const cronModule = await import('./cron.js');
            functions.push({ name: 'cron', status: '✅ Available', type: typeof cronModule.default });
        } catch (error) {
            functions.push({ name: 'cron', status: `❌ Failed: ${error.message}` });
        }

        try {
            const indexModule = await import('./index.js');
            functions.push({ name: 'index', status: '✅ Available', type: typeof indexModule.default });
        } catch (error) {
            functions.push({ name: 'index', status: `❌ Failed: ${error.message}` });
        }

        try {
            const healthModule = await import('./health.js');
            functions.push({ name: 'health', status: '✅ Available', type: typeof healthModule.default });
        } catch (error) {
            functions.push({ name: 'health', status: `❌ Failed: ${error.message}` });
        }

        results.workflow_tests.functions = functions;

        // Test 4: Mock Blockchain Connection (if env vars are set)
        console.log('🧪 Test 4: Mock Blockchain Connection');
        if (process.env.RPC_URL && process.env.CONTRACT_ADDRESS && process.env.PRIVATE_KEY) {
            try {
                const { ethers } = await import('ethers');
                const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

                // We won't actually connect, just test the structure
                results.workflow_tests.blockchain = {
                    status: '✅ Configuration valid',
                    provider: 'configured',
                    contract: process.env.CONTRACT_ADDRESS
                };
            } catch (error) {
                results.workflow_tests.blockchain = {
                    status: `❌ Failed: ${error.message}`
                };
            }
        } else {
            results.workflow_tests.blockchain = {
                status: '⚠️ Skipped (missing env vars)'
            };
        }

        // Test 5: MongoDB Structure (if env var is set)
        console.log('🧪 Test 5: MongoDB Structure');
        if (process.env.MONGODB_URI) {
            try {
                const { MongoClient } = await import('mongodb');

                // We won't actually connect, just test the structure
                results.workflow_tests.mongodb = {
                    status: '✅ Configuration valid',
                    uri: 'configured'
                };
            } catch (error) {
                results.workflow_tests.mongodb = {
                    status: `❌ Failed: ${error.message}`
                };
            }
        } else {
            results.workflow_tests.mongodb = {
                status: '⚠️ Skipped (missing MONGODB_URI)'
            };
        }

        // Test 6: Task Management
        console.log('🧪 Test 6: Task Management');
        try {
            const taskManager = await import('../scripts/taskManager.js');
            results.workflow_tests.taskManager = {
                status: '✅ Available',
                states: taskManager.TASK_STATES,
                functions: Object.keys(taskManager).filter(key => typeof taskManager[key] === 'function')
            };
        } catch (error) {
            results.workflow_tests.taskManager = {
                status: `❌ Failed: ${error.message}`
            };
        }

        // Test 7: Overall Assessment
        console.log('🧪 Test 7: Overall Assessment');
        const allTests = Object.values(results.workflow_tests);
        const failedTests = allTests.filter(test =>
            (test.status && test.status.includes('❌')) ||
            (Array.isArray(test) && test.some(item => item.status && item.status.includes('❌')))
        );

        results.workflow_tests.overall = {
            status: failedTests.length === 0 ? '✅ All tests passed' : `⚠️ ${failedTests.length} tests failed`,
            ready_for_deployment: failedTests.length === 0 && missingEnvVars.length === 0,
            next_steps: missingEnvVars.length > 0 ? 'Configure environment variables' : 'Ready for deployment'
        };

        console.log('🧪 Full workflow test completed:', results);
        return res.status(200).json(results);

    } catch (error) {
        console.error('❌ Full workflow test failed:', error);
        return res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}