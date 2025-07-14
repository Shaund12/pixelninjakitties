import { ethers } from 'ethers';
import { finalizeMint } from '../scripts/finalizeMint.js';
import { createTask, updateTask, completeTask, failTask, getTaskStatus, TASK_STATES } from '../scripts/taskManager.js';
import { saveState, loadState, ensureConnection } from '../scripts/supabase.js';

// Default state structure for cron system
const DEFAULT_STATE = {
    lastProcessedBlock: 0,
    processedTokens: [],
    pendingTasks: []
};

// Load state from Supabase
async function loadCronState() {
    try {
        const state = await loadState('cron', DEFAULT_STATE);
        // Convert array back to Set for processedTokens
        state.processedTokens = new Set(state.processedTokens);
        return state;
    } catch (error) {
        console.error('Failed to load cron state from Supabase:', error);
        return { ...DEFAULT_STATE, processedTokens: new Set() };
    }
}

// Save state to Supabase
async function saveCronState(state) {
    try {
        // Convert Set to array for storage
        const stateToSave = {
            ...state,
            processedTokens: Array.from(state.processedTokens)
        };
        await saveState('cron', stateToSave);
    } catch (error) {
        console.error('Failed to save cron state to Supabase:', error);
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
            IMAGE_PROVIDER = 'dall-e',
            SUPABASE_URL,
            SUPABASE_ANON_KEY
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

        if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
            console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY not configured');
            return res.status(500).json({
                error: 'SUPABASE_URL and SUPABASE_ANON_KEY not configured',
                timestamp: new Date().toISOString()
            });
        }

        // Ensure Supabase connection with detailed logging
        console.log('🔗 Connecting to Supabase...');
        await ensureConnection();
        console.log('✅ Supabase connection established');

        // Load persistent state with error handling
        console.log('📂 Loading cron state...');
        const state = await loadCronState();
        console.log(`📊 Loaded state: lastBlock=${state.lastProcessedBlock}, processedTokens=${state.processedTokens.size}, pendingTasks=${state.pendingTasks.length}`);

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
        console.log(`💾 State saved: lastBlock=${latest}, processedTokens=${state.processedTokens.size}, pendingTasks=${state.pendingTasks.length}`);

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