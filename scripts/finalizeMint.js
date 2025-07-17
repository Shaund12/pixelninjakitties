/**
 * scripts/finalizeMint.js
 * ───────────────────────────────────────────────────────────────
 * Production-ready NFT generation service for Pixel Ninja Cats
 * 
 * FEATURES:
 * - Multi-provider AI image generation (DALL-E, Stability, HuggingFace)
 * - Supabase integration for caching, analytics, and queue management
 * - Robust error handling with circuit breakers and retries
 * - Performance monitoring and structured logging
 * - IPFS storage with multiple fallbacks
 * - Rich metadata with rarity system and storytelling
 * - Background affinity system with stat bonuses
 * - Production-grade memory management
 * 
 * SUPABASE TABLES REQUIRED:
 * - generation_cache: Store successful generations for reuse
 * - generation_analytics: Track performance metrics
 * - generation_queue: Manage bulk generation requests
 * - provider_health: Monitor provider availability
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import FormData from 'form-data';
import fetch from 'node-fetch';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import pLimit from 'p-limit';
import pRetry from 'p-retry';
import { performance } from 'perf_hooks';
import winston from 'winston';
import { createClient } from '@supabase/supabase-js';
import {
    generateTraits,
    assembleMetadata,
    getBackgroundDefinitions,
    normalizeToGatewayUrl
} from '../utils/metadata.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

// Initialize Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// Production logger configuration
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'finalize-mint' },
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({
            filename: 'logs/error.log',
            level: 'error',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.File({
            filename: 'logs/combined.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        })
    ]
});

// Performance tracking with Supabase analytics
class PerformanceTracker {
    constructor() {
        this.metrics = new Map();
        this.analyticsQueue = [];
        this.flushInterval = setInterval(() => this.flushAnalytics(), 5000);
    }

    start(operation) {
        this.metrics.set(operation, {
            startTime: performance.now(),
            timestamp: new Date().toISOString()
        });
    }

    async end(operation, metadata = {}) {
        const metric = this.metrics.get(operation);
        if (!metric) return null;

        const duration = performance.now() - metric.startTime;
        this.metrics.delete(operation);

        // Queue analytics data
        this.analyticsQueue.push({
            operation,
            duration,
            timestamp: metric.timestamp,
            metadata,
            environment: process.env.NODE_ENV || 'development'
        });

        logger.debug(`Performance: ${operation} took ${duration.toFixed(2)}ms`);
        return duration;
    }

    async flushAnalytics() {
        if (this.analyticsQueue.length === 0) return;

        const batch = [...this.analyticsQueue];
        this.analyticsQueue = [];

        try {
            const { error } = await supabase
                .from('generation_analytics')
                .insert(batch);

            if (error) {
                logger.error('Failed to save analytics:', error);
                // Re-queue failed items
                this.analyticsQueue.unshift(...batch);
            }
        } catch (err) {
            logger.error('Analytics flush error:', err);
        }
    }

    async track(operation, fn, metadata = {}) {
        this.start(operation);
        try {
            const result = await fn();
            await this.end(operation, { ...metadata, success: true });
            return result;
        } catch (error) {
            await this.end(operation, { ...metadata, success: false, error: error.message });
            throw error;
        }
    }

    destroy() {
        clearInterval(this.flushInterval);
        this.flushAnalytics();
    }
}

// Circuit breaker with Supabase health tracking
class CircuitBreaker {
    constructor(name, options = {}) {
        this.name = name;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 60000; // 1 minute
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.failures = 0;
        this.nextAttempt = Date.now();
        this.lastError = null;
    }

    async execute(fn) {
        if (this.state === 'OPEN') {
            if (Date.now() < this.nextAttempt) {
                throw new Error(`Circuit breaker is OPEN for ${this.name}`);
            }
            this.state = 'HALF_OPEN';
        }

        try {
            const result = await fn();
            await this.onSuccess();
            return result;
        } catch (error) {
            await this.onFailure(error);
            throw error;
        }
    }

    async onSuccess() {
        this.failures = 0;
        this.lastError = null;

        if (this.state === 'HALF_OPEN') {
            this.state = 'CLOSED';
            logger.info(`Circuit breaker for ${this.name} is now CLOSED`);
        }

        // Update provider health in Supabase
        await this.updateProviderHealth('healthy');
    }

    async onFailure(error) {
        this.failures++;
        this.lastError = error.message;

        if (this.failures >= this.failureThreshold) {
            this.state = 'OPEN';
            this.nextAttempt = Date.now() + this.resetTimeout;
            logger.warn(`Circuit breaker for ${this.name} is now OPEN`);
        }

        // Update provider health in Supabase
        await this.updateProviderHealth('unhealthy');
    }

    async updateProviderHealth(status) {
        try {
            await supabase
                .from('provider_health')
                .upsert({
                    provider_name: this.name,
                    status,
                    state: this.state,
                    failures: this.failures,
                    last_error: this.lastError,
                    updated_at: new Date().toISOString()
                });
        } catch (err) {
            logger.error('Failed to update provider health:', err);
        }
    }
}

// Supabase-backed generation cache
class GenerationCache {
    constructor() {
        this.memoryCache = new Map();
        this.maxMemorySize = 100;
    }

    getCacheKey(params) {
        const normalized = {
            breed: params.breed,
            traits: params.traits,
            provider: params.provider,
            model: params.model
        };
        return createHash('sha256')
            .update(JSON.stringify(normalized))
            .digest('hex');
    }

    async get(params) {
        const key = this.getCacheKey(params);

        // Check memory cache first
        if (this.memoryCache.has(key)) {
            logger.debug(`Cache hit (memory): ${key}`);
            return this.memoryCache.get(key);
        }

        // Check Supabase cache
        try {
            const { data, error } = await supabase
                .from('generation_cache')
                .select('*')
                .eq('cache_key', key)
                .single();

            if (!error && data) {
                logger.debug(`Cache hit (Supabase): ${key}`);

                // Update memory cache
                this.updateMemoryCache(key, data);

                return {
                    imageUri: data.image_uri,
                    metadata: data.metadata,
                    provider: data.provider,
                    cached: true
                };
            }
        } catch (err) {
            logger.error('Cache lookup error:', err);
        }

        return null;
    }

    async set(params, result) {
        const key = this.getCacheKey(params);

        // Save to Supabase
        try {
            await supabase
                .from('generation_cache')
                .upsert({
                    cache_key: key,
                    breed: params.breed,
                    traits: params.traits,
                    provider: result.provider,
                    model: result.model,
                    image_uri: result.imageUri,
                    metadata: result.metadata,
                    created_at: new Date().toISOString()
                });

            // Update memory cache
            this.updateMemoryCache(key, result);

            logger.debug(`Cached generation: ${key}`);
        } catch (err) {
            logger.error('Cache save error:', err);
        }
    }

    updateMemoryCache(key, value) {
        // LRU eviction
        if (this.memoryCache.size >= this.maxMemorySize) {
            const firstKey = this.memoryCache.keys().next().value;
            this.memoryCache.delete(firstKey);
        }
        this.memoryCache.set(key, value);
    }
}

// Rate limiter for API calls
const createRateLimiter = (concurrency = 2) => pLimit(concurrency);

// Input validation with sanitization
const validateInput = (input) => {
    const { tokenId, breed, imageProvider } = input;

    if (!tokenId || (typeof tokenId !== 'string' && typeof tokenId !== 'number')) {
        throw new Error('Invalid tokenId: must be a string or number');
    }

    if (breed && typeof breed !== 'string') {
        throw new Error('Invalid breed: must be a string');
    }

    const validProviders = ['dall-e', 'stability', 'huggingface'];
    if (imageProvider && !validProviders.includes(imageProvider)) {
        throw new Error(`Invalid imageProvider: must be one of ${validProviders.join(', ')}`);
    }

    // Sanitize inputs
    return {
        ...input,
        tokenId: String(tokenId).replace(/[^0-9]/g, ''),
        breed: breed ? breed.trim().slice(0, 50) : 'Tabby',
        imageProvider: imageProvider?.toLowerCase()?.trim()
    };
};

// Memory management utilities
const cleanupTempFiles = async (directory) => {
    try {
        await fs.rm(directory, { recursive: true, force: true });
        logger.debug(`Cleaned up temp directory: ${directory}`);
    } catch (error) {
        logger.warn(`Failed to cleanup temp directory ${directory}: ${error.message}`);
    }
};

// Enhanced error class
class MintError extends Error {
    constructor(message, code, details = {}) {
        super(message);
        this.name = 'MintError';
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load JSON schema
let schema;
try {
    schema = JSON.parse(
        readFileSync(path.resolve(__dirname, '../docs/metadata-schema.json'), 'utf8')
    );
} catch {
    logger.warn('Could not load metadata schema file, using default schema');
    schema = {
        'type': 'object',
        'required': ['name', 'image', 'attributes'],
        'properties': {
            'name': { 'type': 'string' },
            'description': { 'type': 'string' },
            'image': { 'type': 'string' },
            'attributes': { 'type': 'array' }
        }
    };
}

const ajv = new Ajv();
addFormats(ajv);
const validateMetadata = ajv.compile(schema);

// Critical validation function
function validateHttpsUri(uri, context = 'URI') {
    if (!uri || typeof uri !== 'string') {
        throw new Error(`${context} is empty or invalid: ${uri}`);
    }

    if (uri.startsWith('ipfs://')) {
        throw new Error(`${context} is still raw IPFS format: ${uri} - This should have been normalized!`);
    }

    if (!uri.startsWith('https://')) {
        throw new Error(`${context} is not HTTPS format: ${uri}`);
    }

    logger.info(`${context} validation passed: ${uri}`);
    return uri;
}

const execAsync = promisify(exec);

// Environment configuration
const {
    OPENAI_API_KEY,
    STABILITY_API_KEY,
    HUGGING_FACE_TOKEN,
    PINATA_API_KEY,
    PINATA_SECRET_KEY,
    BASE_URL,
    PROJECT_NAME,
    IMAGE_PROVIDER = 'dall-e',
    HF_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0',
    DALLE_MODEL = 'dall-e-3',
    STABILITY_MODEL = 'stable-diffusion-xl-1024-v1-0',
    SUPABASE_URL,
    SUPABASE_ANON_KEY
} = process.env;

// Verify Supabase configuration
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    logger.warn('Supabase not configured - running without database features');
}

// Provider configuration
const PROVIDERS = {
    huggingface: {
        name: 'HuggingFace',
        key: HUGGING_FACE_TOKEN,
        model: HF_MODEL,
        models: {
            'stabilityai/stable-diffusion-xl-base-1.0': 'SDXL (High Quality)',
            'prompthero/openjourney': 'Openjourney (Midjourney Style)',
            'runwayml/stable-diffusion-v1-5': 'SD 1.5 (Faster)',
            'ByteDance/SDXL-Lightning': 'SDXL Lightning (Fastest)',
            'Lykon/dreamshaper-xl-1-0': 'Dreamshaper XL (Stylized)'
        },
        free: true,
        rateLimiter: createRateLimiter(3),
        pixelSettings: {
            guidance_scale: 8.5,
            num_inference_steps: 50,
            prompt_prefix: '32x32 pixel art of a ninja cat, ',
            prompt_suffix: ', retro game style, limited color palette, charming, detailed pixel art, NES style',
            backgrounds: getBackgroundDefinitions(),
            negativePrompt: 'text, letters, numbers, words, captions, labels, watermarks, signatures, blurry, low quality'
        }
    },
    'dall-e': {
        name: 'DALL-E',
        key: OPENAI_API_KEY,
        model: DALLE_MODEL,
        models: {
            'dall-e-3': 'DALL-E 3 (Best Quality)',
            'dall-e-2': 'DALL-E 2 (Faster)'
        },
        free: false,
        rateLimiter: createRateLimiter(2),
        pixelSettings: {
            quality: 'hd',
            style: 'vivid',
            size: '1024x1024',
            prompt_prefix: '32x32 pixel art sprite of a ninja cat: ',
            prompt_suffix: '. Simple retro game style, chunky pixels, extremely limited color palette, NO TEXT, NO LETTERS, NO NUMBERS, NO WORDS, cute, charming pixel art. NES/SNES era game graphics, no anti-aliasing, blocky pixel edges.',
            backgrounds: getBackgroundDefinitions()
        }
    },
    stability: {
        name: 'Stability AI',
        key: STABILITY_API_KEY,
        model: STABILITY_MODEL,
        models: {
            'stable-diffusion-xl-1024-v1-0': 'SDXL 1.0',
            'stable-diffusion-v1-5': 'SD 1.5 (Faster)'
        },
        free: false,
        rateLimiter: createRateLimiter(2),
        pixelSettings: {
            cfg_scale: 9.5,
            steps: 40,
            prompt_prefix: '32x32 pixel art sprite of a ninja cat: ',
            prompt_suffix: ', retro game style, limited color palette (8-16 colors max), chunky pixels, no anti-aliasing, clean pixel art, NES/SNES aesthetic',
            backgrounds: getBackgroundDefinitions(),
            negativePrompt: 'text, letters, numbers, words, captions, labels, watermarks, signatures, blurry, low quality'
        },
        stylePresets: {
            'pixel-art': 'Pixel Art',
            'anime': 'Anime',
            '3d-model': '3D Model',
            'photographic': 'Photographic',
            'digital-art': 'Digital Art'
        },
        defaultStylePreset: 'pixel-art'
    }
};

// Verify API keys
if (!OPENAI_API_KEY && !STABILITY_API_KEY && !HUGGING_FACE_TOKEN) {
    throw new Error('Missing API keys in .env: need at least one of HUGGING_FACE_TOKEN, OPENAI_API_KEY, or STABILITY_API_KEY');
}

const baseUrl = BASE_URL || 'http://localhost:5000';
const projectName = PROJECT_NAME || 'Pixel Ninja Cats';
const isPinataConfigured = PINATA_API_KEY && PINATA_SECRET_KEY;

// Initialize services
const perf = new PerformanceTracker();
const cache = new GenerationCache();
const circuitBreakers = {
    openai: new CircuitBreaker('OpenAI'),
    stability: new CircuitBreaker('Stability AI'),
    huggingface: new CircuitBreaker('HuggingFace'),
    pinata: new CircuitBreaker('Pinata'),
    ipfs: new CircuitBreaker('IPFS')
};

// Optional sharp for image processing
let sharp;
try { sharp = (await import('sharp')).default; } catch { /* fine */ }

// OpenAI client
let openai;
if (OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

/**
 * Enhanced finalizeMint with production features
 */
export async function finalizeMint(options) {
    const requestId = createHash('sha256')
        .update(`${options.tokenId}-${Date.now()}`)
        .digest('hex')
        .slice(0, 8);

    logger.info(`Starting mint request ${requestId}`, {
        tokenId: options.tokenId,
        breed: options.breed,
        provider: options.imageProvider
    });

    let tempDirectory = null;
    let taskManager = null;

    try {
        // Validate and sanitize inputs
        const sanitizedOptions = validateInput(options);
        const { tokenId, breed, taskId, imageProvider } = sanitizedOptions;

        // Initialize task manager if needed
        if (taskId) {
            try {
                taskManager = await import('./taskManager.js');
                taskManager.updateTask(taskId, {
                    status: taskManager.TASK_STATES.PROCESSING,
                    progress: 10,
                    message: 'Starting NFT generation process',
                    requestId
                });
            } catch (err) {
                logger.warn(`Could not initialize task manager: ${err.message}`);
            }
        }

        // Track overall performance
        perf.start(`mint-${requestId}`);

        // Check cache first
        const cacheParams = {
            breed,
            provider: imageProvider || IMAGE_PROVIDER,
            model: PROVIDERS[imageProvider || IMAGE_PROVIDER]?.model
        };

        const cached = await cache.get(cacheParams);
        if (cached && !options.skipCache) {
            logger.info(`Using cached generation for ${requestId}`);

            const totalTime = await perf.end(`mint-${requestId}`, { cached: true });

            if (taskManager) {
                taskManager.completeTask(taskId, {
                    ...cached,
                    tokenId,
                    totalTime: totalTime / 1000,
                    cached: true
                });
            }

            return {
                ...cached,
                tokenId,
                stats: {
                    totalTime: totalTime / 1000,
                    cached: true,
                    requestId,
                    timestamp: Date.now()
                }
            };
        }

        // Generate traits
        const traits = await perf.track('generate-traits', async () => {
            logger.debug(`Generating traits for breed: ${breed}, tokenId: ${tokenId}`);
            return generateTraits(breed, tokenId);
        }, { breed, tokenId });

        // Build enhanced prompt
        const { prompt, backgroundTrait } = await buildEnhancedPrompt(traits, sanitizedOptions);

        // Update task status
        if (taskManager) {
            taskManager.updateTask(taskId, {
                progress: 30,
                message: `Generating image with ${imageProvider || IMAGE_PROVIDER}`,
                prompt,
                traits: traits.attributes.map(a => `${a.trait_type}: ${a.value}`).join(', '),
                rarity: traits.rarity.tier,
                background: backgroundTrait?.name
            });
        }

        // Generate image with retry logic
        const imageResult = await perf.track('generate-image', async () => {
            return await pRetry(
                async () => {
                    const provider = PROVIDERS[imageProvider || IMAGE_PROVIDER];
                    return await provider.rateLimiter(async () => {
                        return await generateImageWithCircuitBreaker(prompt, sanitizedOptions);
                    });
                },
                {
                    retries: 3,
                    onFailedAttempt: (error) => {
                        logger.warn(`Image generation attempt ${error.attemptNumber} failed: ${error.message}`);
                        if (taskManager) {
                            taskManager.updateTask(taskId, {
                                message: `Retrying image generation (attempt ${error.attemptNumber + 1}/4)...`
                            });
                        }
                    }
                }
            );
        }, { provider: imageProvider || IMAGE_PROVIDER });

        // Process and optimize image
        tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'ninjacat-'));
        const processedImage = await perf.track('process-image', async () => {
            return await processImageEnhanced(imageResult, tempDirectory);
        });

        // Upload to IPFS with retry
        const imageUri = await perf.track('upload-image', async () => {
            return await uploadWithRetry(processedImage.path, `${breed}-${tokenId}.png`);
        });

        // Create and validate metadata
        const metadata = await perf.track('create-metadata', async () => {
            return createEnhancedMetadata(traits, imageUri, {
                ...sanitizedOptions,
                backgroundTrait,
                imageResult
            });
        });

        // Save metadata
        const metadataPath = path.join(tempDirectory, `${tokenId}.json`);
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

        // Upload metadata
        const metadataUri = await perf.track('upload-metadata', async () => {
            return await uploadWithRetry(metadataPath, `${tokenId}.json`);
        });

        // Ensure HTTPS URIs
        const finalTokenURI = normalizeToGatewayUrl(metadataUri);
        const finalImageURI = normalizeToGatewayUrl(imageUri);

        validateHttpsUri(finalTokenURI, 'Final Token URI');
        validateHttpsUri(finalImageURI, 'Final Image URI');

        // Calculate final metrics
        const totalTime = await perf.end(`mint-${requestId}`);

        // Cache the result
        const result = {
            tokenURI: finalTokenURI,
            imageUri: finalImageURI,
            metadata,
            provider: imageResult.provider,
            model: imageResult.model,
            background: backgroundTrait?.name
        };

        await cache.set(cacheParams, result);

        // Log to Supabase for analytics
        if (SUPABASE_URL) {
            await supabase
                .from('generation_log')
                .insert({
                    request_id: requestId,
                    token_id: tokenId,
                    breed,
                    provider: imageResult.provider,
                    model: imageResult.model,
                    total_time: totalTime,
                    success: true,
                    metadata_uri: finalTokenURI,
                    image_uri: finalImageURI,
                    created_at: new Date().toISOString()
                });
        }

        logger.info(`Mint completed successfully`, {
            requestId,
            tokenId,
            totalTime: (totalTime / 1000).toFixed(2),
            provider: imageResult.provider
        });

        // Complete task if applicable
        if (taskManager) {
            taskManager.completeTask(taskId, {
                ...result,
                tokenId,
                totalTime: totalTime / 1000,
                requestId
            });
        }

        return {
            ...result,
            stats: {
                totalTime: totalTime / 1000,
                requestId,
                timestamp: Date.now()
            }
        };

    } catch (error) {
        const errorDetails = {
            message: error.message,
            code: error.code || 'MINT_FAILED',
            requestId,
            tokenId: options.tokenId
        };

        logger.error(`Mint failed`, errorDetails);

        // Log failure to Supabase
        if (SUPABASE_URL) {
            await supabase
                .from('generation_log')
                .insert({
                    request_id: requestId,
                    token_id: options.tokenId,
                    breed: options.breed,
                    provider: options.imageProvider || IMAGE_PROVIDER,
                    success: false,
                    error: error.message,
                    created_at: new Date().toISOString()
                });
        }

        if (taskManager && options.taskId) {
            taskManager.failTask(options.taskId, error);
        }

        throw new MintError(
            `Failed to mint NFT: ${error.message}`,
            error.code || 'MINT_FAILED',
            errorDetails
        );

    } finally {
        // Always cleanup temp files
        if (tempDirectory) {
            await cleanupTempFiles(tempDirectory);
        }
    }
}

/**
 * Build enhanced prompt with background selection
 */
async function buildEnhancedPrompt(traits, options) {
    const { breed, promptExtras = '' } = options;
    const providerKey = options.imageProvider || IMAGE_PROVIDER;
    const provider = PROVIDERS[providerKey];

    // Extract traits
    const weapon = traits.rawTraits.find(t => t.trait_type === 'Weapon')?.value || 'Katana';
    const stance = traits.rawTraits.find(t => t.trait_type === 'Stance')?.value || 'Attack';
    const element = traits.rawTraits.find(t => t.trait_type === 'Element')?.value || 'Fire';
    const rank = traits.rawTraits.find(t => t.trait_type === 'Rank')?.value || 'Novice';

    // Select background
    let backgroundTrait = null;
    let backgroundDescription = '';

    if (provider?.pixelSettings?.backgrounds?.length > 0) {
        const seed = parseInt(options.tokenId, 10);
        const backgroundHash = createHash('sha256')
            .update(`${seed}-${breed}-background`)
            .digest('hex');
        const hashValue = parseInt(backgroundHash.substring(0, 8), 16);

        const backgrounds = provider.pixelSettings.backgrounds;
        const affinityBackgrounds = backgrounds.filter(bg =>
            bg.affinityBreeds && bg.affinityBreeds.includes(breed)
        );

        const useAffinityBackground = affinityBackgrounds.length > 0 && (hashValue % 100 < 60);
        const selectedBackgrounds = useAffinityBackground ? affinityBackgrounds : backgrounds;

        // Weighted selection
        const totalWeight = selectedBackgrounds.reduce((sum, bg) =>
            sum + Math.pow(bg.rarityScore || 30, 2), 0
        );
        const target = (hashValue / (2 ** 32)) * totalWeight;
        let cumulativeWeight = 0;

        for (const bg of selectedBackgrounds) {
            cumulativeWeight += Math.pow(bg.rarityScore || 30, 2);
            if (target <= cumulativeWeight) {
                backgroundTrait = bg;
                break;
            }
        }

        if (!backgroundTrait) {
            backgroundTrait = selectedBackgrounds[hashValue % selectedBackgrounds.length];
        }

        if (backgroundTrait) {
            backgroundDescription = ` ${backgroundTrait.description}`;

            // Add to traits
            traits.attributes.push({
                trait_type: 'Background',
                value: backgroundTrait.name
            });

            traits.rawTraits.push({
                trait_type: 'Background',
                value: backgroundTrait.name,
                rarity: backgroundTrait.rarity || 'Common',
                keywords: backgroundTrait.keywords || []
            });

            // Apply stat bonuses
            if (backgroundTrait.statBonus) {
                Object.entries(backgroundTrait.statBonus).forEach(([stat, bonus]) => {
                    const statIndex = traits.attributes.findIndex(
                        attr => attr.trait_type.toLowerCase() === stat.toLowerCase()
                    );
                    if (statIndex !== -1) {
                        traits.attributes[statIndex].value += bonus;
                    }
                });
            }
        }
    }

    // Build prompt
    const basePrompt = `A pixel art ninja cat of ${breed} breed in ${stance} stance wielding ${weapon} with ${element} powers, ${rank} rank`;
    const keywords = traits.keywords.join(', ');
    const backgroundKeywords = backgroundTrait?.keywords?.join(', ') || '';
    const enhancedBackgroundDesc = backgroundTrait ?
        `, set in ${backgroundTrait.description}, ${backgroundKeywords}` : '';

    const prompt = promptExtras
        ? `${basePrompt}, ${keywords}${enhancedBackgroundDesc}, ${promptExtras}`
        : `${basePrompt}, ${keywords}${enhancedBackgroundDesc}`;

    return { prompt, backgroundTrait };
}

/**
 * Generate image with circuit breaker
 */
async function generateImageWithCircuitBreaker(prompt, options) {
    const provider = options.imageProvider || IMAGE_PROVIDER;
    const breaker = circuitBreakers[provider] || circuitBreakers.openai;

    return await breaker.execute(async () => {
        return await generateImage(prompt, options);
    });
}

/**
 * Enhanced image processing with optimization
 */
async function processImageEnhanced(imageResult, tempDirectory) {
    const outputPath = path.join(tempDirectory, 'image.png');

    // Download/save image
    if (imageResult.isLocal && imageResult.localPath) {
        await fs.copyFile(imageResult.localPath, outputPath);
    } else if (imageResult.url) {
        const response = await fetch(imageResult.url);
        const buffer = Buffer.from(await response.arrayBuffer());
        await fs.writeFile(outputPath, buffer);
    } else if (imageResult.base64) {
        const buffer = Buffer.from(imageResult.base64, 'base64');
        await fs.writeFile(outputPath, buffer);
    } else {
        throw new Error('No valid image source in generation result');
    }

    // Apply optimizations if sharp is available
    if (sharp) {
        try {
            const optimizedPath = path.join(tempDirectory, 'optimized.png');

            await sharp(outputPath)
                .resize(512, 512, {
                    kernel: 'nearest',
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                })
                .png({
                    palette: true,
                    colors: 16,
                    compressionLevel: 9,
                    effort: 10
                })
                .toFile(optimizedPath);

            // Check file sizes
            const originalSize = (await fs.stat(outputPath)).size;
            const optimizedSize = (await fs.stat(optimizedPath)).size;

            if (optimizedSize < originalSize * 1.2) { // Allow slight increase for better quality
                logger.debug(`Image optimized: ${originalSize} → ${optimizedSize} bytes`);
                return { path: optimizedPath, directory: tempDirectory };
            }
        } catch (error) {
            logger.warn(`Image optimization failed: ${error.message}`);
        }
    }

    return { path: outputPath, directory: tempDirectory };
}

/**
 * Upload with retry and circuit breaker
 */
async function uploadWithRetry(filePath, name) {
    return await pRetry(
        async () => {
            if (isPinataConfigured) {
                return await circuitBreakers.pinata.execute(async () => {
                    return await uploadToPinata(filePath, name);
                });
            } else {
                return await circuitBreakers.ipfs.execute(async () => {
                    return await uploadToIPFSFallback(filePath, name);
                });
            }
        },
        {
            retries: 3,
            minTimeout: 1000,
            maxTimeout: 10000,
            onFailedAttempt: (error) => {
                logger.warn(`Upload attempt ${error.attemptNumber} failed: ${error.message}`);
            }
        }
    );
}

/**
 * Create enhanced metadata with validation
 */
async function createEnhancedMetadata(traits, imageUri, options) {
    const { tokenId, backgroundTrait, imageResult, metadataExtras = {} } = options;

    const metadata = assembleMetadata(traits, imageUri, {
        name: `${projectName} #${tokenId}`,
        tokenId,
        external_url: `${baseUrl}/kitty/${tokenId}`,
        generationInfo: {
            timestamp: Date.now(),
            version: '2.0',
            provider: imageResult.provider,
            model: imageResult.model,
            background: backgroundTrait?.name,
            rarity: traits.rarity,
            ...metadataExtras
        }
    });

    // Validate metadata
    if (!validateMetadata(metadata)) {
        logger.warn('Metadata validation failed', { errors: validateMetadata.errors });
    }

    return metadata;
}

/**
 * Image generation functions (existing implementations remain the same)
 */
async function generateDallEImage(prompt, options = {}) {
    if (!openai) throw new Error('OpenAI API not configured');

    const settings = PROVIDERS['dall-e'].pixelSettings;
    const model = PROVIDERS['dall-e'].model;

    let enhancedPrompt = options.useCustomPrompt ? prompt :
        `NO TEXT, NO LETTERS, NO NUMBERS: ${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    enhancedPrompt = `GENERATE IMAGE WITHOUT ANY TEXT. ${enhancedPrompt}. IMPORTANT: THE IMAGE MUST NOT CONTAIN ANY TEXT, LETTERS, NUMBERS, WORDS, SYMBOLS, SIGNATURES, WATERMARKS, OR LABELS WHATSOEVER.`;

    logger.debug(`Generating image with ${model}`, { prompt: enhancedPrompt });

    const requestConfig = {
        model: model,
        prompt: enhancedPrompt,
        n: 1,
        size: options.size || settings.size,
        quality: options.quality || settings.quality,
        style: settings.style
    };

    if (options.responseFormat) {
        requestConfig.response_format = options.responseFormat;
    }

    const { data } = await openai.images.generate(requestConfig);

    return {
        url: data[0].url,
        base64: data[0].b64_json,
        isLocal: false,
        provider: 'dall-e',
        model: model,
        prompt: enhancedPrompt,
        metadata: {
            width: parseInt(settings.size.split('x')[0], 10),
            height: parseInt(settings.size.split('x')[1], 10),
            quality: settings.quality
        }
    };
}

async function generateStabilityImage(prompt, options = {}) {
    if (!STABILITY_API_KEY) throw new Error('Stability AI API not configured');

    const settings = PROVIDERS.stability.pixelSettings;
    const model = options.model || PROVIDERS.stability.model;
    const stylePreset = options.stylePreset || PROVIDERS.stability.defaultStylePreset || 'pixel-art';

    const enhancedPrompt = options.useCustomPrompt ? prompt :
        `${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    logger.debug(`Generating image with Stability AI (${model})`, { prompt: enhancedPrompt });

    const requestBody = {
        text_prompts: [
            {
                text: enhancedPrompt,
                weight: 1
            }
        ],
        cfg_scale: options.cfgScale || settings.cfg_scale || 9,
        steps: options.steps || settings.steps || 40,
        width: 1024,
        height: 1024,
        samples: 1
    };

    if (options.negativePrompt || settings.negativePrompt) {
        requestBody.text_prompts.push({
            text: options.negativePrompt || settings.negativePrompt,
            weight: -1
        });
    }

    if (stylePreset) {
        requestBody.style_preset = stylePreset;
    }

    const response = await fetch(
        `https://api.stability.ai/v1/generation/${model}/text-to-image`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${STABILITY_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Stability AI error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stability-'));
    const imagePath = path.join(tmpDir, 'image.png');
    const base64Image = result.artifacts[0].base64;
    await fs.writeFile(imagePath, Buffer.from(base64Image, 'base64'));

    return {
        localPath: imagePath,
        isLocal: true,
        provider: 'stability',
        model: model,
        prompt: enhancedPrompt,
        base64: base64Image,
        metadata: {
            width: 1024,
            height: 1024,
            stylePreset: stylePreset
        }
    };
}

async function generateHuggingFaceImage(prompt, options = {}) {
    if (!HUGGING_FACE_TOKEN) throw new Error('HuggingFace API not configured');

    const settings = PROVIDERS.huggingface.pixelSettings;
    const model = options.model || PROVIDERS.huggingface.model;

    const enhancedPrompt = options.useCustomPrompt ? prompt :
        `${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    logger.debug(`Generating image with HuggingFace (${model})`, { prompt: enhancedPrompt });

    const requestBody = {
        inputs: enhancedPrompt,
        parameters: {
            guidance_scale: options.guidance_scale || settings.guidance_scale || 7.5,
            num_inference_steps: options.num_inference_steps || settings.num_inference_steps || 50,
        }
    };

    if (options.negativePrompt || settings.negativePrompt) {
        requestBody.parameters.negative_prompt = options.negativePrompt || settings.negativePrompt;
    }

    const response = await fetch(
        `https://api-inference.huggingface.co/models/${model}`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${HUGGING_FACE_TOKEN}`
            },
            body: JSON.stringify(requestBody)
        }
    );

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HuggingFace error: ${response.status} - ${error}`);
    }

    const imageBuffer = await response.arrayBuffer();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'huggingface-'));
    const imagePath = path.join(tmpDir, 'image.png');
    await fs.writeFile(imagePath, Buffer.from(imageBuffer));

    return {
        localPath: imagePath,
        isLocal: true,
        provider: 'huggingface',
        model: model,
        prompt: enhancedPrompt,
        metadata: {
            model: model,
            guidance_scale: requestBody.parameters.guidance_scale,
            num_inference_steps: requestBody.parameters.num_inference_steps
        }
    };
}

/**
 * Main image generation router
 */
async function generateImage(prompt, options = {}) {
    const ORIGINAL_PROVIDER = options.imageProvider?.toLowerCase()?.trim();

    logger.debug(`Image generation requested`, { provider: ORIGINAL_PROVIDER });

    // Enhanced prompt for pixel art
    if (!options.useCustomPrompt) {
        const basePixelArtEnhancer = ', true pixel art, 16-bit style, limited color palette, no anti-aliasing, pixel perfect';

        if (ORIGINAL_PROVIDER === 'dall-e') {
            prompt = `${prompt}${basePixelArtEnhancer}, clean edges, blocky style, NES/SNES era game sprite`;
            options.quality = options.quality || 'hd';
        } else if (ORIGINAL_PROVIDER === 'stability') {
            prompt = `${prompt}${basePixelArtEnhancer}, crisp pixels, 8-16 colors maximum`;
            options.cfgScale = options.cfgScale || 9.5;
            options.stylePreset = options.stylePreset || 'pixel-art';
        } else if (ORIGINAL_PROVIDER === 'huggingface') {
            prompt = `${prompt}${basePixelArtEnhancer}, 32x32 resolution, gameboy style, pixel perfect`;
            options.guidance_scale = options.guidance_scale || 9.0;
            options.num_inference_steps = options.num_inference_steps || 60;
        }

        if (!options.negativePrompt) {
            options.negativePrompt = 'blurry, anti-aliasing, smooth edges, high detail, realistic, 3D, shading, gradient, photorealistic, text, signature, watermark, blur, noise, grain, high-resolution detail';
        }
    }

    // Use requested provider without fallbacks
    if (ORIGINAL_PROVIDER) {
        if (ORIGINAL_PROVIDER === 'stability' && !STABILITY_API_KEY) {
            throw new Error('Cannot use requested provider "stability" - Missing STABILITY_API_KEY');
        } else if (ORIGINAL_PROVIDER === 'huggingface' && !HUGGING_FACE_TOKEN) {
            throw new Error('Cannot use requested provider "huggingface" - Missing HUGGING_FACE_TOKEN');
        } else if (ORIGINAL_PROVIDER === 'dall-e' && !OPENAI_API_KEY) {
            throw new Error('Cannot use requested provider "dall-e" - Missing OPENAI_API_KEY');
        } else if (!['stability', 'huggingface', 'dall-e'].includes(ORIGINAL_PROVIDER)) {
            throw new Error(`Unknown provider "${ORIGINAL_PROVIDER}" - Valid options: stability, huggingface, dall-e`);
        }

        if (ORIGINAL_PROVIDER === 'stability') {
            return await generateStabilityImage(prompt, options);
        } else if (ORIGINAL_PROVIDER === 'huggingface') {
            return await generateHuggingFaceImage(prompt, options);
        } else if (ORIGINAL_PROVIDER === 'dall-e') {
            return await generateDallEImage(prompt, options);
        }
    }

    // Default behavior with fallbacks
    const errors = [];

    try {
        if (IMAGE_PROVIDER === 'stability' && STABILITY_API_KEY) {
            return await generateStabilityImage(prompt, options);
        } else if (IMAGE_PROVIDER === 'huggingface' && HUGGING_FACE_TOKEN) {
            return await generateHuggingFaceImage(prompt, options);
        } else if (IMAGE_PROVIDER === 'dall-e' && OPENAI_API_KEY) {
            return await generateDallEImage(prompt, options);
        }
    } catch (error) {
        errors.push(`Default provider ${IMAGE_PROVIDER}: ${error.message}`);
    }

    // Try fallbacks
    if (STABILITY_API_KEY) {
        try {
            return await generateStabilityImage(prompt, options);
        } catch (error) {
            errors.push(`Stability: ${error.message}`);
        }
    }

    if (HUGGING_FACE_TOKEN) {
        try {
            return await generateHuggingFaceImage(prompt, options);
        } catch (error) {
            errors.push(`HuggingFace: ${error.message}`);
        }
    }

    if (OPENAI_API_KEY) {
        try {
            return await generateDallEImage(prompt, options);
        } catch (error) {
            errors.push(`DALL-E: ${error.message}`);
        }
    }

    throw new Error(`All image providers failed: ${errors.join('; ')}`);
}

/**
 * IPFS upload functions
 */
async function uploadToPinata(filePath, name) {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
        throw new Error('Pinata not configured');
    }

    const formData = new FormData();
    const fileBuffer = await fs.readFile(filePath);
    formData.append('file', fileBuffer, { filename: path.basename(filePath) });
    formData.append('pinataMetadata', JSON.stringify({ name }));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            pinata_api_key: PINATA_API_KEY,
            pinata_secret_api_key: PINATA_SECRET_KEY,
            ...formData.getHeaders(),
        },
        body: formData,
    });

    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Pinata upload failed: ${res.status} – ${err}`);
    }

    const { IpfsHash: cid } = await res.json();
    return `https://ipfs.io/ipfs/${cid}/${path.basename(filePath)}`;
}

async function uploadToIPFSFallback(filePath, name) {
    try {
        const cmd = `npx web3.storage put "${filePath}" --name "${name}"`;
        const { stdout } = await execAsync(cmd);
        const lines = stdout.trim().split('\n').filter(l => l);
        const cid = lines[lines.length - 1];

        if (!/^[A-Za-z0-9]+$/.test(cid)) {
            throw new Error(`Invalid CID from web3.storage: ${cid}`);
        }

        return `https://ipfs.io/ipfs/${cid}/${path.basename(filePath)}`;
    } catch (err) {
        logger.warn(`web3.storage fallback failed: ${err.message}`);

        // Last resort: local fallback
        const backupDir = path.join(process.cwd(), 'public', 'images');
        await fs.mkdir(backupDir, { recursive: true });
        const filename = `${Date.now()}-${path.basename(filePath)}`;
        await fs.copyFile(filePath, path.join(backupDir, filename));
        return `${baseUrl.replace(/\/$/, '')}/images/${filename}`;
    }
}

async function uploadToIPFS(filePath, name) {
    if (PINATA_API_KEY && PINATA_SECRET_KEY) {
        try {
            return await uploadToPinata(filePath, name);
        } catch (err) {
            logger.warn(`Pinata upload failed, falling back: ${err.message}`);
        }
    }

    return await uploadToIPFSFallback(filePath, name);
}

// Cleanup on process exit
process.on('exit', () => {
    perf.destroy();
});

// Export utilities for testing
export {
    validateInput,
    MintError,
    CircuitBreaker,
    PerformanceTracker,
    GenerationCache,
    logger
};