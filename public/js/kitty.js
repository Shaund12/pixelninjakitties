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

// Format address for display
function formatAddress(address) {
    if (!address) return '';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

// Format date nicely
function formatDate(timestamp) {
    const date = timestamp ? new Date(timestamp * 1000) : new Date();
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Show a toast message
function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
    }, duration);
}

// Copy text to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!');
    } catch (err) {
        console.error('Failed to copy: ', err);
        showToast('Failed to copy to clipboard');
    }
}

// Download image from URL
async function downloadImage(url, filename) {
    try {
        // If it's an IPFS URL, convert it
        if (url.startsWith('ipfs://')) {
            url = `https://ipfs.io/ipfs/${url.replace('ipfs://', '')}`;
        }

        const response = await fetch(url);
        const blob = await response.blob();
        const objectURL = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = objectURL;
        link.download = filename;
        link.click();

        // Clean up
        URL.revokeObjectURL(objectURL);
        showToast('Image downloaded successfully!');
    } catch (error) {
        console.error('Error downloading image:', error);
        showToast('Failed to download image');
    }
}

// Fetch transaction history for a token
async function fetchTokenHistory(provider, tokenId, contractAddress) {
    try {
        // Define the Transfer event signature
        const transferEventSignature = "Transfer(address,address,uint256)";
        const transferTopic = ethers.keccak256(ethers.toUtf8Bytes(transferEventSignature));

        // Create a topic filter for our token ID
        const tokenIdHex = ethers.toBeHex(tokenId, 32); // 32 bytes for uint256

        // Get logs for this token's transfers
        const logs = await provider.getLogs({
            address: contractAddress,
            topics: [transferTopic, null, null, tokenIdHex],
            fromBlock: 0,
            toBlock: 'latest'
        });

        // Format the logs into usable transactions
        const transactions = await Promise.all(logs.map(async (log) => {
            const block = await provider.getBlock(log.blockNumber);
            return {
                type: log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
                    ? 'Mint' : 'Transfer',
                hash: log.transactionHash,
                blockNumber: log.blockNumber,
                timestamp: block ? block.timestamp : null,
                from: ethers.dataSlice(log.topics[1], 12), // format from address
                to: ethers.dataSlice(log.topics[2], 12)    // format to address
            };
        }));

        // Sort by block number ascending
        return transactions.sort((a, b) => a.blockNumber - b.blockNumber);
    } catch (error) {
        console.error("Error fetching token history:", error);
        return null;
    }
}

// Set up sharing functionality
function setupSharing(metadata, tokenId) {
    // Get the current URL without query parameters
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?id=${tokenId}`;

    // Set up Twitter share
    safeUpdateElement('shareTwitter', el => {
        el.addEventListener('click', () => {
            const nftName = metadata?.name || `Pixel Ninja Cat #${tokenId}`;
            const tweetText = encodeURIComponent(`Check out my ${nftName} NFT! #PixelNinjaCats #NFT`);
            const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`;
            window.open(twitterUrl, '_blank');
        });
    });

    // Set up Discord share (opens Discord with pre-filled message)
    safeUpdateElement('shareDiscord', el => {
        el.addEventListener('click', () => {
            const nftName = metadata?.name || `Pixel Ninja Cat #${tokenId}`;
            // Discord doesn't have a direct share API, but we can at least copy a formatted message
            const discordText = `Check out my ${nftName} NFT!\n${shareUrl}`;
            copyToClipboard(discordText);
            showToast('Discord message copied! Paste it in your Discord chat.');
        });
    });

    // Set up link copy
    safeUpdateElement('copyLink', el => {
        el.addEventListener('click', () => {
            copyToClipboard(shareUrl);
        });
    });

    // Main share button
    safeUpdateElement('shareBtn', el => {
        el.addEventListener('click', function () {
            if (navigator.share) {
                navigator.share({
                    title: metadata?.name || `Pixel Ninja Cat #${tokenId}`,
                    text: 'Check out my awesome Pixel Ninja Cat NFT!',
                    url: shareUrl
                })
                    .catch(console.error);
            } else {
                // If Web Share API is not supported, just open the history tab
                document.querySelector('.tab-btn[data-tab="history"]').click();
            }
        });
    });
}

// Animate skill bars
function animateSkillBars() {
    const skillBars = document.querySelectorAll('.skill-progress');

    skillBars.forEach(bar => {
        const width = bar.style.width;
        bar.style.width = '0%';

        // Trigger reflow
        void bar.offsetWidth;

        // Set the final width
        bar.style.width = width;
    });
}

// Get the appropriate CSS class for a rarity tier
function getRarityClass(rarity) {
    const tier = rarity.toLowerCase();
    switch (tier) {
        case 'legendary':
            return 'legendary-badge';
        case 'epic':
            return 'epic-badge';
        case 'rare':
            return 'rare-badge';
        case 'uncommon':
            return 'uncommon-badge';
        case 'common':
            return 'common-badge';
        case 'mythic':
            return 'mythic-badge';
        default:
            return '';
    }
}

// Get color class for specific elements
function getElementClass(element) {
    if (!element) return '';
    const elementLower = element.toLowerCase();

    if (elementLower === 'fire') return 'element-fire';
    if (elementLower === 'water') return 'element-water';
    if (elementLower === 'earth') return 'element-earth';
    if (elementLower === 'air' || elementLower === 'wind') return 'element-air';
    if (elementLower === 'void') return 'element-void';
    if (elementLower === 'lightning' || elementLower === 'thunder') return 'element-lightning';
    if (elementLower === 'ice') return 'element-ice';
    if (elementLower === 'shadow') return 'element-shadow';
    if (elementLower === 'light') return 'element-light';
    if (elementLower === 'cosmic') return 'element-cosmic';

    return '';
}

// Format special/mythic traits with highlights
function formatSpecialTrait(trait) {
    const isSpecial = trait.rarity === 'Unique';
    const isMythic = trait.rarity === 'Mythic';

    if (!isSpecial && !isMythic) return trait.value;

    if (isMythic) {
        return `<span class="mythic-trait">${trait.value}</span>`;
    } else {
        return `<span class="special-trait">${trait.value}</span>`;
    }
}

// Generate HTML for a trait card based on trait information
function createTraitCard(attr, showRarity = true) {
    // Get rarity from the attribute or use default
    const rarity = attr.rarity || "Common";

    // Calculate progress width based on rarity tier
    const rarityTierScore = {
        "Common": 25,
        "Uncommon": 50,
        "Rare": 75,
        "Epic": 85,
        "Legendary": 95,
        "Mythic": 98,
        "Unique": 90
    };

    // Use rarity score if provided or fall back to tier-based score
    const progressWidth = attr.rarityScore || rarityTierScore[rarity] || 50;

    // Apply element-specific styling
    let elementClass = '';
    if (attr.trait_type === 'Element') {
        elementClass = getElementClass(attr.value);
    }

    // Check if this is a special trait
    const isSpecial = rarity === 'Unique' || rarity === 'Mythic';
    const specialClass = isSpecial ? 'special-attribute-card' : '';

    return `
    <div class="attribute-card ${specialClass} ${elementClass}">
        <div class="attribute-type">${attr.trait_type}</div>
        <div class="attribute-value">${isSpecial ? formatSpecialTrait(attr) : attr.value}</div>
        <div class="skill-bar">
            <div class="skill-progress" style="width: ${progressWidth}%"></div>
        </div>
        ${showRarity ? `<div class="attribute-rarity">${rarity}</div>` : ''}
    </div>
    `;
}

// Main function
document.addEventListener('DOMContentLoaded', async function () {
    try {
        // Get token ID from URL
        const params = new URLSearchParams(window.location.search);
        const id = params.get('id');

        // Redirect if no ID
        if (!id) {
            window.location.href = 'my-kitties.html';
            return;
        }

        // Set the ID immediately
        safeSetTextContent('catId', '#' + id);

        // Constants for blockchain interaction
        const CONTRACT = "0x2D732b0Bb33566A13E586aE83fB21d2feE34e906";
        const ABI = [
            "function tokenURI(uint256 id) view returns (string)",
            "function ownerOf(uint256 tokenId) view returns (address)"
        ];
        const EXPLORER_URL = "https://explorer.vitruveo.xyz";

        // Fetch token data
        try {
            // Show loading state
            document.getElementById('loadingState').style.display = 'block';
            document.getElementById('kittyContent').style.display = 'none';

            let uri, owner;
            let provider;

            try {
                // Try to get data from blockchain
                provider = new ethers.JsonRpcProvider("https://rpc.vitruveo.xyz");
                const nft = new ethers.Contract(CONTRACT, ABI, provider);

                uri = await nft.tokenURI(id);
                owner = await nft.ownerOf(id);
            } catch (err) {
                console.log('Error fetching from contract, using fallback:', err);
                // Fallback to local URI
                uri = `/metadata/${id}.json`;
                owner = "0x0000000000000000000000000000000000000000"; // Placeholder
            }

            // Convert IPFS URI if needed
            if (uri && uri.startsWith('ipfs://')) {
                uri = `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
            }

            // Fetch the metadata
            const response = await fetch(uri);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const metadata = await response.json();
            console.log("Retrieved metadata:", metadata);

            // Show content and hide loading
            safeUpdateElement('loadingState', el => el.style.display = 'none');
            safeUpdateElement('kittyContent', el => el.style.display = 'block');

            // Set image (handle IPFS URI)
            let imageUrl = metadata.image;
            if (imageUrl && imageUrl.startsWith('ipfs://')) {
                imageUrl = `https://ipfs.io/ipfs/${imageUrl.replace('ipfs://', '')}`;
            }
            safeUpdateElement('catImg', el => {
                el.src = imageUrl;
                el.alt = metadata.name;

                // Set up download button
                document.getElementById('downloadBtn').addEventListener('click', () => {
                    downloadImage(metadata.image, `${metadata.name.replace(/ /g, '_')}.png`);
                });
            });

            // Set name
            safeSetTextContent('catName', metadata.name);
            safeSetTextContent('catNameInStory', metadata.name);

            // Process attributes from metadata
            if (metadata.attributes && metadata.attributes.length) {
                // Find breed and other attributes
                const breedAttr = metadata.attributes.find(attr => attr.trait_type === 'Breed');
                if (breedAttr) {
                    const breed = breedAttr.value;
                    safeSetTextContent('catBreed', breed);
                }

                // Check for special & mythic traits
                const specialTrait = metadata.attributes.find(attr =>
                    attr.rarity === 'Unique' ||
                    (attr.trait_type && ['Technique', 'Skill', 'Move', 'Style', 'Secret', 'Ability', 'Power', 'Mastery'].includes(attr.trait_type))
                );

                const mythicTrait = metadata.attributes.find(attr =>
                    attr.rarity === 'Mythic' ||
                    (attr.trait_type && ['Blessing', 'Power', 'Title', 'Ability', 'Secret'].includes(attr.trait_type))
                );

                // Get weapon, element for tagline
                const weaponAttr = metadata.attributes.find(attr => attr.trait_type === 'Weapon');
                const elementAttr = metadata.attributes.find(attr => attr.trait_type === 'Element');
                const stanceAttr = metadata.attributes.find(attr => attr.trait_type === 'Stance');
                const rankAttr = metadata.attributes.find(attr => attr.trait_type === 'Rank');

                // Create tagline from actual traits
                let tagline = rankAttr ? `${rankAttr.value} ninja cat` : "Master ninja cat";

                if (elementAttr && weaponAttr) {
                    tagline = `${elementAttr.value} ${weaponAttr.value} specialist`;
                } else if (elementAttr) {
                    tagline = `Master of ${elementAttr.value} arts`;
                } else if (weaponAttr) {
                    tagline = `${weaponAttr.value} wielding warrior`;
                }

                // Add stance to tagline if available
                if (stanceAttr) {
                    tagline += ` • ${stanceAttr.value} stance`;
                }

                // Add special trait to tagline if present
                if (specialTrait) {
                    tagline += ` • ${specialTrait.trait_type}: ${specialTrait.value}`;
                }

                // Add mythic trait to tagline with special formatting
                if (mythicTrait) {
                    tagline += ` • 🌟 ${mythicTrait.trait_type}: ${mythicTrait.value} 🌟`;
                }

                // Check if we have ninja_data.backstory.name to use as title
                if (metadata.ninja_data && metadata.ninja_data.backstory && metadata.ninja_data.backstory.name) {
                    tagline = metadata.ninja_data.backstory.name + " • " + tagline;
                }

                safeSetTextContent('catTagline', tagline);

                // Set rarity information from metadata
                if (metadata.ninja_data && metadata.ninja_data.rarity) {
                    const rarityData = metadata.ninja_data.rarity;
                    safeSetTextContent('catRarityScore', `${rarityData.score}/100`);

                    // Set rarity badge
                    const rarityTier = rarityData.tier;
                    safeUpdateElement('rarityBadge', el => {
                        el.textContent = rarityTier;
                        el.className = `rarity-badge ${getRarityClass(rarityTier)}`;
                    });
                } else {
                    // Fallback rarity detection from attributes
                    const rarityAttr = metadata.attributes.find(attr =>
                        attr.trait_type === "Rarity" ||
                        attr.trait_type === "Rank"
                    );

                    if (rarityAttr) {
                        safeSetTextContent('catRarityScore', `${rarityAttr.value}/100`);
                        safeUpdateElement('rarityBadge', el => {
                            el.textContent = rarityAttr.value;
                            el.className = `rarity-badge ${getRarityClass(rarityAttr.value)}`;
                        });
                    }
                }

                // Group attributes by category for better organization
                const combatStats = metadata.attributes.filter(attr =>
                    ['Agility', 'Stealth', 'Power', 'Intelligence'].includes(attr.trait_type)
                );

                const coreTraits = metadata.attributes.filter(attr =>
                    ['Breed', 'Weapon', 'Element', 'Stance', 'Rank', 'Accessory'].includes(attr.trait_type)
                );

                const specialTraits = metadata.attributes.filter(attr =>
                    attr.rarity === 'Unique' ||
                    attr.rarity === 'Mythic' ||
                    ['Technique', 'Skill', 'Move', 'Style', 'Secret', 'Ability', 'Power', 'Mastery', 'Blessing', 'Title'].includes(attr.trait_type)
                );

                // Display all core attributes
                safeUpdateElement('attributesGrid', el => {
                    el.innerHTML = coreTraits
                        .filter(attr => attr.trait_type !== "Breed") // Skip breed as it's shown elsewhere
                        .map(attr => createTraitCard(attr))
                        .join('');

                    // Add any special traits at the end
                    if (specialTraits.length > 0) {
                        el.innerHTML += `<div class="attributes-divider"><span>Special Traits</span></div>`;
                        el.innerHTML += specialTraits
                            .map(attr => createTraitCard(attr))
                            .join('');
                    }
                });

                // Display combat stats
                safeUpdateElement('combatSkillsGrid', el => {
                    // Use combat_stats from ninja_data if available, otherwise use attributes
                    if (metadata.ninja_data && metadata.ninja_data.combat_stats) {
                        const stats = metadata.ninja_data.combat_stats;
                        const combatStatsArray = [
                            { trait_type: 'Agility', value: stats.agility || 5, display_type: "number" },
                            { trait_type: 'Stealth', value: stats.stealth || 5, display_type: "number" },
                            { trait_type: 'Power', value: stats.power || 5, display_type: "number" },
                            { trait_type: 'Intelligence', value: stats.intelligence || 5, display_type: "number" }
                        ];

                        el.innerHTML = combatStatsArray
                            .map(stat => {
                                // Convert stat value to percentage for display
                                const percentage = Math.min(100, stat.value * 10);
                                return `
                                <div class="attribute-card">
                                    <div class="attribute-type">${stat.trait_type}</div>
                                    <div class="attribute-value">${stat.value}/10</div>
                                    <div class="skill-bar">
                                        <div class="skill-progress" style="width: ${percentage}%"></div>
                                    </div>
                                </div>
                                `;
                            })
                            .join('');
                    } else if (combatStats.length > 0) {
                        // Use combat stats from attributes
                        el.innerHTML = combatStats
                            .map(stat => createTraitCard(stat, false))
                            .join('');
                    } else {
                        // Generate default combat stats
                        el.innerHTML = `
                            <div class="attribute-card">
                                <div class="attribute-type">Agility</div>
                                <div class="attribute-value">5/10</div>
                                <div class="skill-bar">
                                    <div class="skill-progress" style="width: 50%"></div>
                                </div>
                            </div>
                            <div class="attribute-card">
                                <div class="attribute-type">Stealth</div>
                                <div class="attribute-value">5/10</div>
                                <div class="skill-bar">
                                    <div class="skill-progress" style="width: 50%"></div>
                                </div>
                            </div>
                            <div class="attribute-card">
                                <div class="attribute-type">Power</div>
                                <div class="attribute-value">5/10</div>
                                <div class="skill-bar">
                                    <div class="skill-progress" style="width: 50%"></div>
                                </div>
                            </div>
                            <div class="attribute-card">
                                <div class="attribute-type">Intelligence</div>
                                <div class="attribute-value">5/10</div>
                                <div class="skill-bar">
                                    <div class="skill-progress" style="width: 50%"></div>
                                </div>
                            </div>
                        `;
                    }
                });

                // Display backstory if available in ninja_data
                if (metadata.ninja_data && metadata.ninja_data.backstory) {
                    const backstory = metadata.ninja_data.backstory;

                    if (backstory.origin) {
                        safeSetTextContent('catStoryPart1', backstory.origin);
                    }

                    if (backstory.training) {
                        safeSetTextContent('catStoryPart2', backstory.training);
                    }

                    if (backstory.currentRole) {
                        safeSetTextContent('catStoryPart3', backstory.currentRole);
                    }
                } else if (metadata.description) {
                    // If no structured backstory, use the description field
                    // Split the description into paragraphs
                    const paragraphs = metadata.description.split('. ');

                    if (paragraphs.length >= 3) {
                        // If we have at least 3 sentences, split them into 3 parts
                        const third = Math.floor(paragraphs.length / 3);

                        safeSetTextContent('catStoryPart1', paragraphs.slice(0, third).join('. ') + '.');
                        safeSetTextContent('catStoryPart2', paragraphs.slice(third, third * 2).join('. ') + '.');
                        safeSetTextContent('catStoryPart3', paragraphs.slice(third * 2).join('. '));
                    } else {
                        // If fewer than 3 paragraphs, use what we have
                        safeSetTextContent('catStoryPart1', paragraphs[0] + '.');
                        if (paragraphs.length > 1) {
                            safeSetTextContent('catStoryPart2', paragraphs[1] + '.');
                            safeSetTextContent('catStoryPart3', paragraphs.slice(2).join('. '));
                        } else {
                            safeSetTextContent('catStoryPart2', 'Through years of disciplined training, this ninja cat mastered the ancient arts of stealth and combat.');
                            safeSetTextContent('catStoryPart3', 'Now a formidable warrior, they protect the blockchain realm from threats seen and unseen.');
                        }
                    }
                }

                // Display special abilities from ninja_data if available
                if (metadata.ninja_data && metadata.ninja_data.special_abilities && metadata.ninja_data.special_abilities.length > 0) {
                    safeUpdateElement('specialAbilities', el => {
                        el.innerHTML = metadata.ninja_data.special_abilities
                            .map(ability => `<li>${ability}</li>`)
                            .join('');
                    });
                } else if (specialTrait || mythicTrait) {
                    // Generate special abilities based on special/mythic traits
                    safeUpdateElement('specialAbilities', el => {
                        let abilities = [];

                        if (specialTrait) {
                            abilities.push(`<li><strong>${specialTrait.trait_type}:</strong> ${specialTrait.value} - A rare technique mastered by only the most skilled ninja cats.</li>`);
                        }

                        if (mythicTrait) {
                            abilities.push(`<li><strong>${mythicTrait.trait_type}:</strong> ${mythicTrait.value} - An ancient mystical power bestowed upon the chosen feline warriors.</li>`);
                        }

                        if (elementAttr) {
                            abilities.push(`<li><strong>${elementAttr.value} Mastery</strong> - Complete control over the ${elementAttr.value.toLowerCase()} element.</li>`);
                        }

                        if (weaponAttr) {
                            abilities.push(`<li><strong>${weaponAttr.value} Expertise</strong> - Unmatched skill with the ${weaponAttr.value.toLowerCase()}.</li>`);
                        }

                        el.innerHTML = abilities.join('');
                    });
                } else {
                    // Default special abilities
                    safeUpdateElement('specialAbilities', el => {
                        el.innerHTML = `
                            <li>Silent Paws - Can move without making a sound</li>
                            <li>Night Vision - Can see perfectly in the darkness</li>
                            <li>Quick Reflexes - Able to dodge attacks with supernatural speed</li>
                        `;
                    });
                }
            }

            // Set owner information
            safeSetTextContent('catOwner', formatAddress(owner));

            // Setup copy owner address
            document.querySelector('.copy-address').addEventListener('click', function () {
                copyToClipboard(owner);
            });

            // Get transaction history
            let transactions = null;
            if (provider) {
                transactions = await fetchTokenHistory(provider, id, CONTRACT);
            }

            // Update transaction history section
            safeUpdateElement('transactionList', el => {
                if (transactions && transactions.length > 0) {
                    // Real transaction history
                    const txListHTML = transactions.map(tx => `
                        <li class="transaction-item">
                            <div>
                                <span class="tx-type ${tx.type.toLowerCase() === 'mint' ? 'tx-mint' : 'tx-transfer'}">${tx.type}</span>
                                <a href="${EXPLORER_URL}/tx/${tx.hash}" class="tx-hash" target="_blank">
                                    ${tx.hash.substring(0, 6)}...${tx.hash.substring(tx.hash.length - 4)}
                                </a>
                                <span style="font-size: 0.8rem; color: #9e9e9e; margin-left: 0.5rem;">
                                    ${tx.type === 'Mint' ? '' : `${formatAddress(tx.from)} → ${formatAddress(tx.to)}`}
                                </span>
                            </div>
                            <span class="tx-date">${tx.timestamp ? formatDate(tx.timestamp) : 'Unknown date'}</span>
                        </li>
                    `).join('');

                    el.innerHTML = txListHTML;

                    // Update mint date if we have it
                    if (transactions[0] && transactions[0].timestamp) {
                        safeSetTextContent('mintDate', formatDate(transactions[0].timestamp));
                    } else {
                        safeSetTextContent('mintDate', formatDate());
                    }
                } else {
                    // Fallback to placeholder
                    const txHash = "0x" + parseInt(id).toString(16).padStart(8, '0') + "..." + (parseInt(id) * 2).toString(16).padStart(4, '0');
                    el.innerHTML = `
                        <li class="transaction-item">
                            <div>
                                <span class="tx-type tx-mint">Mint</span>
                                <a href="${EXPLORER_URL}/tx/${txHash}" class="tx-hash" target="_blank">${txHash}</a>
                            </div>
                            <span class="tx-date">${formatDate()}</span>
                        </li>
                    `;
                    safeSetTextContent('mintDate', formatDate());
                }
            });

            // Set up Explorer button
            safeUpdateElement('viewOnExplorerBtn', el => {
                el.addEventListener('click', function () {
                    window.open(`${EXPLORER_URL}/token/${CONTRACT}/instance/${id}`, '_blank');
                });
            });

            // Set up sharing functionality
            setupSharing(metadata, id);

            // Animate skill bars after a short delay
            setTimeout(animateSkillBars, 500);

        } catch (error) {
            console.error("Error fetching NFT data:", error);
            safeUpdateElement('loadingState', el => {
                el.innerHTML = `
                    <div style="text-align: center; padding: 2rem;">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ff3366" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <path d="M15 9L9 15M9 9L15 15"></path>
                        </svg>
                        <h3 style="color: #ffffff; margin-top: 1rem;">Couldn't load ninja cat #${id}</h3>
                        <p style="color: #b0b0b0;">There was an error retrieving this ninja cat from the blockchain.</p>
                        <p style="color: #9e9e9e; font-size: 0.9rem; margin-top: 1rem;">${error.message}</p>
                        <a href="my-kitties.html" class="action-btn" style="display: inline-block; margin-top: 1.5rem; padding: 0.75rem 1.5rem; background: #2c2c2e; color: #e0e0e0; border-radius: 8px; text-decoration: none; box-shadow: 0 4px 8px rgba(0,0,0,0.3);">
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