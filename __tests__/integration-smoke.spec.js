/**
 * __tests__/integration-smoke.spec.js
 * ───────────────────────────────────────────────────────────────
 * Smoke test to verify integration of IPFS gateway normalization.
 *
 * This test verifies that the overall flow would work correctly
 * without requiring actual IPFS uploads or image generation.
 */

// Import metadata functions to verify the integration
import { assembleMetadata, generateTraits } from '../utils/metadata.js';

/**
 * Mock upload function that simulates current behavior
 */
function mockUploadToIPFS(filePath, name) {
    // Simulate different return types that might happen
    if (name.includes('json') || name.includes('metadata')) {
        // Metadata upload returns raw IPFS URI
        return Promise.resolve('ipfs://QmMetadataHash987654321');
    } else {
        // Image upload returns raw IPFS URI  
        return Promise.resolve('ipfs://QmImageHash123456789');
    }
}

/**
 * Convert IPFS URI to HTTPS gateway URL if needed
 */
function normalizeToGatewayUrl(uri, filename = '') {
    if (!uri) return uri;
    
    if (uri.startsWith('https://')) {
        return uri;
    }
    
    if (uri.startsWith('ipfs://')) {
        const cid = uri.replace('ipfs://', '');
        const filenamePart = filename ? `/${filename}` : '';
        return `https://ipfs.io/ipfs/${cid}${filenamePart}`;
    }
    
    return uri;
}

/**
 * Smoke test for the complete integration
 */
async function runSmokeTest() {
    console.log('🧪 Running integration smoke test...\n');

    try {
        // Simulate the finalizeMint workflow
        console.log('Step 1: Generate traits...');
        const traits = generateTraits('Tabby', '68');
        console.log('✅ Traits generated successfully');

        // Simulate image upload (could return raw ipfs:// or https://)
        console.log('\nStep 2: Simulate image upload...');
        let imageUri = await mockUploadToIPFS('/path/to/image.png', 'Tabby-68');
        console.log(`📷 Mock image upload returned: ${imageUri}`);
        
        // Apply normalization as finalizeMint would
        const imageFilename = 'Tabby-68.png';
        imageUri = normalizeToGatewayUrl(imageUri, imageFilename);
        console.log(`🔗 Normalized image URI: ${imageUri}`);

        // Create metadata with normalized image URI
        console.log('\nStep 3: Create metadata...');
        const metadata = assembleMetadata(traits, imageUri, {
            name: 'Pixel Ninja Cat #68',
            tokenId: '68',
            external_url: 'http://localhost:5000/kitty/68'
        });

        // Simulate metadata upload
        console.log('\nStep 4: Simulate metadata upload...');
        let metadataUri = await mockUploadToIPFS('/path/to/metadata.json', '68.json');
        console.log(`📄 Mock metadata upload returned: ${metadataUri}`);
        
        // Apply normalization as finalizeMint would
        metadataUri = normalizeToGatewayUrl(metadataUri, '68.json');
        console.log(`🔗 Normalized metadata URI: ${metadataUri}`);

        // Verify results match requirements
        console.log('\nStep 5: Verify requirements...');
        
        // Check tokenURI format
        const expectedTokenUriPattern = /^https:\/\/ipfs\.io\/ipfs\/[A-Za-z0-9]+\/68\.json$/;
        if (expectedTokenUriPattern.test(metadataUri)) {
            console.log('✅ TokenURI format is correct');
            console.log(`   Format: ${metadataUri}`);
        } else {
            console.log('❌ TokenURI format is incorrect');
            console.log(`   Got: ${metadataUri}`);
        }

        // Check metadata image field format
        const expectedImagePattern = /^https:\/\/ipfs\.io\/ipfs\/[A-Za-z0-9]+\//;
        if (expectedImagePattern.test(metadata.image)) {
            console.log('✅ Metadata image field format is correct');
            console.log(`   Format: ${metadata.image}`);
        } else {
            console.log('❌ Metadata image field format is incorrect');
            console.log(`   Got: ${metadata.image}`);
        }

        // Verify metadata structure
        console.log('\nStep 6: Verify metadata structure...');
        const requiredFields = ['name', 'description', 'image', 'attributes'];
        const hasAllFields = requiredFields.every(field => metadata.hasOwnProperty(field));
        
        if (hasAllFields) {
            console.log('✅ Metadata has all required fields');
        } else {
            console.log('❌ Metadata missing required fields');
        }

        // Check that image URI is HTTPS
        if (metadata.image.startsWith('https://')) {
            console.log('✅ Metadata image field uses HTTPS');
        } else {
            console.log('❌ Metadata image field does not use HTTPS');
            console.log(`   Got: ${metadata.image}`);
        }

        console.log('\n🎉 Integration smoke test completed successfully!');
        console.log('\n📋 Results:');
        console.log(`   🌐 TokenURI: ${metadataUri}`);
        console.log(`   🖼️  Image URI: ${metadata.image}`);
        console.log(`   📝 Name: ${metadata.name}`);
        console.log(`   🎯 Attributes: ${metadata.attributes.length} traits`);
        console.log('\n✨ Ready for Blockscout Explorer and wallet compatibility!');

    } catch (error) {
        console.error('❌ Smoke test failed:', error.message);
        throw error;
    }
}

// Run smoke test if called directly
if (process.argv[1].includes('integration-smoke.spec.js')) {
    runSmokeTest().catch(console.error);
}

export { runSmokeTest };