/**
 * __tests__/metadata.spec.js
 * ───────────────────────────────────────────────────────────────
 * Unit tests for metadata generation functions.
 *
 * These tests verify deterministic trait generation, rarity calculation,
 * and metadata assembly using seeded random number generation.
 */

import { strict as assert } from 'assert';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import our metadata functions
import {
    generateTraits,
    generateStats,
    generateNinjaCatDescription,
    calculateRarityScore,
    getRarityTier,
    assembleMetadata
} from '../utils/metadata.js';

// Load the JSON schema
const schema = JSON.parse(
    readFileSync(resolve(__dirname, '../docs/metadata-schema.json'), 'utf8')
);

// Set up AJV validator
const ajv = new Ajv();
addFormats(ajv);
const validate = ajv.compile(schema);

/**
 * Simple test runner since we don't have a testing framework
 */
function runTests() {
    console.log('🧪 Running metadata generation tests...\n');

    // Test basic trait generation
    console.log('Testing trait generation...');
    const breed = 'Tabby';
    const tokenId = '1';

    try {
        const traits = generateTraits(breed, tokenId);
        console.log('✅ Trait generation successful');
        console.log(`   Generated ${traits.attributes.length} attributes`);
        console.log(`   Rarity: ${traits.rarity.tier} (score: ${traits.rarity.score})`);

        // Test stats generation
        console.log('\nTesting stats generation...');
        const stats = generateStats(traits.rawTraits, 12345);
        console.log('✅ Stats generation successful');
        console.log(`   Stats: ${JSON.stringify(stats)}`);

        // Test description generation
        console.log('\nTesting description generation...');
        const description = generateNinjaCatDescription(tokenId, breed, traits.rawTraits);
        console.log('✅ Description generation successful');
        console.log(`   Description length: ${description.length} characters`);

        // Test rarity calculation
        console.log('\nTesting rarity calculation...');
        const score = calculateRarityScore(traits.rawTraits);
        const tier = getRarityTier(score);
        console.log('✅ Rarity calculation successful');
        console.log(`   Score: ${score}, Tier: ${tier}`);

        // Test metadata assembly
        console.log('\nTesting metadata assembly...');
        const metadata = assembleMetadata(traits, 'ipfs://QmTestHash', {
            name: 'Test Cat #1',
            tokenId: '1'
        });
        console.log('✅ Metadata assembly successful');

        // Test schema validation
        console.log('\nTesting schema validation...');
        const isValid = validate(metadata);
        if (isValid) {
            console.log('✅ Schema validation successful');
        } else {
            console.log('❌ Schema validation failed:');
            console.log(validate.errors);
        }

        // Test deterministic generation
        console.log('\nTesting deterministic generation...');
        const traits2 = generateTraits(breed, tokenId);
        const isConsistent = JSON.stringify(traits.attributes) === JSON.stringify(traits2.attributes);
        if (isConsistent) {
            console.log('✅ Deterministic generation successful');
        } else {
            console.log('❌ Deterministic generation failed');
        }

        // Test multiple breeds
        console.log('\nTesting multiple breeds...');
        const breeds = ['Tabby', 'Bengal', 'Persian', 'Shadow', 'Nyan'];
        const rarityTiers = new Set();

        breeds.forEach(testBreed => {
            for (let i = 1; i <= 5; i++) {
                const testTraits = generateTraits(testBreed, i.toString());
                rarityTiers.add(testTraits.rarity.tier);
            }
        });

        console.log('✅ Multiple breeds tested');
        console.log(`   Generated rarity tiers: ${Array.from(rarityTiers).join(', ')}`);

        // Test edge cases
        console.log('\nTesting edge cases...');

        // Test empty attributes for rarity calculation
        try {
            calculateRarityScore([]);
            console.log('❌ Empty attributes should throw error');
        } catch {
            console.log('✅ Empty attributes correctly throws error');
        }

        // Test unknown breed fallback
        const unknownBreedTraits = generateTraits('UnknownBreed', '1');
        const breedAttribute = unknownBreedTraits.attributes.find(attr => attr.trait_type === 'Breed');
        if (breedAttribute && breedAttribute.value !== 'UnknownBreed') {
            console.log('✅ Unknown breed fallback works');
        } else {
            console.log('❌ Unknown breed fallback failed');
        }

        console.log('\n🎉 All tests completed!');

        // Test IPFS gateway URL normalization
        console.log('\nTesting IPFS gateway URL normalization...');

        // Test with ipfs:// URI
        const ipfsMetadata = assembleMetadata(traits, 'ipfs://QmTestHash123', {
            name: 'Test Cat #1',
            tokenId: '1'
        });

        if (ipfsMetadata.image.startsWith('https://ipfs.io/ipfs/')) {
            console.log('✅ IPFS URI correctly converted to HTTPS gateway URL');
            console.log(`   Image URL: ${ipfsMetadata.image}`);
        } else {
            console.log('❌ IPFS URI conversion failed');
            console.log(`   Expected HTTPS URL, got: ${ipfsMetadata.image}`);
        }

        // Test with already HTTPS URI
        const httpsMetadata = assembleMetadata(traits, 'https://ipfs.io/ipfs/QmTestHash123/image.png', {
            name: 'Test Cat #2',
            tokenId: '2'
        });

        if (httpsMetadata.image === 'https://ipfs.io/ipfs/QmTestHash123/image.png') {
            console.log('✅ HTTPS URI correctly preserved');
        } else {
            console.log('❌ HTTPS URI preservation failed');
        }

        console.log('\n🎉 All tests completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    }
}

// Run tests
runTests();