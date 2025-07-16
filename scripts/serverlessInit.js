// serverlessInit.js

import 'dotenv/config';
import { ethers } from 'ethers';
import { createClient } from '@supabase/supabase-js';
import { UptimeTracker } from './healthCheck.js';

// ── Env vars ────────────────────────────────────────────────────────────────
const {
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    RPC_URL,
    CONTRACT_ADDRESS,
    PRIVATE_KEY,
    PLACEHOLDER_URI,
    IMAGE_PROVIDER = 'dall-e',
    ALLOWED_ORIGINS
} = process.env;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
}
if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY) {
    throw new Error('RPC_URL, CONTRACT_ADDRESS and PRIVATE_KEY are required');
}

// ── Supabase client ────────────────────────────────────────────────────────
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── Uptime tracker ─────────────────────────────────────────────────────────
const uptimeTracker = new UptimeTracker();

// ── Shared instances (lazy init) ───────────────────────────────────────────
let provider;
let signer;
let nft;
let eventSig;
let providerPreferences;
let processedTokens;
let mintQueue;
let lastBlock = 0;
let processingQueue = false;
const lastMinuteRequests = [];

// ── Rate limits ─────────────────────────────────────────────────────────────
export const RATE_LIMIT = 5;
export const RATE_WINDOW = 60_000; // ms

/**
 * Initialize blockchain & storage components
 */
export async function initializeBlockchain() {
  if (!provider) {
    // ── Ethers setup ────────────────────────────────────────────────────────
    provider = new ethers.JsonRpcProvider(RPC_URL);
    signer   = new ethers.Wallet(PRIVATE_KEY, provider);

    const abi = [
      'event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)',
      'function tokenURI(uint256) view returns (string)',
      'function setTokenURI(uint256,string)'
    ];
    nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
    eventSig = nft.interface.getEvent('MintRequested').topicHash;

    // ── Provider preferences storage ───────────────────────────────────────
    providerPreferences = {
      async set(tokenId, { provider: prov, timestamp, options }) {
        const { error } = await supabase
          .from('provider_preferences')
          .upsert(
            { token_id: tokenId, provider: prov, timestamp, options },
            { onConflict: 'token_id' }
          );
        if (error) throw error;
      },
      async get(tokenId) {
        const { data, error } = await supabase
          .from('provider_preferences')
          .select('*')
          .eq('token_id', tokenId)
          .single();
        if (error && error.code !== 'PGRST116') throw error;
        return data;
      }
    };

    // ── Load processedTokens from Supabase ─────────────────────────────────
    try {
      const { data, error } = await supabase
        .from('processed_tokens')
        .select('token_id');
      if (error) throw error;
      processedTokens = new Set(data.map(r => Number(r.token_id)));
    } catch (err) {
      console.warn('Could not load processed_tokens, starting empty', err);
      processedTokens = new Set();
    }

    // ── Initialize mintQueue ───────────────────────────────────────────────
    mintQueue = [];

    // ── Load lastBlock from Supabase ───────────────────────────────────────
    try {
      const { data, error } = await supabase
        .from('event_state')
        .select('last_block')
        .eq('id', 1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      if (data) {
        lastBlock = Number(data.last_block);
      } else {
        const current = await provider.getBlockNumber();
        lastBlock = current > 1000 ? current - 1000 : 0;
      }
    } catch (err) {
      console.warn('Could not load lastBlock, fetching current block', err);
      const current = await provider.getBlockNumber();
      lastBlock = current > 1000 ? current - 1000 : 0;
    }
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
    set lastBlock(val) { lastBlock = val; },
    get processingQueue() { return processingQueue; },
    set processingQueue(val) { processingQueue = val; },
    get lastMinuteRequests() { return lastMinuteRequests; }
  };
}

/**
 * Persist current state back to Supabase
 */
export async function saveState() {
  try {
    const rows = Array.from(processedTokens).map(id => ({ token_id: id }));
    const { error } = await supabase
      .from('processed_tokens')
      .upsert(rows, { onConflict: 'token_id' });
    if (error) throw error;
  } catch (err) {
    console.error('Error saving processed_tokens', err);
  }

  try {
    const { error } = await supabase
      .from('event_state')
      .upsert({ id: 1, last_block: lastBlock }, { onConflict: 'id' });
    if (error) throw error;
  } catch (err) {
    console.error('Error saving lastBlock', err);
  }

  console.log(
    `💾 Saved state: lastBlock=${lastBlock}, processedTokens=${processedTokens.size}`
  );
}

/** Return the shared uptime tracker */
export function getUptimeTracker() {
  return uptimeTracker;
}

/** Return raw environment settings */
export function getEnvVars() {
  return {
    RPC_URL,
    CONTRACT_ADDRESS,
    PRIVATE_KEY,
    PLACEHOLDER_URI,
    IMAGE_PROVIDER,
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  };
}

/** Apply CORS headers to every response */
export function setCorsHeaders(res) {
  res.setHeader(
    'Access-Control-Allow-Origin',
    ALLOWED_ORIGINS?.split(',').join(',') || '*'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PUT, DELETE, OPTIONS'
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

/**
 * Handle preflight OPTIONS
 * @returns true if handled
 */
export function handleOptions(req, res) {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.status(200).end();
    return true;
  }
  return false;
}
