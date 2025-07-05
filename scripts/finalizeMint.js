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

    // Trait options with rarity scores
    const weapons = [
        { value: "Katana", rarity: "Common", rarityScore: 25 },
        { value: "Shuriken", rarity: "Uncommon", rarityScore: 15 },
        { value: "Nunchucks", rarity: "Rare", rarityScore: 10 },
        { value: "Kunai", rarity: "Epic", rarityScore: 7 },
        { value: "Sai", rarity: "Legendary", rarityScore: 3 },
        { value: "Bo Staff", rarity: "Mythic", rarityScore: 2 }
    ];

    const stances = [
        { value: "Attack", rarity: "Common", rarityScore: 30 },
        { value: "Defense", rarity: "Common", rarityScore: 25 },
        { value: "Stealth", rarity: "Uncommon", rarityScore: 15 },
        { value: "Agility", rarity: "Rare", rarityScore: 12 },
        { value: "Focus", rarity: "Epic", rarityScore: 8 },
        { value: "Shadow", rarity: "Legendary", rarityScore: 5 }
    ];

    const elements = [
        { value: "Fire", rarity: "Uncommon", rarityScore: 18 },
        { value: "Water", rarity: "Uncommon", rarityScore: 18 },
        { value: "Earth", rarity: "Uncommon", rarityScore: 16 },
        { value: "Wind", rarity: "Rare", rarityScore: 13 },
        { value: "Shadow", rarity: "Epic", rarityScore: 6 },
        { value: "Lightning", rarity: "Legendary", rarityScore: 4 }
    ];

    const ranks = [
        { value: "Novice", rarity: "Common", rarityScore: 35 },
        { value: "Adept", rarity: "Uncommon", rarityScore: 25 },
        { value: "Skilled", rarity: "Rare", rarityScore: 15 },
        { value: "Elite", rarity: "Epic", rarityScore: 10 },
        { value: "Master", rarity: "Legendary", rarityScore: 5 },
        { value: "Legendary", rarity: "Mythic", rarityScore: 1 }
    ];

    const accessories = [
        { value: "Mask", rarity: "Uncommon", rarityScore: 20 },
        { value: "Bandana", rarity: "Common", rarityScore: 30 },
        { value: "Cape", rarity: "Epic", rarityScore: 8 },
        { value: "Gauntlets", rarity: "Rare", rarityScore: 12 },
        { value: "Scarf", rarity: "Uncommon", rarityScore: 18 },
        { value: "None", rarity: "Common", rarityScore: 40 }
    ];

    // Improved trait selection with better distribution
    const getTraitFromArray = (arr, traitType) => {
        // Use a proper hash for this specific trait
        const hash = getTraitHash(traitType, seed);
        // Take first 8 chars of hash and convert to integer
        const hashValue = parseInt(hash.substring(0, 8), 16);
        // Use modulo to get index within array bounds
        const index = hashValue % arr.length;

        console.log(`TokenId ${tokenId} - Selected ${traitType}: ${arr[index].value} (index: ${index})`);
        return arr[index];
    };

    // Selected traits - each uses its own type string for better variation
    const weaponTrait = getTraitFromArray(weapons, "weapon");
    const stanceTrait = getTraitFromArray(stances, "stance");
    const elementTrait = getTraitFromArray(elements, "element");
    const rankTrait = getTraitFromArray(ranks, "rank");
    const accessoryTrait = getTraitFromArray(accessories, "accessory");

    // Generate the basic attributes
    const attributes = [
        { trait_type: "Breed", value: breed },
        { trait_type: "Weapon", value: weaponTrait.value, rarity: weaponTrait.rarity },
        { trait_type: "Stance", value: stanceTrait.value, rarity: stanceTrait.rarity },
        { trait_type: "Element", value: elementTrait.value, rarity: elementTrait.rarity },
        { trait_type: "Rank", value: rankTrait.value, rarity: rankTrait.rarity },
        { trait_type: "Accessory", value: accessoryTrait.value, rarity: accessoryTrait.rarity }
    ];

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

// Generate backstory based on traits
function generateBackstory(tokenId, breed, attributes) {
    // Get trait values
    const weaponValue = attributes.find(attr => attr.trait_type === "Weapon")?.value;
    const elementValue = attributes.find(attr => attr.trait_type === "Element")?.value;
    const rankValue = attributes.find(attr => attr.trait_type === "Rank")?.value;
    const stanceValue = attributes.find(attr => attr.trait_type === "Stance")?.value;

    // Create a name for consistency in the story
    const seed = parseInt(tokenId);
    const hash = createHash('sha256').update(`${seed}-name`).digest('hex');
    const nameFirstParts = ["Shadow", "Whisker", "Paw", "Claw", "Silent", "Midnight", "Swift", "Stealth"];
    const nameSecondParts = ["Walker", "Runner", "Master", "Hunter", "Blade", "Strike", "Fang", "Protocol"];

    const firstIndex = parseInt(hash.substring(0, 2), 16) % nameFirstParts.length;
    const secondIndex = parseInt(hash.substring(2, 4), 16) % nameSecondParts.length;
    const ninjaName = `${nameFirstParts[firstIndex]} ${nameSecondParts[secondIndex]}`;

    // Generate origin story based on breed
    let origin;
    switch (breed) {
        case "Bengal":
            origin = `Born in the hidden valleys of the Eastern Digital Realm, this Bengal ninja was recognized for exceptional tracking abilities from an early age. The distinctive spotted coat pattern provides perfect camouflage during network infiltration missions.`;
            break;
        case "Siamese":
            origin = `Emerging from the mysterious Fog Protocol with piercing blue eyes that can see through the most complex encryption, this Siamese ninja possesses vocal abilities that can disrupt enemy communications across the blockchain.`;
            break;
        case "Maine Coon":
            origin = `From the frozen northern shards of the blockchain, this Maine Coon ninja grew to be one of the most formidable digital warriors. Revered for impressive size and a thick coat that shields against even the harshest network conditions.`;
            break;
        case "Calico":
            origin = `Born during a rare triple-fork event, this Calico ninja was blessed with a multi-colored coat that marks the most elusive of digital guardians. Calico ninjas bring prosperity to their allies and confusion to their enemies.`;
            break;
        case "Sphynx":
            origin = `Appearing from the Null Vector space, this hairless Sphynx ninja confounds conventional blockchain tracking systems. Operating on a different frequency than other cats, their bare skin is sensitive to the subtle energy flows of digital networks.`;
            break;
        default:
            origin = `Trained in the ancient arts of the blockchain ninjas, this cat showed remarkable aptitude for digital stealth and cryptographic combat from an early age.`;
    }

    // Training story based on rank and element
    let training = `Under the guidance of ${rankValue === "Master" || rankValue === "Legendary" ? "the Grand Masters" : "Master Kiyoto"}, `;

    if (elementValue && rankValue) {
        training += `${ninjaName} spent years mastering the ${elementValue} techniques, achieving the rank of ${rankValue} after passing the Trial of ${stanceValue || "Balance"}.`;
    } else {
        training += `${ninjaName} developed unique techniques that combine traditional ninja skills with cutting-edge blockchain technology.`;
    }

    // Current role based on weapon and stance
    let currentRole = `Now a ${rankValue || "skilled"} ninja, `;

    if (weaponValue && stanceValue) {
        currentRole += `${ninjaName} specializes in the ${stanceValue} stance while wielding a ${weaponValue}, `;
    } else if (weaponValue) {
        currentRole += `${ninjaName} wields the ${weaponValue} with unmatched precision, `;
    } else if (stanceValue) {
        currentRole += `${ninjaName} has mastered the ${stanceValue} stance, `;
    } else {
        currentRole += `${ninjaName} moves silently through the digital landscape, `;
    }

    if (elementValue) {
        currentRole += `channeling the power of ${elementValue} to secure the blockchain against those who would disrupt its harmony.`;
    } else {
        currentRole += `protecting users and their digital assets from those who would exploit vulnerabilities in the system.`;
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
            case "Fire": background = "ancient Japanese dojo with flickering torches"; break;
            case "Water": background = "misty waterfall in a mountain forest"; break;
            case "Earth": background = "stone zen garden with moss-covered rocks"; break;
            case "Wind": background = "bamboo forest with swaying trees"; break;
            case "Shadow": background = "moonlit rooftop overlooking a feudal Japanese village"; break;
            case "Lightning": background = "mountaintop shrine during a thunderstorm"; break;
            default: background = "traditional ninja training grounds"; break;
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