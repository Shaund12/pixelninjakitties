/**
 * Centralized Validation Utilities
 * Consolidates form validation, address validation, and input sanitization
 */

/**
 * Validate Ethereum address format
 * @param {string} address - Address to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result with isValid and error
 */
export function validateAddress(address, options = {}) {
    const {
        allowEmpty = false,
        normalize = true
    } = options;

    try {
        // Check for empty/null input
        if (!address) {
            return {
                isValid: allowEmpty,
                error: allowEmpty ? null : 'Address is required',
                value: null
            };
        }

        if (typeof address !== 'string') {
            return {
                isValid: false,
                error: 'Address must be a string',
                value: null
            };
        }

        // Basic format validation
        const addressRegex = /^0x[a-fA-F0-9]{40}$/;
        if (!addressRegex.test(address)) {
            return {
                isValid: false,
                error: 'Invalid Ethereum address format',
                value: null
            };
        }

        // Optional: Check for checksum validation
        if (hasChecksum(address) && !isValidChecksum(address)) {
            return {
                isValid: false,
                error: 'Invalid address checksum',
                value: null
            };
        }

        const normalizedAddress = normalize ? address.toLowerCase() : address;

        return {
            isValid: true,
            error: null,
            value: normalizedAddress
        };
    } catch (error) {
        return {
            isValid: false,
            error: 'Address validation failed',
            value: null
        };
    }
}

/**
 * Check if address has checksum (mixed case)
 * @param {string} address - Address to check
 * @returns {boolean} True if address has checksum
 */
function hasChecksum(address) {
    return address !== address.toLowerCase() && address !== address.toUpperCase();
}

/**
 * Validate EIP-55 address checksum
 * @param {string} address - Address to validate
 * @returns {boolean} True if checksum is valid
 */
function isValidChecksum(address) {
    // Simplified EIP-55 checksum validation
    // In a real implementation, you would use keccak256 hashing
    try {
        // This is a simplified check - real implementation needs crypto library
        return true; // Placeholder - always return true for now
    } catch {
        return false;
    }
}

/**
 * Validate email address format
 * @param {string} email - Email to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateEmail(email, options = {}) {
    const {
        allowEmpty = false,
        maxLength = 254
    } = options;

    if (!email) {
        return {
            isValid: allowEmpty,
            error: allowEmpty ? null : 'Email is required',
            value: null
        };
    }

    if (typeof email !== 'string') {
        return {
            isValid: false,
            error: 'Email must be a string',
            value: null
        };
    }

    if (email.length > maxLength) {
        return {
            isValid: false,
            error: `Email is too long (max ${maxLength} characters)`,
            value: null
        };
    }

    // Basic email regex - more permissive than RFC 5322
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(email)) {
        return {
            isValid: false,
            error: 'Invalid email format',
            value: null
        };
    }

    return {
        isValid: true,
        error: null,
        value: email.toLowerCase().trim()
    };
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateUrl(url, options = {}) {
    const {
        allowEmpty = false,
        requireHttps = false,
        allowedProtocols = ['http:', 'https:']
    } = options;

    if (!url) {
        return {
            isValid: allowEmpty,
            error: allowEmpty ? null : 'URL is required',
            value: null
        };
    }

    if (typeof url !== 'string') {
        return {
            isValid: false,
            error: 'URL must be a string',
            value: null
        };
    }

    try {
        // Use global URL constructor available in browsers
        const urlObj = typeof window !== 'undefined' ? new window.URL(url) : new URL(url);

        if (requireHttps && urlObj.protocol !== 'https:') {
            return {
                isValid: false,
                error: 'HTTPS is required',
                value: null
            };
        }

        if (!allowedProtocols.includes(urlObj.protocol)) {
            return {
                isValid: false,
                error: `Protocol must be one of: ${allowedProtocols.join(', ')}`,
                value: null
            };
        }

        return {
            isValid: true,
            error: null,
            value: url
        };
    } catch {
        return {
            isValid: false,
            error: 'Invalid URL format',
            value: null
        };
    }
}

/**
 * Validate numeric input
 * @param {string|number} value - Value to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateNumber(value, options = {}) {
    const {
        allowEmpty = false,
        min = null,
        max = null,
        integer = false,
        positive = false
    } = options;

    if (value === null || value === undefined || value === '') {
        return {
            isValid: allowEmpty,
            error: allowEmpty ? null : 'Value is required',
            value: null
        };
    }

    const num = typeof value === 'string' ? parseFloat(value) : value;

    if (isNaN(num)) {
        return {
            isValid: false,
            error: 'Value must be a number',
            value: null
        };
    }

    if (integer && !Number.isInteger(num)) {
        return {
            isValid: false,
            error: 'Value must be an integer',
            value: null
        };
    }

    if (positive && num <= 0) {
        return {
            isValid: false,
            error: 'Value must be positive',
            value: null
        };
    }

    if (min !== null && num < min) {
        return {
            isValid: false,
            error: `Value must be at least ${min}`,
            value: null
        };
    }

    if (max !== null && num > max) {
        return {
            isValid: false,
            error: `Value must be at most ${max}`,
            value: null
        };
    }

    return {
        isValid: true,
        error: null,
        value: num
    };
}

/**
 * Validate string input
 * @param {string} value - String to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateString(value, options = {}) {
    const {
        allowEmpty = false,
        minLength = 0,
        maxLength = null,
        pattern = null,
        trim = true
    } = options;

    if (!value) {
        return {
            isValid: allowEmpty,
            error: allowEmpty ? null : 'Value is required',
            value: null
        };
    }

    if (typeof value !== 'string') {
        return {
            isValid: false,
            error: 'Value must be a string',
            value: null
        };
    }

    const processedValue = trim ? value.trim() : value;

    if (processedValue.length < minLength) {
        return {
            isValid: false,
            error: `Value must be at least ${minLength} characters`,
            value: null
        };
    }

    if (maxLength && processedValue.length > maxLength) {
        return {
            isValid: false,
            error: `Value must be at most ${maxLength} characters`,
            value: null
        };
    }

    if (pattern && !pattern.test(processedValue)) {
        return {
            isValid: false,
            error: 'Value format is invalid',
            value: null
        };
    }

    return {
        isValid: true,
        error: null,
        value: processedValue
    };
}

/**
 * Validate token ID format
 * @param {string|number} tokenId - Token ID to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateTokenId(tokenId, options = {}) {
    const {
        allowEmpty = false,
        min = 0,
        max = null
    } = options;

    if (!tokenId && tokenId !== 0) {
        return {
            isValid: allowEmpty,
            error: allowEmpty ? null : 'Token ID is required',
            value: null
        };
    }

    const numberResult = validateNumber(tokenId, {
        integer: true,
        min,
        max,
        positive: min >= 0
    });

    if (!numberResult.isValid) {
        return {
            ...numberResult,
            error: numberResult.error.replace('Value', 'Token ID')
        };
    }

    return {
        isValid: true,
        error: null,
        value: numberResult.value.toString()
    };
}

/**
 * Validate form data against a schema
 * @param {Object} data - Form data to validate
 * @param {Object} schema - Validation schema
 * @returns {Object} Validation result with errors
 */
export function validateForm(data, schema) {
    const errors = {};
    const validatedData = {};
    let isValid = true;

    for (const [field, rules] of Object.entries(schema)) {
        const value = data[field];
        const fieldResult = validateField(value, rules);

        if (!fieldResult.isValid) {
            errors[field] = fieldResult.error;
            isValid = false;
        } else {
            validatedData[field] = fieldResult.value;
        }
    }

    return {
        isValid,
        errors,
        data: validatedData
    };
}

/**
 * Validate a single field against rules
 * @param {*} value - Field value
 * @param {Object} rules - Validation rules
 * @returns {Object} Validation result
 */
function validateField(value, rules) {
    const { type, ...options } = rules;

    switch (type) {
        case 'string':
            return validateString(value, options);
        case 'number':
            return validateNumber(value, options);
        case 'email':
            return validateEmail(value, options);
        case 'url':
            return validateUrl(value, options);
        case 'address':
            return validateAddress(value, options);
        case 'tokenId':
            return validateTokenId(value, options);
        default:
            return {
                isValid: true,
                error: null,
                value: value
            };
    }
}

/**
 * Sanitize HTML input to prevent XSS
 * @param {string} input - HTML input to sanitize
 * @param {Object} options - Sanitization options
 * @returns {string} Sanitized HTML
 */
export function sanitizeHtml(input, options = {}) {
    const {
        allowedTags = ['b', 'i', 'em', 'strong', 'u']
    } = options;

    if (!input || typeof input !== 'string') {
        return '';
    }

    // Simple HTML sanitization - remove script tags and dangerous attributes
    let sanitized = input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '');

    // Only keep allowed tags
    if (allowedTags.length > 0) {
        const tagRegex = new RegExp(`<(?!\\/?(?:${allowedTags.join('|')})\\s*\\/?)[^>]+>`, 'gi');
        sanitized = sanitized.replace(tagRegex, '');
    }

    return sanitized;
}

/**
 * Sanitize input for safe database storage
 * @param {string} input - Input to sanitize
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
    if (!input || typeof input !== 'string') {
        return '';
    }

    return input
        .trim()
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1f\x7f-\x9f]/g, '') // Remove control characters (excluding \n and \r)
        .replace(/[<>&"']/g, (char) => { // Escape HTML entities
            const entities = {
                '<': '&lt;',
                '>': '&gt;',
                '&': '&amp;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return entities[char];
        });
}

/**
 * Validate file upload
 * @param {File} file - File to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
export function validateFile(file, options = {}) {
    const {
        maxSize = 10 * 1024 * 1024, // 10MB default
        allowedTypes = ['image/jpeg', 'image/png', 'image/gif'],
        allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif']
    } = options;

    if (!file) {
        return {
            isValid: false,
            error: 'No file provided',
            value: null
        };
    }

    // Check if File constructor exists (browser environment)
    const FileConstructor = typeof window !== 'undefined' ? window.File : null;
    if (FileConstructor && !(file instanceof FileConstructor)) {
        return {
            isValid: false,
            error: 'Invalid file object',
            value: null
        };
    }

    if (file.size > maxSize) {
        return {
            isValid: false,
            error: `File size exceeds ${Math.round(maxSize / 1024 / 1024)}MB limit`,
            value: null
        };
    }

    if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
        return {
            isValid: false,
            error: `File type not allowed. Allowed types: ${allowedTypes.join(', ')}`,
            value: null
        };
    }

    if (allowedExtensions.length > 0) {
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        if (!allowedExtensions.includes(fileExtension)) {
            return {
                isValid: false,
                error: `File extension not allowed. Allowed extensions: ${allowedExtensions.join(', ')}`,
                value: null
            };
        }
    }

    return {
        isValid: true,
        error: null,
        value: file
    };
}

/**
 * Create a validation schema builder for common patterns
 */
export const ValidationSchema = {
    string: (options = {}) => ({ type: 'string', ...options }),
    number: (options = {}) => ({ type: 'number', ...options }),
    email: (options = {}) => ({ type: 'email', ...options }),
    url: (options = {}) => ({ type: 'url', ...options }),
    address: (options = {}) => ({ type: 'address', ...options }),
    tokenId: (options = {}) => ({ type: 'tokenId', ...options }),

    // Common patterns
    required: (type, options = {}) => ({ type, allowEmpty: false, ...options }),
    optional: (type, options = {}) => ({ type, allowEmpty: true, ...options }),

    // Preset schemas for common forms
    walletForm: {
        address: { type: 'address', allowEmpty: false }
    },

    listingForm: {
        tokenId: { type: 'tokenId', allowEmpty: false },
        price: { type: 'number', positive: true, allowEmpty: false },
        currency: { type: 'string', allowEmpty: false, minLength: 1 }
    },

    searchForm: {
        query: { type: 'string', allowEmpty: true, maxLength: 100 },
        breed: { type: 'string', allowEmpty: true },
        rarity: { type: 'string', allowEmpty: true }
    }
};

/**
 * Validation error types for consistent error handling
 */
export const ValidationErrors = {
    REQUIRED: 'REQUIRED',
    INVALID_FORMAT: 'INVALID_FORMAT',
    TOO_SHORT: 'TOO_SHORT',
    TOO_LONG: 'TOO_LONG',
    OUT_OF_RANGE: 'OUT_OF_RANGE',
    INVALID_TYPE: 'INVALID_TYPE',
    CUSTOM: 'CUSTOM'
};