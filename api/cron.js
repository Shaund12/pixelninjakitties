import { ethers } from 'ethers';
import { finalizeMint } from '../scripts/finalizeMint.js';
import { createTask, updateTask, completeTask, failTask, getTaskStatus, TASK_STATES } from '../scripts/supabaseTaskManager.js';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Default state structure for cron system
const DEFAULT_STATE = {
    lastProcessedBlock: 0,
    processedTokens: new Set(),
    pendingTasks: []
};

// Supabase state keys
const STATE_KEYS = {
    LAST_BLOCK: 'lastProcessedBlock',
    PROCESSED_TOKENS: 'processedTokens',
    PENDING_TASKS: 'pendingTasks'
};

// Create system_state table if it doesn't exist
// Simplified and more robust table check function
async function ensureSystemStateTable() {
    try {
        console.log('🔧 Checking for system_state table...');

        // Attempt to access the table directly with a simple query
        // This avoids the empty error message issue
        const { data, error } = await supabase
            .from('system_state')
            .select('key')
            .limit(1);

        // Handle table not existing
        if (error && error.code === '42P01') {
            console.log('⚠️ system_state table does not exist - please create it manually');
            console.log(`
                CREATE TABLE public.system_state (
                    key TEXT PRIMARY KEY,
                    value JSONB NOT NULL,
                    created_at TIMESTAMPTZ DEFAULT now(),
                    updated_at TIMESTAMPTZ DEFAULT now()
                );
                
                ALTER TABLE public.system_state ENABLE ROW LEVEL SECURITY;
                
                CREATE POLICY "Allow full access to system_state" 
                ON public.system_state 
                FOR ALL 
                USING (true)
                WITH CHECK (true);
            `);
            return false;
        } 
        // Other errors (permissions, etc.)
        else if (error) {
            console.error('❌ Error checking system_state table:', error);
            // Continue anyway since the state persistence seems to work
            return true;
        }

        console.log('✅ system_state table exists and is accessible');
        return true;
    } catch (err) {
        // Even if there's an error, we'll continue since state persistence works
        console.error('❌ Error checking system_state table:', err);
        return true;
    }
}

// Get a value from system state
async function getStateValue(key) {
    try {
        const { data, error } = await supabase
            .from('system_state')
            .select('value')
            .eq('key', key)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log(`📊 No existing value for ${key}, using default`);
                return null; // Not found is ok
            }
            console.error(`❌ Error fetching ${key}:`, error);
            return null;
        }

        return data?.value;
    } catch (err) {
        console.error(`❌ Failed to get state for ${key}:`, err);
        return null;
    }
}

// Save a value to system state
async function saveStateValue(key, value) {
    try {
        const { error } = await supabase
            .from('system_state')
            .upsert({
                key,
                value,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'key'
            });

        if (error) {
            console.error(`❌ Error saving ${key}:`, error);
            return false;
        }

        return true;
    } catch (err) {
        console.error(`❌ Failed to save state for ${key}:`, err);
        return false;
    }
}

// Load cron state from Supabase
async function loadCronState() {
    try {
        // Ensure the system_state table exists
        await ensureSystemStateTable();

        // Load each part of the state
        const lastBlock = await getStateValue(STATE_KEYS.LAST_BLOCK) || 0;
        const processedTokensArray = await getStateValue(STATE_KEYS.PROCESSED_TOKENS) || [];
        const pendingTasks = await getStateValue(STATE_KEYS.PENDING_TASKS) || [];

        const state = {
            lastProcessedBlock: lastBlock,
            processedTokens: new Set(processedTokensArray),
            pendingTasks
        };

        console.log(`📊 Loaded state: lastBlock=${state.lastProcessedBlock}, processedTokens=${state.processedTokens.size}, pendingTasks=${state.pendingTasks.length}`);
        return state;
    } catch (error) {
        console.error('❌ Failed to load state from Supabase:', error);
        return { ...DEFAULT_STATE };
    }
}

// Save cron state to Supabase
async function saveCronState(state) {
    try {
        // Ensure the system_state table exists
        await ensureSystemStateTable();

        // Save each part of the state
        const processedTokensArray = Array.from(state.processedTokens);

        await Promise.all([
            saveStateValue(STATE_KEYS.LAST_BLOCK, state.lastProcessedBlock),
            saveStateValue(STATE_KEYS.PROCESSED_TOKENS, processedTokensArray),
            saveStateValue(STATE_KEYS.PENDING_TASKS, state.pendingTasks)
        ]);

        console.log(`💾 State saved: lastBlock=${state.lastProcessedBlock}, processedTokens=${state.processedTokens.size}, pendingTasks=${state.pendingTasks.length}`);
        return true;
    } catch (error) {
        console.error('❌ Failed to save state to Supabase:', error);
        return false;
    }
}

// Process a single pending task
async function processSingleTask(nft, taskInfo, state) {
    const { tokenId, breed, buyer, taskId } = taskInfo;
    const id = Number(tokenId);

    console.log(`⚙️ Processing task ${taskId} for token #${id} (${breed}) by ${buyer}`);

    try {
        // Update task status
        await updateTask(taskId, {
            status: TASK_STATES.PROCESSING,
            progress: 10,
            message: 'Starting NFT generation'
        });

        // Check if already processed
        if (state.processedTokens.has(id)) {
            console.log(`⏭️ Token #${id} already processed, marking task complete`);
            await completeTask(taskId, { tokenURI: 'already-processed', skipped: true });
            return { success: true, skipped: true };
        }

        // Set placeholder if needed
        await updateTask(taskId, {
            progress: 20,
            message: 'Setting placeholder image'
        });

        try {
            const current = await nft.tokenURI(id).catch(() => '');
            if (!current || current === '') {
                const txPH = await nft.setTokenURI(id, process.env.PLACEHOLDER_URI);
                await txPH.wait();
                console.log(`• Placeholder set for token #${id}`);
            }
        } catch (err) {
            console.error(`• Placeholder failed for token #${id}:`, err);
            await updateTask(taskId, {
                progress: 25,
                message: `Warning: Placeholder set failed - ${err.message.substring(0, 100)}`
            });
        }

        // Generate final art and metadata
        await updateTask(taskId, {
            progress: 40,
            message: 'Generating artwork and metadata'
        });

        console.log(`🔍 CRON DEBUG: About to call finalizeMint with breed: "${breed}"`);
        console.log('🔍 CRON DEBUG: finalizeMint parameters:', {
            breed,
            tokenId: id,
            imageProvider: process.env.IMAGE_PROVIDER || 'dall-e',
            taskId
        });

        let result;
        try {
            result = await finalizeMint({
                breed,
                tokenId: id,
                imageProvider: process.env.IMAGE_PROVIDER || 'dall-e',
                taskId
            });
            console.log('🔍 CRON DEBUG: finalizeMint completed successfully');
        } catch (finalizeMintError) {
            console.error('❌ CRON DEBUG: finalizeMint failed:', finalizeMintError);
            console.error('❌ CRON DEBUG: finalizeMint error stack:', finalizeMintError.stack);
            throw finalizeMintError;
        }

        console.log('🔍 CRON DEBUG: finalizeMint result:', {
            tokenURI: result.tokenURI,
            provider: result.provider,
            breed: result.metadata?.attributes?.find(a => a.trait_type === 'Breed')?.value
        });

        await updateTask(taskId, {
            progress: 80,
            message: 'Setting token URI on blockchain'
        });

        // Set final token URI
        const tx = await nft.setTokenURI(id, result.tokenURI);
        await tx.wait();

        // Mark as processed
        state.processedTokens.add(id);
        console.log(`✅ Finalized #${id} → ${result.tokenURI}`);

        // Complete the task
        await completeTask(taskId, {
            tokenURI: result.tokenURI,
            breed,
            tokenId: id,
            transactionHash: tx.hash,
            provider: result.provider
        });

        return { success: true, tokenURI: result.tokenURI };

    } catch (error) {
        console.error(`❌ Task ${taskId} failed:`, error);
        await failTask(taskId, error);
        return { success: false, error: error.message };
    }
}

// Define serverless function handler for cron job
export default async function handler(req, res) {
    const startTime = Date.now();
    const MAX_EXECUTION_TIME = 25000; // 25 seconds limit for safety

    // Add proper request logging
    console.log(`🔄 Cron job triggered at ${new Date().toISOString()}`);
    console.log(`📋 Request method: ${req.method}, URL: ${req.url}`);

    try {
        const {
            RPC_URL,
            CONTRACT_ADDRESS,
            PRIVATE_KEY,
            PLACEHOLDER_URI,
            IMAGE_PROVIDER = 'dall-e'
        } = process.env;

        // Validate all required environment variables
        if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY || !PLACEHOLDER_URI) {
            const missingVars = [];
            if (!RPC_URL) missingVars.push('RPC_URL');
            if (!CONTRACT_ADDRESS) missingVars.push('CONTRACT_ADDRESS');
            if (!PRIVATE_KEY) missingVars.push('PRIVATE_KEY');
            if (!PLACEHOLDER_URI) missingVars.push('PLACEHOLDER_URI');

            console.error('❌ Missing required environment variables:', missingVars);
            return res.status(500).json({
                error: 'Missing environment variables',
                missing: missingVars,
                timestamp: new Date().toISOString()
            });
        }

        // Ensure Supabase connection with detailed logging
        console.log('🔗 Connecting to Supabase...');
        // Test Supabase connection
        const { data, error } = await supabase.from('tasks').select('id').limit(1);
        if (error) {
            console.error('❌ Supabase connection failed:', error.message);
            throw error;
        }
        console.log('✅ Supabase connection established');

        // Load persistent state with error handling
        console.log('📂 Loading cron state...');
        const state = await loadCronState();

        // Initialize blockchain connection
        console.log('🔗 Connecting to blockchain...');
        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const signer = new ethers.Wallet(PRIVATE_KEY, provider);

        const abi = [
            'event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)',
            'function tokenURI(uint256) view returns (string)',
            'function setTokenURI(uint256,string)'
        ];
        const nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
        const eventSig = nft.interface.getEvent('MintRequested').topicHash;

        // Get current block with timeout
        console.log('🔍 Getting current block number...');
        const latest = await provider.getBlockNumber();
        const lastBlock = state.lastProcessedBlock || (latest - 100);

        console.log(`🔍 Scanning blocks ${lastBlock + 1} to ${latest} for MintRequested events...`);

        // Look for new mint events with detailed logging
        const logs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock: lastBlock + 1,
            toBlock: latest,
            topics: [eventSig]
        });

        console.log(`📊 Found ${logs.length} new mint events`);

        const results = [];
        let newTasksCreated = 0;

        // Create tasks for new mint events
        for (const log of logs) {
            try {
                const { tokenId, buyer, breed } = nft.interface.parseLog(log).args;
                const id = Number(tokenId);

                // Skip if already processed
                if (state.processedTokens.has(id)) {
                    console.log(`⏭️ Token #${id} already processed, skipping`);
                    continue;
                }

                console.log(`📝 Creating task for token #${id} (${breed}) from buyer ${buyer}`);

                // Create a new task with detailed metadata
                const taskId = await createTask(id, IMAGE_PROVIDER, {
                    breed,
                    buyer,
                    createdFrom: 'cron',
                    blockNumber: log.blockNumber,
                    transactionHash: log.transactionHash,
                    priority: 'high'
                });

                // Store task info in state
                state.pendingTasks.push({
                    tokenId: id,
                    breed,
                    buyer,
                    taskId,
                    createdAt: Date.now(),
                    blockNumber: log.blockNumber
                });

                newTasksCreated++;
                results.push(`📝 Created task ${taskId} for token #${id} (${breed})`);
            } catch (parseError) {
                console.error('❌ Failed to parse event log:', parseError);
                results.push(`❌ Failed to parse event: ${parseError.message}`);
            }
        }

        // Process existing pending tasks (one at a time to avoid timeout)
        let tasksProcessed = 0;
        let taskIndex = 0;
        const maxTasksPerRun = 3; // Limit tasks per cron run to avoid timeout

        console.log(`🔄 Processing up to ${maxTasksPerRun} pending tasks...`);

        while (taskIndex < state.pendingTasks.length &&
            tasksProcessed < maxTasksPerRun &&
            (Date.now() - startTime) < MAX_EXECUTION_TIME) {

            const taskInfo = state.pendingTasks[taskIndex];
            console.log(`⚙️ Processing task ${taskInfo.taskId} for token #${taskInfo.tokenId}...`);

            // Check if task is still valid
            const taskStatus = await getTaskStatus(taskInfo.taskId);
            if (!taskStatus || taskStatus.status === TASK_STATES.COMPLETED) {
                // Remove completed task from pending list
                state.pendingTasks.splice(taskIndex, 1);
                results.push(`✅ Removed completed task ${taskInfo.taskId} for token #${taskInfo.tokenId}`);
                continue;
            }

            if (taskStatus.status === TASK_STATES.FAILED) {
                // Remove failed task from pending list
                state.pendingTasks.splice(taskIndex, 1);
                results.push(`❌ Removed failed task ${taskInfo.taskId} for token #${taskInfo.tokenId}`);
                continue;
            }

            // Process the task
            try {
                const result = await processSingleTask(nft, taskInfo, state);

                if (result.success) {
                    // Remove from pending list
                    state.pendingTasks.splice(taskIndex, 1);
                    tasksProcessed++;
                    results.push(`✅ Completed task ${taskInfo.taskId} for token #${taskInfo.tokenId}`);
                } else {
                    // Keep in pending list for retry, but move to next
                    taskIndex++;
                    results.push(`❌ Failed task ${taskInfo.taskId} for token #${taskInfo.tokenId}: ${result.error}`);
                }
            } catch (taskError) {
                console.error('❌ Task processing error:', taskError);
                taskIndex++;
                results.push(`❌ Task processing error for ${taskInfo.taskId}: ${taskError.message}`);
            }

            // Check time limit
            if ((Date.now() - startTime) >= MAX_EXECUTION_TIME) {
                results.push('⏱️ Execution time limit reached, stopping processing');
                break;
            }
        }

        // Update state with detailed logging
        console.log('💾 Saving cron state...');
        state.lastProcessedBlock = latest;
        await saveCronState(state);

        const executionTime = Date.now() - startTime;
        const summary = {
            status: 'success',
            timestamp: new Date().toISOString(),
            executionTimeMs: executionTime,
            blocksScanned: latest - lastBlock,
            newEventsFound: logs.length,
            newTasksCreated,
            tasksProcessed,
            pendingTasksRemaining: state.pendingTasks.length,
            lastProcessedBlock: latest,
            totalProcessedTokens: state.processedTokens.size,
            environment: {
                imageProvider: IMAGE_PROVIDER,
                supabaseConnected: true,
                blockchainConnected: true
            },
            results
        };

        console.log('📊 Cron execution summary:', summary);
        console.log(`🎯 Cron job completed successfully in ${executionTime}ms`);

        return res.status(200).json(summary);

    } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error('❌ Cron execution failed:', error);
        console.error('❌ Error stack:', error.stack);

        return res.status(500).json({
            status: 'error',
            error: error.message,
            errorType: error.constructor.name,
            timestamp: new Date().toISOString(),
            executionTimeMs: executionTime,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
}