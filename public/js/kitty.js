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

                // Get weapon, element for tagline
                const weaponAttr = metadata.attributes.find(attr => attr.trait_type === 'Weapon');
                const elementAttr = metadata.attributes.find(attr => attr.trait_type === 'Element');

                // Create tagline from actual traits
                let tagline = "Master ninja cat";
                if (elementAttr && weaponAttr) {
                    tagline = `${elementAttr.value} ${weaponAttr.value} specialist`;
                } else if (elementAttr) {
                    tagline = `Master of ${elementAttr.value} arts`;
                } else if (weaponAttr) {
                    tagline = `${weaponAttr.value} wielding warrior`;
                }

                // Check if we have ninja_data.backstory.name to use as title
                if (metadata.ninja_data && metadata.ninja_data.backstory && metadata.ninja_data.backstory.name) {
                    tagline = metadata.ninja_data.backstory.name + " - " + tagline;
                }

                safeSetTextContent('catTagline', tagline);

                // Set rarity information from metadata
                if (metadata.ninja_data && metadata.ninja_data.rarity) {
                    const rarityData = metadata.ninja_data.rarity;
                    safeSetTextContent('catRarityScore', `${rarityData.score}/100`);

                    // Set rarity badge
                    const rarityTier = rarityData.tier.toLowerCase();
                    safeUpdateElement('rarityBadge', el => {
                        el.textContent = rarityData.tier;
                        el.className = `rarity-badge ${rarityTier}-badge`;
                    });
                }

                // Display all attributes from metadata in the attributes grid
                safeUpdateElement('attributesGrid', el => {
                    el.innerHTML = metadata.attributes
                        .filter(attr => attr.trait_type !== "Breed") // Skip breed as it's shown elsewhere
                        .map(attr => {
                            // Use the rarity from the attribute if available
                            const rarityValue = attr.rarity || "Unknown";
                            // Calculate progress width based on rarity tier
                            const rarityTierScore = {
                                "Common": 25,
                                "Uncommon": 50,
                                "Rare": 75,
                                "Epic": 85,
                                "Legendary": 95,
                                "Mythic": 98
                            };
                            const progressWidth = rarityTierScore[rarityValue] || 50;

                            return `
                                <div class="attribute-card">
                                    <div class="attribute-type">${attr.trait_type}</div>
                                    <div class="attribute-value">${attr.value}</div>
                                    <div class="skill-bar">
                                        <div class="skill-progress" style="width: ${progressWidth}%"></div>
                                    </div>
                                    <div class="attribute-rarity">${rarityValue}</div>
                                </div>
                            `;
                        })
                        .join('');
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
                }

                // Display special abilities from ninja_data if available
                if (metadata.ninja_data && metadata.ninja_data.special_abilities && metadata.ninja_data.special_abilities.length > 0) {
                    safeUpdateElement('specialAbilities', el => {
                        el.innerHTML = metadata.ninja_data.special_abilities
                            .map(ability => `<li>${ability}</li>`)
                            .join('');
                    });
                }

                // Display combat stats from ninja_data if available
                if (metadata.ninja_data && metadata.ninja_data.combat_stats) {
                    const stats = metadata.ninja_data.combat_stats;

                    safeUpdateElement('combatSkillsGrid', el => {
                        const combatStats = [
                            { name: 'Agility', value: stats.agility || 50 },
                            { name: 'Stealth', value: stats.stealth || 50 },
                            { name: 'Power', value: stats.power || 50 },
                            { name: 'Intelligence', value: stats.intelligence || 50 }
                        ];

                        el.innerHTML = combatStats.map(stat => `
                            <div class="attribute-card">
                                <div class="attribute-type">${stat.name}</div>
                                <div class="attribute-value">${stat.value}/100</div>
                                <div class="skill-bar">
                                    <div class="skill-progress" style="width: ${stat.value}%"></div>
                                </div>
                            </div>
                        `).join('');
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