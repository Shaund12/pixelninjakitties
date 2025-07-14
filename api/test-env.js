/**
 * Simple cron environment test
 * Tests basic connectivity and environment without running full finalizeMint
 */

import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    console.log('🧪 Testing cron environment...');

    try {
        const result = {
            status: 'success',
            timestamp: new Date().toISOString(),
            environment: {},
            tests: {}
        };

        // ✅ Environment variable checks
        console.log('🧪 Test 1: Environment Variables');
        const requiredEnvVars = [
            'RPC_URL',
            'CONTRACT_ADDRESS',
            'PRIVATE_KEY',
            'PLACEHOLDER_URI',
            'SUPABASE_URL',
            'SUPABASE_ANON_KEY'
        ];

        for (const envVar of requiredEnvVars) {
            result.environment[envVar] = process.env[envVar] ? '✅ Set' : '❌ Missing';
        }

        result.environment.IMAGE_PROVIDER = process.env.IMAGE_PROVIDER || 'dall-e (default)';
        result.environment.OPENAI_API_KEY = process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing';

        // ✅ Supabase connection
        console.log('🧪 Test 2: Supabase Connection');
        try {
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_ANON_KEY;

            if (!supabaseUrl || !supabaseKey) {
                throw new Error('Supabase environment variables not configured');
            }

            const supabase = createClient(supabaseUrl, supabaseKey);
            const { error } = await supabase.from('tasks').select('id').limit(1);
            if (error) throw error;

            result.tests.supabase = '✅ Connected';
        } catch (supabaseError) {
            result.tests.supabase = `❌ Failed: ${supabaseError.message}`;
        }

        // ✅ Blockchain connection
        console.log('🧪 Test 3: Blockchain Connection');
        try {
            if (process.env.RPC_URL) {
                const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
                const blockNumber = await provider.getBlockNumber();
                result.tests.blockchain = `✅ Connected (Block: ${blockNumber})`;
            } else {
                result.tests.blockchain = '❌ RPC_URL not configured';
            }
        } catch (blockchainError) {
            result.tests.blockchain = `❌ Failed: ${blockchainError.message}`;
        }

        // ✅ Temporary directory access
        console.log('🧪 Test 4: Temporary Directory');
        try {
            const os = await import('os');
            const fs = await import('fs/promises');
            const path = await import('path');

            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'test-'));
            await fs.rmdir(tmpDir);
            result.tests.tempDir = '✅ Accessible';
        } catch (tempError) {
            result.tests.tempDir = `❌ Failed: ${tempError.message}`;
        }

        // ✅ finalizeMint import check
        console.log('🧪 Test 5: finalizeMint import');
        try {
            const { finalizeMint } = await import('../scripts/finalizeMint.js');
            result.tests.finalizeMintImport = typeof finalizeMint === 'function' ? '✅ Imported' : '❌ Not a function';
        } catch (importError) {
            result.tests.finalizeMintImport = `❌ Failed: ${importError.message}`;
        }

        console.log('🧪 Environment test completed:', result);
        return res.status(200).json(result);

    } catch (error) {
        console.error('❌ Environment test failed:', error);
        return res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
}
