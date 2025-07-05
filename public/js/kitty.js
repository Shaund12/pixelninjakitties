/* global ethers */

// Helper function to safely set text content
function safeSetTextContent(elementId, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = text;
    } else {
        console.error(`Element with ID "${elementId}" not found when trying to set text: "${text}"`);
    }
}

// Helper for safely updating elements
function safeUpdateElement(elementId, updateFn) {
    const element = document.getElementById(elementId);
    if (element) {
        updateFn(element);
    } else {
        console.error(`Element with ID "${elementId}" not found`);
    }
}

// Determine rarity with more detailed information
function determineRarity(id) {
    const numId = parseInt(id);
    if (numId % 100 === 0) {
        return {
            level: 'Legendary',
            score: 95 + (numId % 5),
            percentile: '0.8%',
            color: 'linear-gradient(135deg, #FFD700, #FFA500)'
        };
    } else if (numId % 10 === 0) {
        return {
            level: 'Epic',
            score: 85 + (numId % 10),
            percentile: '8%',
            color: 'linear-gradient(135deg, #9370DB, #6A5ACD)'
        };
    } else if (numId % 2 === 0) {
        return {
            level: 'Rare',
            score: 70 + (numId % 15),
            percentile: '30%',
            color: 'linear-gradient(135deg, #6495ED, #4169E1)'
        };
    } else {
        return {
            level: 'Common',
            score: 50 + (numId % 20),
            percentile: '61%',
            color: 'linear-gradient(135deg, #90EE90, #3CB371)'
        };
    }
}

// Format date nicely
function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Generate a cat story based on breed and ID
function generateCatStory(breed, id, name) {
    const stories = {
        Bengal: [
            `Born in the hidden valleys of the Eastern Digital Realm, ${name} showed exceptional tracking skills from an early age. Bengal ninjas are known for their distinctive spotted coat patterns that provide perfect camouflage during infiltration missions.`,
            `${name} trained under Master Whisker-Byte, the legendary Bengal warrior who once secured the Genesis Block during the Great Chain Split. The training was brutal, but it forged a ninja of unparalleled speed and precision.`,
            `Today, ${name} is known throughout the blockchain as a guardian of decentralized networks, using powerful pouncing techniques and expert cryptographic skills to protect digital assets from would-be attackers.`
        ],
        Siamese: [
            `${name} emerged from the mysterious Fog Protocol with eyes that pierce through the most complex encryption. Siamese ninjas are distinguished by their hypnotic blue eyes and distinctive vocal abilities that can disrupt enemy communications.`,
            `After earning the coveted Blue Point badge at the Moonlight Dojo, ${name} mastered the ancient art of Memory Pool Meditation, allowing for unprecedented awareness of pending transactions.`,
            `When the network sleeps, ${name} is most active, silently patrolling the blockchain and using telepathic bonds with other Siamese ninjas to coordinate sophisticated defense patterns.`
        ],
        "Maine Coon": [
            `From the frozen northern shards of the blockchain, ${name} grew to be one of the largest and most formidable ninja cats. Maine Coon warriors are revered for their impressive size and thick fur that shields against even the harshest network conditions.`,
            `${name}'s training in the Ice Block Mountains emphasized raw power combined with unexpected grace. Few adversaries expect such agility from a cat of this stature, giving ${name} a crucial advantage in combat.`,
            `With powerful paws that can crush malicious smart contracts and a luxurious coat that stores emergency supplies, ${name} is the perfect guardian for high-value transactions during times of network instability.`
        ],
        Calico: [
            `${name} was born during a rare triple-fork event, blessing this cat with the multi-colored coat pattern that marks the most elusive of ninja cats. Calico ninjas are believed to bring prosperity to their allies and confusion to their enemies.`,
            `Trained in the secretive Tri-Color Temple, ${name} learned to harness the power of unpredictability, developing a fighting style that seems random but follows deep cryptographic patterns that only other calicos can perceive.`,
            `${name} specializes in misdirection and illusion, often appearing to be in multiple places at once. This unique ability has saved countless users from phishing attacks and scam contracts.`
        ],
        Sphynx: [
            `${name} emerged from the Null Vector space, a hairless enigma that confounds conventional blockchain tracking systems. Sphynx ninjas operate on a different frequency than other cats, their bare skin sensitive to the subtle energy flows of digital networks.`,
            `While others dismissed ${name} for lacking the traditional fur of ninja cats, Master Zero-Knowledge recognized the unique potential of this Sphynx and trained ${name} in the forbidden arts of Quantum Entanglement.`,
            `Today, ${name} moves invisibly through firewalls and security systems that stop other ninjas cold. When the temperature drops in the digital realm, ${name} dons a specially crafted stealth suit to maintain optimal operating temperature.`
        ]
    };

    // Default story if breed not found
    const defaultStory = [
        `${name} trained in the ancient arts of the blockchain ninjas, showing remarkable aptitude for digital stealth and cryptographic combat from an early age.`,
        `Under the guidance of the Grandmaster Hash, ${name} developed unique techniques that combine traditional ninja skills with cutting-edge blockchain technology.`,
        `Now a full-fledged ninja cat, ${name} patrols the network, protecting users and their digital assets from those who would exploit vulnerabilities in the system.`
    ];

    return stories[breed] || defaultStory;
}

// Generate abilities based on ID number
function generateAbilities(id) {
    const numId = parseInt(id);
    const abilities = [
        "Can detect potential blockchain threats three blocks before manifestation",
        "Master of the \"Nine-Block Leap\" technique",
        "Developed a unique whisker-sensing ability that can decode encrypted messages",
        "Can purr at the precise frequency to stabilize fluctuating gas prices",
        "Mastered the art of Shadow Contract, leaving no transaction traces",
        "Can spot a fraudulent NFT from nine blocks away",
        "Developed a specialized claw technique to patch vulnerable smart contracts",
        "Can enter a meditative state to predict market movements",
        "Mastered the ancient art of Time-Lock Evasion",
        "Can communicate telepathically with other ninja cats across different chains"
    ];

    // Select 3-4 abilities based on ID
    const numAbilities = 3 + (numId % 2);
    const selectedIndices = [];

    while (selectedIndices.length < numAbilities) {
        const index = (numId + selectedIndices.length * 7) % abilities.length;
        if (!selectedIndices.includes(index)) {
            selectedIndices.push(index);
        }
    }

    return selectedIndices.map(index => abilities[index]);
}

// Generate transaction history
function generateTransactionHistory(id) {
    const numId = parseInt(id);
    const currentDate = new Date();

    // Mint date (between 1-360 days ago)
    const mintDaysAgo = (numId % 360) + 1;
    const mintDate = new Date(currentDate);
    mintDate.setDate(mintDate.getDate() - mintDaysAgo);

    const transactions = [
        {
            type: "Mint",
            hash: "0x" + (numId * 12345).toString(16).padStart(8, '0') + "..." + (numId * 54321).toString(16).padStart(4, '0'),
            date: formatDate(mintDate)
        }
    ];

    // Add 0-2 more transactions if ID conditions met
    if (numId % 5 === 0) {
        const transferDaysAgo = (numId % mintDaysAgo);
        const transferDate = new Date(currentDate);
        transferDate.setDate(transferDate.getDate() - transferDaysAgo);

        transactions.push({
            type: "Transfer",
            hash: "0x" + (numId * 67890).toString(16).padStart(8, '0') + "..." + (numId * 98765).toString(16).padStart(4, '0'),
            date: formatDate(transferDate)
        });
    }

    if (numId % 25 === 0) {
        const listingDaysAgo = (numId % transferDaysAgo || 1);
        const listingDate = new Date(currentDate);
        listingDate.setDate(listingDate.getDate() - listingDaysAgo);

        transactions.push({
            type: "Listing",
            hash: "0x" + (numId * 24680).toString(16).padStart(8, '0') + "..." + (numId * 13579).toString(16).padStart(4, '0'),
            date: formatDate(listingDate)
        });
    }

    return transactions;
}

// Generate attributes based on ID and breed
function generateAttributes(id, breed) {
    const numId = parseInt(id);

    const attributes = [
        {
            type: "Whisker Style",
            value: ["Thunderstrike", "Shadow Sensor", "Quantum Detector", "Blockchain Probe", "Cipher Feeler"][numId % 5],
            rarity: (numId % 10) + 1,
        },
        {
            type: "Blade Type",
            value: ["Star-Iron Katana", "Void Steel Kunai", "Plasma Edge Shuriken", "Quantum Forged Tanto", "Blockchain Cleaver"][numId % 5],
            rarity: (numId % 15) + 1,
        },
        {
            type: "Stealth Level",
            value: ["Ghost Walker", "Shadow Merger", "Void Stepper", "Phantom Glider", "Silent Protocol"][numId % 5],
            rarity: (numId % 20) + 1,
        }
    ];

    // Add breed-specific attribute
    const breedSpecific = {
        Bengal: {
            type: "Spot Pattern",
            value: ["Rosette", "Arrow Mark", "Chain Link", "Marbled", "Circuit Board"][numId % 5],
            rarity: (numId % 12) + 1
        },
        Siamese: {
            type: "Point Color",
            value: ["Seal Point", "Blue Point", "Chocolate Point", "Lilac Point", "Frost Point"][numId % 5],
            rarity: (numId % 14) + 1
        },
        "Maine Coon": {
            type: "Mane Volume",
            value: ["Thunderous", "Majestic", "Royal", "Commanding", "Supreme"][numId % 5],
            rarity: (numId % 16) + 1
        },
        Calico: {
            type: "Color Pattern",
            value: ["Tri-Node", "Digital Patchwork", "Quantum Mosaic", "Block Segment", "Hash Distribution"][numId % 5],
            rarity: (numId % 18) + 1
        },
        Sphynx: {
            type: "Skin Texture",
            value: ["Velvet Code", "Silk Protocol", "Suede Algorithm", "Chamois Cipher", "Peach Kernel"][numId % 5],
            rarity: (numId % 10) + 1
        }
    };

    if (breedSpecific[breed]) {
        attributes.push(breedSpecific[breed]);
    }

    // Calculate percentage for each attribute
    attributes.forEach(attr => {
        attr.percentage = Math.max(1, Math.min(20, attr.rarity)).toFixed(1) + "%";
        attr.rarityText = attr.rarity <= 2 ? "Legendary" :
            attr.rarity <= 5 ? "Epic" :
                attr.rarity <= 10 ? "Rare" : "Common";
    });

    // Combat skills
    const combatSkills = {
        agility: 50 + (numId % 50),
        stealth: 50 + ((numId * 7) % 50),
        power: 50 + ((numId * 13) % 50),
        intelligence: 50 + ((numId * 19) % 50)
    };

    return { attributes, combatSkills };
}

// Main function
document.addEventListener('DOMContentLoaded', async function () {
    try {
        // Get token ID from URL
        const params = new URLSearchParams(location.search);
        const id = params.get('id');

        // Redirect if no ID
        if (!id) {
            window.location.href = 'my-kitties.html';
            return;
        }

        // Constants for blockchain interaction
        const CONTRACT = "0xC4C8770f40e8eF17b27ddD987eCb8669b0924Fd6";
        const ABI = [
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "_usdc",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "_treasury",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "_initialPrice",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint96",
                        "name": "_royaltyBps",
                        "type": "uint96"
                    },
                    {
                        "internalType": "uint256",
                        "name": "_idOffset",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "nonpayable",
                "type": "constructor"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "owner",
                        "type": "address"
                    },
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "approved",
                        "type": "address"
                    },
                    {
                        "indexed": true,
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    }
                ],
                "name": "Approval",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "owner",
                        "type": "address"
                    },
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "operator",
                        "type": "address"
                    },
                    {
                        "indexed": false,
                        "internalType": "bool",
                        "name": "approved",
                        "type": "bool"
                    }
                ],
                "name": "ApprovalForAll",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": false,
                        "internalType": "uint256",
                        "name": "_fromTokenId",
                        "type": "uint256"
                    },
                    {
                        "indexed": false,
                        "internalType": "uint256",
                        "name": "_toTokenId",
                        "type": "uint256"
                    }
                ],
                "name": "BatchMetadataUpdate",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": false,
                        "internalType": "uint256",
                        "name": "_tokenId",
                        "type": "uint256"
                    }
                ],
                "name": "MetadataUpdate",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": true,
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    },
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "buyer",
                        "type": "address"
                    },
                    {
                        "indexed": false,
                        "internalType": "string",
                        "name": "breed",
                        "type": "string"
                    }
                ],
                "name": "MintRequested",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "previousOwner",
                        "type": "address"
                    },
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "newOwner",
                        "type": "address"
                    }
                ],
                "name": "OwnershipTransferred",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": false,
                        "internalType": "address",
                        "name": "account",
                        "type": "address"
                    }
                ],
                "name": "Paused",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": false,
                        "internalType": "uint256",
                        "name": "newPrice",
                        "type": "uint256"
                    }
                ],
                "name": "PriceChanged",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "from",
                        "type": "address"
                    },
                    {
                        "indexed": true,
                        "internalType": "address",
                        "name": "to",
                        "type": "address"
                    },
                    {
                        "indexed": true,
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    }
                ],
                "name": "Transfer",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": false,
                        "internalType": "address",
                        "name": "newTreasury",
                        "type": "address"
                    }
                ],
                "name": "TreasuryChanged",
                "type": "event"
            },
            {
                "anonymous": false,
                "inputs": [
                    {
                        "indexed": false,
                        "internalType": "address",
                        "name": "account",
                        "type": "address"
                    }
                ],
                "name": "Unpaused",
                "type": "event"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "to",
                        "type": "address"
                    },
                    {
                        "internalType": "string[]",
                        "name": "uris",
                        "type": "string[]"
                    }
                ],
                "name": "adminMint",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "to",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    }
                ],
                "name": "approve",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "owner",
                        "type": "address"
                    }
                ],
                "name": "balanceOf",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "string",
                        "name": "breed",
                        "type": "string"
                    }
                ],
                "name": "buy",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "id",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    }
                ],
                "name": "getApproved",
                "outputs": [
                    {
                        "internalType": "address",
                        "name": "",
                        "type": "address"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "idOffset",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "owner",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "operator",
                        "type": "address"
                    }
                ],
                "name": "isApprovedForAll",
                "outputs": [
                    {
                        "internalType": "bool",
                        "name": "",
                        "type": "bool"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "name",
                "outputs": [
                    {
                        "internalType": "string",
                        "name": "",
                        "type": "string"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "nextTokenId",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "owner",
                "outputs": [
                    {
                        "internalType": "address",
                        "name": "",
                        "type": "address"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    }
                ],
                "name": "ownerOf",
                "outputs": [
                    {
                        "internalType": "address",
                        "name": "",
                        "type": "address"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "pause",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "paused",
                "outputs": [
                    {
                        "internalType": "bool",
                        "name": "",
                        "type": "bool"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "price",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "priceHuman",
                "outputs": [
                    {
                        "internalType": "string",
                        "name": "",
                        "type": "string"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "renounceOwnership",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "royaltyBps",
                "outputs": [
                    {
                        "internalType": "uint96",
                        "name": "",
                        "type": "uint96"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    },
                    {
                        "internalType": "uint256",
                        "name": "salePrice",
                        "type": "uint256"
                    }
                ],
                "name": "royaltyInfo",
                "outputs": [
                    {
                        "internalType": "address",
                        "name": "",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "from",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "to",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    }
                ],
                "name": "safeTransferFrom",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "from",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "to",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    },
                    {
                        "internalType": "bytes",
                        "name": "data",
                        "type": "bytes"
                    }
                ],
                "name": "safeTransferFrom",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "operator",
                        "type": "address"
                    },
                    {
                        "internalType": "bool",
                        "name": "approved",
                        "type": "bool"
                    }
                ],
                "name": "setApprovalForAll",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint256",
                        "name": "newPrice",
                        "type": "uint256"
                    }
                ],
                "name": "setPrice",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint96",
                        "name": "bps",
                        "type": "uint96"
                    }
                ],
                "name": "setRoyalty",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    },
                    {
                        "internalType": "string",
                        "name": "uri",
                        "type": "string"
                    }
                ],
                "name": "setTokenURI",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "newTreasury",
                        "type": "address"
                    }
                ],
                "name": "setTreasury",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "bytes4",
                        "name": "i",
                        "type": "bytes4"
                    }
                ],
                "name": "supportsInterface",
                "outputs": [
                    {
                        "internalType": "bool",
                        "name": "",
                        "type": "bool"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "symbol",
                "outputs": [
                    {
                        "internalType": "string",
                        "name": "",
                        "type": "string"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint256",
                        "name": "index",
                        "type": "uint256"
                    }
                ],
                "name": "tokenByIndex",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "owner",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "index",
                        "type": "uint256"
                    }
                ],
                "name": "tokenOfOwnerByIndex",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "uint256",
                        "name": "id",
                        "type": "uint256"
                    }
                ],
                "name": "tokenURI",
                "outputs": [
                    {
                        "internalType": "string",
                        "name": "",
                        "type": "string"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "totalSupply",
                "outputs": [
                    {
                        "internalType": "uint256",
                        "name": "",
                        "type": "uint256"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "from",
                        "type": "address"
                    },
                    {
                        "internalType": "address",
                        "name": "to",
                        "type": "address"
                    },
                    {
                        "internalType": "uint256",
                        "name": "tokenId",
                        "type": "uint256"
                    }
                ],
                "name": "transferFrom",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {
                        "internalType": "address",
                        "name": "newOwner",
                        "type": "address"
                    }
                ],
                "name": "transferOwnership",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "treasury",
                "outputs": [
                    {
                        "internalType": "address",
                        "name": "",
                        "type": "address"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "unpause",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [],
                "name": "usdc",
                "outputs": [
                    {
                        "internalType": "contract IERC20",
                        "name": "",
                        "type": "address"
                    }
                ],
                "stateMutability": "view",
                "type": "function"
            }
        ];
        const provider = new ethers.JsonRpcProvider("https://rpc.vitruveo.xyz");
        const nft = new ethers.Contract(CONTRACT, ABI, provider);

        // Set the ID immediately
        safeSetTextContent('catId', '#' + id);

        // Fetch token data
        try {
            const uri = await nft.tokenURI(id);
            const response = await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'));

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const meta = await response.json();
            const breed = meta.attributes[0].value;
            const rarityInfo = determineRarity(id);

            // Show content and hide loading
            safeUpdateElement('loadingState', el => el.style.display = 'none');
            safeUpdateElement('kittyContent', el => el.style.display = 'block');

            // Set basic info
            safeUpdateElement('catImg', el => el.src = meta.image.replace('ipfs://', 'https://ipfs.io/ipfs/'));
            safeSetTextContent('catName', meta.name);
            safeSetTextContent('catBreed', breed);
            safeSetTextContent('catRarityScore', `${rarityInfo.score}/100 (${rarityInfo.percentile})`);

            // Update rarity badge
            safeUpdateElement('rarityBadge', el => {
                el.textContent = rarityInfo.level;
                el.style.background = rarityInfo.color;
            });

            // Set owner information
            const owner = await nft.ownerOf(id);
            safeSetTextContent('catOwner', owner.slice(0, 6) + '…' + owner.slice(-4));

            // Set mint date (simulated)
            const txHistory = generateTransactionHistory(id);
            safeSetTextContent('mintDate', txHistory[0].date);

            // Set tagline based on breed
            const taglines = {
                'Bengal': 'Master of stealth and infiltration',
                'Siamese': 'Oracle of the digital realm',
                'Maine Coon': 'Guardian of the blockchain frontier',
                'Calico': 'Wielder of unpredictable tactics',
                'Sphynx': 'Phantom of the digital void'
            };
            safeSetTextContent('catTagline', taglines[breed] || 'Skilled blockchain warrior');

            // Generate story
            const story = generateCatStory(breed, id, meta.name);
            safeSetTextContent('catNameInStory', meta.name);
            safeSetTextContent('catStoryPart1', story[0]);
            safeSetTextContent('catStoryPart2', story[1]);
            safeSetTextContent('catStoryPart3', story[2]);

            // Generate abilities
            const abilities = generateAbilities(id);
            safeUpdateElement('specialAbilities', el => {
                el.innerHTML = abilities.map(ability => `<li>${ability}</li>`).join('');
            });

            // Generate attributes
            const { attributes, combatSkills } = generateAttributes(id, breed);
            safeUpdateElement('attributesGrid', el => {
                el.innerHTML = attributes.map(attr => `
                    <div class="attribute-card">
                        <div class="attribute-type">${attr.type}</div>
                        <div class="attribute-value">${attr.value}</div>
                        <div class="skill-bar">
                            <div class="skill-progress" style="width: ${(100 - attr.rarity * 5)}%"></div>
                        </div>
                        <div class="attribute-rarity">${attr.rarityText} (${attr.percentage} have this)</div>
                    </div>
                `).join('');
            });

            // Update combat skills
            const skillsGrid = document.querySelector('.attribute-grid:nth-of-type(2)');
            if (skillsGrid) {
                const skills = [
                    { name: 'Agility', value: combatSkills.agility },
                    { name: 'Stealth', value: combatSkills.stealth },
                    { name: 'Power', value: combatSkills.power },
                    { name: 'Intelligence', value: combatSkills.intelligence }
                ];

                skillsGrid.innerHTML = skills.map(skill => `
                    <div class="attribute-card">
                        <div class="attribute-type">${skill.name}</div>
                        <div class="attribute-value">${skill.value}/100</div>
                        <div class="skill-bar">
                            <div class="skill-progress" style="width: ${skill.value}%"></div>
                        </div>
                    </div>
                `).join('');
            }

            // Transaction history
            safeUpdateElement('transactionList', el => {
                el.innerHTML = txHistory.map(tx => `
                    <li class="transaction-item">
                        <div>
                            <span class="tx-type">${tx.type}</span>
                            <a href="https://explorer.vitruveo.xyz/tx/${tx.hash}" class="tx-hash">${tx.hash}</a>
                        </div>
                        <span class="tx-date">${tx.date}</span>
                    </li>
                `).join('');
            });

            // Set up Etherscan button
            safeUpdateElement('viewOnEtherscanBtn', el => {
                el.addEventListener('click', function () {
                    window.open(`https://explorer.vitruveo.xyz/token/${CONTRACT}/instance/${id}`, '_blank');
                });
            });

        } catch (error) {
            console.error("Error fetching NFT data:", error);
            safeUpdateElement('loadingState', el => {
                el.innerHTML = `
                    <div style="text-align: center; padding: 2rem;">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="10" stroke="#FF3333" stroke-width="2"/>
                            <path d="M15 9L9 15M9 9L15 15" stroke="#FF3333" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                        <h3>Couldn't load ninja cat #${id}</h3>
                        <p>There was an error retrieving this ninja cat from the blockchain.</p>
                        <p style="color: #666; font-size: 0.9rem;">${error.message}</p>
                        <a href="my-kitties.html" class="action-btn" style="display: inline-block; margin-top: 1rem;">
                            Back to Collection
                        </a>
                    </div>
                `;
            });
        }

    } catch (error) {
        console.error("Fatal error:", error);
    }
});