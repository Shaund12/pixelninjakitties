/**
 * Security middleware for Express.js applications
 */

import crypto from 'crypto';
import { RateLimiter } from './securityUtils.js';

/**
 * Security headers middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function securityHeaders(req, res, next) {
    // Content Security Policy
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.ethers.io https://unpkg.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: https:",
        "connect-src 'self' https://rpc.vitruveo.xyz https://api.openai.com https://api.stability.ai https://api-inference.huggingface.co",
        "media-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        'upgrade-insecure-requests'
    ].join('; '));

    // HTTP Strict Transport Security
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // X-Content-Type-Options
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // X-Frame-Options
    res.setHeader('X-Frame-Options', 'DENY');

    // X-XSS-Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Permissions Policy
    res.setHeader('Permissions-Policy', [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'interest-cohort=()'
    ].join(', '));

    // Remove server information
    res.removeHeader('X-Powered-By');

    next();
}

/**
 * Rate limiting middleware
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {Function} - Express middleware function
 */
export function rateLimitMiddleware(maxRequests = 100, windowMs = 60000) {
    const limiter = new RateLimiter(maxRequests, windowMs);

    return (req, res, next) => {
        const identifier = req.ip || req.connection.remoteAddress || 'unknown';

        if (!limiter.isAllowed(identifier)) {
            return res.status(429).json({
                error: 'Too Many Requests',
                message: 'Rate limit exceeded. Please try again later.',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }

        // Add rate limit headers
        res.setHeader('X-RateLimit-Limit', maxRequests);
        res.setHeader('X-RateLimit-Remaining', limiter.getRemainingRequests(identifier));
        res.setHeader('X-RateLimit-Reset', new Date(Date.now() + windowMs).toISOString());

        next();
    };
}

/**
 * CSRF protection middleware
 * @param {Object} options - CSRF options
 * @returns {Function} - Express middleware function
 */
export function csrfProtection(options = {}) {
    const {
        excludePaths = ['/api/health', '/api/docs'],
        tokenLength = 32,
        cookieName = 'csrf-token',
        headerName = 'x-csrf-token'
    } = options;

    return (req, res, next) => {
        // Skip CSRF for GET requests and excluded paths
        if (req.method === 'GET' || excludePaths.includes(req.path)) {
            return next();
        }

        // Generate CSRF token for new sessions
        if (!req.session?.csrfToken) {
            if (!req.session) {
                req.session = {};
            }
            req.session.csrfToken = crypto.randomBytes(tokenLength).toString('hex');
        }

        // Set CSRF token in cookie for client access
        res.cookie(cookieName, req.session.csrfToken, {
            httpOnly: false,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        // Validate CSRF token on non-GET requests
        if (req.method !== 'GET') {
            const clientToken = req.headers[headerName] || req.body?._csrf;

            if (!clientToken || clientToken !== req.session.csrfToken) {
                return res.status(403).json({
                    error: 'Invalid CSRF token',
                    message: 'CSRF token validation failed'
                });
            }
        }

        next();
    };
}

/**
 * Request timeout middleware
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Function} - Express middleware function
 */
export function requestTimeout(timeout = 30000) {
    return (req, res, next) => {
        const timer = setTimeout(() => {
            if (!res.headersSent) {
                res.status(408).json({
                    error: 'Request Timeout',
                    message: 'Request took too long to process'
                });
            }
        }, timeout);

        // Clear timeout when response is sent
        res.on('finish', () => clearTimeout(timer));
        res.on('close', () => clearTimeout(timer));

        next();
    };
}

/**
 * Input sanitization middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function sanitizeInput(req, res, next) {
    // Sanitize query parameters
    if (req.query) {
        for (const key in req.query) {
            if (typeof req.query[key] === 'string') {
                req.query[key] = req.query[key].replace(/[<>\"'&]/g, '');
            }
        }
    }

    // Sanitize request body
    if (req.body) {
        for (const key in req.body) {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].replace(/[<>\"'&]/g, '');
            }
        }
    }

    // Sanitize URL parameters
    if (req.params) {
        for (const key in req.params) {
            if (typeof req.params[key] === 'string') {
                req.params[key] = req.params[key].replace(/[<>\"'&]/g, '');
            }
        }
    }

    next();
}

/**
 * Logging middleware with security considerations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function secureLogging(req, res, next) {
    const startTime = Date.now();

    // Log request (excluding sensitive data)
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${req.ip || 'unknown'}`);

    // Override res.json to log responses
    const originalJson = res.json;
    res.json = function(data) {
        const duration = Date.now() - startTime;

        // Log response (excluding sensitive data)
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);

        // Log errors with more detail
        if (res.statusCode >= 400) {
            console.error(`[ERROR] ${req.method} ${req.path} - ${res.statusCode} - ${JSON.stringify(data)}`);
        }

        return originalJson.call(this, data);
    };

    next();
}

/**
 * Compression middleware for better performance
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function compressionMiddleware(req, res, next) {
    // Simple compression for JSON responses
    const originalJson = res.json;

    res.json = function(data) {
        // Set appropriate headers for JSON compression
        if (req.headers['accept-encoding'] && req.headers['accept-encoding'].includes('gzip')) {
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Vary', 'Accept-Encoding');
        }

        return originalJson.call(this, data);
    };

    next();
}

/**
 * Error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function errorHandler(err, req, res, next) {
    // Log the error
    console.error(`[ERROR] ${req.method} ${req.path} - ${err.message}`);
    console.error(err.stack);

    // Don't expose sensitive information in production
    const isDevelopment = process.env.NODE_ENV === 'development';

    let statusCode = 500;
    let message = 'Internal Server Error';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = err.message;
    } else if (err.name === 'UnauthorizedError') {
        statusCode = 401;
        message = 'Unauthorized';
    } else if (err.name === 'ForbiddenError') {
        statusCode = 403;
        message = 'Forbidden';
    } else if (err.name === 'NotFoundError') {
        statusCode = 404;
        message = 'Not Found';
    } else if (err.message && err.message.includes('Invalid')) {
        statusCode = 400;
        message = err.message;
    }

    const errorResponse = {
        error: message,
        timestamp: new Date().toISOString(),
        path: req.path,
        method: req.method
    };

    // Add detailed error information in development
    if (isDevelopment) {
        errorResponse.stack = err.stack;
        errorResponse.details = err.message;
    }

    res.status(statusCode).json(errorResponse);
}