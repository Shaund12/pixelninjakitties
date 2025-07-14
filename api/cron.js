import { ethers } from 'ethers';
import { finalizeMint } from '../scripts/finalizeMint.js';
import { createTask, updateTask, completeTask, failTask, getTaskStatus, getTasks, TASK_STATES } from '../scripts/taskManager.js';
import { connectToMongoDB, saveState, loadState, ensureConnection } from '../scripts/mongodb.js';

// Default state structure for cron system
const DEFAULT_STATE = {
    lastProcessedBlock: 0,
    processedTokens: [],
    pendingTasks: []
};

// Load state from MongoDB
async function loadCronState() {
    try {
        const state = await loadState('cron', DEFAULT_STATE);
        // Convert array back to Set for processedTokens
        state.processedTokens = new Set(state.processedTokens);
        return state;
    } catch (error) {
        console.error('Failed to load cron state from MongoDB:', error);
        return { ...DEFAULT_STATE, processedTokens: new Set() };
    }
}

// Save state to MongoDB
async function saveCronState(state) {
    try {
        // Convert Set to array for storage
        const stateToSave = {
            ...state,
            processedTokens: Array.from(state.processedTokens)
        };
        await saveState('cron', stateToSave);
    } catch (error) {
        console.error('Failed to save cron state to MongoDB:', error);
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

        const result = await finalizeMint({
            breed,
            tokenId: id,
            imageProvider: process.env.IMAGE_PROVIDER || 'dall-e',
            taskId
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

    try {
        const {
            RPC_URL,
            CONTRACT_ADDRESS,
            PRIVATE_KEY,
            PLACEHOLDER_URI,
            IMAGE_PROVIDER = 'dall-e'
        } = process.env;

        if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY || !PLACEHOLDER_URI) {
            return res.status(500).json({ error: 'Missing environment variables' });
        }

        // Ensure MongoDB connection
        await ensureConnection();

        // Load persistent state
        const state = await loadCronState();

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const signer = new ethers.Wallet(PRIVATE_KEY, provider);

        const abi = [
            'event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)',
            'function tokenURI(uint256) view returns (string)',
            'function setTokenURI(uint256,string)'
        ];
        const nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
        const eventSig = nft.interface.getEvent('MintRequested').topicHash;

        // Get current block
        const latest = await provider.getBlockNumber();
        const lastBlock = state.lastProcessedBlock || (latest - 100);

        console.log(`🔍 Scanning blocks ${lastBlock + 1} to ${latest} for MintRequested events...`);

        // Look for new mint events
        const logs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock: lastBlock + 1,
            toBlock: latest,
            topics: [eventSig]
        });

        const results = [];
        let newTasksCreated = 0;

        // Create tasks for new mint events
        for (const log of logs) {
            const { tokenId, buyer, breed } = nft.interface.parseLog(log).args;
            const id = Number(tokenId);

            // Skip if already processed
            if (state.processedTokens.has(id)) {
                console.log(`⏭️ Token #${id} already processed, skipping`);
                continue;
            }

            console.log(`📝 Creating task for token #${id} (${breed}) from buyer ${buyer}`);

            // Create a new task
            const taskId = await createTask(id, IMAGE_PROVIDER, {
                breed,
                buyer,
                createdFrom: 'cron',
                blockNumber: log.blockNumber
            });

            // Store task info in state
            state.pendingTasks.push({
                tokenId: id,
                breed,
                buyer,
                taskId,
                createdAt: Date.now()
            });

            newTasksCreated++;
            results.push(`📝 Queued task ${taskId} for token #${id}`);
        }

        // Process existing pending tasks (one at a time to avoid timeout)
        let tasksProcessed = 0;
        let taskIndex = 0;

        while (taskIndex < state.pendingTasks.length && (Date.now() - startTime) < MAX_EXECUTION_TIME) {
            const taskInfo = state.pendingTasks[taskIndex];

            // Check if task is still valid
            const taskStatus = await getTaskStatus(taskInfo.taskId);
            if (!taskStatus || taskStatus.status === TASK_STATES.COMPLETED) {
                // Remove completed task from pending list
                state.pendingTasks.splice(taskIndex, 1);
                continue;
            }

            if (taskStatus.status === TASK_STATES.FAILED) {
                // Remove failed task from pending list
                state.pendingTasks.splice(taskIndex, 1);
                results.push(`❌ Removed failed task ${taskInfo.taskId} for token #${taskInfo.tokenId}`);
                continue;
            }

            // Process the task
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

            // Check time limit
            if ((Date.now() - startTime) >= MAX_EXECUTION_TIME) {
                results.push('⏱️ Execution time limit reached, stopping processing');
                break;
            }
        }

        // Update state
        state.lastProcessedBlock = latest;
        await saveCronState(state);

        const executionTime = Date.now() - startTime;
        const summary = {
            timestamp: new Date().toISOString(),
            executionTimeMs: executionTime,
            blocksScanned: latest - lastBlock,
            newEventsFound: logs.length,
            newTasksCreated,
            tasksProcessed,
            pendingTasksRemaining: state.pendingTasks.length,
            lastProcessedBlock: latest,
            totalProcessedTokens: state.processedTokens.size,
            results
        };

        console.log('📊 Cron execution summary:', summary);

        return res.status(200).json(summary);

    } catch (error) {
        console.error('❌ Cron execution failed:', error);
        return res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString(),
            executionTimeMs: Date.now() - startTime
        });
    }
}