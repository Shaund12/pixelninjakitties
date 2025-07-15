/**
 * utils/metadata-definitions.js
 * ───────────────────────────────────────────────────────────────
 * Centralized definitions for all NFT metadata traits, backgrounds,
 * synergy pairs, and breed weightings.
 *
 * This file contains the core data structures that drive the metadata
 * generation process, extracted from the original finalizeMint.js
 * for better maintainability and testing.
 */

/* ─── Enhanced trait categories with more variety ─────────── */
export const traitCategories = {
    breeds: [
        { value: 'Tabby', rarity: 'Common', rarityScore: 30, keywords: ['striped', 'orange', 'common'] },
        { value: 'Siamese', rarity: 'Common', rarityScore: 25, keywords: ['cream', 'pointed', 'sleek'] },
        { value: 'Calico', rarity: 'Uncommon', rarityScore: 20, keywords: ['patched', 'tricolor', 'spots'] },
        { value: 'Maine Coon', rarity: 'Uncommon', rarityScore: 18, keywords: ['large', 'fluffy', 'powerful'] },
        { value: 'Bengal', rarity: 'Rare', rarityScore: 15, keywords: ['spotted', 'wild', 'agile'] },
        { value: 'Bombay', rarity: 'Rare', rarityScore: 14, keywords: ['black', 'sleek', 'shadow'] },
        { value: 'Persian', rarity: 'Epic', rarityScore: 10, keywords: ['fluffy', 'round', 'ornate'] },
        { value: 'Sphynx', rarity: 'Epic', rarityScore: 8, keywords: ['hairless', 'wrinkled', 'alien'] },
        { value: 'Nyan', rarity: 'Legendary', rarityScore: 5, keywords: ['rainbow', 'pixelated', 'meme'] },
        { value: 'Shadow', rarity: 'Legendary', rarityScore: 3, keywords: ['void', 'mist', 'phantom'] }
    ],
    weapons: [
        { value: 'Katana', rarity: 'Common', rarityScore: 30, keywords: ['sword', 'blade', 'japanese'] },
        { value: 'Shuriken', rarity: 'Common', rarityScore: 25, keywords: ['throwing star', 'metal', 'sharp'] },
        { value: 'Nunchucks', rarity: 'Uncommon', rarityScore: 20, keywords: ['chain', 'wood', 'swinging'] },
        { value: 'Kunai', rarity: 'Uncommon', rarityScore: 18, keywords: ['dagger', 'throwing', 'rope'] },
        { value: 'Sai', rarity: 'Rare', rarityScore: 15, keywords: ['fork', 'prongs', 'defensive'] },
        { value: 'Bo Staff', rarity: 'Rare', rarityScore: 12, keywords: ['long', 'wooden', 'staff'] },
        { value: 'Twin Blades', rarity: 'Epic', rarityScore: 10, keywords: ['dual', 'daggers', 'fast'] },
        { value: 'Kusarigama', rarity: 'Epic', rarityScore: 8, keywords: ['chain', 'sickle', 'weight'] },
        { value: 'War Fan', rarity: 'Legendary', rarityScore: 5, keywords: ['metal', 'bladed', 'elegant'] },
        { value: 'Ghost Dagger', rarity: 'Legendary', rarityScore: 3, keywords: ['ethereal', 'translucent', 'glowing'] }
    ],
    stances: [
        { value: 'Attack', rarity: 'Common', rarityScore: 30, keywords: ['aggressive', 'forward', 'striking'] },
        { value: 'Defense', rarity: 'Common', rarityScore: 25, keywords: ['guarded', 'balanced', 'blocking'] },
        { value: 'Stealth', rarity: 'Uncommon', rarityScore: 20, keywords: ['hidden', 'crouching', 'sneaking'] },
        { value: 'Agility', rarity: 'Uncommon', rarityScore: 18, keywords: ['acrobatic', 'jumping', 'flipping'] },
        { value: 'Focus', rarity: 'Rare', rarityScore: 15, keywords: ['concentration', 'meditation', 'precise'] },
        { value: 'Shadow', rarity: 'Rare', rarityScore: 12, keywords: ['darkness', 'invisible', 'merging'] },
        { value: 'Berserker', rarity: 'Epic', rarityScore: 8, keywords: ['rage', 'fury', 'wild'] },
        { value: 'Crane', rarity: 'Epic', rarityScore: 10, keywords: ['balanced', 'one-leg', 'patient'] },
        { value: 'Dragon', rarity: 'Legendary', rarityScore: 5, keywords: ['powerful', 'mythical', 'flowing'] },
        { value: 'Void', rarity: 'Legendary', rarityScore: 3, keywords: ['emptiness', 'formless', 'transcendent'] }
    ],
    elements: [
        { value: 'Fire', rarity: 'Common', rarityScore: 30, keywords: ['flames', 'burning', 'red'] },
        { value: 'Water', rarity: 'Common', rarityScore: 25, keywords: ['flowing', 'blue', 'adaptable'] },
        { value: 'Earth', rarity: 'Uncommon', rarityScore: 20, keywords: ['solid', 'brown', 'strong'] },
        { value: 'Wind', rarity: 'Uncommon', rarityScore: 18, keywords: ['air', 'quick', 'invisible'] },
        { value: 'Lightning', rarity: 'Rare', rarityScore: 15, keywords: ['electric', 'fast', 'yellow'] },
        { value: 'Ice', rarity: 'Rare', rarityScore: 12, keywords: ['frozen', 'cold', 'crystalline'] },
        { value: 'Shadow', rarity: 'Epic', rarityScore: 8, keywords: ['darkness', 'black', 'stealth'] },
        { value: 'Light', rarity: 'Epic', rarityScore: 10, keywords: ['bright', 'white', 'blinding'] },
        { value: 'Void', rarity: 'Legendary', rarityScore: 5, keywords: ['empty', 'nothingness', 'purple'] },
        { value: 'Cosmic', rarity: 'Legendary', rarityScore: 3, keywords: ['stars', 'space', 'universal'] }
    ],
    ranks: [
        { value: 'Novice', rarity: 'Common', rarityScore: 30, keywords: ['beginner', 'training', 'inexperienced'] },
        { value: 'Adept', rarity: 'Common', rarityScore: 25, keywords: ['skilled', 'practiced', 'competent'] },
        { value: 'Elite', rarity: 'Uncommon', rarityScore: 20, keywords: ['specialized', 'talented', 'expert'] },
        { value: 'Veteran', rarity: 'Uncommon', rarityScore: 18, keywords: ['experienced', 'battle-worn', 'proven'] },
        { value: 'Master', rarity: 'Rare', rarityScore: 15, keywords: ['perfected', 'teacher', 'superior'] },
        { value: 'Shadow Master', rarity: 'Rare', rarityScore: 12, keywords: ['stealth', 'unseen', 'infiltrator'] },
        { value: 'Mystic', rarity: 'Epic', rarityScore: 10, keywords: ['magical', 'spiritual', 'enlightened'] },
        { value: 'Warlord', rarity: 'Epic', rarityScore: 8, keywords: ['commander', 'feared', 'powerful'] },
        { value: 'Legendary', rarity: 'Legendary', rarityScore: 5, keywords: ['mythical', 'story-worthy', 'renowned'] },
        { value: 'Immortal', rarity: 'Legendary', rarityScore: 3, keywords: ['deathless', 'eternal', 'godlike'] }
    ],
    accessories: [
        { value: 'Headband', rarity: 'Common', rarityScore: 30, keywords: ['cloth', 'forehead', 'symbol'] },
        { value: 'Scarf', rarity: 'Common', rarityScore: 25, keywords: ['neck', 'flowing', 'colored'] },
        { value: 'Armor Piece', rarity: 'Uncommon', rarityScore: 20, keywords: ['protection', 'metal', 'plated'] },
        { value: 'Belt', rarity: 'Uncommon', rarityScore: 18, keywords: ['waist', 'utility', 'colored'] },
        { value: 'Gloves', rarity: 'Rare', rarityScore: 15, keywords: ['hands', 'grip', 'armored'] },
        { value: 'Face Mask', rarity: 'Rare', rarityScore: 12, keywords: ['concealed', 'mysterious', 'hidden'] },
        { value: 'Enchanted Amulet', rarity: 'Epic', rarityScore: 10, keywords: ['glowing', 'magical', 'powerful'] },
        { value: 'Spirit Companion', rarity: 'Epic', rarityScore: 8, keywords: ['floating', 'ethereal', 'helper'] },
        { value: 'Ancient Scroll', rarity: 'Legendary', rarityScore: 5, keywords: ['knowledge', 'power', 'secret'] },
        { value: 'Celestial Mark', rarity: 'Legendary', rarityScore: 3, keywords: ['glowing', 'divine', 'blessed'] }
    ]
};

/* ─── Breed-based trait weightings ──────────────────────────── */
export const breedWeightings = {
    'Tabby': {
        weapons: ['Shuriken', 'Katana'],
        stances: ['Attack', 'Agility'],
        elements: ['Fire', 'Earth']
    },
    'Siamese': {
        stances: ['Stealth', 'Agility'],
        elements: ['Water', 'Wind'],
        accessories: ['Face Mask', 'Scarf']
    },
    'Calico': {
        weapons: ['Sai', 'Nunchucks'],
        stances: ['Focus', 'Defense'],
        elements: ['Earth', 'Fire']
    },
    'Maine Coon': {
        weapons: ['Bo Staff', 'Kusarigama'],
        stances: ['Defense', 'Focus'],
        elements: ['Earth', 'Ice']
    },
    'Bengal': {
        weapons: ['Twin Blades', 'Kunai'],
        stances: ['Berserker', 'Agility'],
        elements: ['Lightning', 'Fire']
    },
    'Bombay': {
        weapons: ['Kusarigama', 'Ghost Dagger'],
        stances: ['Shadow', 'Stealth'],
        elements: ['Shadow', 'Void']
    },
    'Persian': {
        weapons: ['War Fan', 'Sai'],
        stances: ['Focus', 'Crane'],
        elements: ['Light', 'Wind'],
        accessories: ['Enchanted Amulet', 'Celestial Mark']
    },
    'Sphynx': {
        weapons: ['Kusarigama', 'War Fan'],
        stances: ['Focus', 'Void'],
        elements: ['Void', 'Lightning'],
        accessories: ['Ancient Scroll', 'Spirit Companion']
    },
    'Nyan': {
        elements: ['Cosmic', 'Light'],
        accessories: ['Celestial Mark'],
        ranks: ['Immortal', 'Legendary']
    },
    'Shadow': {
        elements: ['Shadow', 'Void'],
        stances: ['Shadow', 'Stealth'],
        weapons: ['Ghost Dagger', 'Kusarigama']
    }
};

/* ─── Ultra Rare Legendary Traits ──────────────────────────── */
export const mythicTraits = [
    {
        trait_type: 'Blessing', value: 'Nine Lives', rarity: 'Mythic', rarityScore: 1,
        keywords: ['resurrection', 'immortal', 'reborn']
    },
    {
        trait_type: 'Power', value: 'Time Whisker', rarity: 'Mythic', rarityScore: 1,
        keywords: ['temporal', 'time-bending', 'clock']
    },
    {
        trait_type: 'Title', value: 'Cat God', rarity: 'Mythic', rarityScore: 1,
        keywords: ['deity', 'worship', 'almighty']
    },
    {
        trait_type: 'Ability', value: 'Dimension Pounce', rarity: 'Mythic', rarityScore: 1,
        keywords: ['teleport', 'reality-shift', 'portal']
    },
    {
        trait_type: 'Secret', value: 'Catnip Mastery', rarity: 'Mythic', rarityScore: 1,
        keywords: ['euphoria', 'hallucination', 'power-boost']
    }
];

/* ─── Special trait generation with enhanced probabilities ─── */
export const specialTraits = [
    {
        trait_type: 'Technique', value: 'Shadow Clone', rarity: 'Unique', rarityScore: 2,
        keywords: ['duplicate', 'illusion', 'multiple']
    },
    {
        trait_type: 'Skill', value: 'Whisker Sense', rarity: 'Unique', rarityScore: 2,
        keywords: ['detection', 'precognition', 'awareness']
    },
    {
        trait_type: 'Move', value: 'Purrfect Strike', rarity: 'Unique', rarityScore: 2,
        keywords: ['critical', 'devastating', 'precise']
    },
    {
        trait_type: 'Style', value: 'Feline Fury', rarity: 'Unique', rarityScore: 2,
        keywords: ['aggressive', 'combo', 'rapid']
    },
    {
        trait_type: 'Secret', value: 'Nine Shadow Paths', rarity: 'Unique', rarityScore: 2,
        keywords: ['teleport', 'afterimage', 'confusion']
    },
    {
        trait_type: 'Ability', value: "Cat's Eye", rarity: 'Unique', rarityScore: 2,
        keywords: ['perception', 'night-vision', 'analysis']
    },
    {
        trait_type: 'Power', value: 'Sonic Meow', rarity: 'Unique', rarityScore: 2,
        keywords: ['sound', 'shockwave', 'stun']
    },
    {
        trait_type: 'Mastery', value: 'Yarn Manipulation', rarity: 'Unique', rarityScore: 2,
        keywords: ['binding', 'whip', 'ensnare']
    }
];

/* ─── Enhanced synergy pairs that boost score when appearing together ─── */
export const synergyPairs = [
    // Breed + Element combinations
    { type1: 'Breed', value1: 'Shadow', type2: 'Element', value2: 'Shadow', bonus: 15 },
    { type1: 'Breed', value1: 'Nyan', type2: 'Element', value2: 'Cosmic', bonus: 15 },
    { type1: 'Breed', value1: 'Bengal', type2: 'Element', value2: 'Fire', bonus: 10 },
    { type1: 'Breed', value1: 'Siamese', type2: 'Element', value2: 'Water', bonus: 10 },
    { type1: 'Breed', value1: 'Maine Coon', type2: 'Element', value2: 'Earth', bonus: 10 },

    // Weapon + Stance combinations
    { type1: 'Weapon', value1: 'Katana', type2: 'Stance', value2: 'Attack', bonus: 8 },
    { type1: 'Weapon', value1: 'Bo Staff', type2: 'Stance', value2: 'Defense', bonus: 10 },
    { type1: 'Weapon', value1: 'Shuriken', type2: 'Stance', value2: 'Stealth', bonus: 12 },
    { type1: 'Weapon', value1: 'Twin Blades', type2: 'Stance', value2: 'Agility', bonus: 14 },
    { type1: 'Weapon', value1: 'Ghost Dagger', type2: 'Stance', value2: 'Shadow', bonus: 16 },
    { type1: 'Weapon', value1: 'War Fan', type2: 'Stance', value2: 'Focus', bonus: 12 },

    // Element + Accessory combinations
    { type1: 'Element', value1: 'Fire', type2: 'Accessory', value2: 'Headband', bonus: 7 },
    { type1: 'Element', value1: 'Water', type2: 'Accessory', value2: 'Scarf', bonus: 9 },
    { type1: 'Element', value1: 'Shadow', type2: 'Accessory', value2: 'Face Mask', bonus: 13 },
    { type1: 'Element', value1: 'Cosmic', type2: 'Accessory', value2: 'Celestial Mark', bonus: 15 },

    // Background + Breed combinations
    { type1: 'Background', value1: 'Dojo', type2: 'Breed', value2: 'Tabby', bonus: 10 },
    { type1: 'Background', value1: 'Bamboo Forest', type2: 'Breed', value2: 'Calico', bonus: 10 },
    { type1: 'Background', value1: 'Night Sky', type2: 'Breed', value2: 'Bombay', bonus: 12 },
    { type1: 'Background', value1: 'Night Sky', type2: 'Breed', value2: 'Shadow', bonus: 15 },
    { type1: 'Background', value1: 'Mountain Temple', type2: 'Breed', value2: 'Persian', bonus: 12 },
    { type1: 'Background', value1: 'Neon City', type2: 'Breed', value2: 'Nyan', bonus: 14 },
    { type1: 'Background', value1: 'Sakura Garden', type2: 'Element', value2: 'Wind', bonus: 11 },
    { type1: 'Background', value1: 'Ninja Fortress', type2: 'Weapon', value2: 'Katana', bonus: 8 },
    { type1: 'Background', value1: 'Cosmic Dimension', type2: 'Element', value2: 'Cosmic', bonus: 16 },
    { type1: 'Background', value1: 'Lava Cavern', type2: 'Element', value2: 'Fire', bonus: 13 },
    { type1: 'Background', value1: 'Ancient Scroll', type2: 'Rank', value2: 'Legendary', bonus: 17 },
    { type1: 'Background', value1: 'Spirit Realm', type2: 'Element', value2: 'Void', bonus: 18 }
];

/* ─── Background definitions for all providers ─── */
export const backgroundDefinitions = [
    {
        name: 'Dojo',
        description: 'in a traditional Japanese dojo with wooden floors and training equipment',
        rarity: 'Common',
        rarityScore: 30,
        keywords: ['training', 'wooden', 'indoor'],
        affinityBreeds: ['Tabby', 'Bengal'],
        statBonus: { power: 1 }
    },
    {
        name: 'Bamboo Forest',
        description: 'in a dense bamboo forest with dappled light filtering through',
        rarity: 'Common',
        rarityScore: 25,
        keywords: ['green', 'nature', 'peaceful'],
        affinityBreeds: ['Calico', 'Siamese'],
        statBonus: { stealth: 1 }
    },
    {
        name: 'Night Sky',
        description: 'under a starlit night sky with a full moon illuminating the scene',
        rarity: 'Uncommon',
        rarityScore: 20,
        keywords: ['dark', 'moon', 'stars'],
        affinityBreeds: ['Bombay', 'Shadow'],
        statBonus: { stealth: 1 }
    },
    {
        name: 'Mountain Temple',
        description: 'at an ancient mountain temple with stone lanterns and cherry blossoms',
        rarity: 'Uncommon',
        rarityScore: 18,
        keywords: ['spiritual', 'ancient', 'stone'],
        affinityBreeds: ['Persian', 'Sphynx'],
        statBonus: { intelligence: 1 }
    },
    {
        name: 'Neon City',
        description: 'on city rooftops with vibrant neon signs illuminating the night',
        rarity: 'Rare',
        rarityScore: 15,
        keywords: ['urban', 'bright', 'modern'],
        affinityBreeds: ['Bengal', 'Nyan'],
        statBonus: { agility: 1 }
    },
    {
        name: 'Pixel Void',
        description: 'against a simple pixel art background with minimal details',
        rarity: 'Common',
        rarityScore: 28,
        keywords: ['minimal', 'clean', 'simple'],
        affinityBreeds: [],
        statBonus: {}
    },
    {
        name: 'Sakura Garden',
        description: 'in a tranquil garden with falling cherry blossom petals',
        rarity: 'Rare',
        rarityScore: 12,
        keywords: ['pink', 'peaceful', 'flowers'],
        affinityBreeds: ['Persian', 'Calico'],
        statBonus: { intelligence: 1 }
    },
    {
        name: 'Ninja Fortress',
        description: 'inside a secret fortress with training dummies and weapon racks',
        rarity: 'Rare',
        rarityScore: 15,
        keywords: ['fortress', 'training', 'weapons'],
        affinityBreeds: ['Tabby', 'Siamese'],
        statBonus: { power: 1, stealth: 1 }
    },
    {
        name: 'Cosmic Dimension',
        description: 'in a strange dimension with swirling cosmic energies and floating platforms',
        rarity: 'Epic',
        rarityScore: 8,
        keywords: ['space', 'magical', 'otherworldly'],
        affinityBreeds: ['Nyan', 'Shadow'],
        statBonus: { power: 1, intelligence: 1 }
    },
    {
        name: 'Lava Cavern',
        description: 'inside a volcanic cavern with bubbling lava and glowing crystals',
        rarity: 'Epic',
        rarityScore: 10,
        keywords: ['hot', 'danger', 'orange'],
        affinityBreeds: ['Bengal', 'Tabby'],
        statBonus: { power: 2 }
    },
    {
        name: 'Ancient Scroll',
        description: 'depicted on an ancient scroll painting with ink wash style',
        rarity: 'Legendary',
        rarityScore: 5,
        keywords: ['scroll', 'painting', 'ink'],
        affinityBreeds: ['Sphynx', 'Persian'],
        statBonus: { intelligence: 2 }
    },
    {
        name: 'Spirit Realm',
        description: 'in the ethereal spirit realm with glowing wisps and floating lanterns',
        rarity: 'Legendary',
        rarityScore: 3,
        keywords: ['spiritual', 'glowing', 'magical'],
        affinityBreeds: ['Shadow', 'Nyan'],
        statBonus: { stealth: 1, intelligence: 1, agility: 1 }
    }
];

/* ─── Clan definitions based on breed ─── */
export const clanDefinitions = {
    'Tabby': 'Tora Clan',
    'Siamese': 'Twin Moon Clan',
    'Maine Coon': 'Mountain Peak Clan',
    'Bengal': 'Spotted Fang Clan',
    'Bombay': 'Night Shadow Clan',
    'Calico': 'Three Colors Clan',
    'Persian': 'Royal Whisker Clan',
    'Sphynx': 'Ancient Sphinx Order',
    'Nyan': 'Rainbow Path',
    'Shadow': 'Void Walker Sect'
};

/* ─── Villain definitions based on element ─── */
export const villainDefinitions = {
    'Fire': 'the Flame Tyrant',
    'Water': 'the Deep Ocean Shogun',
    'Earth': 'the Stone Emperor',
    'Wind': 'the Cyclone Daimyo',
    'Lightning': 'the Thunder King',
    'Ice': 'the Frost Monarch',
    'Shadow': 'the Darkness Overlord',
    'Light': 'the Blinding Sovereign',
    'Void': 'the Emptiness Devourer',
    'Cosmic': 'the Star Conqueror'
};

/* ─── Background flavor text integration ─── */
export const backgroundFlavorText = {
    'Dojo': 'where they train tirelessly to perfect their technique',
    'Bamboo Forest': 'where they meditate among the rustling bamboo',
    'Night Sky': 'where they blend with shadows under moonlight',
    'Mountain Temple': 'where ancient wisdom guides their path',
    'Neon City': 'where they prowl the rooftops unseen',
    'Pixel Void': 'where they hone their skills in isolation',
    'Sakura Garden': 'where falling petals mark their graceful movements',
    'Ninja Fortress': 'where they prepare for dangerous missions',
    'Cosmic Dimension': 'where reality bends to their will',
    'Lava Cavern': 'where they temper their spirit in extreme heat',
    'Ancient Scroll': 'where their legend is preserved for eternity',
    'Spirit Realm': 'where they commune with ancestral spirits'
};

/* ─── Base rarityScore mapping by rarity level ─── */
export const rarityMapping = {
    'Common': 25,
    'Uncommon': 45,
    'Rare': 65,
    'Epic': 80,
    'Legendary': 90,
    'Unique': 98,
    'Mythic': 125
};