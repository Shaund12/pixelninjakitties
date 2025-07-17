/**
 * Centralized Image Generation Utilities
 * Consolidates prompt building, provider management, and image generation logic
 */

// Enhanced provider configuration with comprehensive details
export const IMAGE_PROVIDERS = {
    'dall-e': {
        name: 'DALL-E 3',
        icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.6174zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.5097-2.6067-1.4998z"/></svg>',
        description: 'OpenAI\'s most advanced text-to-image model with exceptional detail and artistic flair.',
        supportedModels: ['dall-e-3', 'dall-e-2'],
        advantages: [
            'Highest quality image generation',
            'Superior prompt understanding',
            'Excellent for detailed characters',
            'Great consistency in style',
            'Avoids artifacts'
        ],
        options: {
            model: {
                'dall-e-3': 'Latest and highest quality',
                'dall-e-2': 'Faster, lower cost'
            },
            quality: {
                'hd': 'Higher detail, more precision',
                'standard': 'Balanced quality and speed'
            },
            style: {
                'vivid': 'Vibrant, high-contrast images',
                'natural': 'More realistic, subdued tones'
            }
        }
    },
    'stability': {
        name: 'Stability AI',
        icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M5.53 3h2.12l.61 1.37h-1.2V8.6h-1.5V4.37h-.65L5.53 3M9.5 4.7h1.41v1.15H9.5V8.6H8.03V3h3.63l.61 1.37h-2.77v.33M16.38 3h2.12l.61 1.37h-1.2v3.57h-1.5V4.37h-.64L16.38 3M3 9.5h18v1.4H3zM20.5 15v-1h-17v1H14v2.14H3V16h5.03v-1H3v-1h18v1h-5v1H21v1.14H16V15z"></path></svg>',
        description: 'Creator of Stable Diffusion, offering precise control over artistic output.',
        supportedModels: ['stable-diffusion-xl-1024-v1-0'],
        advantages: [
            'Creative and stylistic flexibility',
            'Strong artistic interpretation',
            'Style preset options',
            'Good with abstract concepts',
            'Fast generation times'
        ],
        options: {
            style_preset: {
                'enhance': 'Enhanced details and clarity',
                'anime': 'Anime and manga style',
                'photographic': 'Realistic photographic style',
                'digital-art': 'Digital art style',
                'comic-book': 'Comic book illustration',
                'fantasy-art': 'Fantasy and magical themes',
                'line-art': 'Clean line art style',
                'analog-film': 'Vintage film aesthetic',
                'neon-punk': 'Cyberpunk neon style',
                'isometric': 'Isometric 3D style'
            }
        }
    },
    'huggingface': {
        name: 'Hugging Face',
        icon: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.568 7.432c.27.27.27.707 0 .977l-4.568 4.568a.69.69 0 0 1-.977 0L7.455 8.409a.69.69 0 0 1 0-.977.69.69 0 0 1 .977 0L12 11l3.591-3.568a.69.69 0 0 1 .977 0z"/></svg>',
        description: 'Open-source models with community-driven innovation and diverse artistic styles.',
        supportedModels: ['black-forest-labs/FLUX.1-dev'],
        advantages: [
            'Open-source and transparent',
            'Community-driven improvements',
            'Diverse model selection',
            'Cost-effective generation',
            'Regular model updates'
        ],
        options: {
            guidance_scale: {
                '3.5': 'Lower guidance, more creative',
                '7.5': 'Balanced guidance and creativity',
                '12': 'Higher guidance, more precise'
            }
        }
    }
};

// Default generation settings
export const DEFAULT_SETTINGS = {
    'dall-e': {
        model: 'dall-e-3',
        quality: 'hd',
        style: 'vivid',
        size: '1024x1024'
    },
    'stability': {
        model: 'stable-diffusion-xl-1024-v1-0',
        style_preset: 'enhance',
        steps: 30,
        cfg_scale: 7
    },
    'huggingface': {
        model: 'black-forest-labs/FLUX.1-dev',
        guidance_scale: 3.5,
        num_inference_steps: 28,
        max_sequence_length: 256
    }
};

/**
 * Build image generation prompt from NFT metadata
 * @param {Object} metadata - NFT metadata
 * @param {Object} options - Prompt generation options
 * @returns {string} Generated prompt
 */
export function buildPrompt(metadata, options = {}) {
    const {
        style = 'anime',
        includeBackground = true,
        includeEffects = true,
        customPrefix = '',
        customSuffix = ''
    } = options;

    try {
        const attributes = metadata.attributes || [];

        // Extract key traits
        const breed = findAttribute(attributes, 'Breed');
        const weapon = findAttribute(attributes, 'Weapon');
        const stance = findAttribute(attributes, 'Stance');
        const element = findAttribute(attributes, 'Element');
        const rank = findAttribute(attributes, 'Rank');
        const accessory = findAttribute(attributes, 'Accessory');
        const origin = findAttribute(attributes, 'Origin');
        const technique = findAttribute(attributes, 'Battle Technique');

        // Build prompt components
        const components = [];

        // Custom prefix
        if (customPrefix) {
            components.push(customPrefix);
        }

        // Core character description
        if (breed) {
            components.push(`A ${breed.toLowerCase()} cat ninja`);
        } else {
            components.push('A ninja cat');
        }

        // Weapon and stance
        if (weapon && stance) {
            components.push(`wielding a ${weapon.toLowerCase()} in ${stance.toLowerCase()} stance`);
        } else if (weapon) {
            components.push(`holding a ${weapon.toLowerCase()}`);
        } else if (stance) {
            components.push(`in ${stance.toLowerCase()} pose`);
        }

        // Rank and accessories
        if (rank) {
            components.push(`with ${rank.toLowerCase()} level mastery`);
        }

        if (accessory) {
            components.push(`wearing ${accessory.toLowerCase()}`);
        }

        // Element effects
        if (element && includeEffects) {
            const elementEffects = getElementEffects(element);
            if (elementEffects) {
                components.push(elementEffects);
            }
        }

        // Background and environment
        if (origin && includeBackground) {
            const environment = getOriginEnvironment(origin);
            if (environment) {
                components.push(environment);
            }
        }

        // Battle technique effects
        if (technique && includeEffects) {
            const techniqueEffect = getTechniqueEffect(technique);
            if (techniqueEffect) {
                components.push(techniqueEffect);
            }
        }

        // Style modifiers
        const styleModifiers = getStyleModifiers(style);
        components.push(styleModifiers);

        // Custom suffix
        if (customSuffix) {
            components.push(customSuffix);
        }

        // Join and clean up the prompt
        let prompt = components
            .filter(c => c && c.trim())
            .join(', ')
            .replace(/,\s*,/g, ',') // Remove double commas
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();

        // Ensure it ends properly
        if (!prompt.endsWith('.') && !prompt.endsWith(',')) {
            prompt += '.';
        }

        return prompt;

    } catch (error) {
        console.error('Error building prompt:', error);
        return 'A ninja cat in dynamic pose, anime style, high quality.';
    }
}

/**
 * Find attribute value by trait type
 * @param {Array} attributes - Attributes array
 * @param {string} traitType - Trait type to find
 * @returns {string|null} Attribute value or null
 */
function findAttribute(attributes, traitType) {
    const attr = attributes.find(a => a.trait_type === traitType);
    return attr ? attr.value : null;
}

/**
 * Get visual effects description for element
 * @param {string} element - Element name
 * @returns {string} Element effects description
 */
function getElementEffects(element) {
    const effects = {
        'Fire': 'surrounded by flickering flames and orange energy',
        'Water': 'with flowing water effects and blue aura',
        'Earth': 'with rocky textures and earth energy',
        'Air': 'with swirling wind effects and white energy',
        'Lightning': 'crackling with electric energy and bright sparks',
        'Ice': 'with icy crystals and frost effects',
        'Shadow': 'wreathed in dark shadows and purple energy',
        'Light': 'glowing with golden light and radiant energy',
        'Void': 'surrounded by cosmic void and starry effects',
        'Cosmic': 'with galaxy effects and cosmic energy',
        'Ether': 'emanating ethereal mist and mystical energy'
    };

    return effects[element] || '';
}

/**
 * Get environment description for origin
 * @param {string} origin - Origin location
 * @returns {string} Environment description
 */
function getOriginEnvironment(origin) {
    const environments = {
        'Moonlight Forest': 'in a mystical moonlit forest with glowing trees',
        'Shadow Peaks': 'atop dark mountain peaks with misty shadows',
        'Crystal Caverns': 'in sparkling crystal caves with prismatic light',
        'Burning Sands': 'in a desert with burning sands and mirages',
        'Frozen Tundra': 'in an icy tundra with aurora effects',
        'Floating Islands': 'on floating islands in a cloudy sky',
        'Ancient Temple': 'in an ancient stone temple with mystical symbols',
        'Neon City': 'in a futuristic neon-lit cyberpunk city',
        'Bamboo Grove': 'in a peaceful bamboo forest with dappled light',
        'Volcanic Rim': 'near an active volcano with lava flows'
    };

    return environments[origin] || '';
}

/**
 * Get visual effect for battle technique
 * @param {string} technique - Battle technique name
 * @returns {string} Technique effect description
 */
function getTechniqueEffect(technique) {
    const effects = {
        'Shadow Step': 'with motion blur and shadow trails',
        'Iron Fist': 'with metallic fist effects and impact lines',
        'Wind Slash': 'with visible wind blade effects',
        'Fire Burst': 'with explosive fire effects radiating outward',
        'Ice Shard': 'launching crystalline ice projectiles',
        'Lightning Strike': 'calling down lightning from above',
        'Earth Quake': 'causing ground to crack and rumble',
        'Void Portal': 'opening dimensional rifts and portals',
        'Healing Light': 'emanating gentle healing radiance',
        'Stealth Cloak': 'partially invisible with shimmer effects'
    };

    return effects[technique] || '';
}

/**
 * Get style modifiers for different art styles
 * @param {string} style - Art style name
 * @returns {string} Style modifier text
 */
function getStyleModifiers(style) {
    const modifiers = {
        'anime': 'anime style, detailed character design, vibrant colors, dynamic pose',
        'realistic': 'photorealistic, detailed fur texture, natural lighting, high resolution',
        'cartoon': 'cartoon style, bold outlines, bright colors, expressive features',
        'digital-art': 'digital art, painterly style, rich colors, artistic composition',
        'comic': 'comic book style, bold lines, dramatic shading, action pose',
        'fantasy': 'fantasy art style, magical atmosphere, ethereal effects',
        'cyberpunk': 'cyberpunk aesthetic, neon colors, futuristic elements',
        'traditional': 'traditional Japanese art style, ink wash, classic composition'
    };

    return modifiers[style] || modifiers['anime'];
}

/**
 * Get provider fallback order based on preferences
 * @param {string} primaryProvider - Primary provider choice
 * @param {Object} preferences - User preferences
 * @returns {Array} Ordered list of providers to try
 */
export function getProviderFallbackOrder(primaryProvider, preferences = {}) {
    const {
        preferOpenSource = false,
        preferFast = false,
        preferQuality = true
    } = preferences;

    // Define provider characteristics
    const providerTraits = {
        'dall-e': { quality: 10, speed: 6, cost: 8, openSource: false },
        'stability': { quality: 8, speed: 8, cost: 6, openSource: false },
        'huggingface': { quality: 7, speed: 9, cost: 4, openSource: true }
    };

    // Start with primary provider
    const fallbackOrder = [primaryProvider];
    const remaining = Object.keys(IMAGE_PROVIDERS).filter(p => p !== primaryProvider);

    // Sort remaining providers based on preferences
    remaining.sort((a, b) => {
        const traitA = providerTraits[a];
        const traitB = providerTraits[b];

        let scoreA = 0;
        let scoreB = 0;

        if (preferQuality) {
            scoreA += traitA.quality * 0.4;
            scoreB += traitB.quality * 0.4;
        }

        if (preferFast) {
            scoreA += traitA.speed * 0.3;
            scoreB += traitB.speed * 0.3;
        }

        scoreA += (10 - traitA.cost) * 0.2; // Lower cost is better
        scoreB += (10 - traitB.cost) * 0.2;

        if (preferOpenSource) {
            scoreA += traitA.openSource ? 0.1 : 0;
            scoreB += traitB.openSource ? 0.1 : 0;
        }

        return scoreB - scoreA; // Higher score first
    });

    return [...fallbackOrder, ...remaining];
}

/**
 * Generate optimized settings for a provider
 * @param {string} provider - Provider name
 * @param {Object} options - Generation options
 * @returns {Object} Optimized settings
 */
export function getOptimizedSettings(provider, options = {}) {
    const {
        quality = 'high',
        style = 'anime'
    } = options;

    const baseSettings = { ...DEFAULT_SETTINGS[provider] };

    // Optimize based on quality preference
    if (provider === 'dall-e') {
        if (quality === 'ultra') {
            baseSettings.quality = 'hd';
            baseSettings.model = 'dall-e-3';
        } else if (quality === 'fast') {
            baseSettings.quality = 'standard';
            baseSettings.model = 'dall-e-2';
        }
    } else if (provider === 'stability') {
        if (quality === 'ultra') {
            baseSettings.steps = 50;
            baseSettings.cfg_scale = 9;
        } else if (quality === 'fast') {
            baseSettings.steps = 20;
            baseSettings.cfg_scale = 5;
        }
    }

    // Style-specific optimizations
    if (style === 'anime' && provider === 'stability') {
        baseSettings.style_preset = 'anime';
    } else if (style === 'realistic' && provider === 'stability') {
        baseSettings.style_preset = 'photographic';
    }

    return baseSettings;
}

/**
 * Validate image generation request
 * @param {Object} request - Generation request
 * @returns {Object} Validation result
 */
export function validateGenerationRequest(request) {
    const { provider, prompt, settings } = request;

    if (!provider || !IMAGE_PROVIDERS[provider]) {
        return {
            isValid: false,
            error: 'Invalid provider specified'
        };
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
        return {
            isValid: false,
            error: 'Valid prompt is required'
        };
    }

    if (prompt.length > 2000) {
        return {
            isValid: false,
            error: 'Prompt is too long (max 2000 characters)'
        };
    }

    // Provider-specific validation
    const providerInfo = IMAGE_PROVIDERS[provider];
    if (settings && settings.model && !providerInfo.supportedModels.includes(settings.model)) {
        return {
            isValid: false,
            error: `Model ${settings.model} not supported by ${provider}`
        };
    }

    return {
        isValid: true,
        error: null
    };
}

/**
 * Estimate generation cost and time
 * @param {string} provider - Provider name
 * @param {Object} settings - Generation settings
 * @returns {Object} Cost and time estimates
 */
export function estimateGeneration(provider, settings = {}) {
    // Rough estimates for planning purposes
    const estimates = {
        'dall-e': {
            cost: settings.model === 'dall-e-3' ? 0.04 : 0.02,
            timeSeconds: settings.quality === 'hd' ? 15 : 10,
            currency: 'USD'
        },
        'stability': {
            cost: 0.02,
            timeSeconds: Math.max(5, (settings.steps || 30) * 0.2),
            currency: 'USD'
        },
        'huggingface': {
            cost: 0.01,
            timeSeconds: Math.max(3, (settings.num_inference_steps || 28) * 0.15),
            currency: 'USD'
        }
    };

    return estimates[provider] || { cost: 0, timeSeconds: 10, currency: 'USD' };
}

/**
 * Generate fallback prompt if primary generation fails
 * @param {Object} originalMetadata - Original NFT metadata
 * @returns {string} Simplified fallback prompt
 */
export function generateFallbackPrompt(originalMetadata) {
    try {
        const attributes = originalMetadata.attributes || [];
        const breed = findAttribute(attributes, 'Breed');
        const weapon = findAttribute(attributes, 'Weapon');

        let fallback = 'A ninja cat';

        if (breed) {
            fallback = `A ${breed.toLowerCase()} ninja cat`;
        }

        if (weapon) {
            fallback += ` with ${weapon.toLowerCase()}`;
        }

        fallback += ', anime style, high quality';

        return fallback;
    } catch (error) {
        return 'A ninja cat, anime style, high quality';
    }
}