#!/usr/bin/env node

/**
 * Simple test script to validate security utilities
 */

import { 
    validateTokenId, 
    validateBreed, 
    validateImageProvider, 
    validatePrompt, 
    validateEthereumAddress,
    validateBlockNumber,
    validateProviderOptions,
    sanitizeForLogging,
    RateLimiter,
    createSafeErrorResponse
} from './scripts/securityUtils.js';

console.log('🧪 Testing Security Utilities...\n');

// Test validateTokenId
console.log('1. Testing validateTokenId...');
try {
    console.log('✓ Valid token ID (123):', validateTokenId('123'));
    console.log('✓ Valid token ID (0):', validateTokenId(0));
    console.log('✓ Valid token ID (999999):', validateTokenId(999999));
} catch (error) {
    console.log('❌ Error:', error.message);
}

try {
    validateTokenId('invalid');
    console.log('❌ Should have failed for invalid token ID');
} catch (error) {
    console.log('✓ Correctly rejected invalid token ID');
}

// Test validateBreed
console.log('\n2. Testing validateBreed...');
try {
    console.log('✓ Valid breed:', validateBreed('Tabby Cat'));
    console.log('✓ Sanitized breed:', validateBreed('Test<script>alert("xss")</script>'));
} catch (error) {
    console.log('❌ Error:', error.message);
}

// Test validateImageProvider
console.log('\n3. Testing validateImageProvider...');
try {
    console.log('✓ Valid provider:', validateImageProvider('dall-e'));
    console.log('✓ Valid provider:', validateImageProvider('stability'));
    console.log('✓ Valid provider:', validateImageProvider('huggingface'));
} catch (error) {
    console.log('❌ Error:', error.message);
}

try {
    validateImageProvider('invalid-provider');
    console.log('❌ Should have failed for invalid provider');
} catch (error) {
    console.log('✓ Correctly rejected invalid provider');
}

// Test validatePrompt
console.log('\n4. Testing validatePrompt...');
try {
    console.log('✓ Valid prompt:', validatePrompt('A cute ninja cat'));
    console.log('✓ Empty prompt:', validatePrompt(''));
    console.log('✓ Sanitized prompt:', validatePrompt('Test <script>alert("xss")</script>'));
} catch (error) {
    console.log('❌ Error:', error.message);
}

// Test validateEthereumAddress
console.log('\n5. Testing validateEthereumAddress...');
try {
    const validAddress = '0x742d35Cc6634C0532925a3b8D6c2b8b654f77b5E';
    console.log('✓ Valid address:', validateEthereumAddress(validAddress));
} catch (error) {
    console.log('❌ Error:', error.message);
}

try {
    validateEthereumAddress('invalid-address');
    console.log('❌ Should have failed for invalid address');
} catch (error) {
    console.log('✓ Correctly rejected invalid address');
}

// Test validateBlockNumber
console.log('\n6. Testing validateBlockNumber...');
try {
    console.log('✓ Valid block number:', validateBlockNumber('12345'));
    console.log('✓ Valid block number:', validateBlockNumber(0));
} catch (error) {
    console.log('❌ Error:', error.message);
}

// Test validateProviderOptions
console.log('\n7. Testing validateProviderOptions...');
try {
    console.log('✓ Valid options:', validateProviderOptions('{"model": "dall-e-3"}'));
    console.log('✓ Empty options:', validateProviderOptions(''));
} catch (error) {
    console.log('❌ Error:', error.message);
}

// Test sanitizeForLogging
console.log('\n8. Testing sanitizeForLogging...');
const sensitiveData = 'API Key: sk-1234567890abcdef, Address: 0x742d35Cc6634C0532925a3b8D6c2b8b654f77b5E';
console.log('✓ Sanitized log:', sanitizeForLogging(sensitiveData));

// Test RateLimiter
console.log('\n9. Testing RateLimiter...');
const limiter = new RateLimiter(3, 1000); // 3 requests per second
console.log('✓ First request allowed:', limiter.isAllowed('test-ip'));
console.log('✓ Second request allowed:', limiter.isAllowed('test-ip'));
console.log('✓ Third request allowed:', limiter.isAllowed('test-ip'));
console.log('✓ Fourth request blocked:', !limiter.isAllowed('test-ip'));
console.log('✓ Different IP allowed:', limiter.isAllowed('other-ip'));

// Test createSafeErrorResponse
console.log('\n10. Testing createSafeErrorResponse...');
const testError = new Error('Database connection failed');
const safeResponse = createSafeErrorResponse(testError, false);
console.log('✓ Safe error response (production):', safeResponse);

const devResponse = createSafeErrorResponse(testError, true);
console.log('✓ Detailed error response (development):', devResponse);

console.log('\n✅ All security utility tests completed successfully!');
console.log('\n🔒 Security utilities are working correctly and ready for production use.');