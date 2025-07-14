/**
 * Final comprehensive test for serverless functions
 * This tests the complete system readiness for deployment
 */

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🎯 Running final comprehensive serverless test...');

    try {
        const results = {
            status: 'success',
            timestamp: new Date().toISOString(),
            final_test: {
                summary: {},
                tests: {},
                deployment_ready: false,
                next_steps: []
            }
        };

        // Test 1: Core Function Imports
        console.log('🧪 Test 1: Core Function Imports');
        const functionTests = {};
        
        try {
            const cronModule = await import('./cron.js');
            functionTests.cron = typeof cronModule.default === 'function' ? '✅ Ready' : '❌ Not a function';
        } catch (error) {
            functionTests.cron = `❌ Failed: ${error.message}`;
        }

        try {
            const indexModule = await import('./index.js');
            functionTests.index = typeof indexModule.default === 'function' ? '✅ Ready' : '❌ Not a function';
        } catch (error) {
            functionTests.index = `❌ Failed: ${error.message}`;
        }

        try {
            const healthModule = await import('./health.js');
            functionTests.health = typeof healthModule.default === 'function' ? '✅ Ready' : '❌ Not a function';
        } catch (error) {
            functionTests.health = `❌ Failed: ${error.message}`;
        }

        results.final_test.tests.functions = functionTests;

        // Test 2: Critical Dependencies
        console.log('🧪 Test 2: Critical Dependencies');
        const dependencyTests = {};
        
        try {
            const { finalizeMint } = await import('../scripts/finalizeMint.js');
            dependencyTests.finalizeMint = typeof finalizeMint === 'function' ? '✅ Ready' : '❌ Not a function';
        } catch (error) {
            dependencyTests.finalizeMint = `❌ Failed: ${error.message}`;
        }

        try {
            const { createTask } = await import('../scripts/taskManager.js');
            dependencyTests.taskManager = typeof createTask === 'function' ? '✅ Ready' : '❌ Not a function';
        } catch (error) {
            dependencyTests.taskManager = `❌ Failed: ${error.message}`;
        }

        try {
            const { ensureConnection } = await import('../scripts/mongodb.js');
            dependencyTests.mongodb = typeof ensureConnection === 'function' ? '✅ Ready' : '❌ Not a function';
        } catch (error) {
            dependencyTests.mongodb = `❌ Failed: ${error.message}`;
        }

        results.final_test.tests.dependencies = dependencyTests;

        // Test 3: Environment Configuration
        console.log('🧪 Test 3: Environment Configuration');
        const requiredEnvVars = [
            'RPC_URL', 'CONTRACT_ADDRESS', 'PRIVATE_KEY', 
            'MONGODB_URI', 'PLACEHOLDER_URI'
        ];
        const optionalEnvVars = [
            'OPENAI_API_KEY', 'HUGGING_FACE_TOKEN', 'STABILITY_API_KEY'
        ];

        const missingRequired = requiredEnvVars.filter(varName => !process.env[varName]);
        const missingOptional = optionalEnvVars.filter(varName => !process.env[varName]);

        results.final_test.tests.environment = {
            required: {
                total: requiredEnvVars.length,
                missing: missingRequired.length,
                status: missingRequired.length === 0 ? '✅ All configured' : `❌ Missing ${missingRequired.length}`,
                missing_vars: missingRequired
            },
            optional: {
                total: optionalEnvVars.length,
                missing: missingOptional.length,
                status: missingOptional.length === 0 ? '✅ All configured' : `⚠️ Missing ${missingOptional.length}`,
                missing_vars: missingOptional
            }
        };

        // Test 4: Vercel Configuration
        console.log('🧪 Test 4: Vercel Configuration');
        let vercelConfig = null;
        try {
            const fs = await import('fs/promises');
            const vercelData = await fs.readFile('./vercel.json', 'utf8');
            vercelConfig = JSON.parse(vercelData);
            
            results.final_test.tests.vercel = {
                status: '✅ Configuration valid',
                has_cron: !!vercelConfig.crons,
                cron_schedule: vercelConfig.crons?.[0]?.schedule || 'none',
                max_duration: vercelConfig.functions?.['api/cron.js']?.maxDuration || 'default'
            };
        } catch (error) {
            results.final_test.tests.vercel = {
                status: `❌ Failed: ${error.message}`
            };
        }

        // Test 5: Overall Assessment
        console.log('🧪 Test 5: Overall Assessment');
        const functionErrors = Object.values(functionTests).filter(status => status.includes('❌')).length;
        const dependencyErrors = Object.values(dependencyTests).filter(status => status.includes('❌')).length;
        const totalErrors = functionErrors + dependencyErrors;

        results.final_test.summary = {
            total_functions: Object.keys(functionTests).length,
            working_functions: Object.keys(functionTests).length - functionErrors,
            total_dependencies: Object.keys(dependencyTests).length,
            working_dependencies: Object.keys(dependencyTests).length - dependencyErrors,
            required_env_vars: requiredEnvVars.length,
            configured_env_vars: requiredEnvVars.length - missingRequired.length,
            errors: totalErrors
        };

        // Deployment readiness assessment
        const isDeploymentReady = totalErrors === 0 && missingRequired.length === 0;
        results.final_test.deployment_ready = isDeploymentReady;

        // Next steps
        if (totalErrors > 0) {
            results.final_test.next_steps.push('Fix code errors in serverless functions');
        }
        if (missingRequired.length > 0) {
            results.final_test.next_steps.push('Configure required environment variables in Vercel');
        }
        if (missingOptional.length > 0) {
            results.final_test.next_steps.push('Configure at least one AI provider API key');
        }
        if (isDeploymentReady) {
            results.final_test.next_steps.push('✅ Ready for production deployment');
        }

        results.final_test.status = isDeploymentReady ? 
            '✅ Ready for deployment' : 
            `⚠️ ${totalErrors} errors, ${missingRequired.length} missing env vars`;

        console.log('🎯 Final comprehensive test completed:', results.final_test.summary);
        return res.status(200).json(results);

    } catch (error) {
        console.error('❌ Final comprehensive test failed:', error);
        return res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}