/* global ethers, Chart */

// Import centralized utilities
import { formatDate, formatAddress } from './utils/formatters.js';

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

// Show a toast message with enhanced styling and animation
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    // Set type-specific styling
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.classList.add('visible');

    setTimeout(() => {
        toast.classList.remove('visible');
    }, duration);
}

// Copy text to clipboard with enhanced feedback
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');

        // Trigger confetti effect for a fun interaction
        if (window.confetti) {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        }
    } catch (err) {
        console.error('Failed to copy: ', err);
        showToast('Failed to copy to clipboard', 'error');
    }
}

// Download image from URL with progress feedback
async function downloadImage(url, filename) {
    try {
        showToast('Starting download...', 'info');

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
        showToast('Image downloaded successfully!', 'success');
    } catch (error) {
        console.error('Error downloading image:', error);
        showToast('Failed to download image', 'error');
    }
}

// Fetch transaction history for a token with enhanced details
async function fetchTokenHistory(provider, tokenId, contractAddress) {
    try {
        // Define the Transfer event signature
        const transferEventSignature = 'Transfer(address,address,uint256)';
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

        // Format the logs into usable transactions with enhanced details
        const transactions = await Promise.all(logs.map(async (log) => {
            const block = await provider.getBlock(log.blockNumber);
            const tx = await provider.getTransaction(log.transactionHash);

            // Get gas price and estimate cost
            const gasCost = tx ? (tx.gasPrice * tx.gasLimit) : null;
            const gasCostEth = gasCost ? ethers.formatEther(gasCost) : 'Unknown';

            return {
                type: log.topics[1] === '0x0000000000000000000000000000000000000000000000000000000000000000'
                    ? 'Mint' : 'Transfer',
                hash: log.transactionHash,
                blockNumber: log.blockNumber,
                timestamp: block ? block.timestamp : null,
                from: ethers.dataSlice(log.topics[1], 12), // format from address
                to: ethers.dataSlice(log.topics[2], 12),   // format to address
                gasCost: gasCostEth,
                confirmations: block ? await provider.getBlockNumber() - block.number : 0
            };
        }));

        // Sort by block number ascending
        return transactions.sort((a, b) => a.blockNumber - b.blockNumber);
    } catch (error) {
        console.error('Error fetching token history:', error);
        return null;
    }
}

// Set up enhanced sharing functionality with more platforms
function setupSharing(metadata, tokenId) {
    // Get the current URL without query parameters
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?id=${tokenId}`;
    const nftName = metadata?.name || `Pixel Ninja Cat #${tokenId}`;
    const description = metadata?.description || 'Check out my awesome Ninja Cat NFT!';
    const imageUrl = metadata?.image || '';

    // Set up Twitter share with enhanced content
    safeUpdateElement('shareTwitter', el => {
        el.addEventListener('click', () => {
            const traits = metadata?.attributes?.map(a => a.trait_type === 'Element' || a.trait_type === 'Weapon' ? `#${a.value.replace(/\s/g, '')}` : '').filter(Boolean).join(' ');
            const tweetText = encodeURIComponent(`Check out my ${nftName} NFT! ${traits} #PixelNinjaCats #NFT #Vitruveo`);
            const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`;
            window.open(twitterUrl, '_blank');
        });
    });

    // Set up Discord share with enhanced formatting
    safeUpdateElement('shareDiscord', el => {
        el.addEventListener('click', () => {
            const rarity = metadata?.ninja_data?.rarity?.tier || '';
            const discordText = `**${nftName}** ${rarity ? `[${rarity}]` : ''}\n${description}\n${shareUrl}`;
            copyToClipboard(discordText);
            showToast('Discord message copied! Paste it in your Discord chat.', 'success');
        });
    });

    // Add new Telegram share
    safeUpdateElement('shareTelegram', el => {
        if (el) {
            el.addEventListener('click', () => {
                const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(`Check out my ${nftName} NFT!`)}`;
                window.open(telegramUrl, '_blank');
            });
        }
    });

    // Add WhatsApp share
    safeUpdateElement('shareWhatsApp', el => {
        if (el) {
            el.addEventListener('click', () => {
                const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Check out my ${nftName} NFT! ${shareUrl}`)}`;
                window.open(whatsappUrl, '_blank');
            });
        }
    });

    // Set up link copy with visual feedback
    safeUpdateElement('copyLink', el => {
        el.addEventListener('click', () => {
            copyToClipboard(shareUrl);

            // Add visual feedback
            el.classList.add('copied');
            setTimeout(() => el.classList.remove('copied'), 1000);
        });
    });

    // Generate QR Code if the library is available
    if (window.QRCode) {
        const qrCodeContainer = document.getElementById('qrCodeContainer');
        if (qrCodeContainer) {
            try {
                // First check if QRCode is actually a constructor function
                if (typeof QRCode === 'function') {
                    // Different QR libraries have different APIs
                    const options = {
                        text: shareUrl,
                        width: 128,
                        height: 128,
                        colorDark: '#8a65ff',
                        colorLight: '#ffffff'
                    };

                    new QRCode(qrCodeContainer, options);

                    // Add download QR code button
                    const downloadQrBtn = document.getElementById('downloadQrBtn');
                    if (downloadQrBtn) {
                        downloadQrBtn.addEventListener('click', () => {
                            const canvas = qrCodeContainer.querySelector('canvas');
                            if (canvas) {
                                const link = document.createElement('a');
                                link.href = canvas.toDataURL('image/png');
                                link.download = `${nftName.replace(/\s/g, '_')}_QR.png`;
                                link.click();
                            }
                        });
                    }
                } else {
                    // QRCode exists but is not a constructor
                    throw new Error('QRCode is not properly initialized');
                }
            } catch (err) {
                console.error('QR code generation failed:', err);

                // Create a simple fallback QR code display
                qrCodeContainer.innerHTML = `
                <div class="fallback-qr">
                    <p>Direct link to this NFT:</p>
                    <a href="${shareUrl}" target="_blank">${shareUrl}</a>
                </div>
            `;

                // Hide the download button since we don't have a canvas
                const downloadQrBtn = document.getElementById('downloadQrBtn');
                if (downloadQrBtn) {
                    downloadQrBtn.style.display = 'none';
                }
            }
        }
    } else {
        // QRCode library not available at all
        const qrCodeContainer = document.getElementById('qrCodeContainer');
        if (qrCodeContainer) {
            qrCodeContainer.innerHTML = `
            <div class="fallback-qr">
                <p>Direct link to this NFT:</p>
                <a href="${shareUrl}" target="_blank">${shareUrl}</a>
            </div>
        `;

            // Hide the download button
            const downloadQrBtn = document.getElementById('downloadQrBtn');
            if (downloadQrBtn) {
                downloadQrBtn.style.display = 'none';
            }
        }
    }

    // Main share button with native sharing if available
    safeUpdateElement('shareBtn', el => {
        el.addEventListener('click', function () {
            if (navigator.share) {
                navigator.share({
                    title: nftName,
                    text: description,
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

// Set up regeneration modal and functionality
function setupRegenerationInterface(tokenId) {
    const regenerateBtn = document.getElementById('regenerateBtn');
    const regenerateModal = document.getElementById('regenerateModal');
    const closeRegenerateModal = document.getElementById('closeRegenerateModal');
    const confirmRegenerateBtn = document.getElementById('confirmRegenerateBtn');
    const cancelBtn = document.getElementById('cancelRegenerateBtn');
    const CONTRACT = '0x2D732b0Bb33566A13E586aE83fB21d2feE34e906';

    if (!regenerateBtn || !regenerateModal) return;

    // First check if current user is the owner and show/hide regenerate button accordingly
    async function checkOwnershipAndUpdateUI() {
        try {
            // Default to hiding the button until ownership is confirmed
            regenerateBtn.style.display = 'none';

            // Check if wallet is connected
            if (typeof window.ethereum === 'undefined') {
                console.log('No wallet detected');
                return;
            }

            // Get current user address
            let accounts = [];
            try {
                accounts = await window.ethereum.request({ method: 'eth_accounts' });
                if (accounts.length === 0) {
                    console.log('No connected accounts');
                    return;
                }
            } catch (err) {
                console.log('Error getting accounts:', err);
                return;
            }

            const userAddress = accounts[0].toLowerCase();

            // Get NFT owner from contract
            try {
                const provider = new ethers.JsonRpcProvider('https://rpc.vitruveo.xyz');
                const nftContract = new ethers.Contract(CONTRACT, ['function ownerOf(uint256) view returns (address)'], provider);
                const ownerAddress = (await nftContract.ownerOf(tokenId)).toLowerCase();

                console.log(`Current user: ${userAddress}`);
                console.log(`NFT owner: ${ownerAddress}`);

                // Only show regenerate button if user is the owner
                regenerateBtn.style.display = userAddress === ownerAddress ? 'inline-flex' : 'none';
            } catch (err) {
                console.error('Error checking NFT ownership:', err);
            }
        } catch (err) {
            console.error('Error in ownership check:', err);
        }
    }

    // Run the ownership check when setting up the interface
    checkOwnershipAndUpdateUI();

    // Check again if account changes
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', checkOwnershipAndUpdateUI);
        window.ethereum.on('chainChanged', checkOwnershipAndUpdateUI);
    }

    // Open regeneration modal
    regenerateBtn.addEventListener('click', () => {
        regenerateModal.style.display = 'block';
        document.getElementById('tokenIdDisplay').textContent = tokenId;

        // Reset any previous status
        const statusEl = document.getElementById('regenerateStatus');
        if (statusEl) statusEl.style.display = 'none';

        // Reset form inputs
        const promptEl = document.getElementById('regeneratePrompt');
        const negativePromptEl = document.getElementById('regenerateNegativePrompt');
        if (promptEl) promptEl.value = '';
        if (negativePromptEl) negativePromptEl.value = '';
    });

    // Close modal buttons
    if (closeRegenerateModal) {
        closeRegenerateModal.addEventListener('click', () => {
            regenerateModal.style.display = 'none';
        });
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            regenerateModal.style.display = 'none';
        });
    }

    // Close on outside click
    window.addEventListener('click', (e) => {
        if (e.target === regenerateModal) {
            regenerateModal.style.display = 'none';
        }
    });

    // Handle provider selection changes - update preview style
    const providerSelect = document.getElementById('regenerateProvider');
    if (providerSelect) {
        providerSelect.addEventListener('change', () => {
            const provider = providerSelect.value;
            const previewBox = document.getElementById('stylePreview');

            if (previewBox) {
                // Update preview style based on selected provider
                previewBox.className = 'style-preview';
                previewBox.classList.add(`style-${provider}`);

                // Update preview text
                const styleDesc = document.getElementById('styleDescription');
                if (styleDesc) {
                    switch (provider) {
                        case 'dall-e':
                            styleDesc.textContent = 'OpenAI DALL-E 3: Hyper-realistic, detailed art style';
                            break;
                        case 'stability':
                            styleDesc.textContent = 'Stability AI: Dreamlike, artistic style with vibrant colors';
                            break;
                        case 'huggingface':
                            styleDesc.textContent = 'Hugging Face: Anime-inspired, cartoon style';
                            break;
                        default:
                            styleDesc.textContent = 'Select a style to see preview';
                    }
                }
            }
        });
    }

    // Confirm regeneration button
    if (confirmRegenerateBtn) {
        confirmRegenerateBtn.addEventListener('click', async () => {
            try {
                // Get form values
                const provider = document.getElementById('regenerateProvider').value;
                const promptExtras = document.getElementById('regeneratePrompt').value || '';
                const negativePrompt = document.getElementById('regenerateNegativePrompt').value || '';

                // Update UI to show processing
                const statusEl = document.getElementById('regenerateStatus');
                const statusTextEl = document.getElementById('regenerateStatusText');
                confirmRegenerateBtn.disabled = true;
                confirmRegenerateBtn.textContent = 'Processing...';

                if (statusEl && statusTextEl) {
                    statusEl.style.display = 'block';
                    statusTextEl.innerHTML = '<div class="loading-spinner"></div>Initiating payment transaction...';
                }

                // Validate inputs
                if (!provider) {
                    throw new Error('Please select an art style');
                }

                // First handle the USDC payment
                try {
                    // Check if MetaMask is installed
                    if (typeof window.ethereum === 'undefined') {
                        throw new Error('MetaMask or compatible wallet not found. Please install it to continue.');
                    }

                    // Request account access
                    statusTextEl.innerHTML = '<div class="loading-spinner"></div>Connecting to wallet...';
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                    if (accounts.length === 0) {
                        throw new Error('No accounts found. Please connect your wallet.');
                    }
                    const userAddress = accounts[0];

                    // Get the web3 provider - using ethers v6 syntax
                    const web3Provider = new ethers.BrowserProvider(window.ethereum);
                    const signer = await web3Provider.getSigner();

                    // VERIFY OWNERSHIP - Critical security check
                    statusTextEl.innerHTML = '<div class="loading-spinner"></div>Verifying ownership...';
                    try {
                        const nftContract = new ethers.Contract(CONTRACT, ['function ownerOf(uint256) view returns (address)'], web3Provider);
                        const ownerAddress = (await nftContract.ownerOf(tokenId)).toLowerCase();

                        if (userAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
                            throw new Error('You are not the owner of this NFT. Only the owner can regenerate this NFT.');
                        }

                        console.log('Ownership verified:', userAddress.toLowerCase() === ownerAddress.toLowerCase());
                    } catch (ownerError) {
                        console.error('Ownership verification failed:', ownerError);
                        throw new Error('Ownership verification failed. Only the owner can regenerate this NFT.');
                    }

                    // Import config values
                    const { USDC_ADDRESS, REGENERATION_FEE_RECIPIENT, REGENERATION_FEE_AMOUNT } = await import('./config.js');

                    // Calculate the amount in wei (USDC has 6 decimals)
                    const AMOUNT = ethers.parseUnits(REGENERATION_FEE_AMOUNT, 6);

                    // USDC ABI for the transfer function
                    const usdcAbi = [
                        'function transfer(address to, uint256 value) returns (bool)',
                        'function balanceOf(address owner) view returns (uint256)'
                    ];

                    const usdcContract = new ethers.Contract(USDC_ADDRESS, usdcAbi, signer);

                    // Check USDC balance
                    statusTextEl.innerHTML = '<div class="loading-spinner"></div>Checking USDC balance...';
                    const balance = await usdcContract.balanceOf(userAddress);
                    if (balance < AMOUNT) {
                        throw new Error(`Insufficient USDC balance. You need at least ${REGENERATION_FEE_AMOUNT} USDC.`);
                    }

                    // Send the transaction
                    statusTextEl.innerHTML = '<div class="loading-spinner"></div>Sending payment transaction...';
                    const tx = await usdcContract.transfer(REGENERATION_FEE_RECIPIENT, AMOUNT);

                    // Wait for confirmation
                    statusTextEl.innerHTML = '<div class="loading-spinner"></div>Confirming payment transaction...';
                    await tx.wait();

                    // Payment successful, now proceed with regeneration
                    statusTextEl.innerHTML = '<div class="success-icon">✓</div>Payment successful! Initiating regeneration...';

                    // Get breed from page if available
                    const breedEl = document.getElementById('catBreed');
                    const breed = breedEl ? breedEl.textContent : 'Tabby';

                    // Create task through the new API endpoint
                    statusTextEl.innerHTML = '<div class="loading-spinner"></div>Creating regeneration task...';

                    const response = await fetch('/api/regenerate', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            tokenId: tokenId,
                            imageProvider: provider,
                            breed: breed,
                            promptExtras: promptExtras || undefined,
                            negativePrompt: negativePrompt || undefined,
                            paymentTx: tx.hash,
                            payer: userAddress
                        })
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to start regeneration process');
                    }

                    const responseData = await response.json();
                    const { taskId } = responseData;

                    if (!taskId) {
                        throw new Error('No task ID returned from server');
                    }

                    statusTextEl.innerHTML = '<div class="loading-spinner"></div>Request accepted! Monitoring progress...';

                    // Start polling for status with the new task system
                    await pollTaskStatus(taskId, statusTextEl);

                } catch (paymentError) {
                    console.error('Payment failed:', paymentError);
                    throw new Error(`Payment failed: ${paymentError.message || 'Unknown error'}`);
                }
            } catch (error) {
                console.error('Regeneration failed:', error);
                const statusTextEl = document.getElementById('regenerateStatusText');
                if (statusTextEl) {
                    statusTextEl.innerHTML = `<div class="error-icon">❌</div> Error: ${error.message}`;
                }
                showToast(error.message, 'error');
            } finally {
                // Re-enable button
                confirmRegenerateBtn.disabled = false;
                // Using dynamic import to get REGENERATION_FEE_AMOUNT
                const { REGENERATION_FEE_AMOUNT } = await import('./config.js').catch(() => ({ REGENERATION_FEE_AMOUNT: '5' }));
                confirmRegenerateBtn.textContent = `Pay ${REGENERATION_FEE_AMOUNT} USDC & Regenerate`;
            }
        });
    }
}

// Updated polling function for task status
async function pollTaskStatus(taskId, statusElement) {
    let completed = false;
    let attempts = 0;
    const maxAttempts = 300; // 5 minutes at 1-second intervals

    // Add status tracking variables
    let lastProgress = 0;
    let lastStatus = '';
    let lastImageUpdate = null;

    const checkTaskStatus = async () => {
        if (attempts >= maxAttempts) {
            console.warn(`⏰ Task polling timeout after ${maxAttempts} attempts`);
            if (statusElement) {
                statusElement.innerHTML = '<div class="warning-icon">⚠️</div>Process is taking longer than expected. Check back later to see your regenerated NFT.';

                // Add refresh button
                const refreshBtn = document.createElement('button');
                refreshBtn.className = 'action-btn';
                refreshBtn.textContent = 'Refresh Page';
                refreshBtn.style.marginTop = '10px';
                refreshBtn.onclick = () => window.location.reload();

                statusElement.appendChild(refreshBtn);
            }
            return;
        }

        attempts++;

        try {
            // Try multiple API endpoints for resilience
            let response = null;
            const endpoints = [
                `/api/task-status?id=${taskId}`,
                `/api/task-status/${taskId}`,
                `/api/tasks/${taskId}`,
                `/api/status/${taskId}`
            ];

            for (const endpoint of endpoints) {
                try {
                    console.log(`Trying endpoint: ${endpoint}`);
                    const resp = await fetch(endpoint);
                    if (resp.ok) {
                        response = resp;
                        break;
                    }
                } catch (err) {
                    console.warn(`Failed endpoint ${endpoint}:`, err);
                }
            }

            if (!response) {
                throw new Error('Failed to get task status from any endpoint');
            }

            const taskData = await response.json();
            console.log('Task status update:', taskData);

            // Make status check case-insensitive
            const status = (taskData.status || taskData.state || '').toUpperCase();
            const progress = taskData.progress || 0;
            const message = taskData.message || 'Processing...';

            // Only update if something changed
            if (status !== lastStatus || progress !== lastProgress) {
                lastStatus = status;
                lastProgress = progress;

                // Update status message with progress
                let statusMsg = '';

                switch (status) {
                    case 'PROCESSING':
                    case 'IN_PROGRESS':
                        statusMsg = `<div class="loading-spinner"></div>${message} - ${progress}%`;
                        break;
                    case 'COMPLETED':
                        statusMsg = '<div class="success-icon">✓</div>Image regenerated successfully!';
                        completed = true;

                        // If we have a token_uri in the response, show the new image
                        if (taskData.token_uri) {
                            try {
                                // Show loading state for image
                                statusElement.innerHTML = '<div class="loading-spinner"></div>Fetching new image...';

                                // Extract CID from IPFS URI
                                const cid = taskData.token_uri.replace('ipfs://', '');
                                const ipfsUrl = `https://ipfs.io/ipfs/${cid}`;

                                // Fetch metadata to get the image URL
                                const metadataResponse = await fetch(ipfsUrl);
                                const metadata = await metadataResponse.json();

                                if (metadata && metadata.image) {
                                    // Convert IPFS image URL
                                    let imageUrl = metadata.image;
                                    if (imageUrl.startsWith('ipfs://')) {
                                        const imageCid = imageUrl.replace('ipfs://', '');
                                        imageUrl = `https://ipfs.io/ipfs/${imageCid}`;
                                    }

                                    // Create image preview in status area
                                    lastImageUpdate = imageUrl;
                                    statusElement.innerHTML = `
                                        <div class="success-icon">✓</div>Regeneration successful!
                                        <div class="regeneration-result">
                                            <img src="${imageUrl}" alt="Regenerated image" 
                                                 style="max-width: 100%; border-radius: 8px; margin-top: 10px;">
                                        </div>
                                    `;
                                }
                            } catch (imageError) {
                                console.error('Error fetching new image:', imageError);
                            }
                        }
                        break;
                    case 'FAILED':
                        statusMsg = `<div class="error-icon">❌</div>Failed: ${message || taskData.error || 'Unknown error'}`;
                        completed = true;
                        break;
                    default:
                        statusMsg = `<div class="loading-spinner"></div>${message} - ${progress}%`;
                }

                if (statusElement && !lastImageUpdate) {
                    statusElement.innerHTML = statusMsg;
                }

                // Update progress visually
                if (progress > 0) {
                    const progressBarContainer = document.createElement('div');
                    progressBarContainer.className = 'progress-bar-container';
                    progressBarContainer.style.width = '100%';
                    progressBarContainer.style.height = '6px';
                    progressBarContainer.style.backgroundColor = 'rgba(0,0,0,0.1)';
                    progressBarContainer.style.borderRadius = '3px';
                    progressBarContainer.style.margin = '10px 0';

                    const progressBar = document.createElement('div');
                    progressBar.style.width = `${progress}%`;
                    progressBar.style.height = '100%';
                    progressBar.style.backgroundColor = '#8a65ff';
                    progressBar.style.borderRadius = '3px';
                    progressBar.style.transition = 'width 0.3s ease';

                    progressBarContainer.appendChild(progressBar);

                    // Add after status text if not already present
                    if (!document.querySelector('.progress-bar-container')) {
                        statusElement.appendChild(progressBarContainer);
                    } else {
                        document.querySelector('.progress-bar-container div').style.width = `${progress}%`;
                    }
                }
            }

            // If completed or failed, break the loop
            if (status === 'COMPLETED' || status === 'FAILED') {
                completed = true;

                // If completed successfully and no custom image displayed yet, reload the page
                if (status === 'COMPLETED' && !lastImageUpdate) {
                    setTimeout(() => {
                        statusElement.innerHTML += '<div>Reloading page to show your new image...</div>';

                        // Reload the page after a brief delay
                        setTimeout(() => {
                            window.location.reload();
                        }, 1500);
                    }, 1000);
                } else if (lastImageUpdate) {
                    // If we have the new image, add a reload button
                    setTimeout(() => {
                        const reloadBtn = document.createElement('button');
                        reloadBtn.className = 'action-btn';
                        reloadBtn.textContent = 'Refresh Page';
                        reloadBtn.style.marginTop = '10px';
                        reloadBtn.onclick = () => window.location.reload();

                        statusElement.appendChild(reloadBtn);
                    }, 2000);
                }

                return;
            }

            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Continue polling
            if (!completed) {
                setTimeout(checkTaskStatus, 1000);
            }

        } catch (error) {
            console.error('Error polling task status:', error);

            if (statusElement) {
                statusElement.innerHTML = `<div class="warning-icon">⚠️</div>Error checking status: ${error.message}. Retrying...`;
            }

            // Wait a bit longer if there's an error
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Continue polling despite errors
            if (!completed) {
                setTimeout(checkTaskStatus, 1000);
            }
        }
    };

    // Start polling immediately
    checkTaskStatus();
}

// Animate skill bars with improved transitions
function animateSkillBars() {
    const skillBars = document.querySelectorAll('.skill-progress');

    skillBars.forEach((bar, index) => {
        const width = bar.style.width;
        bar.style.width = '0%';

        // Staggered animation for each bar
        setTimeout(() => {
            // Trigger reflow
            void bar.offsetWidth;

            // Set the final width with easing
            bar.style.transition = 'width 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            bar.style.width = width;
        }, index * 150); // Stagger each bar by 150ms
    });
}

// Get the appropriate CSS class for a rarity tier
function getRarityClass(rarity) {
    if (!rarity) return '';

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

// Get color class for specific elements with expanded elements
function getElementClass(element) {
    if (!element) return '';
    const elementLower = element.toLowerCase();

    const elementMap = {
        'fire': 'element-fire',
        'water': 'element-water',
        'earth': 'element-earth',
        'air': 'element-air',
        'wind': 'element-air',
        'void': 'element-void',
        'lightning': 'element-lightning',
        'thunder': 'element-lightning',
        'ice': 'element-ice',
        'shadow': 'element-shadow',
        'light': 'element-light',
        'cosmic': 'element-cosmic',
        'nature': 'element-nature',
        'metal': 'element-metal',
        'poison': 'element-poison',
        'psychic': 'element-psychic'
    };

    return elementMap[elementLower] || '';
}

// Format special/mythic traits with enhanced styling
function formatSpecialTrait(trait) {
    const isSpecial = trait.rarity === 'Unique';
    const isMythic = trait.rarity === 'Mythic';

    if (!isSpecial && !isMythic) return trait.value;

    if (isMythic) {
        return `<span class="mythic-trait">${trait.value}</span>
                <span class="trait-sparkle"></span>`;
    } else {
        return `<span class="special-trait">${trait.value}</span>`;
    }
}

// Generate HTML for a trait card based on trait information with improved styling
function createTraitCard(attr, showRarity = true) {
    // Get rarity from the attribute or use default
    const rarity = attr.rarity || 'Common';

    // Calculate progress width based on rarity tier
    const rarityTierScore = {
        'Common': 25,
        'Uncommon': 50,
        'Rare': 75,
        'Epic': 85,
        'Legendary': 95,
        'Mythic': 98,
        'Unique': 90
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

    // Add weapon class if needed
    const weaponClass = attr.trait_type === 'Weapon' ? 'weapon-card' : '';

    return `
    <div class="attribute-card ${specialClass} ${elementClass} ${weaponClass}" data-trait="${attr.trait_type}" data-value="${attr.value}">
        <div class="attribute-type">${attr.trait_type}</div>
        <div class="attribute-value">${isSpecial ? formatSpecialTrait(attr) : attr.value}</div>
        <div class="skill-bar">
            <div class="skill-progress" style="width: ${progressWidth}%"></div>
        </div>
        ${showRarity ? `<div class="attribute-rarity">${rarity}</div>` : ''}
    </div>
    `;
}

// Create interactive combat stats radar chart
function createCombatChart(stats) {
    const ctx = document.getElementById('combatChart');
    if (!ctx || !window.Chart) return;

    const chartData = {
        labels: ['Agility', 'Stealth', 'Power', 'Intelligence'],
        datasets: [{
            label: 'Combat Stats',
            data: [
                stats.agility || 5,
                stats.stealth || 5,
                stats.power || 5,
                stats.intelligence || 5
            ],
            backgroundColor: 'rgba(138, 101, 255, 0.5)',
            borderColor: '#8a65ff',
            borderWidth: 2,
            pointBackgroundColor: '#2775ca',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: '#8a65ff'
        }]
    };

    return new Chart(ctx, {
        type: 'radar',
        data: chartData,
        options: {
            scales: {
                r: {
                    angleLines: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    pointLabels: {
                        color: '#b0b0b0',
                        font: {
                            family: 'Poppins',
                            size: 12
                        }
                    },
                    ticks: {
                        color: '#9e9e9e',
                        backdropColor: 'transparent',
                        stepSize: 2
                    },
                    suggestedMin: 0,
                    suggestedMax: 10
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            return `${context.label}: ${context.raw}/10`;
                        }
                    }
                }
            },
            elements: {
                line: {
                    tension: 0.2
                }
            },
            animation: {
                duration: 1500,
                easing: 'easeOutQuart'
            }
        }
    });
}

// Create a timeline visualization for the NFT history
function createTimelineVisualization(transactions) {
    if (!transactions || !transactions.length) return;

    const timelineEl = document.getElementById('transactionTimeline');
    if (!timelineEl) return;

    let timelineHTML = '';

    transactions.forEach((tx, index) => {
        const isFirst = index === 0;
        const isLast = index === transactions.length - 1;
        const date = tx.timestamp ? formatDate(tx.timestamp * 1000, { style: 'medium' }) : 'Unknown date';

        timelineHTML += `
            <div class="timeline-item ${isFirst ? 'first' : ''} ${isLast ? 'last' : ''}">
                <div class="timeline-point ${tx.type.toLowerCase() === 'mint' ? 'mint' : 'transfer'}">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        ${tx.type.toLowerCase() === 'mint'
                ? '<path d="M12 2L20 7V17L12 22L4 17V7L12 2Z"></path>'
                : '<path d="M22 12H2M16 6l6 6-6 6"></path>'}
                    </svg>
                </div>
                <div class="timeline-content">
                    <div class="timeline-date">${date}</div>
                    <div class="timeline-title">
                        <span class="tx-type ${tx.type.toLowerCase() === 'mint' ? 'tx-mint' : 'tx-transfer'}">${tx.type}</span>
                        <a href="https://explorer.vitruveo.xyz/tx/${tx.hash}" class="tx-hash" target="_blank">
                            ${tx.hash.substring(0, 6)}...${tx.hash.substring(tx.hash.length - 4)}
                        </a>
                    </div>
                    <div class="timeline-details">
                        ${tx.type === 'Transfer'
                ? `<div class="transfer-addresses">
                                <span class="from-address">${formatAddress(tx.from)}</span>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#b0b0b0" stroke-width="2">
                                    <path d="M5 12h14M12 5l7 7-7 7"></path>
                                </svg>
                                <span class="to-address">${formatAddress(tx.to)}</span>
                              </div>`
                : '<div class="mint-detail">Original creation on Vitruveo</div>'
            }
                        <div class="tx-gas">Gas: ${tx.gasCost} ETH</div>
                        <div class="tx-confirmations">${tx.confirmations} confirmations</div>
                    </div>
                </div>
            </div>
        `;
    });

    timelineEl.innerHTML = timelineHTML;
}

// Create and animate visual timeline for ninja story
function createStoryTimeline(metadata) {
    const storyEl = document.getElementById('storyTimeline');
    if (!storyEl) return;

    // Extract story parts
    const backstory = metadata?.ninja_data?.backstory || {};
    const origin = backstory.origin || 'Born during the third moon of the Great Bit-Eclipse, this ninja cat showed exceptional promise from the earliest days of training.';
    const training = backstory.training || 'Years of rigorous training in the ancient art of Paw-Hash-Do forged both mind and body into the perfect infiltration instrument.';
    const currentRole = backstory.currentRole || 'Now a full-fledged Ninja, this cat specializes in network infiltration and smart contract protection.';

    storyEl.innerHTML = `
        <div class="story-timeline">
            <div class="story-point birth">
                <div class="story-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        <polyline points="9 22 9 12 15 12 15 22"></polyline>
                    </svg>
                </div>
                <div class="story-content">
                    <h4>Origins</h4>
                    <p>${origin}</p>
                </div>
            </div>
            <div class="story-point training">
                <div class="story-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                    </svg>
                </div>
                <div class="story-content">
                    <h4>Training</h4>
                    <p>${training}</p>
                </div>
            </div>
            <div class="story-point present">
                <div class="story-icon">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <div class="story-content">
                    <h4>Present Day</h4>
                    <p>${currentRole}</p>
                </div>
            </div>
        </div>
    `;

    // Animate the story timeline points
    const storyPoints = document.querySelectorAll('.story-point');
    storyPoints.forEach((point, index) => {
        setTimeout(() => {
            point.classList.add('active');
        }, 500 + (index * 700));
    });
}

// Set up 3D tilt effect for the NFT image
function setupTiltEffect() {
    const card = document.querySelector('.kitty-image-container');
    const img = document.querySelector('.kitty-image');

    if (!card || !img) return;

    card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const percentX = (e.clientX - centerX) / (rect.width / 2);
        const percentY = (e.clientY - centerY) / (rect.height / 2);

        const tiltAmount = 10; // Max tilt in degrees
        const tiltX = -percentY * tiltAmount;
        const tiltY = percentX * tiltAmount;

        card.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
        img.style.transform = 'translateZ(30px) scale(1.05)';

        // Light reflection effect
        const glare = card.querySelector('.glare');
        if (glare) {
            const glareX = 100 * (percentX + 1) / 2; // Convert to 0-100 range
            const glareY = 100 * (percentY + 1) / 2; // Convert to 0-100 range
            glare.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 60%)`;
        }
    });

    card.addEventListener('mouseleave', () => {
        card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg)';
        img.style.transform = 'translateZ(0) scale(1)';

        const glare = card.querySelector('.glare');
        if (glare) {
            glare.style.background = 'none';
        }
    });

    // Add glare effect element
    const glare = document.createElement('div');
    glare.className = 'glare';
    card.appendChild(glare);
}

// Add visual achievement badges based on metadata
function setupAchievements(metadata) {
    const achievementsEl = document.getElementById('achievements');
    if (!achievementsEl) return;

    const achievements = [];

    // Check for special rarity
    if (metadata?.ninja_data?.rarity?.tier === 'Legendary' ||
        metadata?.ninja_data?.rarity?.tier === 'Mythic') {
        achievements.push({
            name: 'Legendary Status',
            description: 'One of the rarest ninja cats in existence',
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
        });
    }

    // Check for special abilities
    if (metadata?.ninja_data?.special_abilities?.length > 0) {
        achievements.push({
            name: 'Master of Techniques',
            description: `Possesses ${metadata.ninja_data.special_abilities.length} special abilities`,
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path></svg>'
        });
    }

    // Check for combat stats
    const combatStats = metadata?.ninja_data?.combat_stats;
    if (combatStats) {
        const totalPoints = (combatStats.agility || 5) +
            (combatStats.stealth || 5) +
            (combatStats.power || 5) +
            (combatStats.intelligence || 5);

        if (totalPoints >= 28) {
            achievements.push({
                name: 'Combat Specialist',
                description: 'Elite combat skills across all disciplines',
                icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path></svg>'
            });
        }
    }

    // Check for specific element mastery
    const elementTrait = metadata?.attributes?.find(t =>
        t.trait_type === 'Element' || t.trait_type === 'Power'
    );

    if (elementTrait) {
        achievements.push({
            name: `${elementTrait.value} Master`,
            description: `Complete mastery of the ${elementTrait.value} element`,
            icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L4 12l8 3 8-3z"></path><path d="M4 12v6l8 4 8-4v-6"></path></svg>'
        });
    }

    // Render achievements
    if (achievements.length > 0) {
        let achievementsHTML = '<h3>Achievements</h3><div class="achievements-grid">';

        achievements.forEach(achievement => {
            achievementsHTML += `
                <div class="achievement">
                    <div class="achievement-icon">${achievement.icon}</div>
                    <div class="achievement-info">
                        <div class="achievement-name">${achievement.name}</div>
                        <div class="achievement-desc">${achievement.description}</div>
                    </div>
                </div>
            `;
        });

        achievementsHTML += '</div>';
        achievementsEl.innerHTML = achievementsHTML;
    }
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
        const CONTRACT = '0x2D732b0Bb33566A13E586aE83fB21d2feE34e906';
        const ABI = [
            'function tokenURI(uint256 id) view returns (string)',
            'function ownerOf(uint256 tokenId) view returns (address)'
        ];
        const EXPLORER_URL = 'https://explorer.vitruveo.xyz';

        // Fetch token data
        try {
            // Show loading state
            document.getElementById('loadingState').style.display = 'block';
            document.getElementById('kittyContent').style.display = 'none';

            let uri, owner;
            let provider;

            try {
                // Try to get data from blockchain
                provider = new ethers.JsonRpcProvider('https://rpc.vitruveo.xyz');
                const nft = new ethers.Contract(CONTRACT, ABI, provider);

                uri = await nft.tokenURI(id);
                owner = await nft.ownerOf(id);
            } catch (err) {
                console.log('Error fetching from contract, using fallback:', err);
                // Fallback to local URI
                uri = `/metadata/${id}.json`;
                owner = '0x0000000000000000000000000000000000000000'; // Placeholder
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
            console.log('Retrieved metadata:', metadata);

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

            // Setup 3D tilt effect for the image
            setupTiltEffect();

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
                let tagline = rankAttr ? `${rankAttr.value} ninja cat` : 'Master ninja cat';

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
                    tagline = metadata.ninja_data.backstory.name + ' • ' + tagline;
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
                        attr.trait_type === 'Rarity' ||
                        attr.trait_type === 'Rank'
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
                        .filter(attr => attr.trait_type !== 'Breed') // Skip breed as it's shown elsewhere
                        .map(attr => createTraitCard(attr))
                        .join('');

                    // Add any special traits at the end
                    if (specialTraits.length > 0) {
                        el.innerHTML += '<div class="attributes-divider"><span>Special Traits</span></div>';
                        el.innerHTML += specialTraits
                            .map(attr => createTraitCard(attr))
                            .join('');
                    }
                });

                // Create combat stats with radar chart
                if (metadata.ninja_data && metadata.ninja_data.combat_stats) {
                    // Render the radar chart
                    createCombatChart(metadata.ninja_data.combat_stats);

                    // Also display traditional bars for mobile users
                    safeUpdateElement('combatSkillsGrid', el => {
                        const stats = metadata.ninja_data.combat_stats;
                        const combatStatsArray = [
                            { trait_type: 'Agility', value: stats.agility || 5, display_type: 'number' },
                            { trait_type: 'Stealth', value: stats.stealth || 5, display_type: 'number' },
                            { trait_type: 'Power', value: stats.power || 5, display_type: 'number' },
                            { trait_type: 'Intelligence', value: stats.intelligence || 5, display_type: 'number' }
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
                    });
                } else if (combatStats.length > 0) {
                    // Use combat stats from attributes
                    safeUpdateElement('combatSkillsGrid', el => {
                        el.innerHTML = combatStats
                            .map(stat => createTraitCard(stat, false))
                            .join('');
                    });
                } else {
                    // Generate default combat stats
                    safeUpdateElement('combatSkillsGrid', el => {
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
                    });
                }

                // Create interactive story timeline
                createStoryTimeline(metadata);

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
                        const abilities = [];

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

                // Setup achievements based on metadata
                setupAchievements(metadata);
            }

            // Set owner information
            safeSetTextContent('catOwner', formatAddress(owner));

            // Setup copy owner address
            document.querySelector('.copy-address')?.addEventListener('click', function () {
                copyToClipboard(owner);
            });

            // Get transaction history
            let transactions = null;
            if (provider) {
                transactions = await fetchTokenHistory(provider, id, CONTRACT);
            }

            // Update transaction history section with traditional list view
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
                            <span class="tx-date">${tx.timestamp ? formatDate(tx.timestamp * 1000, { style: 'medium' }) : 'Unknown date'}</span>
                        </li>
                    `).join('');

                    el.innerHTML = txListHTML;

                    // Update mint date if we have it
                    if (transactions[0] && transactions[0].timestamp) {
                        safeSetTextContent('mintDate', formatDate(transactions[0].timestamp * 1000, { style: 'long' }));
                    } else {
                        safeSetTextContent('mintDate', formatDate(new Date(), { style: 'long' }));
                    }

                    // Also create visual timeline
                    createTimelineVisualization(transactions);

                } else {
                    // Fallback to placeholder
                    const txHash = '0x' + parseInt(id).toString(16).padStart(8, '0') + '...' + (parseInt(id) * 2).toString(16).padStart(4, '0');
                    el.innerHTML = `
                        <li class="transaction-item">
                            <div>
                                <span class="tx-type tx-mint">Mint</span>
                                <a href="${EXPLORER_URL}/tx/${txHash}" class="tx-hash" target="_blank">${txHash}</a>
                            </div>
                            <span class="tx-date">${formatDate(new Date(), { style: 'medium' })}</span>
                        </li>
                    `;
                    safeSetTextContent('mintDate', formatDate(new Date(), { style: 'long' }));
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

            // Set up regeneration interface
            setupRegenerationInterface(id);

            // Animate skill bars after a short delay
            setTimeout(animateSkillBars, 500);

        } catch (error) {
            console.error('Error fetching NFT data:', error);
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
        console.error('Fatal error:', error);
    }
});