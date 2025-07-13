/**
 * Security utilities for input validation and sanitization
 */

import { ethers } from 'ethers';

/**
 * Validates and sanitizes a token ID
 * @param {string|number} tokenId - The token ID to validate
 * @returns {number} - The validated token ID
 * @throws {Error} - If token ID is invalid
 */
export function validateTokenId(tokenId) {
    const id = parseInt(tokenId);
    if (isNaN(id) || id < 0 || id > 1000000) {
        throw new Error('Invalid token ID: must be a number between 0 and 1,000,000');
    }
    return id;
}

/**
 * Validates and sanitizes a breed string
 * @param {string} breed - The breed to validate
 * @returns {string} - The validated breed
 * @throws {Error} - If breed is invalid
 */
export function validateBreed(breed) {
    if (!breed || typeof breed !== 'string') {
        throw new Error('Invalid breed: must be a non-empty string');
    }

    // Remove potentially dangerous characters
    const sanitized = breed.replace(/[<>\"'&]/g, '');

    // Check length
    if (sanitized.length < 1 || sanitized.length > 50) {
        throw new Error('Invalid breed: must be between 1 and 50 characters');
    }

    // Only allow alphanumeric characters, spaces, and common punctuation
    if (!/^[a-zA-Z0-9\s\-_.]+$/.test(sanitized)) {
        throw new Error('Invalid breed: contains invalid characters');
    }

    return sanitized;
}

/**
 * Validates an image provider
 * @param {string} provider - The provider to validate
 * @returns {string} - The validated provider
 * @throws {Error} - If provider is invalid
 */
export function validateImageProvider(provider) {
    const validProviders = ['dall-e', 'stability', 'huggingface'];
    if (!validProviders.includes(provider)) {
        throw new Error(`Invalid image provider: must be one of ${validProviders.join(', ')}`);
    }
    return provider;
}

/**
 * Validates and sanitizes prompt text
 * @param {string} prompt - The prompt to validate
 * @returns {string} - The validated prompt
 * @throws {Error} - If prompt is invalid
 */
export function validatePrompt(prompt) {
    if (!prompt) return '';

    if (typeof prompt !== 'string') {
        throw new Error('Invalid prompt: must be a string');
    }

    // Remove potentially dangerous characters
    const sanitized = prompt.replace(/[<>\"'&]/g, '');

    // Check length
    if (sanitized.length > 500) {
        throw new Error('Invalid prompt: must be less than 500 characters');
    }

    return sanitized;
}

/**
 * Validates an Ethereum address
 * @param {string} address - The address to validate
 * @returns {string} - The validated address
 * @throws {Error} - If address is invalid
 */
export function validateEthereumAddress(address) {
    if (!address || typeof address !== 'string') {
        throw new Error('Invalid address: must be a non-empty string');
    }

    try {
        return ethers.getAddress(address);
    } catch (error) {
        throw new Error('Invalid Ethereum address format');
    }
}

/**
 * Validates and sanitizes a block number
 * @param {string|number} blockNumber - The block number to validate
 * @returns {number} - The validated block number
 * @throws {Error} - If block number is invalid
 */
export function validateBlockNumber(blockNumber) {
    const block = parseInt(blockNumber);
    if (isNaN(block) || block < 0 || block > 10000000) {
        throw new Error('Invalid block number: must be a number between 0 and 10,000,000');
    }
    return block;
}

/**
 * Validates provider options
 * @param {string} optionsString - JSON string of provider options
 * @returns {Object} - The validated options object
 * @throws {Error} - If options are invalid
 */
export function validateProviderOptions(optionsString) {
    if (!optionsString) return {};

    try {
        const options = JSON.parse(optionsString);

        // Validate it's an object
        if (typeof options !== 'object' || options === null || Array.isArray(options)) {
            throw new Error('Invalid provider options: must be a JSON object');
        }

        // Validate specific known options
        if (options.model && typeof options.model !== 'string') {
            throw new Error('Invalid provider options: model must be a string');
        }

        if (options.quality && typeof options.quality !== 'string') {
            throw new Error('Invalid provider options: quality must be a string');
        }

        if (options.style && typeof options.style !== 'string') {
            throw new Error('Invalid provider options: style must be a string');
        }

        return options;
    } catch (parseError) {
        throw new Error('Invalid provider options: must be valid JSON');
    }
}

/**
 * Sanitizes text for safe logging
 * @param {string} text - The text to sanitize
 * @returns {string} - The sanitized text
 */
export function sanitizeForLogging(text) {
    if (!text || typeof text !== 'string') return '';

    // Remove potential secrets, keys, and sensitive data
    return text
        .replace(/[a-zA-Z0-9]{32,}/g, '[REDACTED]') // Likely API keys or hashes
        .replace(/0x[a-fA-F0-9]{40}/g, '[ADDRESS]') // Ethereum addresses
        .replace(/sk-[a-zA-Z0-9]+/g, '[API_KEY]')    // OpenAI API keys
        .replace(/pk_[a-zA-Z0-9]+/g, '[API_KEY]')    // Pinata API keys
        .slice(0, 200); // Limit length
}

/**
 * Rate limiting implementation
 */
export class RateLimiter {
    constructor(maxRequests = 100, windowMs = 60000) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = new Map();
    }

    /**
     * Check if request is allowed
     * @param {string} identifier - Client identifier (IP, user ID, etc.)
     * @returns {boolean} - Whether request is allowed
     */
    isAllowed(identifier) {
        const now = Date.now();
        const clientRequests = this.requests.get(identifier) || [];

        // Remove old requests outside the window
        const validRequests = clientRequests.filter(time => now - time < this.windowMs);

        // Check if under limit
        if (validRequests.length >= this.maxRequests) {
            return false;
        }

        // Add current request
        validRequests.push(now);
        this.requests.set(identifier, validRequests);

        return true;
    }

    /**
     * Get remaining requests for identifier
     * @param {string} identifier - Client identifier
     * @returns {number} - Remaining requests
     */
    getRemainingRequests(identifier) {
        const now = Date.now();
        const clientRequests = this.requests.get(identifier) || [];
        const validRequests = clientRequests.filter(time => now - time < this.windowMs);

        return Math.max(0, this.maxRequests - validRequests.length);
    }
}

/**
 * Secure error handler that prevents information leakage
 * @param {Error} error - The error object
 * @param {boolean} isDevelopment - Whether in development mode
 * @returns {Object} - Safe error response
 */
export function createSafeErrorResponse(error, isDevelopment = false) {
    const safeResponse = {
        error: 'An error occurred',
        timestamp: new Date().toISOString()
    };

    if (isDevelopment) {
        safeResponse.message = error.message;
        safeResponse.stack = error.stack;
    } else {
        // Only include safe error messages in production
        if (error.message && error.message.includes('Invalid')) {
            safeResponse.error = error.message;
        }
    }

    return safeResponse;
}