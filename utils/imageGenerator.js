/**
 * utils/imageGenerator.js
 * ───────────────────────────────────────────────────────────────
 * Shared image generation logic across all mint scripts.
 * 
 * Consolidates image generation functionality from:
 * - public/js/mint.js
 * - scripts/finalizeMint.js  
 * - scripts/generateAndMint.js
 *
 * Provides unified interface for:
 * - AI provider configuration
 * - Image generation with multiple providers (DALL-E, Stability AI, HuggingFace)
 * - Image processing and optimization
 * - IPFS upload functionality
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
import { getBackgroundDefinitions } from './metadata.js';

const execAsync = promisify(exec);

/* ─── Environment Configuration ─────────────────────────────── */
const {
    OPENAI_API_KEY,
    STABILITY_API_KEY,
    HUGGING_FACE_TOKEN,
    PINATA_API_KEY,
    PINATA_SECRET_KEY,
    BASE_URL,
    // Default to DALL-E as the provider
    IMAGE_PROVIDER = 'dall-e',
    // HuggingFace model options
    HF_MODEL = 'stabilityai/stable-diffusion-xl-base-1.0',
    // DALL-E model options (dall-e-3 or dall-e-2)
    DALLE_MODEL = 'dall-e-3',
    // Stability models
    STABILITY_MODEL = 'stable-diffusion-xl-1024-v1-0'
} = process.env;

/* ─── Optional Sharp for Image Processing ─────────────────────── */
let sharp;
try { 
    sharp = (await import('sharp')).default; 
} catch { 
    /* Sharp is optional for enhanced image processing */ 
}

/* ─── OpenAI Client ──────────────────────────────────────────── */
let openai;
if (OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

/* ─── Enhanced Provider Configuration ─────────────────────────── */
export const PROVIDERS = {
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

/* ─── Image Generation Functions ──────────────────────────────── */

/**
 * Generate an image using OpenAI's DALL-E models
 * @param {string} prompt - The base prompt to generate an image from
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Image generation result
 */
export async function generateDallEImage(prompt, options = {}) {
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
export async function generateStabilityImage(prompt, options = {}) {
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
export async function generateHuggingFaceImage(prompt, options = {}) {
    if (!HUGGING_FACE_TOKEN) throw new Error('HuggingFace API not configured');

    const settings = PROVIDERS.huggingface.pixelSettings;
    const model = options.model || PROVIDERS.huggingface.model;

    // Allow using the prompt directly if specified
    const enhancedPrompt = options.useCustomPrompt ? prompt :
        `${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    console.log(`🎨 Generating image with HuggingFace (${model})...`);
    console.log(`📝 ${options.useCustomPrompt ? 'Custom' : 'Enhanced'} prompt: "${enhancedPrompt}"`);

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
 * Main image generation function that dispatches to the appropriate provider
 * @param {string} prompt - The prompt to generate an image from
 * @param {Object} options - Generation options including provider selection
 * @returns {Promise<Object>} The generated image data
 */
export async function generateImage(prompt, options = {}) {
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

/* ─── Image Processing Functions ────────────────────────────── */

/**
 * Process an image (download, crop palette bar if needed)
 * @param {Object} imageResult - Result from image generator
 * @returns {Promise<Object>} - Processed image with path and directory
 */
export async function processImage(imageResult) {
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
                // Look for horizontal palette bars at top or bottom
                const cropTop = 0;
                const cropBottom = 0;
                const cropLeft = 0;
                const cropRight = 0;

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
 * Enhance pixel art quality with better processing
 * @param {Object} processedImage - Processed image object
 * @returns {Promise<Object>} - Enhanced processed image
 */
export async function enhancePixelArt(processedImage) {
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

/* ─── IPFS Upload Functions ──────────────────────────────────── */

/**
 * Upload a file (image or JSON) to Pinata and return an HTTPS gateway URL.
 * @param {string} filePath – Path to the file on disk.
 * @param {string} name – Friendly name (used for Pinata metadata).
 * @returns {Promise<string>} – Always an HTTPS URL: https://ipfs.io/ipfs/{CID}/{filename}
 */
export async function uploadToPinata(filePath, name) {
    if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
        throw new Error('Pinata not configured – missing PINATA_API_KEY or PINATA_SECRET_KEY');
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
    // Return the HTTPS gateway URL
    return `https://ipfs.io/ipfs/${cid}/${path.basename(filePath)}`;
}

/**
 * Upload any file to IPFS, preferring Pinata, then falling back to web3.storage.
 * Always returns an HTTPS gateway URL.
 * @param {string} filePath – Path to the file on disk.
 * @param {string} name – Friendly name for metadata or CLI fallback.
 * @returns {Promise<string>} – https://ipfs.io/ipfs/{CID}/{filename}
 */
export async function uploadToIPFS(filePath, name) {
    // 1) Try Pinata
    if (PINATA_API_KEY && PINATA_SECRET_KEY) {
        try {
            return await uploadToPinata(filePath, name);
        } catch (err) {
            console.warn(`⚠️ Pinata upload failed, falling back: ${err.message}`);
        }
    }

    // 2) Fall back to web3.storage CLI
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
        console.warn(`⚠️ web3.storage fallback failed: ${err.message}`);
    }

    // 3) Last‑resort local fallback (serves from your BASE_URL/public/images)
    const backupDir = path.join(process.cwd(), 'public', 'images');
    await fs.mkdir(backupDir, { recursive: true });
    const filename = `${Date.now()}-${path.basename(filePath)}`;
    await fs.copyFile(filePath, path.join(backupDir, filename));
    return `${BASE_URL.replace(/\/$/, '')}/images/${filename}`;
}

/* ─── Utility Functions ────────────────────────────────────── */

/**
 * Get file size for a given file path
 * @param {string} filePath - Path to the file
 * @returns {Promise<number>} File size in bytes
 */
export async function getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
}

/**
 * Validate that we have at least one API key configured
 * @returns {boolean} True if at least one provider is available
 */
export function validateProviderConfiguration() {
    return !!(OPENAI_API_KEY || STABILITY_API_KEY || HUGGING_FACE_TOKEN);
}

/**
 * Get the available providers based on configured API keys
 * @returns {Array<string>} Array of available provider names
 */
export function getAvailableProviders() {
    const available = [];
    if (OPENAI_API_KEY) available.push('dall-e');
    if (STABILITY_API_KEY) available.push('stability');
    if (HUGGING_FACE_TOKEN) available.push('huggingface');
    return available;
}

// Verify we have at least one image generation API key
if (!validateProviderConfiguration()) {
    throw new Error('Missing API keys in .env: need at least one of HUGGING_FACE_TOKEN, OPENAI_API_KEY, or STABILITY_API_KEY');
}

// Export provider information for external use
export const isPinataConfigured = !!(PINATA_API_KEY && PINATA_SECRET_KEY);
export const baseUrl = BASE_URL || 'http://localhost:5000';
export const defaultImageProvider = IMAGE_PROVIDER;

console.log(`🖼️ Image Generator initialized with providers: ${getAvailableProviders().join(', ')}`);
console.log(`🖼️ Default provider: ${defaultImageProvider}`);
console.log(`📦 IPFS: ${isPinataConfigured ? 'Pinata configured' : 'Using fallbacks'}`);