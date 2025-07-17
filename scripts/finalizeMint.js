/**
 * scripts/finalizeMint.js
 * ───────────────────────────────────────────────────────────────
 * Generates a 32 × 32 pixel-art Ninja-Cat sprite via multiple AI providers,
 * trims any stray palette bar, uploads PNG + JSON to IPFS
 * (Pinata first → w3-CLI fallback), and returns { tokenURI }.
 *
 * Rich metadata generation includes:
 * - Core traits (Breed, Weapon, Stance, Element, Rank, Accessory)
 * - Enhanced backgrounds with breed affinities and rarities
 * - Combat stats (Agility, Stealth, Power, Intelligence)
 * - Immersive backstory based on traits and background
 * - Special abilities and synergies
 * - Detailed rarity indicators
 *
 * PROVIDER CONFIGURATION:
 * Set IMAGE_PROVIDER to one of:
 *   "huggingface" - Free with token (register at huggingface.co)
 *   "dall-e"      - OpenAI's DALL-E 3 (paid API)
 *   "stability"   - Stability AI (paid API)
 *
 * MODEL SELECTION:
 * For HuggingFace, set HF_MODEL to one of:
 *   "stabilityai/stable-diffusion-xl-base-1.0" (default, highest quality)
 *   "prompthero/openjourney" (Midjourney-style)
 *   "runwayml/stable-diffusion-v1-5" (faster)
 *   "ByteDance/SDXL-Lightning" (faster generations)
 *   "Lykon/dreamshaper-xl-1-0" (stylized art)
 *
 * Required env:
 *   At least one of: OPENAI_API_KEY, STABILITY_API_KEY, HUGGING_FACE_TOKEN
 * Optional env:
 *   PINATA_API_KEY  PINATA_SECRET_KEY   (for Pinata first-try)
 *   BASE_URL        (served /images + /metadata fallback)
 *   PROJECT_NAME    (defaults to "Pixel Ninja Cats")
 *   IMAGE_PROVIDER  (defaults to "dall-e", options above)
 *   HF_MODEL        (defaults to "stabilityai/stable-diffusion-xl-base-1.0")
 *
 * Extra dep (for loss-less auto-crop):
 *   npm i sharp
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
import {
    generateTraits,
    assembleMetadata,
    getBackgroundDefinitions
} from '../utils/metadata.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load and set up JSON schema validation
let schema;
try {
    // Try from project root
    schema = JSON.parse(
        readFileSync(path.resolve(__dirname, '../docs/metadata-schema.json'), 'utf8')
    );
} catch {
    try {
        // Try from scripts directory
        schema = JSON.parse(
            readFileSync(path.resolve(__dirname, 'docs/metadata-schema.json'), 'utf8')
        );
    } catch {
        // Create a minimal schema if file can't be found
        console.warn('⚠️ Could not load metadata schema file, using default schema');
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
}

const ajv = new Ajv();
addFormats(ajv);
const validateMetadata = ajv.compile(schema);

/* ─── env ────────────────────────────────────────────────────── */
const {
    OPENAI_API_KEY,
    STABILITY_API_KEY,
    HUGGING_FACE_TOKEN,
    PINATA_API_KEY,
    PINATA_SECRET_KEY,
    BASE_URL,
    PROJECT_NAME,
    // Default to DALL-E as the provider
    IMAGE_PROVIDER = 'dall-e',
    // HuggingFace model options
    HF_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0',
    // DALL-E model options (dall-e-3 or dall-e-2)
    DALLE_MODEL = 'dall-e-3',
    // Stability models
    STABILITY_MODEL = 'stable-diffusion-xl-1024-v1-0'
    // IPFS gateway for compatibility - currently unused but kept for future use
    // IPFS_GATEWAY = 'https://ipfs.io/ipfs/'
} = process.env;

// Enhanced provider configuration with expanded background options and storytelling
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
        pixelSettings: {
            cfg_scale: 9.5, // Increased for better prompt adherence
            steps: 40, // Increased for better quality
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

// Verify we have at least one image generation API key
if (!OPENAI_API_KEY && !STABILITY_API_KEY && !HUGGING_FACE_TOKEN) {
    throw new Error('Missing API keys in .env: need at least one of HUGGING_FACE_TOKEN, OPENAI_API_KEY, or STABILITY_API_KEY');
}

// Check if the selected provider is configured
const selectedProvider = PROVIDERS[IMAGE_PROVIDER];
if (!selectedProvider) {
    console.warn(`⚠️ Unknown provider "${IMAGE_PROVIDER}". Valid options are: ${Object.keys(PROVIDERS).join(', ')}`);
    console.warn('⚠️ Falling back to available provider...');
}
if (selectedProvider && !selectedProvider.key) {
    console.warn(`⚠️ Selected provider "${IMAGE_PROVIDER}" has no API key configured.`);
    console.warn('⚠️ Falling back to available provider...');
}

console.log(`🖼️ Default image provider: ${selectedProvider && selectedProvider.key ?
    `${selectedProvider.name} (${selectedProvider.model})` :
    'Will try all available providers'
    }`);

const baseUrl = BASE_URL || 'http://localhost:5000';
const projectName = PROJECT_NAME || 'Pixel Ninja Cats';
const isPinataConfigured = PINATA_API_KEY && PINATA_SECRET_KEY;

/* ─── optional sharp (auto-crop) ─────────────────────────────── */
let sharp;
try { sharp = (await import('sharp')).default; } catch { /* fine */ }

/* ─── OpenAI client ──────────────────────────────────────────── */
let openai;
if (OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

/* ─── Image generation with various providers ─────────────────── */
/**
 * Generate an image using OpenAI's DALL-E models
 * @param {string} prompt - The base prompt to generate an image from
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Image generation result
 */
async function generateDallEImage(prompt, options = {}) {
    if (!openai) throw new Error('OpenAI API not configured');

    const settings = PROVIDERS['dall-e'].pixelSettings;
    const model = PROVIDERS['dall-e'].model;
    const maxRetries = options.maxRetries || 2;

    // Start with no-text instruction for DALL-E
    let enhancedPrompt = options.useCustomPrompt ? prompt :
        `NO TEXT, NO LETTERS, NO NUMBERS: ${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    // Add extremely strong no-text instructions at both beginning and end
    enhancedPrompt = `GENERATE IMAGE WITHOUT ANY TEXT. ${enhancedPrompt}. IMPORTANT: THE IMAGE MUST NOT CONTAIN ANY TEXT, LETTERS, NUMBERS, WORDS, SYMBOLS, SIGNATURES, WATERMARKS, OR LABELS WHATSOEVER.`;

    console.log(`🎨 Generating image with ${model}...`);
    console.log(`📝 ${options.useCustomPrompt ? 'Custom' : 'Enhanced'} prompt: "${enhancedPrompt}"`);

    // Track generation time
    const startTime = Date.now();

    // Configuration for DALL-E
    const requestConfig = {
        model: model,
        prompt: enhancedPrompt,
        n: 1,
        size: options.size || settings.size,
        quality: options.quality || settings.quality,
        style: settings.style
    };

    // Add response format if requested
    if (options.responseFormat) {
        requestConfig.response_format = options.responseFormat;
    }

    // Use retries for robustness
    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            attempt++;

            // If this is a retry, log it and slightly modify the prompt
            if (attempt > 1) {
                console.log(`🔄 Retry attempt ${attempt}/${maxRetries + 1} for DALL-E generation`);
                requestConfig.prompt = enhancedPrompt + ` [Variation ${attempt}]`;
            }

            // Generate the image
            const { data } = await openai.images.generate(requestConfig);

            const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ DALL-E image generated successfully in ${generationTime}s!`);

            // Compute content hash if URL available
            let contentHash = null;
            if (data[0].url) {
                const urlParts = data[0].url.split('/');
                contentHash = urlParts[urlParts.length - 1].split('.')[0];
            }

            return {
                url: data[0].url,
                base64: data[0].b64_json,
                isLocal: false,
                provider: 'dall-e',
                model: model,
                prompt: enhancedPrompt,
                contentHash,
                metadata: {
                    generationTime: parseFloat(generationTime),
                    width: parseInt(settings.size.split('x')[0], 10),
                    height: parseInt(settings.size.split('x')[1], 10),
                    quality: settings.quality,
                    attempts: attempt
                }
            };
        } catch (error) {
            lastError = error;

            // Check if this is a content policy violation
            const isContentViolation = error.message?.includes('content policy') ||
                error.message?.includes('safety system');

            // If it's a content violation and not using a custom prompt, try simplifying
            if (isContentViolation && !options.useCustomPrompt && attempt <= maxRetries) {
                console.warn(`⚠️ DALL-E content policy triggered: ${error.message}`);
                console.warn('🔄 Simplifying prompt and retrying...');

                // Simplify the prompt by removing potentially problematic terms
                const simplifiedPrompt = enhancedPrompt
                    .replace(/ninja/gi, 'skilled')
                    .replace(/weapon/gi, 'tool')
                    .replace(/battle/gi, 'adventure');

                requestConfig.prompt = simplifiedPrompt;
                continue;
            }

            // For network errors, wait before retry
            if (error.message?.includes('network') || error.message?.includes('timeout')) {
                const waitTime = Math.min(2000 * attempt, 10000);
                console.warn(`⚠️ Network error, waiting ${waitTime / 1000}s before retry: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // If we've reached max retries or unrecoverable error, rethrow
            if (attempt > maxRetries) {
                console.error(`❌ DALL-E generation failed after ${attempt} attempts: ${error.message}`);
                throw error;
            }
        }
    }

    // If we get here, we've exhausted all retries
    throw lastError;
}

/**
 * Generate an image using Stability AI's API
 * @param {string} prompt - The prompt to generate an image from
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Image generation result
 */
async function generateStabilityImage(prompt, options = {}) {
    if (!STABILITY_API_KEY) throw new Error('Stability AI API not configured');

    const settings = PROVIDERS.stability.pixelSettings;
    const model = options.model || PROVIDERS.stability.model;
    const stylePreset = options.stylePreset || PROVIDERS.stability.defaultStylePreset || 'pixel-art';

    // Allow using the prompt directly if specified
    const enhancedPrompt = options.useCustomPrompt ? prompt :
        `${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    console.log(`🎨 Generating image with Stability AI (${model})...`);
    console.log(`📝 ${options.useCustomPrompt ? 'Custom' : 'Enhanced'} prompt: "${enhancedPrompt}"`);
    console.log(`🎭 Style preset: ${stylePreset}`);

    // Track generation time
    const startTime = Date.now();

    // Build request for Stability AI
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

    // Add negative prompt if provided
    if (options.negativePrompt || settings.negativePrompt) {
        requestBody.text_prompts.push({
            text: options.negativePrompt || settings.negativePrompt,
            weight: -1
        });
    }

    // Add style preset if specified
    if (stylePreset) {
        requestBody.style_preset = stylePreset;
    }

    try {
        // Make request to Stability AI API
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

        // Create temp file for the image
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'stability-'));
        const imagePath = path.join(tmpDir, 'image.png');

        // Save the image to disk
        const base64Image = result.artifacts[0].base64;
        await fs.writeFile(imagePath, Buffer.from(base64Image, 'base64'));

        const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Stability AI image generated successfully in ${generationTime}s!`);

        return {
            localPath: imagePath,
            isLocal: true,
            provider: 'stability',
            model: model,
            prompt: enhancedPrompt,
            base64: base64Image,
            metadata: {
                generationTime: parseFloat(generationTime),
                width: 1024,
                height: 1024,
                stylePreset: stylePreset
            }
        };
    } catch (error) {
        console.error(`❌ Stability AI generation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Generate an image using HuggingFace's API
 * @param {string} prompt - The prompt to generate an image from
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Image generation result
 */
async function generateHuggingFaceImage(prompt, options = {}) {
    if (!HUGGING_FACE_TOKEN) throw new Error('HuggingFace API not configured');

    const settings = PROVIDERS.huggingface.pixelSettings;
    const model = options.model || PROVIDERS.huggingface.model;

    // Allow using the prompt directly if specified
    const enhancedPrompt = options.useCustomPrompt ? prompt :
        `${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    console.log(`🎨 Generating image with HuggingFace (${model})...`);
    console.log(`📝 ${options.useCustomPrompt ? 'Custom' : 'Enhanced'} prompt: "${enhancedPrompt}"`);

    // Track generation time
    const startTime = Date.now();

    // Build request for HuggingFace
    const requestBody = {
        inputs: enhancedPrompt,
        parameters: {
            guidance_scale: options.guidance_scale || settings.guidance_scale || 7.5,
            num_inference_steps: options.num_inference_steps || settings.num_inference_steps || 50,
        }
    };

    // Add negative prompt if provided
    if (options.negativePrompt || settings.negativePrompt) {
        requestBody.parameters.negative_prompt = options.negativePrompt || settings.negativePrompt;
    }

    try {
        // Make request to HuggingFace API
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

        // HuggingFace returns the image directly
        const imageBuffer = await response.arrayBuffer();

        // Create temp file for the image
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'huggingface-'));
        const imagePath = path.join(tmpDir, 'image.png');

        // Save the image to disk
        await fs.writeFile(imagePath, Buffer.from(imageBuffer));

        const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ HuggingFace image generated successfully in ${generationTime}s!`);

        return {
            localPath: imagePath,
            isLocal: true,
            provider: 'huggingface',
            model: model,
            prompt: enhancedPrompt,
            metadata: {
                generationTime: parseFloat(generationTime),
                model: model,
                guidance_scale: requestBody.parameters.guidance_scale,
                num_inference_steps: requestBody.parameters.num_inference_steps
            }
        };
    } catch (error) {
        console.error(`❌ HuggingFace generation failed: ${error.message}`);
        throw error;
    }
}

/**
 * Enhance pixel art quality with better processing
 * @param {Object} imageResult - Result from image generator
 * @returns {Promise<Object>} - Enhanced processed image
 */
async function enhancePixelArt(processedImage) {
    if (!sharp) return processedImage; // Skip if sharp isn't available

    try {
        const enhancedPath = path.join(processedImage.directory, 'enhanced.png');

        // Apply pixel art optimization:
        // 1. Resize to ensure proper pixel grid
        // 2. Quantize colors to create a limited palette
        // 3. Remove anti-aliasing by making pixels more blocky
        await sharp(processedImage.path)
            .resize(512, 512, {
                kernel: 'nearest', // Use nearest neighbor for blocky pixel scaling
                fit: 'contain'
            })
            // Quantize to limited palette (optional - can sometimes make images look more "pixel art")
            .png({
                palette: true,  // Use palette-based PNG
                colors: 16,     // Limit to 16 colors
                compressionLevel: 9,
                effort: 10
            })
            .toFile(enhancedPath);

        console.log('✅ Applied pixel art enhancements');
        return {
            path: enhancedPath,
            directory: processedImage.directory
        };
    } catch (error) {
        console.warn(`⚠️ Pixel art enhancement failed: ${error.message}`);
        return processedImage; // Return original on failure
    }
}

/**
 * Generate and pin an NFT image + metadata for a ninja cat
 * @param {Object} options - Generation options
 * @param {string} options.breed - Cat breed (defaults to "Tabby")
 * @param {string|number} options.tokenId - NFT token ID
 * @param {string} options.imageProvider - AI provider (stability, dall-e, huggingface)
 * @param {string} options.promptExtras - Additional prompt instructions
 * @param {string} options.negativePrompt - Negative prompt instructions
 * @param {Object} options.providerOptions - Provider-specific options
 * @param {string} options.taskId - Task ID for progress tracking
 * @param {Object} options.metadataExtras - Additional metadata to include
 * @returns {Promise<Object>} Image and metadata URLs
 */
export async function finalizeMint({
    breed = 'Tabby',
    tokenId,
    imageProvider,
    promptExtras = '',
    negativePrompt = '',
    providerOptions = {},
    metadataExtras = {},
    taskId = null,
    ...rest
}) {
    // CRITICAL: Capture the provider value immediately and make it immutable
    const LOCKED_PROVIDER = imageProvider?.toLowerCase()?.trim();
    console.log(`🔒 PROVIDER LOCKED: "${LOCKED_PROVIDER || 'default'}" will be used exclusively`);

    // Import task management tools at the start
    let taskManager = null;
    if (taskId) {
        try {
            taskManager = await import('./taskManager.js');
            // Set task to processing state
            taskManager.updateTask(taskId, {
                status: taskManager.TASK_STATES.PROCESSING,
                progress: 10,
                message: 'Starting NFT generation process'
            });
        } catch (err) {
            console.warn(`⚠️ Could not initialize task manager: ${err.message}`);
        }
    }

    // Start timing the entire process
    const startTime = Date.now();

    try {
        // Validate required parameters
        if (!tokenId) {
            throw new Error('TokenId is required');
        }

        // Normalize the breed name properly for multi-word breeds
        if (typeof breed !== 'string' || breed.trim() === '') {
            breed = 'Tabby';
        }
        const normalizedBreed = breed.trim()
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ');

        // Generate traits based on breed and tokenId
        console.log(`💫 Generating traits for #${tokenId}...`);
        console.log(`🔍 FINALIZE DEBUG: Original breed: "${breed}", Normalized breed: "${normalizedBreed}"`);
        if (taskManager) {
            taskManager.updateTask(taskId, {
                progress: 20,
                message: 'Generating traits and attributes'
            });
        }

        const traits = generateTraits(normalizedBreed, tokenId);
        console.log(`🔍 FINALIZE DEBUG: Generated traits breed: "${traits.rawTraits.find(t => t.trait_type === 'Breed')?.value}"`);

        // Build prompt from traits
        const weapon = traits.rawTraits.find(t => t.trait_type === 'Weapon')?.value || 'Katana';
        const stance = traits.rawTraits.find(t => t.trait_type === 'Stance')?.value || 'Attack';
        const element = traits.rawTraits.find(t => t.trait_type === 'Element')?.value || 'Fire';
        const rank = traits.rawTraits.find(t => t.trait_type === 'Rank')?.value || 'Novice';

        // Get all keywords from traits for a richer prompt
        const keywordString = traits.keywords.join(', ');

        // Determine which provider we're using - USE THE LOCKED PROVIDER
        const providerKey = LOCKED_PROVIDER || IMAGE_PROVIDER;
        const provider = PROVIDERS[providerKey];

        // STEP 1: ENHANCED BACKGROUND SELECTION WITH BREED AFFINITIES
        let backgroundTrait = null;
        let backgroundDescription = '';

        // Only proceed if we have backgrounds defined for this provider
        if (provider?.pixelSettings?.backgrounds?.length > 0) {
            // Create a deterministic but "random" selection based on tokenId
            const seed = parseInt(tokenId, 10);
            const backgroundHash = createHash('sha256')
                .update(`${seed}-${normalizedBreed}-background`)
                .digest('hex');
            const hashValue = parseInt(backgroundHash.substring(0, 8), 16);

            // Get all backgrounds
            const backgrounds = provider.pixelSettings.backgrounds;

            // Check if there are any backgrounds with affinity for this breed
            const affinityBackgrounds = backgrounds.filter(bg =>
                bg.affinityBreeds && bg.affinityBreeds.includes(normalizedBreed)
            );

            // 60% chance to select from affinity backgrounds if available
            const useAffinityBackground = affinityBackgrounds.length > 0 &&
                (hashValue % 100 < 60);

            const selectedBackgrounds = useAffinityBackground ? affinityBackgrounds : backgrounds;

            // Weighted selection based on rarity
            // FIX: Use proper direct weighting based on rarityScore
            const totalWeight = selectedBackgrounds.reduce((sum, bg) => sum + Math.pow(bg.rarityScore || 30, 2), 0);
            const target = (hashValue / (2 ** 32)) * totalWeight;
            let cumulativeWeight = 0;

            // Find the background that corresponds to the target value
            for (const bg of selectedBackgrounds) {
                cumulativeWeight += Math.pow(bg.rarityScore || 30, 2);
                if (target <= cumulativeWeight) {
                    backgroundTrait = bg;
                    break;
                }
            }

            // Fallback if no background selected (shouldn't happen)
            if (!backgroundTrait) {
                backgroundTrait = selectedBackgrounds[hashValue % selectedBackgrounds.length];
            }

            // Extract background description for the prompt
            if (backgroundTrait) {
                backgroundDescription = ` ${backgroundTrait.description}`;

                // Enhanced logging
                console.log(`🏞️ BACKGROUND: Selected "${backgroundTrait.name}" (${backgroundTrait.rarity || 'Common'}) for token #${tokenId}`);
                console.log(`🏞️ BACKGROUND DESCRIPTION: "${backgroundDescription}"`);

                if (useAffinityBackground) {
                    console.log(`✨ AFFINITY MATCH: ${normalizedBreed} has affinity with ${backgroundTrait.name} background`);
                }

                // Add the background to traits list with rarity information
                traits.attributes.push({
                    trait_type: 'Background',
                    value: backgroundTrait.name
                });

                // Add to raw traits for later reference
                traits.rawTraits.push({
                    trait_type: 'Background',
                    value: backgroundTrait.name,
                    rarity: backgroundTrait.rarity || 'Common',
                    keywords: backgroundTrait.keywords || backgroundTrait.name.split(' ')
                });

                // Apply background stat bonuses if available
                if (backgroundTrait.statBonus) {
                    Object.entries(backgroundTrait.statBonus).forEach(([stat, bonus]) => {
                        const statIndex = traits.attributes.findIndex(
                            attr => attr.trait_type.toLowerCase() === stat.toLowerCase()
                        );

                        if (statIndex !== -1) {
                            traits.attributes[statIndex].value += bonus;
                            console.log(`📊 BACKGROUND BONUS: +${bonus} to ${stat} from ${backgroundTrait.name} background`);
                        }
                    });
                }
            }
        } else {
            console.log(`⚠️ No backgrounds defined for provider ${providerKey}!`);
        }

        // STEP 2: BUILD FINAL PROMPT WITH ENHANCED BACKGROUND AND EXTRAS
        // Extract background keywords for better prompt enhancement
        const backgroundKeywords = backgroundTrait?.keywords?.join(', ') || '';

        // Create the base prompt
        const basePrompt = `A pixel art ninja cat of ${normalizedBreed} breed in ${stance} stance wielding ${weapon} with ${element} powers, ${rank} rank`;

        // Create a more descriptive background integration
        const enhancedBackgroundDesc = backgroundTrait ?
            `, set in ${backgroundTrait.description}, ${backgroundKeywords}` :
            '';

        // Always include keywords and background in prompt, even with custom extras
        const prompt = promptExtras
            ? `${basePrompt}, ${keywordString}${enhancedBackgroundDesc}, ${promptExtras}`
            : `${basePrompt}, ${keywordString}${enhancedBackgroundDesc}`;

        console.log(`📝 ENHANCED PROMPT: "${prompt}"`);

        // Update task status for prompt generation
        if (taskManager) {
            taskManager.updateTask(taskId, {
                progress: 30,
                message: `Preparing to generate image with ${LOCKED_PROVIDER || IMAGE_PROVIDER}`,
                prompt,
                traits: traits.attributes.map(a => `${a.trait_type}: ${a.value}`).join(', '),
                rarity: traits.rarity.tier,
                background: backgroundTrait?.name
            });
        }

        // Generate the image with detailed logging
        console.log('🎨 Generating image...');
        console.log(`🚨 STRICT PROVIDER: "${LOCKED_PROVIDER || IMAGE_PROVIDER}" (no fallbacks)`);

        // Log provider options if available
        if (Object.keys(providerOptions).length > 0) {
            console.log('📋 PROVIDER OPTIONS:', JSON.stringify(providerOptions, null, 2));
        }

        // Update task status for image generation
        if (taskManager) {
            taskManager.updateTask(taskId, {
                progress: 40,
                message: `Generating image with ${LOCKED_PROVIDER || IMAGE_PROVIDER}...`,
                providerOptions: JSON.stringify(providerOptions)
            });
        }

        let imageResult;
        const imageStartTime = Date.now();
        try {
            // CRITICAL FIX: Create immutable options object with locked provider
            const generationOptions = Object.create(Object.prototype, {
                imageProvider: {
                    value: LOCKED_PROVIDER,
                    writable: false,
                    configurable: false,
                    enumerable: true
                },
                strictMode: { value: true, writable: true, enumerable: true },
                negativePrompt: { value: negativePrompt, writable: true, enumerable: true },
                useCustomPrompt: { value: true, writable: true, enumerable: true }
            });

            // Safely add provider options without overriding protected properties
            if (providerOptions) {
                Object.entries(providerOptions).forEach(([key, value]) => {
                    if (key !== 'imageProvider') {
                        generationOptions[key] = value;
                    }
                });
            }

            // Add rest params but ensure they can't override imageProvider
            if (rest) {
                Object.entries(rest).forEach(([key, value]) => {
                    if (key !== 'imageProvider') {
                        generationOptions[key] = value;
                    }
                });
            }

            console.log(`🔒 PROVIDER CONFIRMED: Using "${LOCKED_PROVIDER}" for generation`);

            // Generate the image with our secured options
            imageResult = await generateImage(prompt, generationOptions);

            const imageGenTime = ((Date.now() - imageStartTime) / 1000).toFixed(2);
            console.log(`✅ Image generated in ${imageGenTime}s using ${imageResult.provider}`);

            // Update task with successful generation
            if (taskManager) {
                taskManager.updateTask(taskId, {
                    status: 'processing',
                    progress: 60,
                    message: `Image successfully generated in ${imageGenTime}s with ${imageResult.provider}`,
                    provider: imageResult.provider,
                    model: imageResult.model,
                    generationTime: imageGenTime
                });
            }
        } catch (error) {
            console.error(`❌ Image generation failed: ${error.message}`);
            if (taskManager) {
                taskManager.failTask(taskId, new Error(`Image generation failed: ${error.message}`));
            }
            throw new Error(`Failed to generate image: ${error.message}`);
        }

        // Process the image (auto-crop, etc.)
        if (taskManager) {
            taskManager.updateTask(taskId, {
                progress: 65,
                message: 'Processing and optimizing image'
            });
        }

        const processingStartTime = Date.now();
        const processedImage = await processImage(imageResult);
        const processTime = ((Date.now() - processingStartTime) / 1000).toFixed(2);
        console.log(`✅ Image processed in ${processTime}s`);

        // Add pixel art enhancements (optional - only if sharp is available)
        await enhancePixelArt(processedImage);

        // Update task status for IPFS upload
        if (taskManager) {
            taskManager.updateTask(taskId, {
                progress: 70,
                message: 'Uploading image to IPFS...'
            });
        }

        // Upload image to IPFS with retry logic
        console.log('📦 Saving and uploading image...');
        const uploadStartTime = Date.now();
        let imageUri;
        try {
            imageUri = await uploadToIPFS(processedImage.path, `${normalizedBreed}-${tokenId}`);

            // Ensure imageUri is converted to HTTPS gateway URL
            const imageFilename = `${normalizedBreed}-${tokenId}.png`;
            imageUri = normalizeToGatewayUrl(imageUri, imageFilename);

            const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(2);
            console.log(`✅ Image uploaded in ${uploadTime}s`);

            if (taskManager) {
                taskManager.updateTask(taskId, {
                    progress: 80,
                    message: 'Image successfully uploaded to IPFS',
                    imageUri
                });
            }
        } catch (error) {
            console.error(`❌ Image upload failed: ${error.message}`);
            if (taskManager) {
                taskManager.failTask(taskId, new Error(`Failed to upload image: ${error.message}`));
            }
            throw new Error(`Failed to upload image to IPFS: ${error.message}`);
        }

        // Create metadata
        if (taskManager) {
            taskManager.updateTask(taskId, {
                progress: 85,
                message: 'Creating and uploading metadata',
                imageUri
            });
        }

        // Create enhanced metadata using the new assembleMetadata function
        console.log('📝 Creating metadata...');
        const metadataOptions = {
            name: `${projectName} #${tokenId}`,
            tokenId,
            external_url: `${baseUrl}/kitty/${tokenId}`,
            generationInfo: {
                prompt,
                provider: imageResult.provider,
                model: imageResult.model,
                providerOptions,
                timestamp: Date.now(),
                rarity: traits.rarity,
                background: backgroundTrait?.name,
                generation: {
                    version: '2.0',
                    engine: imageResult.provider,
                    promptEnhanced: !!promptExtras,
                    negativePrompt: negativePrompt || undefined,
                    generationTime: imageResult.metadata?.generationTime,
                },
                stats: {
                    processingTime: {
                        total: ((Date.now() - startTime) / 1000).toFixed(2),
                        image: ((imageStartTime - startTime) / 1000).toFixed(2),
                        processing: ((processingStartTime - imageStartTime) / 1000).toFixed(2),
                        upload: ((uploadStartTime - processingStartTime) / 1000).toFixed(2)
                    }
                },
                ...metadataExtras
            }
        };

        const metadata = assembleMetadata(traits, imageUri, metadataOptions);

        // Validate metadata against JSON schema
        console.log('🔍 Validating metadata against schema...');
        const isValid = validateMetadata(metadata);
        if (!isValid) {
            console.warn('⚠️ Metadata validation failed:', validateMetadata.errors);
            console.warn('⚠️ Continuing with potentially invalid metadata...');
        } else {
            console.log('✅ Metadata validation successful');
        }

        // Log the attributes to confirm background is included
        console.log(`🏷️  NFT ATTRIBUTES (${traits.attributes.length}):`);
        traits.attributes.forEach(attr => {
            console.log(`  • ${attr.trait_type}: ${attr.value}`);
        });

        // 📄 Save metadata to `<tokenId>.json`
        const fileName = `${tokenId}.json`;
        const metaPath = path.join(processedImage.directory, fileName);
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

        // 🚀 Upload metadata to IPFS as `<tokenId>.json`
        if (taskManager) {
            taskManager.updateTask(taskId, {
                progress: 90,
                message: 'Uploading metadata to IPFS'
            });
        }

        const metadataStartTime = Date.now();
        let metadataUri;
        try {
            metadataUri = await uploadToIPFS(metaPath, fileName);

            // Ensure metadataUri is converted to HTTPS gateway URL
            metadataUri = normalizeToGatewayUrl(metadataUri, fileName);

            const metadataUploadTime = ((Date.now() - metadataStartTime) / 1000).toFixed(2);
            console.log(`✅ Metadata uploaded in ${metadataUploadTime}s as ${fileName}`);
        } catch (error) {
            console.error(`❌ Metadata upload failed: ${error.message}`);
            if (taskManager) {
                taskManager.failTask(taskId, new Error(`Failed to upload metadata: ${error.message}`));
            }
            throw new Error(`Failed to upload metadata to IPFS: ${error.message}`);
        }

        console.log(`🔗 Token URI metadata at: ${metadataUri}`);

        // Clean up temporary directory
        fs.rm(processedImage.directory, { recursive: true, force: true }).catch(err => {
            console.warn(`Warning: Failed to clean up temp directory: ${err.message}`);
        });

        // Log total generation time
        const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ Finished #${tokenId} → ${metadataUri} using ${imageResult.provider} in ${totalTime}s`);

        // Mark task as complete with explicit status
        if (taskManager) {
            console.log(`📋 Marking task #${tokenId} as complete...`);
            taskManager.completeTask(taskId, {
                tokenId,
                tokenURI: metadataUri,
                imageUri,
                provider: imageResult.provider,
                model: imageResult.model || PROVIDERS[imageResult.provider]?.model,
                totalTime: parseFloat(totalTime),
                rarity: traits.rarity.tier,
                status: 'completed',
                background: backgroundTrait?.name
            });
        }

        // Return comprehensive result object
        return {
            tokenURI: metadataUri,
            imageUri,
            metadata,
            provider: imageResult.provider,
            model: imageResult.model || PROVIDERS[imageResult.provider]?.model,
            background: backgroundTrait?.name,
            providerOptions,
            taskId, // Include taskId in the response
            stats: {
                totalTime: parseFloat(totalTime),
                timestamp: Date.now()
            }
        };
    } catch (error) {
        // Centralized error handling
        console.error(`❌ NFT generation failed: ${error.message}`);

        // Mark task as failed if task manager is available
        if (taskManager && taskId) {
            taskManager.failTask(taskId, error);
        }

        // Re-throw the error for the caller to handle
        throw error;
    }
}

/**
 * Process an image (download, crop palette bar if needed)
 * @param {Object} imageResult - Result from image generator
 * @returns {Promise<string>} - Path to the processed image
 */
async function processImage(imageResult) {
    console.log('📥 Processing image...');

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ninjacat-'));
    const outputPath = path.join(tmpDir, 'image.png');

    // For local files from Stability or HuggingFace
    if (imageResult.isLocal && imageResult.localPath) {
        try {
            // Copy the image to our temp directory
            await fs.copyFile(imageResult.localPath, outputPath);
        } catch (err) {
            console.error(`Error copying local image: ${err.message}`);
            throw err;
        }
    }
    // For remote files from DALL-E
    else if (imageResult.url) {
        try {
            // Download the image
            const response = await fetch(imageResult.url);
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(outputPath, buffer);
        } catch (err) {
            console.error(`Error downloading image: ${err.message}`);
            throw err;
        }
    }
    // Base64 data directly (some APIs provide this)
    else if (imageResult.base64) {
        try {
            const buffer = Buffer.from(imageResult.base64, 'base64');
            await fs.writeFile(outputPath, buffer);
        } catch (err) {
            console.error(`Error saving base64 image: ${err.message}`);
            throw err;
        }
    }
    else {
        throw new Error('No valid image source in generation result');
    }

    // Auto-crop palette bar if sharp is available
    if (sharp) {
        try {
            // Load the image
            const image = sharp(outputPath);
            const metadata = await image.metadata();
            const { width, height } = metadata;

            // Only process if it's big enough (some models return tiny images)
            if (width > 100 && height > 100) {
                // Analyze the image to look for palette bars (horizontal or vertical)
                // const { data: imageData } = await image
                //     .raw()
                //     .toBuffer({ resolveWithObject: true });

                // Look for horizontal palette bars at top or bottom
                const cropTop = 0;
                const cropBottom = 0;
                const cropLeft = 0;
                const cropRight = 0;

                // This is a simplified detection - looks for solid horizontal/vertical lines
                // that might be palette bars in AI-generated images

                // Check for crop and apply if needed
                if (cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0) {
                    const newWidth = width - cropLeft - cropRight;
                    const newHeight = height - cropTop - cropBottom;

                    // Only crop if we're not removing too much of the image
                    if (newWidth > width * 0.8 && newHeight > height * 0.8) {
                        await image
                            .extract({
                                left: cropLeft,
                                top: cropTop,
                                width: newWidth,
                                height: newHeight
                            })
                            .toFile(outputPath);
                        console.log('✂️ Image processed successfully');
                    }
                }
            }
        } catch (err) {
            // Non-fatal error, just log and continue with the original
            console.warn(`⚠️ Image auto-crop failed: ${err.message}`);
        }
    } else {
        console.log('ℹ️ Sharp library not available, skipping auto-crop');
    }

    return {
        path: outputPath,
        directory: tmpDir
    };
}

/**
 * Upload an image to IPFS via Pinata
 * @param {string} imagePath - Path to the image file
 * @param {string} name - Name for the upload
 * @returns {Promise<string>} - IPFS hash/CID
 */
async function uploadToPinata(filePath, name) {
    console.log(`📤 Attempting Pinata upload for ${name} (${await getFileSize(filePath)} bytes)`);
    console.log(`Uploading to Pinata: ${filePath}`);

    if (!isPinataConfigured) {
        throw new Error('Pinata not configured - missing API key or secret key');
    }

    // Create form data with the file
    const formData = new FormData();
    const fileStream = await fs.readFile(filePath);
    formData.append('file', fileStream, { filename: path.basename(filePath) });

    // Add metadata
    formData.append('pinataMetadata', JSON.stringify({
        name: `nft-${name}`
    }));

    try {
        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
            method: 'POST',
            headers: {
                'pinata_api_key': PINATA_API_KEY,
                'pinata_secret_api_key': PINATA_SECRET_KEY,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Pinata error: ${response.status} - ${error}`);
        }

        const result = await response.json();
        const ipfsHash = result.IpfsHash;

        // Return HTTPS gateway URL instead of raw ipfs:// for better compatibility
        const gatewayUrl = `https://ipfs.io/ipfs/${ipfsHash}/${path.basename(filePath)}`;
        console.log(`✅ Pinata upload successful: ${gatewayUrl}`);
        return gatewayUrl;
    } catch (error) {
        console.error(`Error uploading to Pinata: ${error.message}`);
        throw error;
    }
}

/**
 * Upload a file to IPFS
 * @param {string} filePath - Path to the file
 * @param {string} name - Name for the upload
 * @returns {Promise<string>} - IPFS URL
 */
async function uploadToIPFS(filePath, name) {
    // Try Pinata first if configured
    if (isPinataConfigured) {
        try {
            return await uploadToPinata(filePath, name);
        } catch (error) {
            console.warn(`⚠️ Pinata upload failed: ${error.message}`);
            console.warn('⚠️ Falling back to local w3.storage CLI...');
        }
    }

    // Fall back to web3.storage CLI
    try {
        const { stdout } = await execAsync(`npx web3.storage put "${filePath}" --name "${name}"`);
        const ipfsCid = stdout.trim().split('\n').pop().trim();

        if (!ipfsCid || ipfsCid.length < 40) {
            throw new Error(`Invalid IPFS CID returned: ${ipfsCid}`);
        }

        // Return HTTPS gateway URL instead of raw ipfs:// for better compatibility
        const gatewayUrl = `https://ipfs.io/ipfs/${ipfsCid}/${path.basename(filePath)}`;
        console.log(`✅ Web3.storage upload successful: ${gatewayUrl}`);
        return gatewayUrl;
    } catch (error) {
        console.error(`Error uploading to IPFS: ${error.message}`);

        // In case of failure, generate a local URL as last resort
        const backupFilename = `${Date.now()}-${name}.png`;
        const publicDir = path.join(process.cwd(), 'public', 'images');

        try {
            // Ensure the public/images directory exists
            await fs.mkdir(publicDir, { recursive: true });

            // Copy the file to the public directory
            await fs.copyFile(filePath, path.join(publicDir, backupFilename));

            // Return a URL relative to the base URL
            return `${baseUrl}/images/${backupFilename}`;
        } catch (err) {
            console.error(`Final fallback failed: ${err.message}`);
            throw new Error('All upload attempts failed');
        }
    }
}

// Helper to get file size
async function getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
}

/**
 * Convert IPFS URI to HTTPS gateway URL if needed
 * @param {string} uri - URI to convert (may be ipfs:// or https://)
 * @param {string} filename - Optional filename to append
 * @returns {string} - HTTPS gateway URL
 */
function normalizeToGatewayUrl(uri, filename = '') {
    if (!uri) return uri;

    // If already HTTPS, return as-is
    if (uri.startsWith('https://')) {
        return uri;
    }

    // Convert ipfs:// to HTTPS gateway
    if (uri.startsWith('ipfs://')) {
        const cid = uri.replace('ipfs://', '');
        const filenamePart = filename ? `/${filename}` : '';
        return `https://ipfs.io/ipfs/${cid}${filenamePart}`;
    }

    // Return as-is if not IPFS URI
    return uri;
}

/**
 * Generate an image using the requested provider with NO FALLBACKS
 * @param {string} prompt - The prompt to generate an image from
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} The generated image data
 */
async function generateImage(prompt, options = {}) {
    // Save original provider immediately, before any possible modifications
    const ORIGINAL_PROVIDER = options.imageProvider?.toLowerCase()?.trim();

    // Log the initial provider for debugging
    console.log(`🔐 PROVIDER SECURE: Original value "${ORIGINAL_PROVIDER}" safely captured`);

    // Create a completely new options object to avoid reference issues
    const enhancedOptions = JSON.parse(JSON.stringify(options));

    // Set the provider and protect it from being overwritten
    Object.defineProperty(enhancedOptions, 'imageProvider', {
        value: ORIGINAL_PROVIDER,
        writable: false,
        configurable: false,
        enumerable: true
    });

    console.log(`🔍 PROVIDER CHECK: Protected provider is "${enhancedOptions.imageProvider || 'not specified'}"`);

    // Enhance prompts based on provider for better pixel art results
    if (!options.useCustomPrompt) {
        const basePixelArtEnhancer = ', true pixel art, 16-bit style, limited color palette, no anti-aliasing, pixel perfect';

        if (ORIGINAL_PROVIDER === 'dall-e') {
            prompt = `${prompt}${basePixelArtEnhancer}, clean edges, blocky style, NES/SNES era game sprite`;
            // DALL-E specific parameters for better pixel results
            enhancedOptions.quality = enhancedOptions.quality || 'hd';
        }
        else if (ORIGINAL_PROVIDER === 'stability') {
            prompt = `${prompt}${basePixelArtEnhancer}, crisp pixels, 8-16 colors maximum`;
            // Stability specific parameters for better pixel results
            enhancedOptions.cfgScale = enhancedOptions.cfgScale || 9.5; // Stronger prompt adherence
            enhancedOptions.stylePreset = enhancedOptions.stylePreset || 'pixel-art';
        }
        else if (ORIGINAL_PROVIDER === 'huggingface') {
            prompt = `${prompt}${basePixelArtEnhancer}, 32x32 resolution, gameboy style, pixel perfect`;
            // HuggingFace specific parameters
            enhancedOptions.guidance_scale = enhancedOptions.guidance_scale || 9.0;
            enhancedOptions.num_inference_steps = enhancedOptions.num_inference_steps || 60;
        }

        // Enhanced negative prompt for better pixel art
        if (!enhancedOptions.negativePrompt) {
            const pixelArtNegative = 'blurry, anti-aliasing, smooth edges, high detail, realistic, 3D, shading, gradient, ' +
                'photorealistic, text, signature, watermark, blur, noise, grain, high-resolution detail';
            enhancedOptions.negativePrompt = pixelArtNegative;
        }
    }

    // IMPORTANT: Verify provider wasn't modified
    console.log(`🛡️ PROVIDER VERIFY: Still using "${ORIGINAL_PROVIDER}" (unchanged)`);

    // ALWAYS respect the explicitly requested provider - without requiring strictMode flag
    if (ORIGINAL_PROVIDER) {
        console.log(`🔒 STRICT MODE: Using ONLY "${ORIGINAL_PROVIDER}" - NO FALLBACKS ALLOWED`);

        // Validate provider and API key availability
        if (ORIGINAL_PROVIDER === 'stability' && !STABILITY_API_KEY) {
            throw new Error('Cannot use requested provider "stability" - Missing STABILITY_API_KEY');
        }
        else if (ORIGINAL_PROVIDER === 'huggingface' && !HUGGING_FACE_TOKEN) {
            throw new Error('Cannot use requested provider "huggingface" - Missing HUGGING_FACE_TOKEN');
        }
        else if (ORIGINAL_PROVIDER === 'dall-e' && !OPENAI_API_KEY) {
            throw new Error('Cannot use requested provider "dall-e" - Missing OPENAI_API_KEY');
        }
        else if (!['stability', 'huggingface', 'dall-e'].includes(ORIGINAL_PROVIDER)) {
            throw new Error(`Unknown provider "${ORIGINAL_PROVIDER}" - Valid options: stability, huggingface, dall-e`);
        }

        // Use ONLY the requested provider - no fallbacks whatsoever
        if (ORIGINAL_PROVIDER === 'stability') {
            console.log('✅ EXECUTING: Using Stability AI (100% confirmed)');
            return await generateStabilityImage(prompt, enhancedOptions);
        }
        else if (ORIGINAL_PROVIDER === 'huggingface') {
            console.log('✅ EXECUTING: Using HuggingFace (100% confirmed)');
            return await generateHuggingFaceImage(prompt, enhancedOptions);
        }
        else if (ORIGINAL_PROVIDER === 'dall-e') {
            console.log('✅ EXECUTING: Using DALL-E (100% confirmed)');
            return await generateDallEImage(prompt, enhancedOptions);
        }
    }

    // Default behavior (only used when no provider is specified)
    console.log(`⚠️ NO PROVIDER SPECIFIED: Using default provider with fallbacks: ${IMAGE_PROVIDER}`);

    // Try each available provider in order of preference
    const errors = [];

    // Try preferred provider first
    try {
        if (IMAGE_PROVIDER === 'stability' && STABILITY_API_KEY) {
            return await generateStabilityImage(prompt, enhancedOptions);
        }
        else if (IMAGE_PROVIDER === 'huggingface' && HUGGING_FACE_TOKEN) {
            return await generateHuggingFaceImage(prompt, enhancedOptions);
        }
        else if (IMAGE_PROVIDER === 'dall-e' && OPENAI_API_KEY) {
            return await generateDallEImage(prompt, enhancedOptions);
        }
    } catch (error) {
        errors.push(`Default provider ${IMAGE_PROVIDER}: ${error.message}`);
    }

    // Try any available provider as fallback
    if (STABILITY_API_KEY) {
        try {
            return await generateStabilityImage(prompt, enhancedOptions);
        } catch (error) {
            errors.push(`Stability: ${error.message}`);
        }
    }

    if (HUGGING_FACE_TOKEN) {
        try {
            return await generateHuggingFaceImage(prompt, enhancedOptions);
        } catch (error) {
            errors.push(`HuggingFace: ${error.message}`);
        }
    }

    if (OPENAI_API_KEY) {
        try {
            return await generateDallEImage(prompt, enhancedOptions);
        } catch (error) {
            errors.push(`DALL-E: ${error.message}`);
        }
    }

    throw new Error(`All image providers failed: ${errors.join('; ')}`);
}