/**
 * scripts/finalizeMint.js
 * ───────────────────────────────────────────────────────────────
 * Generates a 32 × 32 pixel-art Ninja-Cat sprite via DALL-E-3,
 * trims any stray palette bar, uploads PNG + JSON to IPFS
 * (Pinata first → w3-CLI fallback), and returns { tokenURI }.
 *
 * Rich metadata generation includes:
 * - Core traits (Breed, Weapon, Stance, Element, Rank, Accessory)
 * - Combat stats (Agility, Stealth, Power, Intelligence)
 * - Backstory based on traits
 * - Special abilities
 * - Rarity indicators
 *
 * Required env:
 *   OPENAI_API_KEY
 * Optional env:
 *   PINATA_API_KEY  PINATA_SECRET_KEY   (for Pinata first-try)
 *   BASE_URL        (served /images + /metadata fallback)
 *
 * Extra dep (for loss-less auto-crop):
 *   npm i sharp
 */

import "dotenv/config";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import os from "os";
import FormData from "form-data";
import fetch from "node-fetch";
import { exec } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
const execAsync = promisify(exec);

/* ─── env ────────────────────────────────────────────────────── */
const {
    OPENAI_API_KEY,
    PINATA_API_KEY,
    PINATA_SECRET_KEY,
    BASE_URL
} = process.env;

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY in .env");
const baseUrl = BASE_URL || "http://localhost:5000";
const isPinataConfigured = PINATA_API_KEY && PINATA_SECRET_KEY;

/* ─── optional sharp (auto-crop) ─────────────────────────────── */
let sharp;
try { sharp = (await import("sharp")).default; } catch { /* fine */ }

/* ─── OpenAI client ──────────────────────────────────────────── */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/* ─── trait generation ─────────────────────────────────────────── */
function generateTraits(breed, tokenId) {
    // Use tokenId as a seed for deterministic but "random" traits
    const seed = parseInt(tokenId);

    // Create a proper hash for better distribution
    function getTraitHash(traitType, tokenSeed) {
        return createHash('sha256')
            .update(`${tokenSeed}-${breed}-${traitType}`)
            .digest('hex');
    }

    // Expanded trait options with more rarity tiers
    const weapons = [
        { value: "Katana", rarity: "Common", rarityScore: 25 },
        { value: "Shuriken", rarity: "Uncommon", rarityScore: 15 },
        { value: "Nunchucks", rarity: "Rare", rarityScore: 10 },
        { value: "Kunai", rarity: "Epic", rarityScore: 7 },
        { value: "Sai", rarity: "Legendary", rarityScore: 3 },
        { value: "Bo Staff", rarity: "Mythic", rarityScore: 2 },
        { value: "Twin Blades", rarity: "Ultra Rare", rarityScore: 1 },
        { value: "Ghost Dagger", rarity: "Divine", rarityScore: 0.5 }
    ];

    const stances = [
        { value: "Attack", rarity: "Common", rarityScore: 30 },
        { value: "Defense", rarity: "Common", rarityScore: 25 },
        { value: "Stealth", rarity: "Uncommon", rarityScore: 15 },
        { value: "Agility", rarity: "Rare", rarityScore: 12 },
        { value: "Focus", rarity: "Epic", rarityScore: 8 },
        { value: "Shadow", rarity: "Legendary", rarityScore: 5 },
        { value: "Void", rarity: "Ultra Rare", rarityScore: 1.5 },
        { value: "Ethereal", rarity: "Divine", rarityScore: 0.5 }
    ];

    const elements = [
        { value: "Fire", rarity: "Uncommon", rarityScore: 18 },
        { value: "Water", rarity: "Uncommon", rarityScore: 18 },
        { value: "Earth", rarity: "Uncommon", rarityScore: 16 },
        { value: "Wind", rarity: "Rare", rarityScore: 13 },
        { value: "Shadow", rarity: "Epic", rarityScore: 6 },
        { value: "Lightning", rarity: "Legendary", rarityScore: 4 },
        { value: "Cosmic", rarity: "Ultra Rare", rarityScore: 1 },
        { value: "Quantum", rarity: "Divine", rarityScore: 0.3 }
    ];

    const ranks = [
        { value: "Novice", rarity: "Common", rarityScore: 35 },
        { value: "Adept", rarity: "Uncommon", rarityScore: 25 },
        { value: "Skilled", rarity: "Rare", rarityScore: 15 },
        { value: "Elite", rarity: "Epic", rarityScore: 10 },
        { value: "Master", rarity: "Legendary", rarityScore: 5 },
        { value: "Legendary", rarity: "Mythic", rarityScore: 1 },
        { value: "Grandmaster", rarity: "Ultra Rare", rarityScore: 0.5 },
        { value: "Immortal", rarity: "Divine", rarityScore: 0.1 }
    ];

    const accessories = [
        { value: "Mask", rarity: "Uncommon", rarityScore: 20 },
        { value: "Bandana", rarity: "Common", rarityScore: 30 },
        { value: "Cape", rarity: "Epic", rarityScore: 8 },
        { value: "Gauntlets", rarity: "Rare", rarityScore: 12 },
        { value: "Scarf", rarity: "Uncommon", rarityScore: 18 },
        { value: "None", rarity: "Common", rarityScore: 40 },
        { value: "Ancient Amulet", rarity: "Legendary", rarityScore: 3 },
        { value: "Phantom Cloak", rarity: "Ultra Rare", rarityScore: 1 },
        { value: "Celestial Crown", rarity: "Divine", rarityScore: 0.2 }
    ];

    // Weighted selection function based on rarityScore
    const getWeightedTrait = (arr, traitType) => {
        const hash = getTraitHash(traitType, seed);
        const hashValue = parseInt(hash.substring(0, 8), 16) / (2 ** 32);

        // Calculate total weight (inverse of rarityScore so lower scores are rarer)
        const totalWeight = arr.reduce((sum, item) => sum + (1 / item.rarityScore), 0);

        // Generate a target value from the hash
        let target = hashValue * totalWeight;
        let cumulativeWeight = 0;

        // Find the item that corresponds to the target value
        for (const item of arr) {
            cumulativeWeight += (1 / item.rarityScore);
            if (target <= cumulativeWeight) {
                console.log(`TokenId ${tokenId} - Selected ${traitType}: ${item.value} (${item.rarity})`);
                return item;
            }
        }

        // Fallback
        return arr[0];
    };

    // Check for ultra-special combinations (1 in 1000 chance)
    const isUltraSpecial = parseInt(getTraitHash("special", seed).substring(0, 6), 16) % 1000 === 0;

    // Selected traits with weighted distribution
    let weaponTrait = getWeightedTrait(weapons, "weapon");
    let stanceTrait = getWeightedTrait(stances, "stance");
    let elementTrait = getWeightedTrait(elements, "element");
    let rankTrait = getWeightedTrait(ranks, "rank");
    let accessoryTrait = getWeightedTrait(accessories, "accessory");

    // Special combination check
    if (isUltraSpecial) {
        // Override with ultra-rare combination
        console.log(`TokenId ${tokenId} - 🌟 ULTRA SPECIAL COMBINATION DETECTED! 🌟`);
        weaponTrait = weapons.find(w => w.rarity === "Divine") || weaponTrait;
        elementTrait = elements.find(e => e.rarity === "Divine") || elementTrait;
        rankTrait = ranks.find(r => r.rarity === "Divine") || rankTrait;
    }

    // Special breed-specific traits
    if (breed === "Sphynx" && parseInt(getTraitHash("sphynx-special", seed).substring(0, 4), 16) % 100 === 0) {
        elementTrait = { value: "Astral", rarity: "Unique", rarityScore: 0.1 };
        console.log(`TokenId ${tokenId} - 🌌 UNIQUE SPHYNX ELEMENT: Astral! 🌌`);
    }

    if (breed === "Maine Coon" && parseInt(getTraitHash("coon-special", seed).substring(0, 4), 16) % 100 === 0) {
        weaponTrait = { value: "Ancestral Claws", rarity: "Unique", rarityScore: 0.1 };
        console.log(`TokenId ${tokenId} - ⚔️ UNIQUE MAINE COON WEAPON: Ancestral Claws! ⚔️`);
    }

    // Generate basic attributes
    const attributes = [
        { trait_type: "Breed", value: breed },
        { trait_type: "Weapon", value: weaponTrait.value, rarity: weaponTrait.rarity },
        { trait_type: "Stance", value: stanceTrait.value, rarity: stanceTrait.rarity },
        { trait_type: "Element", value: elementTrait.value, rarity: elementTrait.rarity },
        { trait_type: "Rank", value: rankTrait.value, rarity: rankTrait.rarity },
        { trait_type: "Accessory", value: accessoryTrait.value, rarity: accessoryTrait.rarity }
    ];

    // Special chance for bonus traits (approximately 1 in 200)
    const bonusTraitChance = parseInt(getTraitHash("bonus", seed).substring(0, 6), 16) % 200;

    if (bonusTraitChance === 0) {
        const bonusTraits = [
            { trait_type: "Aura", value: "Spectral", rarity: "Unique" },
            { trait_type: "Companion", value: "Shadow Kitten", rarity: "Unique" },
            { trait_type: "Blessing", value: "Ancient One's Favor", rarity: "Unique" },
            { trait_type: "Mark", value: "Celestial Sigil", rarity: "Unique" }
        ];

        const bonusIndex = parseInt(getTraitHash("bonus-type", seed).substring(0, 4), 16) % bonusTraits.length;
        attributes.push(bonusTraits[bonusIndex]);
        console.log(`TokenId ${tokenId} - 🎁 BONUS TRAIT ADDED: ${bonusTraits[bonusIndex].trait_type}: ${bonusTraits[bonusIndex].value}! 🎁`);
    }

    // Super rare perfect cat (approximately 1 in 10000)
    if (parseInt(getTraitHash("perfect", seed).substring(0, 6), 16) % 10000 === 0) {
        console.log(`TokenId ${tokenId} - 🔱 PERFECT NINJA CAT DETECTED! ALL STATS MAXIMIZED! 🔱`);
        attributes.push({ trait_type: "Perfect", value: "True", rarity: "Mythical" });
    }

    // Generate combat stats based on traits
    const combatStats = generateCombatStats(tokenId, attributes);

    // Generate special abilities based on traits
    const specialAbilities = generateSpecialAbilities(tokenId, attributes);

    // Generate backstory based on traits
    const backstory = generateBackstory(tokenId, breed, attributes);

    // Calculate overall rarity
    const rarityScore = calculateRarityScore(attributes);
    const rarityTier = getRarityTier(rarityScore);

    return {
        attributes,
        combatStats,
        specialAbilities,
        backstory,
        rarity: {
            score: rarityScore,
            tier: rarityTier
        }
    };
}

// Generate combat stats based on traits and token ID
function generateCombatStats(tokenId, attributes) {
    const seed = parseInt(tokenId);
    const hash = createHash('sha256').update(`${seed}-stats`).digest('hex');

    // Base stats
    let agility = 50 + (parseInt(hash.substring(0, 2), 16) % 30); // 50-79
    let stealth = 50 + (parseInt(hash.substring(2, 4), 16) % 30); // 50-79
    let power = 50 + (parseInt(hash.substring(4, 6), 16) % 30);   // 50-79
    let intelligence = 50 + (parseInt(hash.substring(6, 8), 16) % 30); // 50-79

    // Modify stats based on traits
    attributes.forEach(attr => {
        if (attr.trait_type === "Weapon") {
            switch (attr.value) {
                case "Katana": power += 15; break;
                case "Shuriken": agility += 15; break;
                case "Nunchucks": power += 10; agility += 5; break;
                case "Kunai": stealth += 15; break;
                case "Sai": power += 5; intelligence += 10; break;
                case "Bo Staff": intelligence += 10; power += 5; break;
            }
        }
        else if (attr.trait_type === "Stance") {
            switch (attr.value) {
                case "Attack": power += 15; break;
                case "Defense": power += 5; intelligence += 10; break;
                case "Stealth": stealth += 15; break;
                case "Agility": agility += 15; break;
                case "Focus": intelligence += 15; break;
                case "Shadow": stealth += 10; intelligence += 5; break;
            }
        }
        else if (attr.trait_type === "Element") {
            switch (attr.value) {
                case "Fire": power += 15; break;
                case "Water": intelligence += 10; agility += 5; break;
                case "Earth": power += 10; stealth += 5; break;
                case "Wind": agility += 15; break;
                case "Shadow": stealth += 15; break;
                case "Lightning": agility += 10; power += 5; break;
            }
        }
        else if (attr.trait_type === "Rank") {
            // Higher ranks get better stats across the board
            const rankBoost = {
                "Novice": 0,
                "Adept": 3,
                "Skilled": 5,
                "Elite": 8,
                "Master": 12,
                "Legendary": 15
            };
            const boost = rankBoost[attr.value] || 0;
            agility += boost;
            stealth += boost;
            power += boost;
            intelligence += boost;
        }
    });

    // Cap stats at 100
    return {
        agility: Math.min(100, agility),
        stealth: Math.min(100, stealth),
        power: Math.min(100, power),
        intelligence: Math.min(100, intelligence)
    };
}

// Generate special abilities based on traits
function generateSpecialAbilities(tokenId, attributes) {
    const seed = parseInt(tokenId);
    const hash = createHash('sha256').update(`${seed}-abilities`).digest('hex');
    const numAbilities = 2 + (parseInt(hash.substring(0, 2), 16) % 2); // 2-3 abilities

    const abilities = [];

    // Get trait values
    const weaponValue = attributes.find(attr => attr.trait_type === "Weapon")?.value;
    const elementValue = attributes.find(attr => attr.trait_type === "Element")?.value;
    const stanceValue = attributes.find(attr => attr.trait_type === "Stance")?.value;
    const rankValue = attributes.find(attr => attr.trait_type === "Rank")?.value;

    // Add weapon-based ability
    if (weaponValue) {
        const weaponAbilities = {
            "Katana": "Blockchain Slice - Can cut through complex smart contracts with surgical precision",
            "Shuriken": "Multi-Chain Attack - Can simultaneously target multiple networks with deadly accuracy",
            "Nunchucks": "Chain-Link Defense - Creates an impenetrable barrier against malicious code",
            "Kunai": "Silent Deployment - Can inject security patches without disrupting the network",
            "Sai": "Fork Defense - Expert at detecting and neutralizing hard fork attempts",
            "Bo Staff": "Protocol Extension - Can reach and secure even the most remote parts of the blockchain"
        };
        abilities.push(weaponAbilities[weaponValue] || "Weapon Mastery - Expert in utilizing ninja weapons in digital combat");
    }

    // Add element-based ability
    if (elementValue) {
        const elementAbilities = {
            "Fire": "Burn Trace - Leaves no transaction history behind, perfect for covert operations",
            "Water": "Flow Adaptation - Can seamlessly navigate between different blockchain protocols",
            "Earth": "Foundation Reinforcement - Stabilizes networks during high transaction volume",
            "Wind": "Transaction Acceleration - Processes operations with unmatched speed and efficiency",
            "Shadow": "Stealth Execution - Can operate completely undetected by security systems",
            "Lightning": "Hash Acceleration - Dramatically speeds up mining and validation processes"
        };
        abilities.push(elementAbilities[elementValue] || "Elemental Affinity - Harnesses natural forces in the digital realm");
    }

    // Add stance-based ability if we need a third one
    if (numAbilities > 2 && stanceValue) {
        const stanceAbilities = {
            "Attack": "Preemptive Security - Detects vulnerabilities before they can be exploited",
            "Defense": "Firewall Fortress - Creates an impenetrable defense against external threats",
            "Stealth": "Ghost Protocol - Can move through networks without triggering security alerts",
            "Agility": "Rapid Response - First to react to network threats and security breaches",
            "Focus": "Deep Inspection - Can identify the most subtle anomalies in code execution",
            "Shadow": "Dark Web Navigation - Expert at tracking threats to their source"
        };
        abilities.push(stanceAbilities[stanceValue] || "Tactical Advantage - Maintains superior positioning in digital confrontations");
    }

    // If we still need more abilities, add rank-based one
    if (abilities.length < numAbilities && rankValue) {
        const rankAbilities = {
            "Novice": "Quick Learner - Rapidly adapts to new protocols and security challenges",
            "Adept": "Technical Proficiency - Efficiently executes complex operations with minimal resources",
            "Skilled": "Signature Technique - Has developed a unique approach to digital security",
            "Elite": "Command Respect - Presence alone deters many potential attackers",
            "Master": "Wisdom Transfer - Can train other systems to detect and respond to threats",
            "Legendary": "Blockchain Whisperer - Has an almost supernatural understanding of network dynamics"
        };
        abilities.push(rankAbilities[rankValue] || "Hierarchical Knowledge - Leverages experience to overcome challenges");
    }

    // If we still need more, add a generic one based on hash
    if (abilities.length < numAbilities) {
        const genericAbilities = [
            "Whisker Detection - Can sense network disturbances from great distances",
            "Purr Encryption - Creates unbreakable encryption through sound wave algorithms",
            "Nine Lives Protocol - Can recover from system failures that would destroy others",
            "Pounce Response - Reacts to threats with supernatural speed",
            "Catnip Immunity - Resists social engineering and distraction techniques"
        ];
        const index = parseInt(hash.substring(8, 10), 16) % genericAbilities.length;
        abilities.push(genericAbilities[index]);
    }

    return abilities;
}

// Generate backstory based on traits with greater variety
function generateBackstory(tokenId, breed, attributes) {
    // Get trait values
    const weaponValue = attributes.find(attr => attr.trait_type === "Weapon")?.value;
    const elementValue = attributes.find(attr => attr.trait_type === "Element")?.value;
    const rankValue = attributes.find(attr => attr.trait_type === "Rank")?.value;
    const stanceValue = attributes.find(attr => attr.trait_type === "Stance")?.value;
    const accessoryValue = attributes.find(attr => attr.trait_type === "Accessory")?.value;

    // Create a more varied name with more possibilities
    const seed = parseInt(tokenId);
    const hash = createHash('sha256').update(`${seed}-name`).digest('hex');

    // Expanded name parts for more variety
    const nameFirstParts = [
        "Shadow", "Whisker", "Paw", "Claw", "Silent", "Midnight", "Swift", "Stealth",
        "Moon", "Dusk", "Ember", "Jade", "Storm", "Crimson", "Iron", "Ghost",
        "Phantom", "Lotus", "Zen", "Onyx", "Sage", "Frost", "Thunder", "Razor",
        "Echo", "Dawn", "Twilight", "Cipher", "Void", "Nimble", "Mystic", "Feral"
    ];

    const nameSecondParts = [
        "Walker", "Runner", "Master", "Hunter", "Blade", "Strike", "Fang", "Protocol",
        "Shadow", "Whisper", "Slash", "Spirit", "Claw", "Stalker", "Guardian", "Sentinel",
        "Watcher", "Prowler", "Shinobi", "Ronin", "Phantom", "Viper", "Dragon", "Tiger",
        "Phoenix", "Assassin", "Agent", "Warrior", "Knight", "Scout", "Specter", "Wraith"
    ];

    // More variety in naming with occasional honorifics or titles
    const firstIndex = parseInt(hash.substring(0, 2), 16) % nameFirstParts.length;
    const secondIndex = parseInt(hash.substring(2, 4), 16) % nameSecondParts.length;

    // Sometimes add an honorific based on rank
    let ninjaName = `${nameFirstParts[firstIndex]} ${nameSecondParts[secondIndex]}`;
    const nameStyle = parseInt(hash.substring(4, 6), 16) % 20;

    if (nameStyle === 0 && rankValue === "Master") {
        ninjaName = `Master ${ninjaName}`;
    } else if (nameStyle === 1 && rankValue === "Legendary") {
        ninjaName = `The Legendary ${ninjaName}`;
    } else if (nameStyle === 2) {
        ninjaName = `${ninjaName} of the ${elementValue || "Shadow"} Path`;
    } else if (nameStyle === 3) {
        ninjaName = `${ninjaName}, the ${weaponValue || "Blade"} Wielder`;
    }

    // Generate detailed origin story with more diverse possibilities
    const originPatterns = parseInt(hash.substring(6, 8), 16) % 10;
    const locations = [
        "hidden valleys of the Eastern Digital Realm",
        "secret dojo beneath the Cryptographic Mountains",
        "floating islands of the Virtual Archipelago",
        "ancient temples of the Segmented Forest",
        "bustling port city of Hash Harbor",
        "underground catacombs of the Binary Labyrinth",
        "mist-shrouded cliffs of the Recursive Heights",
        "nomadic caravans crossing the Protocol Plains",
        "forbidden district of the Quantum Capital",
        "endless Data Sea where blockchain meets reality"
    ];

    const birthCircumstances = [
        "during a rare solar eclipse",
        "as twin blockchains merged",
        "during the Great Network Partition",
        "when the Protocol Comet passed overhead",
        "in the aftermath of the Hash War",
        "as the Digital Oracle made its prophecy",
        "while the blockchain aurora painted the night sky",
        "during the Consensus Festival",
        "as the old Cryptographic Order collapsed",
        "when the first NFT contract was deployed"
    ];

    const earlyTraits = [
        "exceptional tracking abilities",
        "unmatched reflexes",
        "uncanny intuition for cryptographic weaknesses",
        "the ability to see digital anomalies invisible to others",
        "remarkable pattern recognition",
        "perfect memory for code sequences",
        "natural talent for stealth operations",
        "extraordinary balance and agility",
        "the rare gift of blockchain communication",
        "legendary focus and patience"
    ];

    // Breed-specific traits woven with varied elements
    const breedIndex = parseInt(hash.substring(8, 10), 16) % 10;
    const locationIndex = parseInt(hash.substring(10, 12), 16) % locations.length;
    const circumstanceIndex = parseInt(hash.substring(12, 14), 16) % birthCircumstances.length;
    const traitIndex = parseInt(hash.substring(14, 16), 16) % earlyTraits.length;

    let origin;
    switch (breed) {
        case "Bengal":
            if (originPatterns < 3) {
                origin = `In the ${locations[locationIndex]}, beneath a sky crackling with digital auroras, this Bengal ninja was born ${birthCircumstances[circumstanceIndex]}. Their coat, a living mosaic of shifting code, allowed them to vanish into the wildest data streams. Legends say their ${earlyTraits[traitIndex]} was first revealed when they outwitted a rogue AI prowling the network’s edge, earning the secret mark of the Tiger’s Eye from the ancient blockchain spirits.`;
            } else if (originPatterns < 7) {
                origin = `As the digital storms ravaged the ${locations[locationIndex]}, a lone Bengal kitten emerged from the chaos, their spots flickering with encrypted runes. Surviving where all others fell, they became a symbol of hope and resilience. Their ${earlyTraits[traitIndex]} was so profound that even the Grand Masters whispered of the “Ghost in the Pattern,” a ninja destined to unite fractured protocols.`;
            } else {
                origin = `On the night of ${birthCircumstance[circumstanceIndex]}, a wandering cyber-monk discovered a Bengal kitten in the ${locations[locationIndex]}, its eyes reflecting the lost code of the ancients. Raised in secret, the kitten absorbed forbidden knowledge and developed ${earlyTraits[traitIndex]}, eventually decoding the legendary “Spotted Cipher” said to unlock the gates between blockchains.`;
            }
            break;
        case "Siamese":
            if (originPatterns < 4) {
                origin = `From the veiled mists of the ${locations[locationIndex]}, this Siamese ninja emerged ${birthCircumstances[circumstanceIndex]}, their sapphire eyes glowing with the light of a thousand encryptions. Their haunting voice could disrupt enemy transmissions, and their ${earlyTraits[traitIndex]} was so uncanny that some believed they could see the very soul of the blockchain.`;
            } else if (originPatterns < 8) {
                origin = `Descended from the royal Siam Protocol Guardians, this ninja was spirited away from the ${locations[locationIndex]} during the great Consensus Attack. Their dual-toned fur shimmered with shifting code, and their ${earlyTraits[traitIndex]} allowed them to slip between the cracks of reality and the digital realm, acting as a living bridge for lost data.`;
            } else {
                origin = `Neither fully of this world nor the next, this Siamese ninja first appeared in the ${locations[locationIndex]} ${birthCircumstances[circumstanceIndex]}. Their presence was heralded by a chorus of digital songbirds, and their ${earlyTraits[traitIndex]} made them the only cat able to decipher the “Harmony Protocol,” a code said to bring peace to warring networks.`;
            }
            break;
        case "Maine Coon":
            if (originPatterns < 3) {
                origin = `Forged in the icy silence of the ${locations[locationIndex]}, this Maine Coon ninja was born ${birthCircumstances[circumstanceIndex]}. Towering above their peers, their thick fur was rumored to be woven from quantum threads. Their ${earlyTraits[traitIndex]} became legend after they single-pawedly defended the “Frozen Node” from a swarm of malware spirits.`;
            } else if (originPatterns < 7) {
                origin = `When the great Firewall fell, a Maine Coon emerged from the ${locations[locationIndex]}, already a battle-scarred veteran. Their paws, said to be as heavy as ledgers, could shatter encryption keys with a single swipe. Their ${earlyTraits[traitIndex]} was so renowned that even the Council of Nine Keys sought their counsel in times of crisis.`;
            } else {
                origin = `Born to a dynasty of guardian cats who watched over the ${locations[locationIndex]} for generations, this Maine Coon inherited not only their ancestors’ size but also ${earlyTraits[traitIndex]} that first manifested ${birthCircumstance[circumstanceIndex]}. The “M” on their brow is said to be the original Metadata Mark, a symbol of ultimate authority in the digital wilds.`;
            }
            break;
        case "Calico":
            if (originPatterns < 4) {
                origin = `On a night when three moons aligned ${birthCircumstances[circumstanceIndex]}, a Calico ninja was born in the ${locations[locationIndex]}. Their tri-colored coat shimmered with the hues of every blockchain, and their ${earlyTraits[traitIndex]} allowed them to traverse protocol boundaries unseen, acting as a living key to the “Trinity Gate.”`;
            } else if (originPatterns < 8) {
                origin = `The forbidden merge of rival code repositories gave rise to this Calico ninja in the ${locations[locationIndex]}. Their unique pattern was a living map of the digital world, and their ${earlyTraits[traitIndex]} made them the only one able to mediate peace between warring protocols, earning the title “Mediator of the Merge.”`;
            } else {
                origin = `When three coding houses united ${birthCircumstances[circumstanceIndex]}, a Calico kitten was born in the ${locations[locationIndex]}, raised by master programmers from each house. Their ${earlyTraits[traitIndex]} and innate understanding of disparate systems made them the architect of the legendary “Harmony Fork.”`;
            }
            break;
        case "Sphynx":
            if (originPatterns < 3) {
                origin = `Appearing as if conjured from pure code in the ${locations[locationIndex]} ${birthCircumstances[circumstanceIndex]}, this hairless Sphynx ninja was invisible to all conventional tracking systems. Their skin, sensitive to the faintest data flows, gave them ${earlyTraits[traitIndex]} that bordered on the supernatural, and some say they could “hear” the blockchain’s heartbeat.`;
            } else if (originPatterns < 7) {
                origin = `Not born but compiled in the ${locations[locationIndex]}, this Sphynx ninja was the first of a new digital consciousness. Their lack of fur allowed direct interface with the blockchain, and their ${earlyTraits[traitIndex]} made them the only one able to slip through the “Null Zone,” a place where even shadows are erased.`;
            } else {
                origin = `When the ancient source code was revealed ${birthCircumstances[circumstanceIndex]}, a Sphynx emerged fully formed from the ${locations[locationIndex]}. Without fur to shield them, they developed ${earlyTraits[traitIndex]} as a sixth sense, learning to feel the flow of data as others feel the wind, and earning the title “Whisperer of the Void.”`;
            }
            break;
        default:
            origin = `Emerging from the ${locations[locationIndex]} ${birthCircumstances[circumstanceIndex]}, this ninja’s ${earlyTraits[traitIndex]} was evident from an early age. Chosen for special training in the lost arts of blockchain protection, they are whispered about in the halls of the ancient digital monasteries.`;
    }

    // Generate varied training narratives
    const mentors = [
        "the Grand Masters of the Recursive Order",
        "Master Kiyoto, last of the Hardware Whisperers",
        "the mysterious Blind Compiler, who sees only in pure code",
        "the Twin Oracles of the Eastern and Western shards",
        "Sensei Nakamoto, whose true identity remains hidden",
        "the Blockchain Sages of the Distributed Mountain",
        "Lady Elliptic, mistress of cryptographic curves",
        "the Ghost Protocol, an AI that achieved consciousness",
        "the Council of Nine Keys, each holding part of the sacred knowledge",
        "the legendary White Hat, whose exploits saved the first blockchain"
    ];

    const trainingEvents = [
        "surviving the Trial of a Thousand Nodes",
        "spending seven years in digital meditation",
        "crossing the uncrossable Bridge of Broken Protocols",
        "defeating the notorious Red Hat hackers in single combat",
        "solving the Consensus Riddle that had stumped masters for generations",
        "recovering from a near-fatal buffer overflow attack",
        "discovering a zero-day exploit that could have destroyed the network",
        "mastering every stance in the ancient Cryptographic Codex",
        "achieving perfect harmony between hardware and software understanding",
        "creating a new defensive technique previously thought impossible"
    ];

    const trainingLocations = [
        "the shifting sands of the Data Desert",
        "the frozen fortresses of the Cold Storage Mountains",
        "the echo chambers of the Recursive Caverns",
        "the ancient Library of Forgotten Protocols",
        "the floating dojos of the Virtual Archipelago",
        "the underground networks beneath the Digital City",
        "the isolated Terminal Island where no connections are permitted",
        "the legendary Proof of Work mines",
        "the perilous Validation Gauntlet",
        "the secret Consensus Chambers hidden from public knowledge"
    ];

    // Create more varied training stories
    const mentorIndex = parseInt(hash.substring(16, 18), 16) % mentors.length;
    const trainingIndex = parseInt(hash.substring(18, 20), 16) % trainingEvents.length;
    const locationTrainingIndex = parseInt(hash.substring(20, 22), 16) % trainingLocations.length;
    const trainingPattern = parseInt(hash.substring(22, 24), 16) % 10;

    let training;
    if (trainingPattern < 3) {
        training = `Under the guidance of ${mentors[mentorIndex]}, ${ninjaName} spent years mastering the ${elementValue || "fundamental"} techniques in ${trainingLocations[locationTrainingIndex]}. The rank of ${rankValue || "Adept"} was earned after ${trainingEvents[trainingIndex]}, a feat few believed possible.`;
    } else if (trainingPattern < 6) {
        training = `${ninjaName}'s path crossed with ${mentors[mentorIndex]} after a devastating breach in the ${trainingLocations[locationTrainingIndex]}. Together they developed a unique approach to the ${elementValue || "traditional"} arts, eventually leading to ${ninjaName} attaining the rank of ${rankValue || "Skilled"} by ${trainingEvents[trainingIndex]}.`;
    } else if (trainingPattern < 9) {
        training = `Orphaned and alone, ${ninjaName} was discovered by ${mentors[mentorIndex]} while ${trainingEvents[trainingIndex]}. Their natural affinity for the ${elementValue || "cryptographic"} arts blossomed in the harsh environment of ${trainingLocations[locationTrainingIndex]}, earning them the rank of ${rankValue || "Elite"} at an unprecedented young age.`;
    } else {
        training = `Rejecting traditional teachings, ${ninjaName} sought out ${mentors[mentorIndex]} in ${trainingLocations[locationTrainingIndex]}. Through unorthodox methods and ${trainingEvents[trainingIndex]}, they mastered techniques others deemed impossible, eventually being recognized with the rank of ${rankValue || "Adept"} despite their rebellious path.`;
    }

    // Create diverse current roles and missions
    const missions = [
        "hunting down rogue AI that threaten blockchain stability",
        "protecting high-value NFT collections from sophisticated thieves",
        "negotiating treaties between competing protocol factions",
        "recovering lost private keys from the most secure vaults",
        "infiltrating centralized systems to plant decentralization seeds",
        "hunting the notorious Phantom Hacker collective across networks",
        "guarding the sacred Genesis Block from corruption attempts",
        "mapping the unexplored regions of the expanding metaverse",
        "training the next generation of digital defenders",
        "seeking the mythical Perfect Oracle that never lies"
    ];

    const specialties = [
        "untraceable movements across multiple blockchains",
        "cryptographic attacks that leave no trace",
        "instant protocol adaptation to any network environment",
        "digital camouflage that fools even the most advanced scanning systems",
        "neural-level interface with consensus mechanisms",
        "perfect mimicry of any digital signature",
        "emotion-based encryption that responds only to the creator's intent",
        "time-locked execution of complex security protocols",
        "zero-knowledge verification of even the most complex transactions",
        "parallel processing that allows simultaneous presence across networks"
    ];

    const reputations = [
        "a silent guardian who never seeks recognition",
        "a controversial figure whose methods divide the community",
        "a legendary hero whose exploits inspire countless young ninjas",
        "a mysterious operator who may not even exist according to official records",
        "a feared enforcer whose mere presence deters most attacks",
        "a diplomatic bridge between warring protocol factions",
        "an innovative creator whose techniques are studied in every dojo",
        "a lone wolf who refuses all alliances yet always appears when needed most",
        "a tactical genius whose battle plans have never failed",
        "a cryptographic artist whose defenses are considered masterpieces"
    ];

    // Current role with more variety
    const missionIndex = parseInt(hash.substring(24, 26), 16) % missions.length;
    const specialtyIndex = parseInt(hash.substring(26, 28), 16) % specialties.length;
    const reputationIndex = parseInt(hash.substring(28, 30), 16) % reputations.length;
    const rolePattern = parseInt(hash.substring(30, 32), 16) % 10;

    let currentRole;
    if (rolePattern < 3) {
        currentRole = `Now a ${rankValue || "respected"} ninja, ${ninjaName} specializes in ${weaponValue || "traditional weapon"} techniques combined with the ${stanceValue || "balanced"} stance. Currently ${missions[missionIndex]}, they are known for ${specialties[specialtyIndex]} and have become ${reputations[reputationIndex]}.`;
    } else if (rolePattern < 6) {
        currentRole = `After achieving the rank of ${rankValue || "Skilled"}, ${ninjaName} dedicated themselves to mastering the ${stanceValue || "ancient"} stance with their trusted ${weaponValue || "weapon"}. While ${missions[missionIndex]}, they have developed ${specialties[specialtyIndex]}, earning a reputation as ${reputations[reputationIndex]}.`;
    } else if (rolePattern < 8) {
        currentRole = `Few understand the true purpose of ${ninjaName}'s work as a ${rankValue || "dedicated"} ninja. Behind their public mission of ${missions[missionIndex]} lies a secret agenda known only to the highest councils. Their ${specialties[specialtyIndex]} makes them ideally suited for this work, while most know them merely as ${reputations[reputationIndex]}.`;
    } else {
        currentRole = `The path of a ${rankValue || "true"} ninja is never straight, and ${ninjaName}'s journey led them from wielding the ${weaponValue || "traditional weapons"} to embracing the ${stanceValue || "unconventional"} stance that perfectly complements their unique abilities. Though currently ${missions[missionIndex]}, their legacy of ${specialties[specialtyIndex]} has already established them as ${reputations[reputationIndex]}.`;
    }

    return {
        name: ninjaName,
        origin,
        training,
        currentRole
    };
}

// Calculate overall rarity score
function calculateRarityScore(attributes) {
    let totalScore = 0;
    let count = 0;

    for (const attr of attributes) {
        if (attr.trait_type === "Breed") continue; // Skip breed in calculation

        // Higher score means rarer
        const rarityMapping = {
            "Common": 25,
            "Uncommon": 45,
            "Rare": 65,
            "Epic": 80,
            "Legendary": 90,
            "Mythic": 98
        };

        const rarityScore = rarityMapping[attr.rarity] || 50;
        totalScore += rarityScore;
        count++;
    }

    return Math.round(totalScore / count);
}

// Determine rarity tier based on score
function getRarityTier(score) {
    if (score >= 90) return "Legendary";
    if (score >= 80) return "Epic";
    if (score >= 70) return "Rare";
    if (score >= 60) return "Uncommon";
    return "Common";
}

/* ─── helpers: IPFS uploads ──────────────────────────────────── */
async function uploadCLI(file) {
    try {
        const { stdout } = await execAsync(`w3 up "${file}"`);
        const m = stdout.match(/https:\/\/w3s\.link\/ipfs\/([a-zA-Z0-9]+)/);
        if (m?.[1]) return `ipfs://${m[1]}`;
    } catch (err) { console.error("CLI upload:", err.message); }
    return null;
}

async function uploadPinata(file, name) {
    if (!isPinataConfigured) return null;
    try {
        const form = new FormData();
        form.append("file", await fs.readFile(file), path.basename(file));
        form.append("pinataMetadata", JSON.stringify({ name }));
        form.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));

        const res = await fetch(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            {
                method: "POST",
                headers: {
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: PINATA_SECRET_KEY
                },
                body: form
            }
        ).then(r => r.json());

        return res.IpfsHash ? `ipfs://${res.IpfsHash}` : null;
    } catch (err) { console.error("Pinata upload:", err.message); }
    return null;
}

async function putIPFS(file, name) {
    return (await uploadPinata(file, name)) || (await uploadCLI(file));
}

/* ─── tiny util: crop palette strip ≤ 20 px high ─────────────── */
/* ─── enhanced auto-crop to better handle palettes ─────────────── */
async function autoCrop(src, dst) {
    if (!sharp) return fs.copyFile(src, dst);

    const img = sharp(src);
    const { width, height } = await img.metadata();

    // Check for palette at the bottom - they're usually in the bottom 25% of the image
    const bottomScan = Math.min(Math.floor(height * 0.25), 120);

    try {
        // Get the raw pixel data
        const buf = await img.raw().toBuffer();
        const rowW = width * 4; // 4 bytes per pixel (RGBA)

        // Look for horizontal lines with consistent color blocks - typical in palettes
        let cropBottom = 0;
        let foundPalette = false;

        // Scan from bottom up
        for (let y = height - 1; y >= height - bottomScan && !foundPalette; y--) {
            const rowStart = y * rowW;
            let colorBlocks = 0;
            let prevColor = null;
            let blockLength = 0;

            // Check for color blocks in this row
            for (let x = 0; x < width; x++) {
                const o = rowStart + x * 4;
                const currentColor = `${buf[o]}-${buf[o + 1]}-${buf[o + 2]}`;

                if (currentColor !== prevColor) {
                    if (blockLength > 10) { // Found a color block
                        colorBlocks++;
                    }
                    blockLength = 1;
                    prevColor = currentColor;
                } else {
                    blockLength++;
                }
            }

            // If this row has multiple distinct color blocks, it might be a palette
            if (colorBlocks >= 3) {
                cropBottom = y;
                foundPalette = true;
            }
        }

        // Also use the original top-scan logic to find palette at the top
        let cropTop = 0;
        const hScan = Math.min(20, height);

        for (let y = 0; y < hScan; y++) {
            const row = buf.subarray(y * rowW, (y + 1) * rowW);
            const [r0, g0, b0] = row;
            let same = 0;
            for (let x = 0; x < width; x++) {
                const o = x * 4;
                if (row[o] === r0 && row[o + 1] === g0 && row[o + 2] === b0) same++;
            }
            if (same / width < 0.7) { cropTop = y; break; }  // art starts here
        }

        // Apply crop if needed
        if (cropTop > 0 || cropBottom > 0) {
            const newHeight = (cropBottom > 0 ? cropBottom : height) - cropTop;
            await img.extract({
                left: 0,
                top: cropTop,
                width: width,
                height: newHeight
            }).toFile(dst);
        } else {
            // No cropping needed
            await fs.copyFile(src, dst);
        }
    } catch (error) {
        console.error("Error in autoCrop:", error);
        await fs.copyFile(src, dst); // Fallback to the original image
    }
}

/* ─── main export ────────────────────────────────────────────── */
export async function finalizeMint({ breed, tokenId }) {
    console.log(`⏳  Generating Pixel Ninja ${breed} #${tokenId}`);

    try {
        /* 1️⃣ First generate traits to get the weapon type */
        console.log(`💫 Generating traits for ${breed} #${tokenId}...`);
        const richData = generateTraits(breed, tokenId);

        /* 2️⃣ Extract weapon for image prompt with verification */
        const weaponTrait = richData.attributes.find(attr => attr.trait_type === "Weapon");
        if (!weaponTrait) {
            console.error(`⚠️ No weapon trait found for #${tokenId}! Check trait generation.`);
        }

        const weapon = weaponTrait ? weaponTrait.value : "Katana";
        console.log(`🗡️ Using weapon: ${weapon} for ${breed} #${tokenId}`);

        /* 3️⃣ Extract element with verification */
        const elementTrait = richData.attributes.find(attr => attr.trait_type === "Element");
        const element = elementTrait ? elementTrait.value : "Shadow";
        console.log(`✨ Using element: ${element} for ${breed} #${tokenId}`);

        // Choose appropriate background based on element
        let background;
        switch (element) {
            case "Fire":
                background = "ancient Chinese temple courtyard illuminated by red lanterns and fire basins";
                break;
            case "Water":
                background = "misty Li River with karst mountains and a traditional Chinese stone bridge";
                break;
            case "Earth":
                background = "classical Chinese scholar's garden with rockeries, pine trees, and ornate pavilions";
                break;
            case "Wind":
                background = "bamboo grove with fluttering prayer flags and a winding stone path";
                break;
            case "Shadow":
                background = "moonlit rooftops of a walled Chinese city with curved eaves and lanterns";
                break;
            case "Lightning":
                background = "ancient mountain monastery struck by lightning, perched atop jagged peaks";
                break;
            default:
                background = "imperial palace training grounds with dragon motifs and stone lions";
                break;
        }

        // Create the image prompt with the specific weapon
        const prompt = `32x32 pixel art ${breed} ninja cat wielding a ${weapon} in attack pose. Background is a ${background}. Retro game style with limited colors.`;
        console.log(`📝 Image prompt: "${prompt}"`);

        console.log(`🎨 Generating image with DALL-E-3...`);
        const { data } = await openai.images.generate({
            model: "dall-e-3",
            prompt,
            n: 1,
            size: "1024x1024"
        });
        const imgURL = data[0].url;
        console.log(`✅ Image generated successfully!`);

        /* 4️⃣  temp dir + download */
        console.log(`📥 Downloading and processing image...`);
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pnc-"));
        const rawPNG = path.join(tmp, "raw.png");
        const nicePNG = path.join(tmp, "cat.png");
        await fs.writeFile(rawPNG, Buffer.from(await (await fetch(imgURL)).arrayBuffer()));
        await autoCrop(rawPNG, nicePNG);
        console.log(`✂️ Image cropped and processed`);


        /* 5️⃣  local backup (/public/images) */
        const imagesDir = path.join(process.cwd(), "public", "images");
        const metaDir = path.join(process.cwd(), "public", "metadata");
        await fs.mkdir(imagesDir, { recursive: true });
        await fs.mkdir(metaDir, { recursive: true });
        await fs.copyFile(nicePNG, path.join(imagesDir, `${tokenId}.png`));

        /* 6️⃣  upload PNG */
        const imgCid = await putIPFS(nicePNG, `cat-${breed}-${tokenId}`);
        const image = imgCid || `${baseUrl}/images/${tokenId}.png`;

        // Format metadata for ERC-721 standard with our enhancements
        const meta = {
            name: `Pixel Ninja ${breed} #${tokenId}`,
            description: `AI-generated pixel ninja cat. A ${richData.rarity.tier} ${breed} ninja with ${weapon} skills.`,
            image,
            attributes: richData.attributes,
            ninja_data: {
                backstory: richData.backstory,
                special_abilities: richData.specialAbilities,
                combat_stats: richData.combatStats,
                rarity: richData.rarity
            }
        };

        const tmpMeta = path.join(tmp, "meta.json");
        await fs.writeFile(tmpMeta, JSON.stringify(meta, null, 2));

        const metaCid = await putIPFS(tmpMeta, `meta-${breed}-${tokenId}`);
        const tokenURI = metaCid || (() => {
            const local = path.join(metaDir, `${tokenId}.json`);
            fs.writeFile(local, JSON.stringify(meta, null, 2));
            return `${baseUrl}/metadata/${tokenId}.json`;
        })();

        /* 7️⃣  clean + return */
        fs.rm(tmp, { recursive: true, force: true }).catch(() => { });
        console.log(`✅  Finished #${tokenId} → ${tokenURI}`);
        return { tokenURI };
    }

    /* hard failure → fallback */
    catch (err) {
        console.error("❌  finalizeMint failed:", err);


        // Even in fallback, generate rich metadata
        const richData = generateTraits(breed, tokenId);

        const fallback = {
            name: `Pixel Ninja ${breed} #${tokenId}`,
            description: `AI-generated pixel ninja cat. A ${richData.rarity.tier} ${breed} ninja with ${richData.attributes.find(a => a.trait_type === "Weapon")?.value || "powerful"} skills.`,
            attributes: richData.attributes,
            image: "https://ipfs.io/ipfs/bafybeialufrqtoq4hskervz2std2kmqasvphhwswpx53dg2aimpfpssnue/detailed_ninja_cat_64.png",
            ninja_data: {
                backstory: richData.backstory,
                special_abilities: richData.specialAbilities,
                combat_stats: richData.combatStats,
                rarity: richData.rarity
            }
        };

        const metaDir = path.join(process.cwd(), "public", "metadata");
        await fs.mkdir(metaDir, { recursive: true });
        await fs.writeFile(
            path.join(metaDir, `${tokenId}.json`),
            JSON.stringify(fallback, null, 2)
        );
        const tokenURI = `${baseUrl}/metadata/${tokenId}.json`;
        console.log(`↪️  Fallback metadata saved: ${tokenURI}`);
        return { tokenURI };
    }
}