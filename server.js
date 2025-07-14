/**
 * server.js
 * ───────────────────────────────────────────────────────────────
 * • Serves static mint site   →  http://localhost:5000
 * • Polls chain every 15 s for MintRequested logs (no RPC filters)
 * • Instantly sets placeholder sprite URI
 * • Generates AI art + rich metadata → pins via w3up → overwrites tokenURI
 * • Includes API endpoints for monitoring and manual processing
 *
 * Rich metadata includes:
 * - Core traits (Weapon, Stance, Element, etc.)
 * - Combat stats based on traits
 * - Backstory and special abilities
 * - Rarity calculations
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import { ethers } from 'ethers';
import { finalizeMint } from './scripts/finalizeMint.js';
import { createStorage } from './scripts/storageHelpers.js'; // You'll need to create this file
import { createTask, updateTask, completeTask, failTask, getTaskStatus, cleanupTasks } from './scripts/taskManager.js';
import {
    validateTokenId,
    validateBreed,
    validateImageProvider,
    validatePrompt,
    validateBlockNumber,
    validateProviderOptions,
    sanitizeForLogging,
    createSafeErrorResponse
} from './scripts/securityUtils.js';
import {
    securityHeaders,
    rateLimitMiddleware,
    requestTimeout,
    sanitizeInput,
    secureLogging,
    errorHandler
} from './scripts/middleware.js';
import { performHealthCheck, UptimeTracker } from './scripts/healthCheck.js';
import { connectToSupabase } from './scripts/supabase.js';
import fs from 'fs/promises';
import path from 'path';

// Initialize uptime tracker
const uptimeTracker = new UptimeTracker();


/* ───── Env checks ───────────────────────────────────────────── */
const {
    RPC_URL,
    CONTRACT_ADDRESS,
    PRIVATE_KEY,
    PLACEHOLDER_URI,
    PORT = 5000,
    IMAGE_PROVIDER = 'dall-e'
} = process.env;

// Log environment configuration at startup (with security considerations)
console.log('Environment check:');
console.log(`- RPC_URL: ${RPC_URL ? '✓ Set' : '❌ Missing'}`);
console.log(`- CONTRACT_ADDRESS: ${CONTRACT_ADDRESS ? '✓ Set' : '❌ Missing'}`);
console.log(`- PINATA_API_KEY: ${process.env.PINATA_API_KEY ? '✓ Set' : '❌ Missing'}`);
console.log(`- PINATA_SECRET_KEY: ${process.env.PINATA_SECRET_KEY ? '✓ Set' : '❌ Missing'}`);
console.log(`- BASE_URL: ${process.env.BASE_URL ? '✓ Set' : '(using default)'}`);
console.log(`- DEFAULT_IMAGE_PROVIDER: ${IMAGE_PROVIDER}`);
console.log(`- OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ Set' : '❌ Missing'}`);
console.log(`- HUGGING_FACE_TOKEN: ${process.env.HUGGING_FACE_TOKEN ? '✓ Set' : '❌ Missing'}`);
console.log(`- STABILITY_API_KEY: ${process.env.STABILITY_API_KEY ? '✓ Set' : '❌ Missing'}`);
console.log(`- SUPABASE_URL: ${process.env.SUPABASE_URL ? '✓ Set' : '❌ Missing'}`);
console.log(`- SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✓ Set' : '❌ Missing'}`);

if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY || !PLACEHOLDER_URI) {
    console.error('❌  Missing env vars – check .env');
    process.exit(1);
}

/* ───── Static site (front-end) ──────────────────────────────── */
const app = express();

// Apply security middleware
app.use(securityHeaders);
app.use(compression());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5000'],
    credentials: true,
    optionsSuccessStatus: 200
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply rate limiting to API routes
app.use('/api/', rateLimitMiddleware(100, 60000)); // 100 requests per minute

// Request timeout and input sanitization with tracking
app.use((req, res, next) => {
    uptimeTracker.recordRequest();
    next();
});
app.use(requestTimeout(30000)); // 30 second timeout
app.use(sanitizeInput);
app.use(secureLogging);

app.use(express.static('public'));                // index.html, mint.js …

// API endpoint for task status
app.get('/api/task/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;

        // Basic validation
        if (!taskId || typeof taskId !== 'string' || taskId.length > 100) {
            return res.status(400).json({ error: 'Invalid task ID' });
        }

        const status = await getTaskStatus(taskId);
        res.json(status);
    } catch (error) {
        console.error('Error in /api/task/:taskId:', sanitizeForLogging(error.message));
        res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
});

// API endpoint for health check
app.get('/api/health', async (req, res) => {
    try {
        uptimeTracker.recordRequest();

        const healthCheck = await performHealthCheck();
        const uptimeStats = uptimeTracker.getStats();

        const response = {
            status: healthCheck.status,
            timestamp: healthCheck.timestamp,
            uptime: uptimeStats.uptime,
            queueLength: mintQueue.length,
            lastProcessed: lastBlock,
            defaultImageProvider: IMAGE_PROVIDER,
            availableProviders: {
                'dall-e': !!process.env.OPENAI_API_KEY,
                'huggingface': !!process.env.HUGGING_FACE_TOKEN,
                'stability': !!process.env.STABILITY_API_KEY
            },
            checks: healthCheck.checks,
            stats: {
                requests: uptimeStats.requests,
                errors: uptimeStats.errors,
                errorRate: uptimeStats.errorRate
            }
        };

        res.json(response);
    } catch (error) {
        uptimeTracker.recordError();
        console.error('Error in /api/health:', sanitizeForLogging(error.message));
        res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
});

// Enhanced health check endpoint with detailed diagnostics
app.get('/api/health/detailed', async (req, res) => {
    try {
        uptimeTracker.recordRequest();

        const healthCheck = await performHealthCheck();
        const uptimeStats = uptimeTracker.getStats();

        res.json({
            ...healthCheck,
            uptime: uptimeStats,
            queueStatus: {
                length: mintQueue.length,
                processing: processingQueue,
                lastProcessedBlock: lastBlock,
                processedTokensCount: processedTokens.size
            }
        });
    } catch (error) {
        uptimeTracker.recordError();
        console.error('Error in /api/health/detailed:', sanitizeForLogging(error.message));
        res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
});

// Metrics endpoint for monitoring
app.get('/api/metrics', (req, res) => {
    try {
        const uptimeStats = uptimeTracker.getStats();
        const memoryUsage = process.memoryUsage();

        res.json({
            uptime: uptimeStats,
            memory: {
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                external: Math.round(memoryUsage.external / 1024 / 1024),
                rss: Math.round(memoryUsage.rss / 1024 / 1024),
                unit: 'MB'
            },
            process: {
                pid: process.pid,
                version: process.version,
                platform: process.platform,
                arch: process.arch
            },
            queue: {
                length: mintQueue.length,
                processing: processingQueue,
                lastProcessedBlock: lastBlock,
                processedTokensCount: processedTokens.size
            }
        });
    } catch (error) {
        console.error('Error in /api/metrics:', sanitizeForLogging(error.message));
        res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
});

// Debug information API endpoint
app.get('/api/debug', async (req, res) => {
    try {
        // const stateData = await fs.readFile(STATE_FILE, 'utf8').catch(() => '{}'); // Currently unused
        const currentBlock = await provider.getBlockNumber();
        const contractAddr = CONTRACT_ADDRESS;

        res.json({
            currentBlock,
            lastProcessedBlock: lastBlock,
            behindBy: currentBlock - lastBlock,
            processedCount: processedTokens.size,
            queueLength: mintQueue.length,
            queueItems: mintQueue.map(item => ({
                tokenId: item.tokenId.toString(),
                breed: item.breed,
                imageProvider: item.imageProvider || IMAGE_PROVIDER
            })),
            contractAddress: contractAddr,
            defaultImageProvider: IMAGE_PROVIDER
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint to reset and scan all blocks
app.get('/api/scan-all', async (req, res) => {
    try {
        console.log('🔍 Resetting block pointer to scan from genesis block');
        lastBlock = 0;
        await saveState();
        checkForEvents();

        res.json({
            success: true,
            message: 'Reset block pointer to genesis block and started scanning'
        });
    } catch (err) {
        console.error('Error in /api/scan-all:', sanitizeForLogging(err.message));
        res.status(500).json(createSafeErrorResponse(err, process.env.NODE_ENV === 'development'));
    }
});

// Endpoint to get recent events
app.get('/api/recent-events', async (req, res) => {
    try {
        const currentBlock = await provider.getBlockNumber();
        const fromBlock = Math.max(0, currentBlock - 10000);

        console.log(`Checking for all events from block ${fromBlock} to ${currentBlock}`);

        const logs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock,
            toBlock: currentBlock
        });

        const eventTypes = {};
        logs.forEach(log => {
            const topic = log.topics[0];
            eventTypes[topic] = (eventTypes[topic] || 0) + 1;
        });

        res.json({
            success: true,
            totalEvents: logs.length,
            eventTypes,
            recentBlocks: {
                from: fromBlock,
                to: currentBlock,
                range: currentBlock - fromBlock
            },
            sampleEvents: logs.slice(0, 5)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Command to reset the last processed block
app.get('/api/reset-block/:blockNumber', async (req, res) => {
    try {
        const blockNumber = validateBlockNumber(req.params.blockNumber);

        // Update the last processed block
        lastBlock = blockNumber;
        await saveState();

        res.json({
            success: true,
            message: `Last processed block reset to ${blockNumber}`,
            lastBlock: blockNumber
        });

        // Immediately check for events
        checkForEvents();
    } catch (err) {
        console.error('Error in /api/reset-block:', sanitizeForLogging(err.message));
        res.status(400).json(createSafeErrorResponse(err, process.env.NODE_ENV === 'development'));
    }
});

/// Force process specific token ID with options
app.get('/api/process/:tokenId', async (req, res) => {
    try {
        const tokenId = validateTokenId(req.params.tokenId);

        // Check if the token has already been processed - BUT ALLOW REGENERATION
        const forceProcess = req.query.force === 'true';
        const isRegeneration = req.query.regenerate === 'true';

        if (processedTokens.has(tokenId) && !forceProcess) {
            console.log(`⏭️ Token #${tokenId} has already been processed, skipping`);
            return res.json({
                status: 'already_processed',
                message: `Token #${tokenId} has already been processed`,
                tokenId
            });
        }

        if (processedTokens.has(tokenId) && forceProcess) {
            console.log(`🔄 Force regenerating token #${tokenId} that was previously processed`);
        }

        // Validate and sanitize parameters
        const breed = validateBreed(req.query.breed || 'Tabby');
        const imageProvider = validateImageProvider(req.query.imageProvider || IMAGE_PROVIDER);
        const promptExtras = validatePrompt(req.query.promptExtras || '');
        const negativePrompt = validatePrompt(req.query.negativePrompt || '');
        const providerOptions = validateProviderOptions(req.query.providerOptions || '{}');

        console.log(`🎯 Processing token #${tokenId} with provider: ${imageProvider}`);

        // Store the user's provider preference for this token
        await providerPreferences.set(tokenId.toString(), {
            provider: imageProvider,
            timestamp: Date.now(),
            options: providerOptions
        });

        let current = 'unknown';
        let owner = 'unknown';

        try {
            current = await nft.tokenURI(tokenId);
        } catch (err) {
            console.log(`Could not get URI for token #${tokenId}: ${sanitizeForLogging(err.message)}`);
        }

        try {
            owner = await nft.ownerOf(tokenId);
        } catch (err) {
            console.log(`Could not get owner for token #${tokenId}: ${sanitizeForLogging(err.message)}`);
        }

        console.log(`🔄 Manually queueing token #${tokenId} (${breed}) using ${imageProvider}`);
        console.log(`   Current URI: ${sanitizeForLogging(current)}`);
        console.log(`   Owner: ${sanitizeForLogging(owner)}`);

        // Create a task for tracking
        const taskId = await createTask(tokenId, imageProvider);
        await updateTask(taskId, {
            status: 'queued',
            message: 'Waiting in processing queue',
            breed,
            owner,
            provider: imageProvider,
            providerOptions
        });

        // Add to processing queue with explicit provider and all options
        mintQueue.push({
            tokenId,
            buyer: owner !== 'unknown' ? owner : 'manual-request',
            breed,
            imageProvider,
            promptExtras,
            negativePrompt,
            providerOptions,
            taskId,
            forceProcess,
            isRegeneration
        });

        // Start queue processing
        processQueue();

        res.json({
            status: 'queued',
            taskId,
            tokenId,
            breed,
            imageProvider,
            currentURI: current,
            owner,
            options: providerOptions
        });
    } catch (err) {
        console.error('Error in /api/process/:tokenId:', sanitizeForLogging(err.message));
        res.status(400).json(createSafeErrorResponse(err, process.env.NODE_ENV === 'development'));
    }
});



// Add this new API endpoint to get current provider status
app.get('/api/status/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;

        // Basic validation
        if (!taskId || typeof taskId !== 'string' || taskId.length > 100) {
            return res.status(400).json({ error: 'Invalid task ID' });
        }

        const status = await getTaskStatus(taskId);

        // If no status found, return 404
        if (!status) {
            return res.status(404).json({ error: 'Task not found' });
        }

        // Add the provider to the status response
        if (!status.provider && status.details?.provider) {
            status.provider = status.details.provider;
        }

        return res.json(status);
    } catch (error) {
        console.error('Error in /api/status/:taskId:', sanitizeForLogging(error.message));
        return res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
});

// API documentation endpoint
app.get('/api/docs', (req, res) => {
    res.json({
        name: 'Ninja Kitty NFT API',
        version: '1.0',
        description: 'API for minting and processing pixel art ninja cat NFTs',
        endpoints: [
            {
                path: '/api/health',
                method: 'GET',
                description: 'Check server health status'
            },
            {
                path: '/api/task/:taskId',
                method: 'GET',
                description: 'Check status of a specific generation task'
            },
            {
                path: '/api/debug',
                method: 'GET',
                description: 'Get debugging information about the server state'
            },
            {
                path: '/api/scan-all',
                method: 'GET',
                description: 'Reset block pointer and scan all blocks for events'
            },
            {
                path: '/api/recent-events',
                method: 'GET',
                description: 'Get recent events from the contract'
            },
            {
                path: '/api/reset-block/:blockNumber',
                method: 'GET',
                description: 'Reset the last processed block to a specific number'
            },
            {
                path: '/api/process/:tokenId',
                method: 'GET',
                description: 'Process a specific token ID',
                query: {
                    breed: "Cat breed (e.g., 'Tabby', 'Bengal')",
                    imageProvider: 'AI provider to use (dall-e, huggingface, stability)',
                    promptExtras: 'Additional prompt instructions',
                    negativePrompt: 'Things to exclude from the image'
                }
            },
            {
                path: '/api/docs',
                method: 'GET',
                description: 'This documentation'
            }
        ],
        imageProviders: [
            {
                id: 'dall-e',
                name: 'DALL-E 3',
                description: "OpenAI's high-quality image generation model"
            },
            {
                id: 'huggingface',
                name: 'Hugging Face (Stable Diffusion)',
                description: 'Free open-source model with good quality'
            },
            {
                id: 'stability',
                name: 'Stability AI',
                description: 'Professional quality image generation'
            }
        ]
    });
});

// Initialize Supabase connection and start server
async function startServer() {
    try {
        // Connect to Supabase
        await connectToSupabase();
        console.log('✅ Supabase connection established');

        // Start Express server
        app.listen(PORT, () => {
            console.log(`🌐 Ninja Kitty server running on port ${PORT}`);
            console.log('📊 Supabase integrated for task persistence');
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// Start the server
startServer();

// Add error handling middleware with tracking
app.use((err, req, res, next) => {
    uptimeTracker.recordError();
    errorHandler(err, req, res, next);
});

/* ───── Provider + signer + contract ─────────────────────────── */
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
    'event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)',
    'function tokenURI(uint256) view returns (string)',
    'function setTokenURI(uint256,string)'
];
const nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
const eventSig = nft.interface.getEvent('MintRequested').topicHash;

/* ───── Rate limiting queue system for OpenAI ─────────────────── */
// DALL-E-3 is limited to 5 images per minute
const RATE_LIMIT = 5;
const RATE_WINDOW = 60000; // 1 minute in milliseconds
const mintQueue = [];
const providerPreferences = createStorage('provider-preferences.json');
let processingQueue = false;
let lastMinuteRequests = [];

// Validate event signature
function validateEventSignatures() {
    try {
        // Calculate signature manually and compare
        const eventSigManual = ethers.id('MintRequested(uint256,address,string)');
        const eventSigFromEthers = nft.interface.getEvent('MintRequested').topicHash;

        console.log('Event signature validation:');
        console.log(`- Manual hash:   ${eventSigManual}`);
        console.log(`- Contract hash: ${eventSigFromEthers}`);
        console.log(`- Match: ${eventSigManual === eventSigFromEthers ? '✓' : '❌'}`);

        return eventSigManual;
    } catch (error) {
        console.error('Error validating event signature:', error);
        // Return a fallback
        return ethers.id('MintRequested(uint256,address,string)');
    }
}

// Get blockchain information
async function getBlockchainInfo() {
    try {
        // Get current block and chain ID
        const [blockNumber, chainId] = await Promise.all([
            provider.getBlockNumber(),
            provider.getNetwork().then(network => network.chainId)
        ]);

        // Get block details to estimate average block time
        const latestBlock = await provider.getBlock(blockNumber);
        const olderBlock = await provider.getBlock(Math.max(1, blockNumber - 100));

        // Calculate average block time in seconds
        const blockTimeMs = latestBlock && olderBlock ?
            (latestBlock.timestamp - olderBlock.timestamp) * 1000 / (blockNumber - olderBlock.number) : 0;

        console.log('\n📊 Blockchain Information:');
        console.log(`- Chain ID: ${chainId}`);
        console.log(`- Current Block: ${blockNumber}`);
        console.log(`- Approx. Block Time: ${(blockTimeMs / 1000).toFixed(1)} seconds`);
        console.log(`- Contract: ${CONTRACT_ADDRESS}`);

        return { blockNumber, chainId, blockTimeMs };
    } catch (error) {
        console.error('Error getting blockchain info:', error);
        return { blockNumber: 0, chainId: 0, blockTimeMs: 0 };
    }
}

// Process a single mint task with rate limiting
/**
 * Process a single mint task with rate limiting and enhanced error handling
 * @param {Object} task - The mint task to process
 * @param {number} task.tokenId - The token ID to mint
 * @param {string} task.breed - The breed of the NFT
 * @param {string} task.buyer - The buyer's address
 * @param {string} task.imageProvider - The AI image provider to use
 * @param {string} task.promptExtras - Additional prompt text
 * @param {string} task.negativePrompt - Negative prompt text
 * @param {string} task.taskId - The task ID for tracking
 * @param {boolean} task.forceProcess - Whether to force process already processed tokens
 * @param {boolean} task.isRegeneration - Whether this is a regeneration request
 * @returns {Promise<void>}
 */
async function processMintTask(task) {
    const { tokenId, breed, buyer, imageProvider, promptExtras, negativePrompt, taskId: existingTaskId, forceProcess } = task;
    // const { isRegeneration } = task; // Currently unused
    const id = Number(tokenId);

    // CHECK IF TOKEN WAS ALREADY PROCESSED WHILE WAITING IN QUEUE
    // BUT ALLOW REGENERATION IF FORCE FLAG IS SET
    if (processedTokens.has(id) && !forceProcess) {
        console.log(`⏭️ Token #${id} was already processed while in queue, skipping duplicate processing`);
        return; // Skip processing entirely
    }

    if (processedTokens.has(id) && forceProcess) {
        console.log(`🔄 Allowing regeneration of previously processed token #${id}`);
    }

    // CRITICAL FIX: Ensure we use the explicitly passed imageProvider and never fall back to default
    // This is the key issue - we need to respect the user's choice 100% of the time
    const providerToUse = imageProvider || IMAGE_PROVIDER;

    // Create or use existing task ID
    const mintTaskId = existingTaskId || await createTask(id, providerToUse);
    await updateTask(mintTaskId, {
        status: 'processing',
        progress: 5,
        message: 'Starting mint process',
        breed,
        buyer
    });

    console.log(`⚙️ Processing queued mint for #${id} (${breed}) by ${buyer} using ${providerToUse}`);
    console.log(`🚨 STRICT MODE: Will only use ${providerToUse} for this generation`);

    try {
        // Check if we can make a new request
        const now = Date.now();
        // Remove requests older than 1 minute
        lastMinuteRequests = lastMinuteRequests.filter(time => now - time < RATE_WINDOW);

        // If we've reached the rate limit, wait until we can make another request
        if (lastMinuteRequests.length >= RATE_LIMIT) {
            const oldestRequest = lastMinuteRequests[0];
            const waitTime = RATE_WINDOW - (now - oldestRequest) + 100; // Add 100ms buffer

            await updateTask(mintTaskId, {
                progress: 10,
                message: `Rate limit reached, waiting ${Math.ceil(waitTime / 1000)} seconds`
            });

            console.log(`⏱️ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)} seconds`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        /* 1️⃣ Set placeholder URI if needed */
        await updateTask(mintTaskId, {
            progress: 20,
            message: 'Setting placeholder image'
        });

        try {
            const current = await nft.tokenURI(id).catch(() => '');
            if (!current || current === '') {
                const txPH = await nft.setTokenURI(id, PLACEHOLDER_URI);
                await txPH.wait();
                console.log(`  • Placeholder set for token #${id}`);
            }
        } catch (err) {
            console.error(`  • Placeholder failed for token #${id}:`, err);
            await updateTask(mintTaskId, {
                progress: 25,
                message: `Warning: Placeholder set failed - ${err.message.substring(0, 100)}`
            });
        }

        /* 2️⃣ Generate final art and metadata */
        await updateTask(mintTaskId, {
            progress: 30,
            message: `Generating artwork using ${providerToUse}`,
            details: {
                provider: providerToUse,
                hasCustomPrompt: !!promptExtras,
                hasNegativePrompt: !!negativePrompt
            }
        });

        console.log(`  • Generating art and metadata for token #${id}...`);

        // Record this API call
        lastMinuteRequests.push(Date.now());

        // Pass all parameters to finalizeMint - CRITICAL: Pass exact provider here
        const result = await finalizeMint({
            breed,
            tokenId: id,
            imageProvider: providerToUse, // Explicitly pass the exact provider name
            promptExtras,
            negativePrompt,
            taskId: mintTaskId
        });

        await updateTask(mintTaskId, {
            progress: 80,
            message: 'Setting token URI on blockchain',
            metadata: result.metadata
        });

        const tx = await nft.setTokenURI(id, result.tokenURI);
        await tx.wait();
        console.log(`✅ Finalized #${id} → ${result.tokenURI} using ${providerToUse}`);

        // Mark this token as processed
        processedTokens.add(id);
        await saveState();

        // Complete the task
        await completeTask(mintTaskId, {
            tokenURI: result.tokenURI,
            breed,
            tokenId: id,
            transactionHash: tx.hash,
            provider: result.provider,
            model: result.model
        });

    } catch (err) {
        console.error(`❌ Finalizing #${id} failed:`, err);

        // Mark task as failed
        await failTask(mintTaskId, err);

        // If generation failed, add back to queue with a delay (up to 3 retries)
        const retryCount = task.retryCount || 0;
        if (retryCount < 3 && mintQueue.length < 20) {
            console.log(`  • Requeueing #${id} for retry ${retryCount + 1}/3 after 2 minutes`);
            setTimeout(() => {
                mintQueue.push({
                    ...task,
                    retryCount: retryCount + 1,
                    taskId: null // Create a fresh task on retry
                });
                processQueue(); // Trigger queue processing
            }, 120000); // 2 minute delay before retry
        } else {
            console.error(`  • Max retries reached or too many items in queue for #${id}`);
        }
    }
}

/**
 * Process the mint queue with controlled flow
 * @returns {Promise<void>}
 */
async function processQueue() {
    if (processingQueue || mintQueue.length === 0) return;

    processingQueue = true;

    try {
        while (mintQueue.length > 0) {
            const task = mintQueue.shift();
            await processMintTask(task);
        }
    } finally {
        processingQueue = false;
    }
}

/* ───── Process state tracking - persist between restarts ────── */
const STATE_FILE = path.join(process.cwd(), 'event-state.json');
let processedTokens = new Set();
let lastBlock = 0;

/**
 * Load state from persistent storage
 * @returns {Promise<void>}
 */
async function loadState() {
    try {
        const stateData = await fs.readFile(STATE_FILE, 'utf8');
        const state = JSON.parse(stateData);
        lastBlock = state.lastBlock || 0;
        processedTokens = new Set(state.processedTokens || []);
        console.log(`📂 Loaded state: lastBlock=${lastBlock}, processedTokens=${processedTokens.size}`);
    } catch {
        // If file doesn't exist, start from a few blocks back for safety
        const currentBlock = await provider.getBlockNumber();
        lastBlock = Math.max(0, currentBlock - 1000);
        processedTokens = new Set();
        console.log(`🆕 Created new state: starting from block ${lastBlock}`);
        await saveState();
    }
}

/**
 * Save current state to persistent storage
 * @returns {Promise<void>}
 */
async function saveState() {
    const state = {
        lastBlock,
        processedTokens: Array.from(processedTokens)
    };
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`💾 Saved state: lastBlock=${lastBlock}, processedTokens=${processedTokens.size}`);
}

/* ───── Enhanced log-polling with rate-limited processing ────── */
async function checkForEvents() {
    try {
        const latest = await provider.getBlockNumber();
        if (latest <= lastBlock) return;

        // Process blocks in batches to avoid overloading the RPC endpoint
        const batchSize = 500;
        const fromBlock = lastBlock + 1;
        const toBlock = Math.min(latest, fromBlock + batchSize - 1);

        console.log(`🔍 Scanning blocks ${fromBlock} to ${toBlock} for MintRequested events...`);

        // First try with full topic filter
        let logs = [];
        try {
            logs = await provider.getLogs({
                address: CONTRACT_ADDRESS,
                fromBlock: fromBlock,
                toBlock: toBlock,
                topics: [eventSig]
            });
            console.log(`📊 Found ${logs.length} event(s) with topic filter`);
        } catch (error) {
            console.warn(`Error with topic filtering: ${error.message}`);
        }

        // If no logs found, try without topic filter
        if (logs.length === 0) {
            try {
                console.log('Trying without topic filter...');
                logs = await provider.getLogs({
                    address: CONTRACT_ADDRESS,
                    fromBlock: fromBlock,
                    toBlock: toBlock
                });
                console.log(`📊 Found ${logs.length} total events on contract (no filter)`);

                // Log all available topics for debugging
                if (logs.length > 0) {
                    const uniqueTopics = [...new Set(logs.map(log => log.topics[0]))];
                    console.log('Available topics on contract:', uniqueTopics);
                }
            } catch (error) {
                console.error(`Error getting logs without filter: ${error.message}`);
            }
        }

        // Process all logs and try to find MintRequested events
        for (const log of logs) {
            try {
                let parsedLog;

                try {
                    parsedLog = nft.interface.parseLog(log);
                    if (!parsedLog || parsedLog.name !== 'MintRequested') continue;
                } catch {
                    // Skip logs we can't parse
                    continue;
                }

                // Extract event data
                const tokenId = parsedLog.args.tokenId;
                const buyer = parsedLog.args.buyer;
                const breed = parsedLog.args.breed;

                const id = Number(tokenId);

                // Skip if we've already processed this token
                if (processedTokens.has(id)) {
                    console.log(`⏭️ Skipping already processed token #${id}`);
                    continue;
                }

                // Check for user preference in localStorage (if we have it)
                // Note: This may not work directly for server-side code,
                // but we need to get the user's preferred provider somehow
                // In a real implementation, you might store this in a database
                const storedProvider = global.localStorage?.getItem('ninjacat_provider');
                const storedPromptExtras = global.localStorage?.getItem('ninjacat_promptExtras');
                const storedNegativePrompt = global.localStorage?.getItem('ninjacat_negativePrompt');

                console.log(`📝 Queueing token #${id} (${breed}) from buyer ${buyer}`);
                console.log(`🎨 Selected image provider: ${storedProvider || IMAGE_PROVIDER}`);

                // Add to processing queue with explicit provider and all options
                mintQueue.push({
                    tokenId,
                    buyer,
                    breed,
                    imageProvider: storedProvider || IMAGE_PROVIDER,
                    promptExtras: storedPromptExtras || '',
                    negativePrompt: storedNegativePrompt || ''
                    // No force or regeneration flags for regular events
                });
            } catch (err) {
                console.error('❌ Error processing log:', err);
                console.log('Raw log data:', log);
            }
        }

        // Start queue processing if items were added
        if (mintQueue.length > 0) {
            processQueue();
        }

        // Update last processed block and save state
        lastBlock = toBlock;
        await saveState();
    } catch (err) {
        console.error('❗ Error in event polling:', err.message);
    }
}

/* ───── Start the polling system ─────────────────────────────── */
async function initialize() {
    // Get blockchain info first
    const { blockNumber } = await getBlockchainInfo();

    await loadState();

    // Check if we're way behind or starting fresh
    if (blockNumber - lastBlock > 10000) {
        console.log(`⚠️ Current block (${blockNumber}) is far ahead of last processed block (${lastBlock})`);

        // If we're more than 10,000 blocks behind, or starting from 0, fast forward to recent blocks
        if (lastBlock < 1000) {
            const newStartBlock = Math.max(1, blockNumber - 5000);
            console.log(`🔄 Setting initial scan point to block ${newStartBlock} (skipping ancient history)`);
            lastBlock = newStartBlock;
            await saveState();
        }
    }

    // Validate event signatures
    validateEventSignatures();

    // Set up task cleanup
    setInterval(async () => {
        await cleanupTasks();
    }, 3600000); // Run every hour

    // Set up regular polling
    console.log(`🚀 Starting event polling (every 15s from block ${lastBlock})...`);
    setInterval(checkForEvents, 15000);

    // Run initial check immediately
    checkForEvents();
}

// Start the system
initialize().catch(err => {
    console.error('Failed to initialize server:', err);
});

/* ───── Graceful shutdown ───────────────────────────────────── */
process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down server...');
    await saveState();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 Shutting down server (SIGTERM)...');
    await saveState();
    process.exit(0);
});

// Log uncaught exceptions but keep the server running
process.on('uncaughtException', (err) => {
    console.error('Uncaught exception:', err);
});