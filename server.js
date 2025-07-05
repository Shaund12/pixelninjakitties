/**
 * server.js
 * ───────────────────────────────────────────────────────────────
 * • Serves static mint site   →  http://localhost:5000
 * • Polls chain every 15 s for MintRequested logs (no RPC filters)
 * • Instantly sets placeholder sprite URI
 * • Generates AI art + rich metadata → pins via w3up → overwrites tokenURI
 * 
 * Rich metadata includes:
 * - Core traits (Weapon, Stance, Element, etc.)
 * - Combat stats based on traits
 * - Backstory and special abilities
 * - Rarity calculations
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { finalizeMint } from "./scripts/finalizeMint.js";
import fs from "fs/promises";
import path from "path";

/* ───── Env checks ───────────────────────────────────────────── */
const {
    RPC_URL,
    CONTRACT_ADDRESS,
    PRIVATE_KEY,
    PLACEHOLDER_URI,
    PORT = 5000
} = process.env;

if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY || !PLACEHOLDER_URI) {
    console.error("❌  Missing env vars – check .env");
    process.exit(1);
}

/* ───── Static site (front-end) ──────────────────────────────── */
const app = express();
app.use(cors());
app.use(express.static("public"));                // index.html, mint.js …
app.listen(PORT, () => console.log(`Static site on :${PORT}`));

/* ───── Provider + signer + contract ─────────────────────────── */
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
    "event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)",
    "function tokenURI(uint256) view returns (string)",
    "function setTokenURI(uint256,string)"
];
const nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
const eventSig = nft.interface.getEvent("MintRequested").topicHash;

/* ───── Rate limiting queue system for OpenAI ─────────────────── */
// DALL-E-3 is limited to 5 images per minute
const RATE_LIMIT = 5;
const RATE_WINDOW = 60000; // 1 minute in milliseconds
const mintQueue = [];
let processingQueue = false;
let lastMinuteRequests = [];

// Process a single mint task with rate limiting
async function processMintTask(task) {
    const { tokenId, breed, buyer } = task;
    const id = Number(tokenId);

    console.log(`⚙️ Processing queued mint for #${id} (${breed}) by ${buyer}`);

    try {
        // Check if we can make a new request
        const now = Date.now();
        // Remove requests older than 1 minute
        lastMinuteRequests = lastMinuteRequests.filter(time => now - time < RATE_WINDOW);

        // If we've reached the rate limit, wait until we can make another request
        if (lastMinuteRequests.length >= RATE_LIMIT) {
            const oldestRequest = lastMinuteRequests[0];
            const waitTime = RATE_WINDOW - (now - oldestRequest) + 100; // Add 100ms buffer
            console.log(`⏱️ Rate limit reached, waiting ${Math.ceil(waitTime / 1000)} seconds`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        /* 1️⃣ Set placeholder URI if needed */
        try {
            const current = await nft.tokenURI(id).catch(() => "");
            if (!current || current === "") {
                const txPH = await nft.setTokenURI(id, PLACEHOLDER_URI);
                await txPH.wait();
                console.log(`  • Placeholder set for token #${id}`);
            }
        } catch (err) {
            console.error(`  • Placeholder failed for token #${id}:`, err);
        }

        /* 2️⃣ Generate final art and metadata */
        console.log(`  • Generating art and metadata for token #${id}...`);

        // Record this API call
        lastMinuteRequests.push(Date.now());

        const { tokenURI } = await finalizeMint({ breed, tokenId: id });
        const tx = await nft.setTokenURI(id, tokenURI);
        await tx.wait();
        console.log(`✅ Finalized #${id} → ${tokenURI}`);

        // Mark this token as processed
        processedTokens.add(id);
        await saveState();

    } catch (err) {
        console.error(`❌ Finalizing #${id} failed:`, err);
    }
}

// Process the queue with a controlled flow
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
const STATE_FILE = path.join(process.cwd(), "event-state.json");
let processedTokens = new Set();
let lastBlock = 0;

// Load state from file or initialize if file doesn't exist
async function loadState() {
    try {
        const stateData = await fs.readFile(STATE_FILE, 'utf8');
        const state = JSON.parse(stateData);
        lastBlock = state.lastBlock || 0;
        processedTokens = new Set(state.processedTokens || []);
        console.log(`📂 Loaded state: lastBlock=${lastBlock}, processedTokens=${processedTokens.size}`);
    } catch (err) {
        // If file doesn't exist, start from a few blocks back for safety
        const currentBlock = await provider.getBlockNumber();
        lastBlock = Math.max(0, currentBlock - 1000);
        processedTokens = new Set();
        console.log(`🆕 Created new state: starting from block ${lastBlock}`);
        await saveState();
    }
}

// Save state to file
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
        const batchSize = 2000;
        const fromBlock = lastBlock + 1;
        const toBlock = Math.min(latest, fromBlock + batchSize - 1);

        console.log(`🔍 Scanning blocks ${fromBlock} to ${toBlock} for MintRequested events...`);

        const logs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock: fromBlock,
            toBlock: toBlock,
            topics: [eventSig]
        });

        console.log(`📊 Found ${logs.length} event(s) in block range ${fromBlock}-${toBlock}`);

        // Add logs to processing queue
        for (const log of logs) {
            const { tokenId, buyer, breed } = nft.interface.parseLog(log).args;
            const id = Number(tokenId);

            // Skip if we've already processed this token
            if (processedTokens.has(id)) {
                console.log(`⏭️ Skipping already processed token #${id}`);
                continue;
            }

            console.log(`📝 Queueing token #${id} for processing`);
            mintQueue.push({ tokenId, buyer, breed });
        }

        // Start queue processing if not already running
        processQueue();

        // Update last processed block and save state
        lastBlock = toBlock;
        await saveState();
    } catch (err) {
        console.error("❗ Error in event polling:", err);
    }
}

/* ───── Start the polling system ─────────────────────────────── */
async function initialize() {
    await loadState();

    // Set up regular polling
    console.log(`🚀 Starting event polling (every 15s from block ${lastBlock})...`);
    setInterval(checkForEvents, 15000);

    // Run initial check immediately
    checkForEvents();
}

// Start the system
initialize().catch(err => {
    console.error("Failed to initialize server:", err);
});

/* ───── Graceful shutdown ───────────────────────────────────── */
process.on("SIGINT", async () => {
    console.log("\n👋 Shutting down server...");
    await saveState();
    process.exit(0);
});