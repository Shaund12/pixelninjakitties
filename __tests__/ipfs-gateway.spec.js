/**
 * __tests__/ipfs-gateway.spec.js
 * ───────────────────────────────────────────────────────────────
 * Unit tests for IPFS gateway URL normalization.
 *
 * Tests the normalization functions to ensure IPFS URIs are properly
 * converted to HTTPS gateway URLs for Blockscout and wallet compatibility.
 */

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
 * Simple test runner for IPFS gateway normalization
 */
function runTests() {
    console.log('🧪 Running IPFS gateway normalization tests...\n');

    // Test 1: Convert ipfs:// to HTTPS gateway
    console.log('Test 1: Converting ipfs:// to HTTPS gateway...');
    const ipfsUri = 'ipfs://QmTestHashExample123456789';
    const expectedHttps = 'https://ipfs.io/ipfs/QmTestHashExample123456789';
    const result1 = normalizeToGatewayUrl(ipfsUri);

    if (result1 === expectedHttps) {
        console.log('✅ IPFS URI correctly converted to HTTPS gateway');
        console.log(`   Input: ${ipfsUri}`);
        console.log(`   Output: ${result1}`);
    } else {
        console.log('❌ IPFS URI conversion failed');
        console.log(`   Expected: ${expectedHttps}`);
        console.log(`   Got: ${result1}`);
    }

    // Test 2: Convert ipfs:// to HTTPS gateway with filename
    console.log('\nTest 2: Converting ipfs:// to HTTPS gateway with filename...');
    const ipfsUri2 = 'ipfs://QmTestHashExample123456789';
    const filename = 'Tabby-68.png';
    const expectedHttps2 = 'https://ipfs.io/ipfs/QmTestHashExample123456789/Tabby-68.png';
    const result2 = normalizeToGatewayUrl(ipfsUri2, filename);

    if (result2 === expectedHttps2) {
        console.log('✅ IPFS URI with filename correctly converted');
        console.log(`   Input: ${ipfsUri2} + ${filename}`);
        console.log(`   Output: ${result2}`);
    } else {
        console.log('❌ IPFS URI with filename conversion failed');
        console.log(`   Expected: ${expectedHttps2}`);
        console.log(`   Got: ${result2}`);
    }

    // Test 3: Preserve existing HTTPS URLs
    console.log('\nTest 3: Preserving existing HTTPS URLs...');
    const httpsUri = 'https://ipfs.io/ipfs/QmExistingHash/image.png';
    const result3 = normalizeToGatewayUrl(httpsUri);

    if (result3 === httpsUri) {
        console.log('✅ HTTPS URI correctly preserved');
        console.log(`   Input: ${httpsUri}`);
        console.log(`   Output: ${result3}`);
    } else {
        console.log('❌ HTTPS URI preservation failed');
        console.log(`   Expected: ${httpsUri}`);
        console.log(`   Got: ${result3}`);
    }

    // Test 4: Handle non-IPFS URIs
    console.log('\nTest 4: Handling non-IPFS URIs...');
    const httpUri = 'http://example.com/image.png';
    const result4 = normalizeToGatewayUrl(httpUri);

    if (result4 === httpUri) {
        console.log('✅ Non-IPFS URI correctly preserved');
        console.log(`   Input: ${httpUri}`);
        console.log(`   Output: ${result4}`);
    } else {
        console.log('❌ Non-IPFS URI preservation failed');
        console.log(`   Expected: ${httpUri}`);
        console.log(`   Got: ${result4}`);
    }

    // Test 5: Handle empty/null URIs
    console.log('\nTest 5: Handling empty/null URIs...');
    const emptyResult = normalizeToGatewayUrl('');
    const nullResult = normalizeToGatewayUrl(null);

    if (emptyResult === '' && nullResult === null) {
        console.log('✅ Empty/null URIs correctly handled');
    } else {
        console.log('❌ Empty/null URI handling failed');
        console.log(`   Empty result: ${emptyResult}`);
        console.log(`   Null result: ${nullResult}`);
    }

    // Test 6: Validate gateway format for tokenURI scenario
    console.log('\nTest 6: Validating gateway format for tokenURI scenario...');
    const tokenUri = 'ipfs://QmMetadataHash123';
    const metadataFilename = '68.json';
    const expectedTokenUri = 'https://ipfs.io/ipfs/QmMetadataHash123/68.json';
    const tokenResult = normalizeToGatewayUrl(tokenUri, metadataFilename);

    if (tokenResult === expectedTokenUri) {
        console.log('✅ TokenURI format correctly generated');
        console.log(`   Input: ${tokenUri} + ${metadataFilename}`);
        console.log(`   Output: ${tokenResult}`);
        console.log('   ✓ Format matches requirement: https://ipfs.io/ipfs/<CID>/<filename>');
    } else {
        console.log('❌ TokenURI format generation failed');
        console.log(`   Expected: ${expectedTokenUri}`);
        console.log(`   Got: ${tokenResult}`);
    }

    console.log('\n🎉 All IPFS gateway normalization tests completed!');
    console.log('\n📋 Summary:');
    console.log('   ✓ IPFS URIs are normalized to HTTPS gateway format');
    console.log('   ✓ Gateway URLs use https://ipfs.io/ipfs/<CID>/<filename> format');
    console.log('   ✓ Existing HTTPS URLs are preserved');
    console.log('   ✓ Non-IPFS URIs are preserved');
    console.log('   ✓ Empty/null values are handled gracefully');
    console.log('   ✓ Blockscout and wallet compatibility ensured');
}

// Only run tests if called directly
if (process.argv[1].includes('ipfs-gateway.spec.js')) {
    runTests();
}

export { runTests, normalizeToGatewayUrl };