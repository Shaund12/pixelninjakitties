/**
 * Health check utilities for monitoring system status
 */

import { ethers } from 'ethers';
import fs from 'fs/promises';
import path from 'path';

/**
 * Comprehensive health check for the NFT minting system
 * @returns {Promise<Object>} Health check results
 */
export async function performHealthCheck() {
    const startTime = Date.now();
    const results = {
        timestamp: new Date().toISOString(),
        status: 'healthy',
        checks: {},
        responseTime: 0,
        version: '1.0.0'
    };

    try {
        // Check environment variables
        results.checks.environment = await checkEnvironment();

        // Check file system
        results.checks.filesystem = await checkFileSystem();

        // Check blockchain connectivity
        results.checks.blockchain = await checkBlockchain();

        // Check memory usage
        results.checks.memory = checkMemoryUsage();

        // Check API keys
        results.checks.apiKeys = checkApiKeys();

        // Determine overall status
        const hasFailures = Object.values(results.checks).some(check => check.status === 'unhealthy');
        results.status = hasFailures ? 'unhealthy' : 'healthy';

    } catch (error) {
        results.status = 'error';
        results.error = error.message;
    }

    results.responseTime = Date.now() - startTime;
    return results;
}

/**
 * Check environment variables
 * @returns {Promise<Object>} Environment check results
 */
async function checkEnvironment() {
    const required = ['RPC_URL', 'CONTRACT_ADDRESS', 'PRIVATE_KEY', 'PLACEHOLDER_URI'];
    const missing = required.filter(key => !process.env[key]);

    return {
        status: missing.length === 0 ? 'healthy' : 'unhealthy',
        message: missing.length === 0 ? 'All required environment variables set' : `Missing: ${missing.join(', ')}`,
        required: required.length,
        missing: missing.length
    };
}

/**
 * Check blockchain connectivity
 * @returns {Promise<Object>} Blockchain check results
 */
async function checkBlockchain() {
    try {
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const blockNumber = await provider.getBlockNumber();
        const network = await provider.getNetwork();

        return {
            status: 'healthy',
            message: 'Blockchain connection successful',
            blockNumber,
            chainId: network.chainId.toString(),
            responseTime: Date.now()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            message: 'Blockchain connection failed',
            error: error.message
        };
    }
}

/**
 * Check file system access
 * @returns {Promise<Object>} File system check results
 */
async function checkFileSystem() {
    try {
        const testFile = path.join(process.cwd(), 'test-write.tmp');
        await fs.writeFile(testFile, 'test', 'utf8');
        await fs.readFile(testFile, 'utf8');
        await fs.unlink(testFile);

        return {
            status: 'healthy',
            message: 'File system read/write successful',
            workingDirectory: process.cwd()
        };
    } catch (error) {
        return {
            status: 'unhealthy',
            message: 'File system access failed',
            error: error.message
        };
    }
}

/**
 * Check memory usage
 * @returns {Object} Memory usage check results
 */
function checkMemoryUsage() {
    const usage = process.memoryUsage();
    const totalMemory = usage.heapTotal + usage.external;
    const usedMemory = usage.heapUsed;
    const memoryUsagePercent = (usedMemory / totalMemory) * 100;

    return {
        status: memoryUsagePercent < 90 ? 'healthy' : 'warning',
        message: `Memory usage: ${memoryUsagePercent.toFixed(2)}%`,
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024),
        rss: Math.round(usage.rss / 1024 / 1024),
        unit: 'MB'
    };
}

/**
 * Check API keys availability
 * @returns {Object} API keys check results
 */
function checkApiKeys() {
    const apiKeys = {
        openai: !!process.env.OPENAI_API_KEY,
        huggingface: !!process.env.HUGGING_FACE_TOKEN,
        stability: !!process.env.STABILITY_API_KEY,
        pinata: !!(process.env.PINATA_API_KEY && process.env.PINATA_SECRET_KEY)
    };

    const availableKeys = Object.values(apiKeys).filter(Boolean).length;

    return {
        status: availableKeys > 0 ? 'healthy' : 'warning',
        message: `${availableKeys} API provider(s) available`,
        providers: apiKeys,
        availableCount: availableKeys
    };
}

/**
 * Simple uptime tracker
 */
export class UptimeTracker {
    constructor() {
        this.startTime = Date.now();
        this.requests = 0;
        this.errors = 0;
    }

    /**
     * Record a request
     */
    recordRequest() {
        this.requests++;
    }

    /**
     * Record an error
     */
    recordError() {
        this.errors++;
    }

    /**
     * Get uptime statistics
     * @returns {Object} Uptime statistics
     */
    getStats() {
        const now = Date.now();
        const uptimeMs = now - this.startTime;

        return {
            uptime: {
                milliseconds: uptimeMs,
                seconds: Math.floor(uptimeMs / 1000),
                minutes: Math.floor(uptimeMs / 1000 / 60),
                hours: Math.floor(uptimeMs / 1000 / 60 / 60),
                human: this.formatUptime(uptimeMs)
            },
            requests: this.requests,
            errors: this.errors,
            errorRate: this.requests > 0 ? (this.errors / this.requests) * 100 : 0,
            startTime: new Date(this.startTime).toISOString()
        };
    }

    /**
     * Format uptime in human-readable format
     * @param {number} ms - Uptime in milliseconds
     * @returns {string} Formatted uptime
     */
    formatUptime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
        if (hours > 0) return `${hours}h ${minutes % 60}m`;
        if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
        return `${seconds}s`;
    }
}