/**
 * utils/metadata.js
 * ───────────────────────────────────────────────────────────────
 * Core metadata generation utilities for Pixel Ninja Cats NFTs.
 * 
 * This module contains the main logic for generating traits, stats,
 * descriptions, and rarity calculations, extracted from finalizeMint.js
 * for better modularity and testing.
 */

import { createHash } from 'crypto';
import {
    traitCategories,
    breedWeightings,
    mythicTraits,
    specialTraits,
    synergyPairs,
    backgroundDefinitions,
    clanDefinitions,
    villainDefinitions,
    backgroundFlavorText,
    rarityMapping
} from './metadata-definitions.js';

/**
 * Generate traits for a ninja cat based on breed and tokenId
 * @param {string} breed - The breed of the cat
 * @param {string|number} tokenId - The token ID for deterministic generation
 * @returns {Object} Generated traits with attributes, description, rarity, etc.
 */
export function generateTraits(breed, tokenId) {
    // Use tokenId as a seed for deterministic but "random" traits
    const seed = parseInt(tokenId, 10);

    // Create a proper hash for better distribution
    function getTraitHash(traitType, tokenSeed) {
        return createHash('sha256')
            .update(`${tokenSeed}-${breed}-${traitType}`)
            .digest('hex');
    }

    // Apply breed-based weightings to trait selection
    function applyBreedWeightings(categories, breed) {
        // Check if we have specific weightings for this breed
        const weightings = breedWeightings[breed];
        if (!weightings) return categories; // No specific weightings

        // Create a copy of the categories to modify
        const weighted = JSON.parse(JSON.stringify(categories));

        // Apply weightings to preferred traits
        Object.keys(weightings).forEach(categoryName => {
            if (!weighted[categoryName]) return;

            const preferredTraits = weightings[categoryName];
            weighted[categoryName].forEach(trait => {
                if (preferredTraits.includes(trait.value)) {
                    // FIX: BOOST rarityScore for preferred traits (higher = more common)
                    trait.rarityScore = Math.min(40, Math.floor(trait.rarityScore * 1.8));
                    console.log(`👑 Breed affinity: ${breed} gets +80% chance for ${trait.value}`);
                }
            });
        });

        return weighted;
    }

    // Apply breed weightings if applicable
    const weightedCategories = applyBreedWeightings(traitCategories, breed);

    // Check for ultra rare "Mythic" tier traits (1 in 1000 chance)
    const isMythic = parseInt(getTraitHash('mythic', seed).substring(0, 8), 16) % 1000 === 0;

    // Weighted selection function with proper rarity distribution
    const getWeightedTrait = (arr, traitType) => {
        if (!arr || arr.length === 0) {
            throw new Error(`Empty or undefined trait array for ${traitType}`);
        }

        const hash = getTraitHash(traitType, seed);
        const hashValue = parseInt(hash.substring(0, 8), 16) / (2 ** 32);

        // Use rarityScore directly (higher score = higher chance)
        // Square the rarityScore for more dramatic rarity effects
        const totalWeight = arr.reduce((sum, item) => sum + Math.pow(item.rarityScore || 30, 2), 0);

        // Generate a target value from the hash
        const target = hashValue * totalWeight;
        let cumulativeWeight = 0;

        // Find the item that corresponds to the target value
        for (const item of arr) {
            cumulativeWeight += Math.pow(item.rarityScore || 30, 2);
            if (target <= cumulativeWeight) {
                console.log(`TokenId ${tokenId} - Selected ${traitType}: ${item.value} (${item.rarity}) [${item.rarityScore}]`);
                return item;
            }
        }

        // Fallback
        return arr[0];
    };

    // Check for special trait (1 in 50 chance instead of 1 in 100)
    const isSpecial = parseInt(getTraitHash('special', seed).substring(0, 6), 16) % 50 === 0;

    // Generate core traits - use the specified breed instead of random selection
    console.log(`🔍 DEBUG: Looking for breed "${breed}" in available breeds`);
    console.log(`🔍 DEBUG: Available breeds: ${traitCategories.breeds.map(b => b.value).join(', ')}`);
    console.log(`🔍 DEBUG: Breed type: ${typeof breed}, Length: ${breed.length}`);

    let breedTrait = traitCategories.breeds.find(b => b.value === breed);
    console.log('🔍 DEBUG: Found breed trait:', breedTrait);

    // Additional debugging for the exact comparison
    console.log(`🔍 DEBUG: Searching for breed "${breed}" with strict comparison`);
    traitCategories.breeds.forEach((b, index) => {
        console.log(`🔍 DEBUG: Available breed ${index}: "${b.value}" (${b.value === breed ? 'MATCH' : 'NO MATCH'})`);
    });

    // If the breed is not found, try a more flexible comparison
    if (!breedTrait) {
        console.log('⚠️ Exact match failed, trying case-insensitive match');
        breedTrait = traitCategories.breeds.find(b => b.value.toLowerCase() === breed.toLowerCase());
        console.log('🔍 DEBUG: Case-insensitive match result:', breedTrait);
    }

    if (!breedTrait) {
        console.log(`⚠️ Breed "${breed}" not found in available breeds, using random selection`);
        breedTrait = getWeightedTrait(weightedCategories.breeds, 'breed');
        console.log(`TokenId ${tokenId} - Selected breed: ${breedTrait.value} (${breedTrait.rarity}) [${breedTrait.rarityScore}] - RANDOM FALLBACK`);
    } else {
        console.log(`TokenId ${tokenId} - Selected breed: ${breedTrait.value} (${breedTrait.rarity}) [${breedTrait.rarityScore}] - USER SPECIFIED`);
    }

    // Additional debugging for breed trait content
    console.log('🔍 DEBUG: Final breedTrait object:', JSON.stringify(breedTrait, null, 2));
    const weaponTrait = getWeightedTrait(weightedCategories.weapons, 'weapon');
    const stanceTrait = getWeightedTrait(weightedCategories.stances, 'stance');
    const elementTrait = getWeightedTrait(weightedCategories.elements, 'element');
    const rankTrait = getWeightedTrait(weightedCategories.ranks, 'rank');

    // 75% chance to have accessory
    const hasAccessory = parseInt(getTraitHash('hasAccessory', seed).substring(0, 4), 16) % 100 < 75;
    const accessoryTrait = hasAccessory ?
        getWeightedTrait(weightedCategories.accessories, 'accessory') : null;

    // Build attribute array
    const attributes = [
        { trait_type: 'Breed', value: breedTrait.value, rarity: breedTrait.rarity, keywords: breedTrait.keywords },
        { trait_type: 'Weapon', value: weaponTrait.value, rarity: weaponTrait.rarity, keywords: weaponTrait.keywords },
        { trait_type: 'Stance', value: stanceTrait.value, rarity: stanceTrait.rarity, keywords: stanceTrait.keywords },
        { trait_type: 'Element', value: elementTrait.value, rarity: elementTrait.rarity, keywords: elementTrait.keywords },
        { trait_type: 'Rank', value: rankTrait.value, rarity: rankTrait.rarity, keywords: rankTrait.keywords }
    ];

    // Add accessory if present
    if (accessoryTrait) {
        attributes.push({
            trait_type: 'Accessory',
            value: accessoryTrait.value,
            rarity: accessoryTrait.rarity,
            keywords: accessoryTrait.keywords
        });
    }

    // Add special trait if lucky
    if (isSpecial) {
        const specialIndex = parseInt(getTraitHash('special-type', seed).substring(0, 4), 16) % specialTraits.length;
        attributes.push({
            trait_type: specialTraits[specialIndex].trait_type,
            value: specialTraits[specialIndex].value,
            rarity: 'Unique',
            keywords: specialTraits[specialIndex].keywords
        });
        console.log(`TokenId ${tokenId} - 🎁 SPECIAL TRAIT ADDED: ${specialTraits[specialIndex].trait_type}: ${specialTraits[specialIndex].value}! 🎁`);
    }

    // Add mythic trait if extremely lucky (1 in 1000)
    if (isMythic) {
        const mythicIndex = parseInt(getTraitHash('mythic-type', seed).substring(0, 4), 16) % mythicTraits.length;
        attributes.push({
            trait_type: mythicTraits[mythicIndex].trait_type,
            value: mythicTraits[mythicIndex].value,
            rarity: 'Mythic',
            keywords: mythicTraits[mythicIndex].keywords
        });
        console.log(`TokenId ${tokenId} - 🌟 MYTHIC TRAIT ADDED: ${mythicTraits[mythicIndex].trait_type}: ${mythicTraits[mythicIndex].value}! 🌟`);
    }

    // Generate stats
    const stats = generateStats(attributes, seed);

    // Add stats to attributes
    Object.entries(stats).forEach(([stat, value]) => {
        attributes.push({
            trait_type: stat.charAt(0).toUpperCase() + stat.slice(1),
            value,
            display_type: 'number'
        });
    });

    // Generate description/backstory based on traits
    const description = generateNinjaCatDescription(tokenId, breed, attributes);

    // Calculate overall rarity score and tier
    const rarityScore = calculateRarityScore(attributes);
    const rarityTier = getRarityTier(rarityScore);

    // Extract keywords from all traits for better prompt generation
    const allKeywords = attributes
        .filter(attr => attr.keywords)
        .map(attr => attr.keywords)
        .flat();

    // Return enhanced trait data
    return {
        attributes: attributes.map(attr => {
            const displayAttr = {
                trait_type: attr.trait_type,
                value: attr.value
            };
            if (attr.display_type) {
                displayAttr.display_type = attr.display_type;
            }
            return displayAttr;
        }),
        description,
        rarity: {
            score: rarityScore,
            tier: rarityTier
        },
        // Include keywords for prompt enhancement
        keywords: allKeywords,
        // Store raw trait data for internal use
        rawTraits: attributes,
        stats
    };
}

/**
 * Generate stats based on traits
 * @param {Array} traits - Array of trait objects
 * @param {number} seed - Seed for deterministic generation
 * @returns {Object} Generated stats
 */
export function generateStats(traits, seed) {
    const baseStats = {
        agility: 5,
        stealth: 5,
        power: 5,
        intelligence: 5
    };

    // Generate hash-based modifier
    const modifier = (statName) => {
        const hash = createHash('sha256')
            .update(`${seed}-stat-${statName}`)
            .digest('hex');
        const mod = parseInt(hash.substring(0, 2), 16) % 4;
        return mod;
    };

    // Apply breed bonuses
    const breed = traits.find(t => t.trait_type === 'Breed')?.value;
    switch (breed) {
        case 'Tabby':
            baseStats.agility += 2;
            baseStats.power += 1;
            break;
        case 'Siamese':
            baseStats.stealth += 2;
            baseStats.intelligence += 1;
            break;
        case 'Maine Coon':
            baseStats.power += 3;
            baseStats.intelligence += 1;
            break;
        case 'Bengal':
            baseStats.agility += 3;
            baseStats.power += 1;
            break;
        case 'Calico':
            baseStats.intelligence += 2;
            baseStats.stealth += 1;
            break;
        case 'Bombay':
            baseStats.stealth += 3;
            break;
        case 'Persian':
            baseStats.intelligence += 3;
            baseStats.agility -= 1;
            break;
        case 'Sphynx':
            baseStats.stealth += 1;
            baseStats.intelligence += 2;
            break;
        case 'Nyan':
            baseStats.agility += 2;
            baseStats.power += 2;
            break;
        case 'Shadow':
            baseStats.stealth += 3;
            baseStats.power += 2;
            baseStats.agility += 1;
            break;
    }

    // Apply weapon bonuses
    const weapon = traits.find(t => t.trait_type === 'Weapon')?.value;
    switch (weapon) {
        case 'Katana':
            baseStats.power += 2;
            break;
        case 'Shuriken':
            baseStats.agility += 1;
            baseStats.stealth += 1;
            break;
        case 'Nunchucks':
            baseStats.agility += 2;
            break;
        case 'Kunai':
            baseStats.stealth += 2;
            break;
        case 'Sai':
            baseStats.power += 1;
            baseStats.agility += 1;
            break;
        case 'Bo Staff':
            baseStats.intelligence += 2;
            break;
        case 'Twin Blades':
            baseStats.agility += 2;
            baseStats.power += 1;
            break;
        case 'Kusarigama':
            baseStats.stealth += 1;
            baseStats.intelligence += 2;
            break;
        case 'War Fan':
            baseStats.intelligence += 2;
            baseStats.power += 1;
            break;
        case 'Ghost Dagger':
            baseStats.stealth += 3;
            baseStats.power += 1;
            break;
    }

    // Apply element bonuses
    const element = traits.find(t => t.trait_type === 'Element')?.value;
    switch (element) {
        case 'Fire':
            baseStats.power += 2;
            break;
        case 'Water':
            baseStats.agility += 2;
            break;
        case 'Earth':
            baseStats.power += 1;
            baseStats.intelligence += 1;
            break;
        case 'Wind':
            baseStats.agility += 3;
            break;
        case 'Lightning':
            baseStats.agility += 2;
            baseStats.power += 1;
            break;
        case 'Ice':
            baseStats.intelligence += 2;
            baseStats.stealth += 1;
            break;
        case 'Shadow':
            baseStats.stealth += 3;
            break;
        case 'Light':
            baseStats.intelligence += 2;
            baseStats.power += 1;
            break;
        case 'Void':
            baseStats.power += 2;
            baseStats.stealth += 2;
            break;
        case 'Cosmic':
            baseStats.power += 2;
            baseStats.intelligence += 2;
            break;
    }

    // Apply random modifiers
    baseStats.agility += modifier('agility');
    baseStats.stealth += modifier('stealth');
    baseStats.power += modifier('power');
    baseStats.intelligence += modifier('intelligence');

    // Apply mythic and special bonuses
    const hasMythic = traits.some(t => t.rarity === 'Mythic');
    const hasSpecial = traits.some(t => t.rarity === 'Unique');

    if (hasMythic) {
        Object.keys(baseStats).forEach(key => {
            baseStats[key] += 3;
        });
    }

    if (hasSpecial) {
        const specialTrait = traits.find(t => t.rarity === 'Unique');
        switch (specialTrait?.trait_type) {
            case 'Technique':
                baseStats.agility += 2;
                break;
            case 'Skill':
                baseStats.intelligence += 2;
                break;
            case 'Move':
                baseStats.power += 2;
                break;
            case 'Style':
                baseStats.agility += 1;
                baseStats.power += 1;
                break;
            case 'Secret':
                baseStats.stealth += 2;
                break;
            case 'Ability':
                baseStats.intelligence += 1;
                baseStats.stealth += 1;
                break;
            case 'Power':
                baseStats.power += 2;
                break;
            case 'Mastery':
                baseStats.intelligence += 1;
                baseStats.agility += 1;
                break;
        }
    }

    // Ensure stats are within bounds (1-10)
    Object.keys(baseStats).forEach(key => {
        baseStats[key] = Math.max(1, Math.min(10, baseStats[key]));
    });

    return baseStats;
}

/**
 * Generate ninja cat backstory and description
 * @param {string|number} tokenId - Token ID
 * @param {string} breed - Cat breed
 * @param {Array} attributes - Array of trait attributes
 * @returns {string} Generated description
 */
export function generateNinjaCatDescription(tokenId, breed, attributes) {
    const seed = parseInt(tokenId, 10);
    const hash = createHash('sha256').update(`${seed}-description`).digest('hex');

    // Extract trait values with fallbacks
    const weapon = attributes.find(attr => attr.trait_type === 'Weapon')?.value || 'Katana';
    const element = attributes.find(attr => attr.trait_type === 'Element')?.value || 'Fire';
    const stance = attributes.find(attr => attr.trait_type === 'Stance')?.value || 'Attack';
    const rank = attributes.find(attr => attr.trait_type === 'Rank')?.value || 'Novice';
    const accessory = attributes.find(attr => attr.trait_type === 'Accessory')?.value;
    const background = attributes.find(attr => attr.trait_type === 'Background')?.value;

    // Check for special/mythic traits
    const special = attributes.find(attr => attr.rarity === 'Unique');
    const mythic = attributes.find(attr => attr.rarity === 'Mythic');

    // Get stats
    const agility = attributes.find(attr => attr.trait_type === 'Agility')?.value || 5;
    const stealth = attributes.find(attr => attr.trait_type === 'Stealth')?.value || 5;
    const power = attributes.find(attr => attr.trait_type === 'Power')?.value || 5;
    const intelligence = attributes.find(attr => attr.trait_type === 'Intelligence')?.value || 5;

    // Determine cat's prowess based on stats
    const highestStat = Math.max(agility, stealth, power, intelligence);
    let specialty = 'balanced fighting';

    if (highestStat === agility) specialty = 'swift movements';
    else if (highestStat === stealth) specialty = 'silent operations';
    else if (highestStat === power) specialty = 'powerful strikes';
    else if (highestStat === intelligence) specialty = 'tactical mastery';

    const clan = clanDefinitions[breed] || 'Shadow Paw Clan';
    const villain = villainDefinitions[element] || 'the Evil Overlord';

    // Background flavor text integration
    const backgroundContext = background && backgroundFlavorText[background]
        ? backgroundFlavorText[background]
        : 'where they pursue their ninja path';

    // Pattern selection with expanded variety (8 patterns)
    const pattern = parseInt(hash.substring(0, 4), 16) % 8;

    // Build backstory based on pattern with background integration
    let description;

    if (pattern === 0) {
        description = `A ${rank.toLowerCase()} ${breed} ninja cat from the ${clan}, wielding a ${weapon.toLowerCase()} infused with ${element.toLowerCase()} energy. Known for ${specialty}, this warrior has sworn to defeat ${villain} and restore peace to the realm. They are often found in the ${background ? background.toLowerCase() : 'shadows'}, ${backgroundContext}.`;
    }
    else if (pattern === 1) {
        description = `Trained in the secret arts of the ${clan}, this ${breed} ninja cat has mastered the ${stance.toLowerCase()} stance. Armed with a legendary ${weapon.toLowerCase()} and commanding ${element.toLowerCase()} techniques, the ${rank.toLowerCase()} warrior excels at ${specialty}. The ${background ? background.toLowerCase() : 'shadows'} ${backgroundContext}.`;
    }
    else if (pattern === 2) {
        description = `This ${breed} ninja of ${rank.toLowerCase()} status serves the ancient ${clan}. Having perfected the ${stance.toLowerCase()} stance and carrying a trusty ${weapon.toLowerCase()}, they harness ${element.toLowerCase()} powers with exceptional skill in ${specialty}. The ${background ? background.toLowerCase() : 'dojo'} is ${backgroundContext}.`;
    }
    else if (pattern === 3) {
        description = `A mysterious ${breed} warrior from the shadows of the ${clan}, this ${rank.toLowerCase()} ninja cat wields a deadly ${weapon.toLowerCase()}. Their mastery of ${element.toLowerCase()} techniques and ${stance.toLowerCase()} stance makes them formidable in ${specialty}, especially when in the ${background ? background.toLowerCase() : 'night'}, ${backgroundContext}.`;
    }
    else if (pattern === 4) {
        description = `The ${clan} has produced few warriors as talented as this ${breed} ninja cat. Rising to the rank of ${rank.toLowerCase()}, they've become legendary for their ${stance.toLowerCase()} technique, ${weapon.toLowerCase()} prowess, and ${element.toLowerCase()} manipulation, particularly excelling in ${specialty}. They seek sanctuary in the ${background ? background.toLowerCase() : 'temple'}, ${backgroundContext}.`;
    }
    else if (pattern === 5) {
        description = `Whispers speak of a ${breed} ninja cat from the ${clan}, who reached the ${rank.toLowerCase()} rank before age three. With unparalleled skill in the ${stance.toLowerCase()} stance and wielding a ${weapon.toLowerCase()} with deadly precision, they channel ${element.toLowerCase()} energy while specializing in ${specialty}. Legends say they emerged from the ${background ? background.toLowerCase() : 'mist'}, ${backgroundContext}.`;
    }
    else if (pattern === 6) {
        description = `Born under a rare celestial alignment, this ${breed} ninja of the ${clan} carries the mark of destiny. Their ${element.toLowerCase()} powers flow through their ${weapon.toLowerCase()} as they move with perfect ${stance.toLowerCase()} form. Now a ${rank.toLowerCase()} warrior known for ${specialty}, they've claimed the ${background ? background.toLowerCase() : 'mountain'} as their domain, ${backgroundContext}.`;
    }
    else {
        description = `Neither friend nor foe can predict the movements of this ${breed} ninja from the ${clan}. Their ${stance.toLowerCase()} stance combined with masterful control of ${element.toLowerCase()} energy makes their ${weapon.toLowerCase()} strikes devastatingly effective. As a ${rank.toLowerCase()} who excels in ${specialty}, they've found their true calling in the ${background ? background.toLowerCase() : 'forest'}, ${backgroundContext}.`;
    }

    // Add accessory detail if present
    if (accessory) {
        description += ` Their ${accessory.toLowerCase()} is a symbol of honor earned through countless victorious battles.`;
    }

    // Add special ability if present
    if (special) {
        description += ` This warrior possesses the rare ${special.value} ${special.trait_type.toLowerCase()}, allowing them to overcome seemingly impossible odds.`;
    }

    // Add mythic ability if present
    if (mythic) {
        description += ` Legends tell that they were blessed by the Cat Gods with the mythical ${mythic.value}, a power so rare it appears only once in a thousand generations.`;
    }

    return description;
}

/**
 * Calculate rarity score based on trait rarities and synergies
 * @param {Array} attributes - NFT trait attributes
 * @returns {Number} - Calculated rarity score
 */
export function calculateRarityScore(attributes) {
    if (!attributes || attributes.length === 0) {
        throw new Error('Empty or undefined attributes array');
    }

    let totalScore = 0;
    let count = 0;

    // Skip these types in calculation
    const skipTypes = ['Agility', 'Stealth', 'Power', 'Intelligence'];

    // Calculate base score from rarity values
    for (const attr of attributes) {
        if (skipTypes.includes(attr.trait_type)) continue;

        const rarityScore = rarityMapping[attr.rarity] || 50;
        totalScore += rarityScore;
        count++;
    }

    // Calculate synergy bonuses
    for (const synergy of synergyPairs) {
        const hasTrait1 = attributes.some(attr =>
            attr.trait_type === synergy.type1 && attr.value === synergy.value1
        );

        const hasTrait2 = attributes.some(attr =>
            attr.trait_type === synergy.type2 && attr.value === synergy.value2
        );

        if (hasTrait1 && hasTrait2) {
            totalScore += synergy.bonus;
            console.log(`🔄 Synergy bonus: ${synergy.value1} + ${synergy.value2} = +${synergy.bonus} points`);
        }
    }

    // Special bonuses for mythic traits
    const hasMythic = attributes.some(attr => attr.rarity === 'Mythic');
    if (hasMythic) {
        totalScore += 50;
        console.log('✨ Mythic trait detected: +50 points bonus!');
    }

    // Calculate final average score
    return Math.round(totalScore / count);
}

/**
 * Determine rarity tier based on score
 * @param {Number} score - Calculated rarity score
 * @returns {String} - Rarity tier name
 */
export function getRarityTier(score) {
    if (score >= 120) return 'Mythic';      // Ultra-rare
    if (score >= 100) return 'Legendary';   // Extremely rare
    if (score >= 85) return 'Epic';         // Very rare
    if (score >= 70) return 'Rare';         // Rare
    if (score >= 60) return 'Uncommon';     // Uncommon
    if (score >= 40) return 'Common';       // Common
    return 'Standard';                      // Default
}

/**
 * Assemble the final metadata object with versioning
 * @param {Object} traits - Generated traits object
 * @param {string} imageUri - IPFS URI for the image
 * @param {Object} metadataExtras - Additional metadata properties
 * @returns {Object} - Final metadata object
 */
export function assembleMetadata(traits, imageUri, metadataExtras = {}) {
    const metadata = {
        metadata_version: "2.0",
        name: metadataExtras.name || `Pixel Ninja Cat #${metadataExtras.tokenId || 'Unknown'}`,
        description: traits.description,
        image: imageUri,
        external_url: metadataExtras.external_url || undefined,
        attributes: traits.attributes,
        ...metadataExtras
    };

    // Remove undefined values
    Object.keys(metadata).forEach(key => {
        if (metadata[key] === undefined) {
            delete metadata[key];
        }
    });

    return metadata;
}

/**
 * Get background definitions for all providers
 * @returns {Array} Array of background definitions
 */
export function getBackgroundDefinitions() {
    return backgroundDefinitions;
}