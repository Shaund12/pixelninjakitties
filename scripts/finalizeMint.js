/**
 * scripts/finalizeMint.js
 * ───────────────────────────────────────────────────────────────
 * Generates a 32 × 32 pixel-art Ninja-Cat sprite via multiple AI providers,
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
 * PROVIDER CONFIGURATION:
 * Set IMAGE_PROVIDER to one of:
 *   "huggingface" - Free with token (register at huggingface.co)
 *   "dall-e"      - OpenAI's DALL-E 3 (paid API)
 *   "stability"   - Stability AI (paid API)
 * 
 * MODEL SELECTION:
 * For HuggingFace, set HF_MODEL to one of:
 *   "stabilityai/stable-diffusion-xl-base-1.0" (default, highest quality)
 *   "prompthero/openjourney" (Midjourney-style)
 *   "runwayml/stable-diffusion-v1-5" (faster)
 *   "ByteDance/SDXL-Lightning" (faster generations)
 *   "Lykon/dreamshaper-xl-1-0" (stylized art)
 * 
 * Required env:
 *   At least one of: OPENAI_API_KEY, STABILITY_API_KEY, HUGGING_FACE_TOKEN
 * Optional env:
 *   PINATA_API_KEY  PINATA_SECRET_KEY   (for Pinata first-try)
 *   BASE_URL        (served /images + /metadata fallback)
 *   PROJECT_NAME    (defaults to "Pixel Ninja Cats")
 *   IMAGE_PROVIDER  (defaults to "dall-e", options above)
 *   HF_MODEL        (defaults to "stabilityai/stable-diffusion-xl-base-1.0")
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
    STABILITY_API_KEY,
    HUGGING_FACE_TOKEN,
    PINATA_API_KEY,
    PINATA_SECRET_KEY,
    BASE_URL,
    PROJECT_NAME,
    // Default to DALL-E as the provider
    IMAGE_PROVIDER = "dall-e",
    // HuggingFace model options
    HF_MODEL = "stabilityai/stable-diffusion-xl-base-1.0",
    // DALL-E model options (dall-e-3 or dall-e-2)
    DALLE_MODEL = "dall-e-3",
    // Stability models
    STABILITY_MODEL = "stable-diffusion-xl-1024-v1-0",
    // IPFS gateway for compatibility
    IPFS_GATEWAY = "https://ipfs.io/ipfs/"
} = process.env;

// Provider configuration - easily add/modify providers here
const PROVIDERS = {
    huggingface: {
        name: "HuggingFace",
        key: HUGGING_FACE_TOKEN,
        model: HF_MODEL,
        models: {
            "stabilityai/stable-diffusion-xl-base-1.0": "SDXL (High Quality)",
            "prompthero/openjourney": "Openjourney (Midjourney Style)",
            "runwayml/stable-diffusion-v1-5": "SD 1.5 (Faster)",
            "ByteDance/SDXL-Lightning": "SDXL Lightning (Fastest)",
            "Lykon/dreamshaper-xl-1-0": "Dreamshaper XL (Stylized)"
        },
        free: true,
        pixelSettings: {
            guidance_scale: 8.5,
            num_inference_steps: 50,
            prompt_prefix: "32x32 pixel art of a ninja cat, ",
            prompt_suffix: ", retro game style, limited color palette, charming, detailed pixel art, NES style"
        }
    },
    "dall-e": {
        name: "DALL-E",
        key: OPENAI_API_KEY,
        model: DALLE_MODEL,
        models: {
            "dall-e-3": "DALL-E 3 (Best Quality)",
            "dall-e-2": "DALL-E 2 (Faster)"
        },
        free: false,
        pixelSettings: {
            quality: "hd",
            style: "vivid",
            size: "1024x1024",
            prompt_prefix: "32x32 pixel art of a ninja cat: ",
            prompt_suffix: ". Retro game style, extremely limited color palette, cute, charming, high-contrast pixel art. No text, watermarks, or signatures."
        }
    },
    stability: {
        name: "Stability AI",
        key: STABILITY_API_KEY,
        model: STABILITY_MODEL,
        models: {
            "stable-diffusion-xl-1024-v1-0": "SDXL 1.0"
        },
        free: false,
        pixelSettings: {
            cfg_scale: 8,
            steps: 30,
            prompt_prefix: "32x32 pixel art of a ninja cat: ",
            prompt_suffix: ", retro game style, limited palette, NES style, clean pixel art"
        }
    }
};

// Verify we have at least one image generation API key
if (!OPENAI_API_KEY && !STABILITY_API_KEY && !HUGGING_FACE_TOKEN) {
    throw new Error("Missing API keys in .env: need at least one of HUGGING_FACE_TOKEN, OPENAI_API_KEY, or STABILITY_API_KEY");
}

// Check if the selected provider is configured
const selectedProvider = PROVIDERS[IMAGE_PROVIDER];
if (!selectedProvider) {
    console.warn(`⚠️ Unknown provider "${IMAGE_PROVIDER}". Valid options are: ${Object.keys(PROVIDERS).join(", ")}`);
    console.warn(`⚠️ Falling back to available provider...`);
}
if (selectedProvider && !selectedProvider.key) {
    console.warn(`⚠️ Selected provider "${IMAGE_PROVIDER}" has no API key configured.`);
    console.warn(`⚠️ Falling back to available provider...`);
}

console.log(`🖼️ Default image provider: ${selectedProvider && selectedProvider.key ?
    `${selectedProvider.name} (${selectedProvider.model})` :
    "Will try all available providers"
    }`);

const baseUrl = BASE_URL || "http://localhost:5000";
const projectName = PROJECT_NAME || "Pixel Ninja Cats";
const isPinataConfigured = PINATA_API_KEY && PINATA_SECRET_KEY;

/* ─── optional sharp (auto-crop) ─────────────────────────────── */
let sharp;
try { sharp = (await import("sharp")).default; } catch { /* fine */ }

/* ─── OpenAI client ──────────────────────────────────────────── */
let openai;
if (OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: OPENAI_API_KEY });
}

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

    /* ─── Enhanced trait categories with more variety ─────────── */
    const traitCategories = {
        breeds: [
            { value: "Tabby", rarity: "Common", rarityScore: 30, keywords: ["striped", "orange", "common"] },
            { value: "Siamese", rarity: "Common", rarityScore: 25, keywords: ["cream", "pointed", "sleek"] },
            { value: "Calico", rarity: "Uncommon", rarityScore: 20, keywords: ["patched", "tricolor", "spots"] },
            { value: "Bengal", rarity: "Rare", rarityScore: 15, keywords: ["spotted", "wild", "agile"] },
            { value: "Bombay", rarity: "Rare", rarityScore: 14, keywords: ["black", "sleek", "shadow"] },
            { value: "Persian", rarity: "Epic", rarityScore: 10, keywords: ["fluffy", "round", "ornate"] },
            { value: "Sphynx", rarity: "Epic", rarityScore: 8, keywords: ["hairless", "wrinkled", "alien"] },
            { value: "Nyan", rarity: "Legendary", rarityScore: 5, keywords: ["rainbow", "pixelated", "meme"] },
            { value: "Shadow", rarity: "Legendary", rarityScore: 3, keywords: ["void", "mist", "phantom"] }
        ],
        weapons: [
            { value: "Katana", rarity: "Common", rarityScore: 30, keywords: ["sword", "blade", "japanese"] },
            { value: "Shuriken", rarity: "Common", rarityScore: 25, keywords: ["throwing star", "metal", "sharp"] },
            { value: "Nunchucks", rarity: "Uncommon", rarityScore: 20, keywords: ["chain", "wood", "swinging"] },
            { value: "Kunai", rarity: "Uncommon", rarityScore: 18, keywords: ["dagger", "throwing", "rope"] },
            { value: "Sai", rarity: "Rare", rarityScore: 15, keywords: ["fork", "prongs", "defensive"] },
            { value: "Bo Staff", rarity: "Rare", rarityScore: 12, keywords: ["long", "wooden", "staff"] },
            { value: "Twin Blades", rarity: "Epic", rarityScore: 10, keywords: ["dual", "daggers", "fast"] },
            { value: "Kusarigama", rarity: "Epic", rarityScore: 8, keywords: ["chain", "sickle", "weight"] },
            { value: "War Fan", rarity: "Legendary", rarityScore: 5, keywords: ["metal", "bladed", "elegant"] },
            { value: "Ghost Dagger", rarity: "Legendary", rarityScore: 3, keywords: ["ethereal", "translucent", "glowing"] }
        ],
        stances: [
            { value: "Attack", rarity: "Common", rarityScore: 30, keywords: ["aggressive", "forward", "striking"] },
            { value: "Defense", rarity: "Common", rarityScore: 25, keywords: ["guarded", "balanced", "blocking"] },
            { value: "Stealth", rarity: "Uncommon", rarityScore: 20, keywords: ["hidden", "crouching", "sneaking"] },
            { value: "Agility", rarity: "Uncommon", rarityScore: 18, keywords: ["acrobatic", "jumping", "flipping"] },
            { value: "Focus", rarity: "Rare", rarityScore: 15, keywords: ["concentration", "meditation", "precise"] },
            { value: "Shadow", rarity: "Rare", rarityScore: 12, keywords: ["darkness", "invisible", "merging"] },
            { value: "Berserker", rarity: "Epic", rarityScore: 8, keywords: ["rage", "fury", "wild"] },
            { value: "Crane", rarity: "Epic", rarityScore: 10, keywords: ["balanced", "one-leg", "patient"] },
            { value: "Dragon", rarity: "Legendary", rarityScore: 5, keywords: ["powerful", "mythical", "flowing"] },
            { value: "Void", rarity: "Legendary", rarityScore: 3, keywords: ["emptiness", "formless", "transcendent"] }
        ],
        elements: [
            { value: "Fire", rarity: "Common", rarityScore: 30, keywords: ["flames", "burning", "red"] },
            { value: "Water", rarity: "Common", rarityScore: 25, keywords: ["flowing", "blue", "adaptable"] },
            { value: "Earth", rarity: "Uncommon", rarityScore: 20, keywords: ["solid", "brown", "strong"] },
            { value: "Wind", rarity: "Uncommon", rarityScore: 18, keywords: ["air", "quick", "invisible"] },
            { value: "Lightning", rarity: "Rare", rarityScore: 15, keywords: ["electric", "fast", "yellow"] },
            { value: "Ice", rarity: "Rare", rarityScore: 12, keywords: ["frozen", "cold", "crystalline"] },
            { value: "Shadow", rarity: "Epic", rarityScore: 8, keywords: ["darkness", "black", "stealth"] },
            { value: "Light", rarity: "Epic", rarityScore: 10, keywords: ["bright", "white", "blinding"] },
            { value: "Void", rarity: "Legendary", rarityScore: 5, keywords: ["empty", "nothingness", "purple"] },
            { value: "Cosmic", rarity: "Legendary", rarityScore: 3, keywords: ["stars", "space", "universal"] }
        ],
        ranks: [
            { value: "Novice", rarity: "Common", rarityScore: 30, keywords: ["beginner", "training", "inexperienced"] },
            { value: "Adept", rarity: "Common", rarityScore: 25, keywords: ["skilled", "practiced", "competent"] },
            { value: "Elite", rarity: "Uncommon", rarityScore: 20, keywords: ["specialized", "talented", "expert"] },
            { value: "Veteran", rarity: "Uncommon", rarityScore: 18, keywords: ["experienced", "battle-worn", "proven"] },
            { value: "Master", rarity: "Rare", rarityScore: 15, keywords: ["perfected", "teacher", "superior"] },
            { value: "Shadow Master", rarity: "Rare", rarityScore: 12, keywords: ["stealth", "unseen", "infiltrator"] },
            { value: "Mystic", rarity: "Epic", rarityScore: 10, keywords: ["magical", "spiritual", "enlightened"] },
            { value: "Warlord", rarity: "Epic", rarityScore: 8, keywords: ["commander", "feared", "powerful"] },
            { value: "Legendary", rarity: "Legendary", rarityScore: 5, keywords: ["mythical", "story-worthy", "renowned"] },
            { value: "Immortal", rarity: "Legendary", rarityScore: 3, keywords: ["deathless", "eternal", "godlike"] }
        ],
        accessories: [
            { value: "Headband", rarity: "Common", rarityScore: 30, keywords: ["cloth", "forehead", "symbol"] },
            { value: "Scarf", rarity: "Common", rarityScore: 25, keywords: ["neck", "flowing", "colored"] },
            { value: "Armor Piece", rarity: "Uncommon", rarityScore: 20, keywords: ["protection", "metal", "plated"] },
            { value: "Belt", rarity: "Uncommon", rarityScore: 18, keywords: ["waist", "utility", "colored"] },
            { value: "Gloves", rarity: "Rare", rarityScore: 15, keywords: ["hands", "grip", "armored"] },
            { value: "Face Mask", rarity: "Rare", rarityScore: 12, keywords: ["concealed", "mysterious", "hidden"] },
            { value: "Enchanted Amulet", rarity: "Epic", rarityScore: 10, keywords: ["glowing", "magical", "powerful"] },
            { value: "Spirit Companion", rarity: "Epic", rarityScore: 8, keywords: ["floating", "ethereal", "helper"] },
            { value: "Ancient Scroll", rarity: "Legendary", rarityScore: 5, keywords: ["knowledge", "power", "secret"] },
            { value: "Celestial Mark", rarity: "Legendary", rarityScore: 3, keywords: ["glowing", "divine", "blessed"] }
        ]
    };

    /* ─── Breed-based trait weightings ──────────────────────────── */
    const breedWeightings = {
        "Tabby": {
            weapons: ["Shuriken", "Katana"],
            stances: ["Attack", "Agility"],
            elements: ["Fire", "Earth"]
        },
        "Siamese": {
            stances: ["Stealth", "Agility"],
            elements: ["Water", "Wind"],
            accessories: ["Face Mask", "Scarf"]
        },
        "Bengal": {
            weapons: ["Twin Blades", "Kunai"],
            stances: ["Berserker", "Agility"],
            elements: ["Lightning", "Fire"]
        },
        "Shadow": {
            elements: ["Shadow", "Void"],
            stances: ["Shadow", "Stealth"],
            weapons: ["Ghost Dagger", "Kusarigama"]
        },
        "Nyan": {
            elements: ["Cosmic", "Light"],
            accessories: ["Celestial Mark"],
            ranks: ["Immortal", "Legendary"]
        }
    };

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
                    // Boost the chances of preferred traits (lower rarityScore makes them more common)
                    trait.rarityScore = Math.max(3, Math.floor(trait.rarityScore * 0.6));
                }
            });
        });

        return weighted;
    }

    // Apply breed weightings if applicable
    const weightedCategories = applyBreedWeightings(traitCategories, breed);

    /* ─── Ultra Rare Legendary Traits ──────────────────────────── */
    // Check for ultra rare "Mythic" tier traits (1 in 1000 chance)
    const isMythic = parseInt(getTraitHash("mythic", seed).substring(0, 8), 16) % 1000 === 0;

    // Mythic traits with extremely rare occurrence
    const mythicTraits = [
        {
            trait_type: "Blessing", value: "Nine Lives", rarity: "Mythic", rarityScore: 1,
            keywords: ["resurrection", "immortal", "reborn"]
        },
        {
            trait_type: "Power", value: "Time Whisker", rarity: "Mythic", rarityScore: 1,
            keywords: ["temporal", "time-bending", "clock"]
        },
        {
            trait_type: "Title", value: "Cat God", rarity: "Mythic", rarityScore: 1,
            keywords: ["deity", "worship", "almighty"]
        },
        {
            trait_type: "Ability", value: "Dimension Pounce", rarity: "Mythic", rarityScore: 1,
            keywords: ["teleport", "reality-shift", "portal"]
        },
        {
            trait_type: "Secret", value: "Catnip Mastery", rarity: "Mythic", rarityScore: 1,
            keywords: ["euphoria", "hallucination", "power-boost"]
        }
    ];

    /* ─── Weighted selection function with logging ─────────────── */
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

    /* ─── Special trait generation with enhanced probabilities ─── */
    // Check for special trait (1 in 50 chance instead of 1 in 100)
    const isSpecial = parseInt(getTraitHash("special", seed).substring(0, 6), 16) % 50 === 0;

    // Enhanced special traits with more variety
    const specialTraits = [
        {
            trait_type: "Technique", value: "Shadow Clone", rarity: "Unique", rarityScore: 2,
            keywords: ["duplicate", "illusion", "multiple"]
        },
        {
            trait_type: "Skill", value: "Whisker Sense", rarity: "Unique", rarityScore: 2,
            keywords: ["detection", "precognition", "awareness"]
        },
        {
            trait_type: "Move", value: "Purrfect Strike", rarity: "Unique", rarityScore: 2,
            keywords: ["critical", "devastating", "precise"]
        },
        {
            trait_type: "Style", value: "Feline Fury", rarity: "Unique", rarityScore: 2,
            keywords: ["aggressive", "combo", "rapid"]
        },
        {
            trait_type: "Secret", value: "Nine Shadow Paths", rarity: "Unique", rarityScore: 2,
            keywords: ["teleport", "afterimage", "confusion"]
        },
        {
            trait_type: "Ability", value: "Cat's Eye", rarity: "Unique", rarityScore: 2,
            keywords: ["perception", "night-vision", "analysis"]
        },
        {
            trait_type: "Power", value: "Sonic Meow", rarity: "Unique", rarityScore: 2,
            keywords: ["sound", "shockwave", "stun"]
        },
        {
            trait_type: "Mastery", value: "Yarn Manipulation", rarity: "Unique", rarityScore: 2,
            keywords: ["binding", "whip", "ensnare"]
        }
    ];

    /* ─── Generate stats based on traits ───────────────────────── */
    const generateStats = (traits) => {
        const baseStats = {
            agility: 5,
            stealth: 5,
            power: 5,
            intelligence: 5
        };

        // Generate hash-based modifier
        const modifier = (statName) => {
            const hash = getTraitHash(`stat-${statName}`, seed);
            const mod = parseInt(hash.substring(0, 2), 16) % 4;
            return mod;
        };

        // Apply breed bonuses
        const breed = traits.find(t => t.trait_type === "Breed")?.value;
        switch (breed) {
            case "Tabby":
                baseStats.agility += 2;
                baseStats.power += 1;
                break;
            case "Siamese":
                baseStats.stealth += 2;
                baseStats.intelligence += 1;
                break;
            case "Bengal":
                baseStats.agility += 3;
                baseStats.power += 1;
                break;
            case "Calico":
                baseStats.intelligence += 2;
                baseStats.stealth += 1;
                break;
            case "Bombay":
                baseStats.stealth += 3;
                break;
            case "Persian":
                baseStats.intelligence += 3;
                baseStats.agility -= 1;
                break;
            case "Sphynx":
                baseStats.stealth += 1;
                baseStats.intelligence += 2;
                break;
            case "Nyan":
                baseStats.agility += 2;
                baseStats.power += 2;
                break;
            case "Shadow":
                baseStats.stealth += 3;
                baseStats.power += 2;
                baseStats.agility += 1;
                break;
        }

        // Apply weapon bonuses
        const weapon = traits.find(t => t.trait_type === "Weapon")?.value;
        switch (weapon) {
            case "Katana":
                baseStats.power += 2;
                break;
            case "Shuriken":
                baseStats.agility += 1;
                baseStats.stealth += 1;
                break;
            case "Nunchucks":
                baseStats.agility += 2;
                break;
            case "Kunai":
                baseStats.stealth += 2;
                break;
            case "Sai":
                baseStats.power += 1;
                baseStats.agility += 1;
                break;
            case "Bo Staff":
                baseStats.intelligence += 2;
                break;
            case "Twin Blades":
                baseStats.agility += 2;
                baseStats.power += 1;
                break;
            case "Kusarigama":
                baseStats.stealth += 1;
                baseStats.intelligence += 2;
                break;
            case "War Fan":
                baseStats.intelligence += 2;
                baseStats.power += 1;
                break;
            case "Ghost Dagger":
                baseStats.stealth += 3;
                baseStats.power += 1;
                break;
        }

        // Apply element bonuses
        const element = traits.find(t => t.trait_type === "Element")?.value;
        switch (element) {
            case "Fire":
                baseStats.power += 2;
                break;
            case "Water":
                baseStats.agility += 2;
                break;
            case "Earth":
                baseStats.power += 1;
                baseStats.intelligence += 1;
                break;
            case "Wind":
                baseStats.agility += 3;
                break;
            case "Lightning":
                baseStats.agility += 2;
                baseStats.power += 1;
                break;
            case "Ice":
                baseStats.intelligence += 2;
                baseStats.stealth += 1;
                break;
            case "Shadow":
                baseStats.stealth += 3;
                break;
            case "Light":
                baseStats.intelligence += 2;
                baseStats.power += 1;
                break;
            case "Void":
                baseStats.power += 2;
                baseStats.stealth += 2;
                break;
            case "Cosmic":
                baseStats.power += 2;
                baseStats.intelligence += 2;
                break;
        }

        // Apply random modifiers
        baseStats.agility += modifier("agility");
        baseStats.stealth += modifier("stealth");
        baseStats.power += modifier("power");
        baseStats.intelligence += modifier("intelligence");

        // Apply mythic and special bonuses
        const hasMythic = traits.some(t => t.rarity === "Mythic");
        const hasSpecial = traits.some(t => t.rarity === "Unique");

        if (hasMythic) {
            Object.keys(baseStats).forEach(key => {
                baseStats[key] += 3;
            });
        }

        if (hasSpecial) {
            const specialTrait = traits.find(t => t.rarity === "Unique");
            switch (specialTrait?.trait_type) {
                case "Technique":
                    baseStats.agility += 2;
                    break;
                case "Skill":
                    baseStats.intelligence += 2;
                    break;
                case "Move":
                    baseStats.power += 2;
                    break;
                case "Style":
                    baseStats.agility += 1;
                    baseStats.power += 1;
                    break;
                case "Secret":
                    baseStats.stealth += 2;
                    break;
                case "Ability":
                    baseStats.intelligence += 1;
                    baseStats.stealth += 1;
                    break;
                case "Power":
                    baseStats.power += 2;
                    break;
                case "Mastery":
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
    };

    /* ─── Generate core traits ─────────────────────────────────── */
    // Generate core traits
    const breedTrait = getWeightedTrait(weightedCategories.breeds, "breed");
    const weaponTrait = getWeightedTrait(weightedCategories.weapons, "weapon");
    const stanceTrait = getWeightedTrait(weightedCategories.stances, "stance");
    const elementTrait = getWeightedTrait(weightedCategories.elements, "element");
    const rankTrait = getWeightedTrait(weightedCategories.ranks, "rank");

    // 75% chance to have accessory
    const hasAccessory = parseInt(getTraitHash("hasAccessory", seed).substring(0, 4), 16) % 100 < 75;
    const accessoryTrait = hasAccessory ?
        getWeightedTrait(weightedCategories.accessories, "accessory") : null;

    /* ─── Build attribute array ───────────────────────────────── */
    // Generate basic attributes
    const attributes = [
        { trait_type: "Breed", value: breedTrait.value, rarity: breedTrait.rarity, keywords: breedTrait.keywords },
        { trait_type: "Weapon", value: weaponTrait.value, rarity: weaponTrait.rarity, keywords: weaponTrait.keywords },
        { trait_type: "Stance", value: stanceTrait.value, rarity: stanceTrait.rarity, keywords: stanceTrait.keywords },
        { trait_type: "Element", value: elementTrait.value, rarity: elementTrait.rarity, keywords: elementTrait.keywords },
        { trait_type: "Rank", value: rankTrait.value, rarity: rankTrait.rarity, keywords: rankTrait.keywords }
    ];

    // Add accessory if present
    if (accessoryTrait) {
        attributes.push({
            trait_type: "Accessory",
            value: accessoryTrait.value,
            rarity: accessoryTrait.rarity,
            keywords: accessoryTrait.keywords
        });
    }

    // Add special trait if lucky
    if (isSpecial) {
        const specialIndex = parseInt(getTraitHash("special-type", seed).substring(0, 4), 16) % specialTraits.length;
        attributes.push({
            trait_type: specialTraits[specialIndex].trait_type,
            value: specialTraits[specialIndex].value,
            rarity: "Unique",
            keywords: specialTraits[specialIndex].keywords
        });
        console.log(`TokenId ${tokenId} - 🎁 SPECIAL TRAIT ADDED: ${specialTraits[specialIndex].trait_type}: ${specialTraits[specialIndex].value}! 🎁`);
    }

    // Add mythic trait if extremely lucky (1 in 1000)
    if (isMythic) {
        const mythicIndex = parseInt(getTraitHash("mythic-type", seed).substring(0, 4), 16) % mythicTraits.length;
        attributes.push({
            trait_type: mythicTraits[mythicIndex].trait_type,
            value: mythicTraits[mythicIndex].value,
            rarity: "Mythic",
            keywords: mythicTraits[mythicIndex].keywords
        });
        console.log(`TokenId ${tokenId} - 🌟 MYTHIC TRAIT ADDED: ${mythicTraits[mythicIndex].trait_type}: ${mythicTraits[mythicIndex].value}! 🌟`);
    }

    // Generate stats
    const stats = generateStats(attributes);

    // Add stats to attributes
    Object.entries(stats).forEach(([stat, value]) => {
        attributes.push({
            trait_type: stat.charAt(0).toUpperCase() + stat.slice(1),
            value,
            display_type: "number"
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

    /* ─── Return enhanced trait data ───────────────────────────── */
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

// Generate ninja cat backstory and description
function generateNinjaCatDescription(tokenId, breed, attributes) {
    const seed = parseInt(tokenId);
    const hash = createHash('sha256').update(`${seed}-description`).digest('hex');

    // Extract trait values with fallbacks
    const weapon = attributes.find(attr => attr.trait_type === "Weapon")?.value || "Katana";
    const element = attributes.find(attr => attr.trait_type === "Element")?.value || "Fire";
    const stance = attributes.find(attr => attr.trait_type === "Stance")?.value || "Attack";
    const rank = attributes.find(attr => attr.trait_type === "Rank")?.value || "Novice";
    const accessory = attributes.find(attr => attr.trait_type === "Accessory")?.value;

    // Check for special/mythic traits
    const special = attributes.find(attr => attr.rarity === "Unique");
    const mythic = attributes.find(attr => attr.rarity === "Mythic");

    // Get stats
    const agility = attributes.find(attr => attr.trait_type === "Agility")?.value || 5;
    const stealth = attributes.find(attr => attr.trait_type === "Stealth")?.value || 5;
    const power = attributes.find(attr => attr.trait_type === "Power")?.value || 5;
    const intelligence = attributes.find(attr => attr.trait_type === "Intelligence")?.value || 5;

    // Determine cat's prowess based on stats
    const highestStat = Math.max(agility, stealth, power, intelligence);
    let specialty = "balanced fighting";

    if (highestStat === agility) specialty = "swift movements";
    else if (highestStat === stealth) specialty = "silent operations";
    else if (highestStat === power) specialty = "powerful strikes";
    else if (highestStat === intelligence) specialty = "tactical mastery";

    // Clan names based on breed
    const clans = {
        "Tabby": "Tora Clan",
        "Siamese": "Twin Moon Clan",
        "Bengal": "Spotted Fang Clan",
        "Bombay": "Night Shadow Clan",
        "Calico": "Three Colors Clan",
        "Persian": "Royal Whisker Clan",
        "Sphynx": "Ancient Sphinx Order",
        "Nyan": "Rainbow Path",
        "Shadow": "Void Walker Sect"
    };

    const clan = clans[breed] || "Shadow Paw Clan";

    // Villain names based on element
    const villains = {
        "Fire": "the Flame Tyrant",
        "Water": "the Deep Ocean Shogun",
        "Earth": "the Stone Emperor",
        "Wind": "the Cyclone Daimyo",
        "Lightning": "the Thunder King",
        "Ice": "the Frost Monarch",
        "Shadow": "the Darkness Overlord",
        "Light": "the Blinding Sovereign",
        "Void": "the Emptiness Devourer",
        "Cosmic": "the Star Conqueror"
    };

    const villain = villains[element] || "the Evil Overlord";

    // Pattern selection with variety
    const pattern = parseInt(hash.substring(0, 4), 16) % 6;

    // Build backstory based on pattern
    let description;

    if (pattern === 0) {
        description = `A ${rank.toLowerCase()} ${breed} ninja cat from the ${clan}, wielding a ${weapon.toLowerCase()} infused with ${element.toLowerCase()} energy. Known for ${specialty}, this warrior has sworn to defeat ${villain} and restore peace to the realm.`;
    }
    else if (pattern === 1) {
        description = `Trained in the secret arts of the ${clan}, this ${breed} ninja cat has mastered the ${stance.toLowerCase()} stance. Armed with a legendary ${weapon.toLowerCase()} and commanding ${element.toLowerCase()} techniques, the ${rank.toLowerCase()} warrior excels at ${specialty}.`;
    }
    else if (pattern === 2) {
        description = `This ${breed} ninja of ${rank.toLowerCase()} status serves the ancient ${clan}. Having perfected the ${stance.toLowerCase()} stance and carrying a trusty ${weapon.toLowerCase()}, they harness ${element.toLowerCase()} powers with exceptional skill in ${specialty}.`;
    }
    else if (pattern === 3) {
        description = `A mysterious ${breed} warrior from the shadows of the ${clan}, this ${rank.toLowerCase()} ninja cat wields a deadly ${weapon.toLowerCase()}. Their mastery of ${element.toLowerCase()} techniques and ${stance.toLowerCase()} stance makes them formidable in ${specialty}.`;
    }
    else if (pattern === 4) {
        description = `The ${clan} has produced few warriors as talented as this ${breed} ninja cat. Rising to the rank of ${rank.toLowerCase()}, they've become legendary for their ${stance.toLowerCase()} technique, ${weapon.toLowerCase()} prowess, and ${element.toLowerCase()} manipulation, particularly excelling in ${specialty}.`;
    }
    else {
        description = `Whispers speak of a ${breed} ninja cat from the ${clan}, who reached the ${rank.toLowerCase()} rank before age three. With unparalleled skill in the ${stance.toLowerCase()} stance and wielding a ${weapon.toLowerCase()} with deadly precision, they channel ${element.toLowerCase()} energy while specializing in ${specialty}.`;
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
function calculateRarityScore(attributes) {
    let totalScore = 0;
    let count = 0;

    // Skip these types in calculation
    const skipTypes = ["Agility", "Stealth", "Power", "Intelligence"];

    // Synergy pairs that boost score when appearing together
    const synergyPairs = [
        // Breed + Element combinations
        { type1: "Breed", value1: "Shadow", type2: "Element", value2: "Shadow", bonus: 15 },
        { type1: "Breed", value1: "Nyan", type2: "Element", value2: "Cosmic", bonus: 15 },
        { type1: "Breed", value1: "Bengal", type2: "Element", value2: "Fire", bonus: 10 },
        { type1: "Breed", value1: "Siamese", type2: "Element", value2: "Water", bonus: 10 },

        // Weapon + Stance combinations
        { type1: "Weapon", value1: "Katana", type2: "Stance", value2: "Attack", bonus: 8 },
        { type1: "Weapon", value1: "Bo Staff", type2: "Stance", value2: "Defense", bonus: 10 },
        { type1: "Weapon", value1: "Shuriken", type2: "Stance", value2: "Stealth", bonus: 12 },
        { type1: "Weapon", value1: "Twin Blades", type2: "Stance", value2: "Agility", bonus: 14 },
        { type1: "Weapon", value1: "Ghost Dagger", type2: "Stance", value2: "Shadow", bonus: 16 },
        { type1: "Weapon", value1: "War Fan", type2: "Stance", value2: "Focus", bonus: 12 },

        // Element + Accessory combinations
        { type1: "Element", value1: "Fire", type2: "Accessory", value2: "Headband", bonus: 7 },
        { type1: "Element", value1: "Water", type2: "Accessory", value2: "Scarf", bonus: 9 },
        { type1: "Element", value1: "Shadow", type2: "Accessory", value2: "Face Mask", bonus: 13 },
        { type1: "Element", value1: "Cosmic", type2: "Accessory", value2: "Celestial Mark", bonus: 15 }
    ];

    // Base rarityScore mapping by rarity level
    const rarityMapping = {
        "Common": 25,
        "Uncommon": 45,
        "Rare": 65,
        "Epic": 80,
        "Legendary": 90,
        "Unique": 98,
        "Mythic": 125
    };

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
    const hasMythic = attributes.some(attr => attr.rarity === "Mythic");
    if (hasMythic) {
        totalScore += 50;
        console.log(`✨ Mythic trait detected: +50 points bonus!`);
    }

    // Calculate final average score
    return Math.round(totalScore / count);
}

/**
 * Determine rarity tier based on score
 * @param {Number} score - Calculated rarity score
 * @returns {String} - Rarity tier name
 */
function getRarityTier(score) {
    if (score >= 120) return "Mythic";      // Ultra-rare
    if (score >= 100) return "Legendary";   // Extremely rare
    if (score >= 85) return "Epic";         // Very rare
    if (score >= 70) return "Rare";         // Rare
    if (score >= 60) return "Uncommon";     // Uncommon
    if (score >= 40) return "Common";       // Common
    return "Standard";                      // Default
}

/* ─── Image generation with various providers ─────────────────── */
/**
 * Generate an image using OpenAI's DALL-E models
 * @param {string} prompt - The base prompt to generate an image from
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Image generation result
 */
async function generateDallEImage(prompt, options = {}) {
    if (!openai) throw new Error("OpenAI API not configured");

    const settings = PROVIDERS["dall-e"].pixelSettings;
    const model = PROVIDERS["dall-e"].model;
    const maxRetries = options.maxRetries || 2;

    // Allow using the prompt directly if specified
    const enhancedPrompt = options.useCustomPrompt ? prompt :
        `${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    console.log(`🎨 Generating image with ${model}...`);
    console.log(`📝 ${options.useCustomPrompt ? 'Custom' : 'Enhanced'} prompt: "${enhancedPrompt}"`);

    // Track generation time
    const startTime = Date.now();

    // Configuration for DALL-E
    const requestConfig = {
        model: model,
        prompt: enhancedPrompt,
        n: 1,
        size: options.size || settings.size,
        quality: options.quality || settings.quality,
        style: settings.style
    };

    // Add response format if requested
    if (options.responseFormat) {
        requestConfig.response_format = options.responseFormat;
    }

    // Use retries for robustness
    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            attempt++;

            // If this is a retry, log it and slightly modify the prompt
            if (attempt > 1) {
                console.log(`🔄 Retry attempt ${attempt}/${maxRetries + 1} for DALL-E generation`);
                requestConfig.prompt = enhancedPrompt + ` [Variation ${attempt}]`;
            }

            // Generate the image
            const { data } = await openai.images.generate(requestConfig);

            const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ DALL-E image generated successfully in ${generationTime}s!`);

            // Compute content hash if URL available
            let contentHash = null;
            if (data[0].url) {
                const urlParts = data[0].url.split('/');
                contentHash = urlParts[urlParts.length - 1].split('.')[0];
            }

            return {
                url: data[0].url,
                base64: data[0].b64_json,
                isLocal: false,
                provider: "dall-e",
                model: model,
                prompt: enhancedPrompt,
                contentHash,
                metadata: {
                    generationTime: parseFloat(generationTime),
                    width: parseInt(settings.size.split('x')[0]),
                    height: parseInt(settings.size.split('x')[1]),
                    quality: settings.quality,
                    attempts: attempt
                }
            };
        } catch (error) {
            lastError = error;

            // Check if this is a content policy violation
            const isContentViolation = error.message?.includes('content policy') ||
                error.message?.includes('safety system');

            // If it's a content violation and not using a custom prompt, try simplifying
            if (isContentViolation && !options.useCustomPrompt && attempt <= maxRetries) {
                console.warn(`⚠️ DALL-E content policy triggered: ${error.message}`);
                console.warn(`🔄 Simplifying prompt and retrying...`);

                // Simplify the prompt by removing potentially problematic terms
                const simplifiedPrompt = enhancedPrompt
                    .replace(/ninja/gi, 'skilled')
                    .replace(/weapon/gi, 'tool')
                    .replace(/battle/gi, 'adventure');

                requestConfig.prompt = simplifiedPrompt;
                continue;
            }

            // For network errors, wait before retry
            if (error.message?.includes('network') || error.message?.includes('timeout')) {
                const waitTime = Math.min(2000 * attempt, 10000);
                console.warn(`⚠️ Network error, waiting ${waitTime / 1000}s before retry: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // If we've reached max retries or unrecoverable error, rethrow
            if (attempt > maxRetries) {
                console.error(`❌ DALL-E generation failed after ${attempt} attempts: ${error.message}`);
                throw error;
            }
        }
    }

    // If we get here, we've exhausted all retries
    throw lastError;
}

/**
 * Generate an image using Stability AI
 * @param {string} prompt - The base prompt to generate an image from
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Image generation result
 */
async function generateStabilityImage(prompt, options = {}) {
    if (!STABILITY_API_KEY) throw new Error("Stability API not configured");

    const settings = PROVIDERS.stability.pixelSettings;
    const model = PROVIDERS.stability.model;
    const maxRetries = options.maxRetries || 2;

    // Use custom prompt or enhance the provided one
    const enhancedPrompt = options.useCustomPrompt ? prompt :
        `${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    console.log(`🎨 Generating image with Stability AI (${model})...`);
    console.log(`📝 ${options.useCustomPrompt ? 'Custom' : 'Enhanced'} prompt: "${enhancedPrompt}"`);

    // Track generation time
    const startTime = Date.now();

    // Build request body with configurable options
    const requestBody = {
        text_prompts: [
            { text: enhancedPrompt, weight: 1 }
        ],
        cfg_scale: options.cfgScale || settings.cfg_scale,
        height: options.height || 1024,
        width: options.width || 1024,
        samples: 1,
        steps: options.steps || settings.steps,
    };

    // Add negative prompt if provided
    if (options.negativePrompt) {
        requestBody.text_prompts.push({
            text: options.negativePrompt,
            weight: -1
        });
        console.log(`🚫 Negative prompt: "${options.negativePrompt}"`);
    }

    // Add style preset if specified
    if (options.stylePreset) {
        requestBody.style_preset = options.stylePreset;
        console.log(`🎭 Style preset: ${options.stylePreset}`);
    }

    // Use retries for robustness
    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
        try {
            attempt++;

            // Log retry attempts
            if (attempt > 1) {
                console.log(`🔄 Retry attempt ${attempt}/${maxRetries + 1} for Stability AI generation`);
                // Add slight variation for content filtering issues
                requestBody.seed = Math.floor(Math.random() * 2147483647);
            }

            const response = await fetch(
                `https://api.stability.ai/v1/generation/${model}/text-to-image`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${STABILITY_API_KEY}`
                    },
                    body: JSON.stringify(requestBody)
                }
            );

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'Unknown error');

                // Handle specific error cases
                if (response.status === 400) {
                    throw new Error(`Stability API validation error: ${errorText}`);
                } else if (response.status === 401) {
                    throw new Error(`Stability API authentication error: Invalid API key`);
                } else if (response.status === 403) {
                    throw new Error(`Stability API authorization error: ${errorText}`);
                } else if (response.status === 429) {
                    throw new Error(`Stability API rate limit reached: ${errorText}`);
                } else {
                    throw new Error(`Stability API error: ${response.status} - ${errorText}`);
                }
            }

            const result = await response.json();
            const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ Stability image generated successfully in ${generationTime}s!`);

            if (!result.artifacts || result.artifacts.length === 0) {
                throw new Error("Stability API returned no image artifacts");
            }

            const base64Image = result.artifacts[0].base64;
            const seed = result.artifacts[0].seed;
            const finishReason = result.artifacts[0].finishReason;

            // Check for content filtering
            if (finishReason === "CONTENT_FILTERED") {
                // If this is our last retry, fail
                if (attempt > maxRetries) {
                    throw new Error("Stability API content filtered - prompt violated content policy");
                }

                console.warn("⚠️ Content filtered by Stability AI, trying a modified prompt...");

                // Try to simplify/sanitize the prompt on next attempt
                requestBody.text_prompts[0].text = enhancedPrompt
                    .replace(/ninja/gi, "warrior cat")
                    .replace(/weapon/gi, "tool")
                    .replace(/battle/gi, "adventure");

                continue; // Try again with modified prompt
            }

            // Create a temp file with the image data
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "stability-"));
            const imagePath = path.join(tmpDir, "image.png");
            await fs.writeFile(imagePath, Buffer.from(base64Image, 'base64'));

            // Return detailed result
            return {
                url: `file://${imagePath}`,
                localPath: imagePath,
                isLocal: true,
                provider: "stability",
                model: model,
                prompt: enhancedPrompt,
                metadata: {
                    generationTime: parseFloat(generationTime),
                    seed,
                    cfgScale: requestBody.cfg_scale,
                    steps: requestBody.steps,
                    width: requestBody.width,
                    height: requestBody.height,
                    stylePreset: options.stylePreset,
                    finishReason,
                    attempts: attempt
                }
            };
        } catch (error) {
            lastError = error;

            // Special handling for different error types
            const errorMessage = error.message.toLowerCase();

            // Rate limit errors - wait longer
            if (errorMessage.includes('rate limit') || error.message.includes('429')) {
                const waitTime = Math.min(5000 * attempt, 30000); // Up to 30 seconds
                console.warn(`⏳ Rate limit hit, waiting ${waitTime / 1000}s before retry`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // Network errors - retry after short wait
            if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
                const waitTime = Math.min(2000 * attempt, 10000);
                console.warn(`⚠️ Network error, waiting ${waitTime / 1000}s before retry: ${errorMessage}`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            // Content policy violations - modify prompt and retry
            if (errorMessage.includes('content') || errorMessage.includes('safety') || errorMessage.includes('policy')) {
                if (attempt <= maxRetries) {
                    console.warn(`⚠️ Content policy triggered: ${errorMessage}`);
                    console.warn(`🔄 Simplifying prompt and retrying...`);

                    // Simplify prompt for next attempt
                    requestBody.text_prompts[0].text = enhancedPrompt
                        .replace(/ninja/gi, "warrior cat")
                        .replace(/weapon/gi, "tool")
                        .replace(/battle/gi, "adventure");

                    continue;
                }
            }

            // If max retries reached or unrecoverable error
            if (attempt > maxRetries) {
                console.error(`❌ Stability AI generation failed after ${attempt} attempts: ${errorMessage}`);
                throw error;
            }
        }
    }

    // If we exhaust all retries
    throw lastError || new Error("Failed to generate image with Stability AI after multiple attempts");
}

/**
 * Generate an image using HuggingFace models
 * @param {string} prompt - The base prompt to generate an image from
 * @param {Object} options - Optional configuration
 * @returns {Promise<Object>} Image generation result
 */
async function generateHuggingFaceImage(prompt, options = {}) {
    if (!HUGGING_FACE_TOKEN) throw new Error("HuggingFace API token not configured");

    const settings = PROVIDERS.huggingface.pixelSettings;
    const model = options.model || PROVIDERS.huggingface.model;
    const maxAttempts = options.maxAttempts || 3;
    const loadingTimeout = options.loadingTimeout || 10;

    // Allow using the prompt directly if specified
    const enhancedPrompt = options.useCustomPrompt ? prompt :
        `${settings.prompt_prefix}${prompt}${settings.prompt_suffix}`;

    console.log(`🎨 Generating image with HuggingFace (${model})...`);
    console.log(`📝 ${options.useCustomPrompt ? 'Custom' : 'Enhanced'} prompt: "${enhancedPrompt}"`);

    // Track generation time
    const startTime = Date.now();
    let waitedForModelLoading = false;

    // Configure generation parameters
    const requestParameters = {
        inputs: enhancedPrompt,
        parameters: {
            guidance_scale: options.guidance_scale || settings.guidance_scale,
            num_inference_steps: options.num_inference_steps || settings.num_inference_steps
        }
    };

    // Add negative prompt if provided
    if (options.negativePrompt) {
        requestParameters.parameters.negative_prompt = options.negativePrompt;
        console.log(`🚫 Negative prompt: "${options.negativePrompt}"`);
    }

    // Function to handle model loading retry
    async function handleModelLoading(error, attempt) {
        const isLoadingError = error.message.includes("loading") ||
            error.message.includes("not ready") ||
            error.message.includes("currently loading") ||
            error.message.includes("try again");

        if (isLoadingError && attempt < maxAttempts) {
            waitedForModelLoading = true;
            const waitTime = loadingTimeout * 1000;
            console.log(`⏳ Model still loading, waiting ${loadingTimeout}s before retry (attempt ${attempt + 1}/${maxAttempts})...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return true; // Try again
        }

        return false; // Don't try again for this error type
    }

    // Try to generate multiple times with backoff
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            const response = await fetch(
                `https://api-inference.huggingface.co/models/${model}`,
                {
                    headers: {
                        "Authorization": `Bearer ${HUGGING_FACE_TOKEN}`,
                        "Content-Type": "application/json"
                    },
                    method: "POST",
                    body: JSON.stringify(requestParameters)
                }
            );

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`HuggingFace API error: ${response.status} - ${error}`);
            }

            // Check if we got JSON error response instead of image
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                const errorJson = await response.json();
                if (errorJson.error) {
                    // Handle model loading case
                    if (await handleModelLoading(new Error(errorJson.error), attempt)) continue;
                    throw new Error(`HuggingFace API error: ${errorJson.error}`);
                }
            }

            // If we get here, we should have an image
            const imageBuffer = Buffer.from(await response.arrayBuffer());

            // Create a temporary file to store the image
            const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hf-image-'));
            const imagePath = path.join(tmpDir, 'image.png');
            await fs.writeFile(imagePath, imageBuffer);

            const generationTime = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`✅ HuggingFace image generated successfully in ${generationTime}s!`);
            if (waitedForModelLoading) {
                console.log(`   (Included ${loadingTimeout}s model loading time)`);
            }

            return {
                url: `file://${imagePath}`,
                localPath: imagePath,
                isLocal: true,
                provider: "huggingface",
                model: model,
                prompt: enhancedPrompt,
                metadata: {
                    generationTime: parseFloat(generationTime),
                    guidanceScale: requestParameters.parameters.guidance_scale,
                    steps: requestParameters.parameters.num_inference_steps,
                    modelName: model
                }
            };
        } catch (error) {
            // On the last attempt, just rethrow the error
            if (attempt === maxAttempts - 1) {
                console.error(`❌ HuggingFace generation failed after ${maxAttempts} attempts: ${error.message}`);
                throw error;
            }

            // Handle model loading case
            if (await handleModelLoading(error, attempt)) continue;

            // For other errors, add exponential backoff
            const backoffTime = Math.min(2000 * Math.pow(2, attempt), 10000);
            console.warn(`⚠️ HuggingFace API error (attempt ${attempt + 1}/${maxAttempts}): ${error.message}`);
            console.warn(`   Retrying in ${backoffTime / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
        }
    }

    throw new Error("All HuggingFace generation attempts failed");
}

/**
 * Try to generate an image using the requested provider with NO FALLBACKS
 * @param {string} prompt - The prompt to generate an image from
 * @param {Object} options - Generation options
 * @returns {Promise<Object>} The generated image data
 */
async function generateImage(prompt, options = {}) {
    // Normalize the requested provider name to lowercase and trim
    const requestedProvider = options.imageProvider?.toLowerCase()?.trim();

    // ALWAYS respect the explicitly requested provider - without requiring strictMode flag
    if (requestedProvider) {
        console.log(`🔒 STRICT MODE: Using ONLY "${requestedProvider}" - NO FALLBACKS ALLOWED`);

        // Validate provider and API key availability
        if (requestedProvider === 'stability' && !STABILITY_API_KEY) {
            throw new Error(`Cannot use requested provider "stability" - Missing STABILITY_API_KEY`);
        }
        else if (requestedProvider === 'huggingface' && !HUGGING_FACE_TOKEN) {
            throw new Error(`Cannot use requested provider "huggingface" - Missing HUGGING_FACE_TOKEN`);
        }
        else if (requestedProvider === 'dall-e' && !OPENAI_API_KEY) {
            throw new Error(`Cannot use requested provider "dall-e" - Missing OPENAI_API_KEY`);
        }
        else if (!['stability', 'huggingface', 'dall-e'].includes(requestedProvider)) {
            throw new Error(`Unknown provider "${requestedProvider}" - Valid options: stability, huggingface, dall-e`);
        }

        // Use ONLY the requested provider - no fallbacks whatsoever
        if (requestedProvider === 'stability') {
            return await generateStabilityImage(prompt, options);
        }
        else if (requestedProvider === 'huggingface') {
            return await generateHuggingFaceImage(prompt, options);
        }
        else if (requestedProvider === 'dall-e') {
            return await generateDallEImage(prompt, options);
        }
    }

    // Default behavior (only used when no provider is specified)
    console.log(`Using default provider with fallbacks: ${IMAGE_PROVIDER}`);


    // Default behavior (no specific provider requested)
    console.log(`Using default provider with fallbacks: ${IMAGE_PROVIDER}`);

    // Try each available provider in order of preference
    const errors = [];

    // Try preferred provider first
    try {
        if (IMAGE_PROVIDER === 'stability' && STABILITY_API_KEY) {
            return await generateStabilityImage(prompt, options);
        }
        else if (IMAGE_PROVIDER === 'huggingface' && HUGGING_FACE_TOKEN) {
            return await generateHuggingFaceImage(prompt, options);
        }
        else if (IMAGE_PROVIDER === 'dall-e' && OPENAI_API_KEY) {
            return await generateDallEImage(prompt, options);
        }
    } catch (error) {
        errors.push(`Default provider ${IMAGE_PROVIDER}: ${error.message}`);
    }

    // Try any available provider as fallback
    if (STABILITY_API_KEY) {
        try {
            return await generateStabilityImage(prompt, options);
        } catch (error) {
            errors.push(`Stability: ${error.message}`);
        }
    }

    if (HUGGING_FACE_TOKEN) {
        try {
            return await generateHuggingFaceImage(prompt, options);
        } catch (error) {
            errors.push(`HuggingFace: ${error.message}`);
        }
    }

    if (OPENAI_API_KEY) {
        try {
            return await generateDallEImage(prompt, options);
        } catch (error) {
            errors.push(`DALL-E: ${error.message}`);
        }
    }

    throw new Error(`All image providers failed: ${errors.join('; ')}`);
}

/* ─── Image processing & uploading ────────────────────────────── */
/**
 * Process an image (download, crop palette bar if needed)
 * @param {Object} imageResult - Result from image generator 
 * @returns {Promise<string>} - Path to the processed image
 */
async function processImage(imageResult) {
    console.log(`📥 Processing image...`);

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ninjacat-'));
    const outputPath = path.join(tmpDir, 'image.png');

    // For local files from Stability or HuggingFace
    if (imageResult.isLocal && imageResult.localPath) {
        try {
            // Copy the image to our temp directory
            await fs.copyFile(imageResult.localPath, outputPath);
        } catch (err) {
            console.error(`Error copying local image: ${err.message}`);
            throw err;
        }
    }
    // For remote files from DALL-E
    else if (imageResult.url) {
        try {
            // Download the image
            const response = await fetch(imageResult.url);
            const buffer = Buffer.from(await response.arrayBuffer());
            await fs.writeFile(outputPath, buffer);
        } catch (err) {
            console.error(`Error downloading image: ${err.message}`);
            throw err;
        }
    }
    // Base64 data directly (some APIs provide this)
    else if (imageResult.base64) {
        try {
            const buffer = Buffer.from(imageResult.base64, 'base64');
            await fs.writeFile(outputPath, buffer);
        } catch (err) {
            console.error(`Error saving base64 image: ${err.message}`);
            throw err;
        }
    }
    else {
        throw new Error("No valid image source in generation result");
    }

    // Auto-crop palette bar if sharp is available
    if (sharp) {
        try {
            // Load the image
            const image = sharp(outputPath);
            const metadata = await image.metadata();
            const { width, height } = metadata;

            // Only process if it's big enough (some models return tiny images)
            if (width > 100 && height > 100) {
                // Analyze the image to look for palette bars (horizontal or vertical)
                const { data } = await image
                    .raw()
                    .toBuffer({ resolveWithObject: true });

                // Look for horizontal palette bars at top or bottom
                let cropTop = 0;
                let cropBottom = 0;
                let cropLeft = 0;
                let cropRight = 0;

                // This is a simplified detection - looks for solid horizontal/vertical lines
                // that might be palette bars in AI-generated images

                // Check for crop and apply if needed
                if (cropTop > 0 || cropBottom > 0 || cropLeft > 0 || cropRight > 0) {
                    const newWidth = width - cropLeft - cropRight;
                    const newHeight = height - cropTop - cropBottom;

                    // Only crop if we're not removing too much of the image
                    if (newWidth > width * 0.8 && newHeight > height * 0.8) {
                        await image
                            .extract({
                                left: cropLeft,
                                top: cropTop,
                                width: newWidth,
                                height: newHeight
                            })
                            .toFile(outputPath);
                        console.log(`✂️ Image processed successfully`);
                    }
                }
            }
        } catch (err) {
            // Non-fatal error, just log and continue with the original
            console.warn(`⚠️ Image auto-crop failed: ${err.message}`);
        }
    } else {
        console.log("ℹ️ Sharp library not available, skipping auto-crop");
    }

    return {
        path: outputPath,
        directory: tmpDir
    };
}

/**
 * Upload an image to IPFS via Pinata
 * @param {string} imagePath - Path to the image file
 * @param {string} name - Name for the upload
 * @returns {Promise<string>} - IPFS hash/CID
 */
async function uploadToPinata(filePath, name) {
    console.log(`📤 Attempting Pinata upload for ${name} (${await getFileSize(filePath)} bytes)`);
    console.log(`Uploading to Pinata: ${filePath}`);

    if (!isPinataConfigured) {
        throw new Error('Pinata not configured - missing API key or secret key');
    }

    // Create form data with the file
    const formData = new FormData();
    const fileStream = await fs.readFile(filePath);
    formData.append('file', fileStream, { filename: path.basename(filePath) });

    // Add metadata
    formData.append('pinataMetadata', JSON.stringify({
        name: `nft-${name}`
    }));

    try {
        const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
            method: 'POST',
            headers: {
                'pinata_api_key': PINATA_API_KEY,
                'pinata_secret_api_key': PINATA_SECRET_KEY,
                ...formData.getHeaders()
            },
            body: formData
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Pinata error: ${response.status} - ${error}`);
        }

        const result = await response.json();
        const ipfsHash = result.IpfsHash;

        console.log(`✅ Pinata upload successful: ipfs://${ipfsHash}`);
        return `ipfs://${ipfsHash}`;
    } catch (error) {
        console.error(`Error uploading to Pinata: ${error.message}`);
        throw error;
    }
}

/**
 * Upload a file to IPFS
 * @param {string} filePath - Path to the file
 * @param {string} name - Name for the upload
 * @returns {Promise<string>} - IPFS URL
 */
async function uploadToIPFS(filePath, name) {
    // Try Pinata first if configured
    if (isPinataConfigured) {
        try {
            return await uploadToPinata(filePath, name);
        } catch (error) {
            console.warn(`⚠️ Pinata upload failed: ${error.message}`);
            console.warn(`⚠️ Falling back to local w3.storage CLI...`);
        }
    }

    // Fall back to web3.storage CLI
    try {
        const { stdout } = await execAsync(`npx web3.storage put "${filePath}" --name "${name}"`);
        const ipfsCid = stdout.trim().split('\n').pop().trim();

        if (!ipfsCid || ipfsCid.length < 40) {
            throw new Error(`Invalid IPFS CID returned: ${ipfsCid}`);
        }

        console.log(`✅ Web3.storage upload successful: ipfs://${ipfsCid}`);
        return `ipfs://${ipfsCid}`;
    } catch (error) {
        console.error(`Error uploading to IPFS: ${error.message}`);

        // In case of failure, generate a local URL as last resort
        const backupFilename = `${Date.now()}-${name}.png`;
        const publicDir = path.join(process.cwd(), 'public', 'images');

        try {
            // Ensure the public/images directory exists
            await fs.mkdir(publicDir, { recursive: true });

            // Copy the file to the public directory
            await fs.copyFile(filePath, path.join(publicDir, backupFilename));

            // Return a URL relative to the base URL
            return `${baseUrl}/images/${backupFilename}`;
        } catch (err) {
            console.error(`Final fallback failed: ${err.message}`);
            throw new Error('All upload attempts failed');
        }
    }
}

// Helper to get file size
async function getFileSize(filePath) {
    const stats = await fs.stat(filePath);
    return stats.size;
}

/**
 * Generate and pin an NFT image + metadata for a ninja cat
 * @param {Object} options - Generation options
 * @param {string} options.breed - Cat breed (defaults to "Tabby")
 * @param {string|number} options.tokenId - NFT token ID
 * @param {string} options.imageProvider - AI provider (stability, dall-e, huggingface)
 * @param {string} options.promptExtras - Additional prompt instructions
 * @param {string} options.negativePrompt - Negative prompt instructions
 * @param {Object} options.providerOptions - Provider-specific options (stylePreset, model, etc.)
 * @param {string} options.taskId - Task ID for progress tracking
 * @returns {Promise<Object>} Image and metadata URLs
 */
export async function finalizeMint({
    breed = "Tabby",
    tokenId,
    imageProvider,
    promptExtras = "",
    negativePrompt = "",
    providerOptions = {},  // Explicit parameter for provider-specific options
    taskId = null,
    ...rest  // Capture any other parameters
}) {
    // Normalize the breed name
    if (typeof breed !== 'string' || breed.trim() === '') {
        breed = 'Tabby';
    }
    const normalizedBreed = breed.charAt(0).toUpperCase() + breed.slice(1).toLowerCase();

    // Generate traits based on breed and tokenId
    console.log(`💫 Generating traits for #${tokenId}...`);
    const traits = generateTraits(normalizedBreed, tokenId);

    // Build prompt from traits
    const weapon = traits.rawTraits.find(t => t.trait_type === "Weapon")?.value || "Katana";
    const stance = traits.rawTraits.find(t => t.trait_type === "Stance")?.value || "Attack";
    const element = traits.rawTraits.find(t => t.trait_type === "Element")?.value || "Fire";
    const rank = traits.rawTraits.find(t => t.trait_type === "Rank")?.value || "Novice";

    // Get all keywords from traits for a richer prompt
    const keywordString = traits.keywords.join(", ");

    // Create the base prompt
    const basePrompt = `A pixel art ninja cat of ${normalizedBreed} breed in ${stance} stance wielding ${weapon} with ${element} powers, ${rank} rank, ${keywordString}`;

    // Add any custom prompt extras if provided
    const prompt = promptExtras ? `${basePrompt}, ${promptExtras}` : basePrompt;
    console.log(`📝 Generated prompt: "${prompt}"`);

    // Update task status if available
    if (taskId) {
        try {
            const { updateTask } = await import('./taskManager.js');
            updateTask(taskId, {
                progress: 40,
                message: `Generating image with ${imageProvider || IMAGE_PROVIDER}...`,
                prompt
            });
        } catch (err) {
            // Non-fatal if task manager isn't available
            console.warn(`⚠️ Could not update task status: ${err.message}`);
        }
    }

    // Generate the image - CRITICAL FIX: Clear logging and enforce strict provider selection
    console.log(`🎨 Generating image...`);
    console.log(`🚨 STRICT PROVIDER: ${imageProvider || IMAGE_PROVIDER} (no fallbacks)`);

    // Log provider options if available
    if (Object.keys(providerOptions).length > 0) {
        console.log(`📋 PROVIDER OPTIONS:`, providerOptions);
    }

    // Pass all options to generateImage, including provider-specific options
    const imageResult = await generateImage(prompt, {
        imageProvider,
        strictMode: true,
        negativePrompt,
        useCustomPrompt: !!promptExtras,
        ...providerOptions,  // Explicitly include provider-specific options (style, model, etc.)
        ...rest              // Include any other options
    });

    // Update task status
    if (taskId) {
        try {
            const { updateTask } = await import('./taskManager.js');
            updateTask(taskId, {
                progress: 60,
                message: 'Processing image...',
                provider: imageResult.provider,
                model: imageResult.model
            });
        } catch (err) {
            // Non-fatal
        }
    }

    // Process the image (auto-crop, etc.)
    const processedImage = await processImage(imageResult);

    // Update task status
    if (taskId) {
        try {
            const { updateTask } = await import('./taskManager.js');
            updateTask(taskId, {
                progress: 70,
                message: 'Uploading to IPFS...'
            });
        } catch (err) {
            // Non-fatal
        }
    }

    // Upload image to IPFS
    console.log(`📦 Saving and uploading image...`);
    const imageUri = await uploadToIPFS(processedImage.path, `${normalizedBreed}-${tokenId}`);

    // Update task status if available
    if (taskId) {
        try {
            const { updateTask } = await import('./taskManager.js');
            updateTask(taskId, {
                progress: 85,
                message: 'Creating metadata...',
                imageUri
            });
        } catch (err) {
            // Non-fatal
        }
    }

    // Create metadata - include provider options in generation info
    console.log(`📝 Creating metadata...`);
    const metadata = {
        name: `${projectName} #${tokenId}`,
        description: traits.description,
        image: imageUri,
        attributes: traits.attributes,
        generationInfo: {
            prompt,
            provider: imageResult.provider,
            model: imageResult.model,
            providerOptions,  // Include provider options in metadata
            timestamp: Date.now(),
            rarity: traits.rarity
        }
    };

    // Save metadata to file
    const metaPath = path.join(processedImage.directory, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

    // Upload metadata to IPFS
    const metadataUri = await uploadToIPFS(metaPath, `meta-${normalizedBreed}-${tokenId}`);
    console.log(`🔗 Token URI metadata at: ${metadataUri}`);

    // Clean up temporary directory
    fs.rm(processedImage.directory, { recursive: true, force: true }).catch(err => {
        console.warn(`Warning: Failed to clean up temp directory: ${err.message}`);
    });

    // Track generation time
    const generationTime = ((Date.now() - Date.now()) / 1000).toFixed(2);
    console.log(`✅ Finished #${tokenId} → ${metadataUri} using ${imageResult.provider} (${generationTime}s)`);

    return {
        tokenURI: metadataUri,
        imageUri,
        metadata,
        provider: imageResult.provider,
        model: imageResult.model || PROVIDERS[imageResult.provider]?.model,
        providerOptions  // Include provider options in the return value
    };
}