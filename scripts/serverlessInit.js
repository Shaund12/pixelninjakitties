/**
 * Serverless initialization module
 * Provides shared instances and utilities for API functions
 */

import 'dotenv/config';
import { ethers } from 'ethers';
import { providerPreferences } from './providerPreferencesManager.js';
import { UptimeTracker } from './healthCheck.js';
import fs from 'fs/promises';
import path from 'path';

// Initialize uptime tracker
const uptimeTracker = new UptimeTracker();

// Environment variables
const {
    RPC_URL,
    CONTRACT_ADDRESS,
    PRIVATE_KEY,
    PLACEHOLDER_URI,
    IMAGE_PROVIDER = 'dall-e'
} = process.env;

// Shared instances (initialized lazily)
let provider;
let signer;
let nft;
let eventSig;
let processedTokens;
let mintQueue;
let lastBlock = 0;
const processingQueue = false;
const lastMinuteRequests = [];

// Constants
const RATE_LIMIT = 5;
const RATE_WINDOW = 60000; // 1 minute in milliseconds
const STATE_FILE = path.join(process.cwd(), 'event-state.json');

/**
 * Initialize blockchain components
 */
export async function initializeBlockchain() {
    if (!provider) {
        if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY) {
            throw new Error('Missing required environment variables');
        }

        provider = new ethers.JsonRpcProvider(RPC_URL);
        signer = new ethers.Wallet(PRIVATE_KEY, provider);

        const abi = [
            'event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)',
            'function tokenURI(uint256) view returns (string)',
            'function setTokenURI(uint256,string)'
        ];

        nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
        eventSig = nft.interface.getEvent('MintRequested').topicHash;

        // Initialize storage
        processedTokens = new Set();
        mintQueue = [];

        // Load state
        await loadState();

        // Initialize provider preferences table
        await providerPreferences.initializeTable();
    }

    return {
        provider,
        signer,
        nft,
        eventSig,
        providerPreferences,
        processedTokens,
        mintQueue,
        get lastBlock() { return lastBlock; },
        set lastBlock(value) { lastBlock = value; },
        get processingQueue() { return processingQueue; },
        set processingQueue(value) { processingQueue = value; },
        get lastMinuteRequests() { return lastMinuteRequests; },
        set lastMinuteRequests(value) { lastMinuteRequests = value; },
        RATE_LIMIT,
        RATE_WINDOW
    };
}

/**
 * Load state from persistent storage
 */
async function loadState() {
    try {
        const stateData = await fs.readFile(STATE_FILE, 'utf8');
        const state = JSON.parse(stateData);
        lastBlock = state.lastBlock || 0;
        processedTokens = new Set(state.processedTokens || []);
        console.log(`📂 Loaded state: lastBlock=${lastBlock}, processedTokens=${processedTokens.size}`);
    } catch {
        // If file doesn't exist, initialize with safe defaults
        if (provider) {
            const currentBlock = await provider.getBlockNumber();
            lastBlock = Math.max(0, currentBlock - 1000);
        }
        processedTokens = new Set();
        console.log(`🆕 Created new state: starting from block ${lastBlock}`);
    }
}

/**
 * Save current state to persistent storage
 */
export async function saveState() {
    const state = {
        lastBlock,
        processedTokens: Array.from(processedTokens)
    };
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
    console.log(`💾 Saved state: lastBlock=${lastBlock}, processedTokens=${processedTokens.size}`);
}

/**
 * Get uptime tracker instance
 */
export function getUptimeTracker() {
    return uptimeTracker;
}

/**
 * Get environment variables
 */
export function getEnvVars() {
    return {
        RPC_URL,
        CONTRACT_ADDRESS,
        PRIVATE_KEY,
        PLACEHOLDER_URI,
        IMAGE_PROVIDER
    };
}

/**
 * Standard CORS headers for all API responses
 */
export function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS?.split(',')?.join(',') || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/**
 * Handle OPTIONS requests for CORS
 */
export function handleOptions(req, res) {
    if (req.method === 'OPTIONS') {
        setCorsHeaders(res);
        res.status(200).end();
        return true;
    }
    return false;
}