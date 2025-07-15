/* global ethers */
import { CONTRACT_ADDRESS, USDC_ADDRESS, NFT_ABI, USDC_ABI } from './js/config.js';

const connectBtn = document.getElementById('connectBtn');
const mintBtn = document.getElementById('mintBtn');
const statusBox = document.getElementById('status');
const breedSel = document.getElementById('breed');
const priceLine = document.getElementById('price');
const priceValue = document.getElementById('priceValue') || priceLine; // Fallback if priceValue doesn't exist

let currentPrice;                                     // fetched on-chain
let account;

// Security utilities
const sanitizeHtml = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
};

const validateBreed = (breed) => {
    if (!breed || typeof breed !== 'string' || breed.length > 50) {
        throw new Error('Invalid breed selection');
    }
    return breed.replace(/[<>\"'&]/g, ''); // Remove dangerous characters
};

const validateAddress = (address) => {
    if (!address || typeof address !== 'string' || !address.startsWith('0x') || address.length !== 42) {
        throw new Error('Invalid Ethereum address');
    }
    return address;
};

// Enhanced error handling
const handleError = (error, context = '') => {
    console.error(`${context}:`, error);
    const message = error.message || 'An unexpected error occurred';
    const sanitizedMessage = sanitizeHtml(message);
    idle(`Error: ${sanitizedMessage}`);
};

// Enhanced logging with security considerations
const secureLog = (message, data = null) => {
    const timestamp = new Date().toISOString();
    if (data) {
        // Remove sensitive data before logging
        const sanitizedData = JSON.stringify(data).replace(/0x[a-fA-F0-9]{40}/g, '[ADDRESS]');
        console.log(`[${timestamp}] ${message}:`, sanitizedData);
    } else {
        console.log(`[${timestamp}] ${message}`);
    }
};

/* ─── UI helpers ───────────────────────────────── */
const busy = msg => {
    statusBox.style.display = 'block';
    statusBox.innerHTML = sanitizeHtml(msg);
    mintBtn.disabled = true;
};
const ready = msg => {
    statusBox.style.display = 'block';
    statusBox.innerHTML = sanitizeHtml(msg);
    mintBtn.disabled = false;
};
const idle = msg => {
    statusBox.style.display = 'block';
    statusBox.innerHTML = msg; // Allow some HTML for links, but sanitize elsewhere
    mintBtn.disabled = true;
};

/* ─── Fetch price from contract ─────────────────── */
async function loadPrice() {
    try {
        if (!window.ethereum) {
            throw new Error('MetaMask not found');
        }

        const provider = new ethers.BrowserProvider(window.ethereum);

        // Use full ABI from config.js
        const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);

        // Just use the global price function since we're on the old contract
        currentPrice = await nft.price();
        secureLog('Price loaded successfully', { price: ethers.formatUnits(currentPrice, 6) });

        const human = ethers.formatUnits(currentPrice, 6);

        // Update price display - handle both formats
        if (priceValue !== priceLine) {
            priceValue.textContent = `${human} USDC`;
        } else {
            priceLine.textContent = `Price: ${human} USDC`;
        }

        mintBtn.textContent = `Pay ${human} USDC & Mint`;
        ready('Ready to mint!');
    } catch (error) {
        handleError(error, 'Error loading price');
        idle('Error loading price. Please refresh.');
    }
}

/* ─── Connect wallet ────────────────────────────── */
connectBtn.onclick = async () => {
    if (!window.ethereum) return idle('MetaMask not found.');
    try {
        busy('Connecting wallet...');

        const [addr] = await window.ethereum.request({ method: 'eth_requestAccounts' });
        account = validateAddress(addr);

        connectBtn.textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
        secureLog('Wallet connected successfully');

        await loadPrice();
    } catch (error) {
        handleError(error, 'Connection error');
        idle('Failed to connect wallet.');
    }
};

/* ─── Mint flow ─────────────────────────────────── */
mintBtn.onclick = async () => {
    if (!account) return idle('Connect wallet first.');

    try {
        const breed = validateBreed(breedSel.value);

        if (!window.ethereum) {
            throw new Error('MetaMask not found');
        }

        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // Use ABIs from config.js
        const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
        const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);

        // Re-fetch price in case it changed
        currentPrice = await nft.price();
        const priceInUsdc = ethers.formatUnits(currentPrice, 6);

        secureLog('Starting mint process', { breed, price: priceInUsdc });

        /* 1️⃣ Approve if needed */
        busy(`Approving ${priceInUsdc} USDC…`);
        const allowance = await usdc.allowance(account, CONTRACT_ADDRESS);
        if (allowance < currentPrice) {
            const tx = await usdc.approve(CONTRACT_ADDRESS, currentPrice);
            await tx.wait();
            secureLog('USDC approval completed');
        }

        /* 2️⃣ Buy */
        busy('Paying & minting…');
        const tx2 = await nft.buy(breed);
        await tx2.wait();

        secureLog('Mint transaction completed', { hash: tx2.hash });

        // Start polling for task completion
        const tokenId = await nft.nextTokenId() - 1n; // Get the token ID that was just minted
        
        // Show the task timeline
        showTaskTimeline();
        
        // Start polling for task status
        pollForTaskCompletion(tokenId.toString(), tx2.hash);

    } catch (error) {
        handleError(error, 'Mint error');
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    secureLog('DOM loaded, initializing mint interface');

    // Always load the price on page load (read operation doesn't require wallet)
    try {
        await loadPrice();
    } catch (error) {
        handleError(error, 'Error loading price on page load');
    }

    // Try to auto-connect if wallet is already connected
    if (window.ethereum && window.ethereum.selectedAddress) {
        try {
            account = validateAddress(window.ethereum.selectedAddress);
            connectBtn.textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
            // Price already loaded above, just update UI status
            ready('Ready to mint!');
        } catch (error) {
            handleError(error, 'Auto-connect error');
        }
    }

    // Add network change handler
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            if (accounts.length === 0) {
                account = null;
                connectBtn.textContent = 'Connect Wallet';
                idle('Please connect your wallet');
            } else {
                account = validateAddress(accounts[0]);
                connectBtn.textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
            }
        });

        window.ethereum.on('chainChanged', () => {
            window.location.reload();
        });
    }
});

// Show task timeline
function showTaskTimeline() {
    const timeline = document.getElementById('taskTimeline');
    if (timeline) {
        timeline.style.display = 'flex';
    }
}

// Update task stage status
function updateTaskStage(stage, status, message) {
    const timeline = document.getElementById('taskTimeline');
    if (!timeline) return;

    const stageElement = timeline.querySelector(`[data-stage="${stage}"]`);
    if (!stageElement) return;

    const statusElement = stageElement.querySelector('.stage-status');

    // Remove existing status classes
    stageElement.classList.remove('active', 'completed', 'failed');

    // Add new status
    stageElement.classList.add(status);

    // Update status message
    if (statusElement) {
        statusElement.textContent = message || getDefaultStageMessage(stage, status);
    }
}

// Get default stage message
function getDefaultStageMessage(stage, status) {
    const messages = {
        'art': {
            'active': 'Generating artwork...',
            'completed': 'Artwork complete!',
            'failed': 'Generation failed'
        },
        'metadata': {
            'active': 'Building metadata...',
            'completed': 'Metadata ready!',
            'failed': 'Metadata failed'
        },
        'ipfs': {
            'active': 'Uploading to IPFS...',
            'completed': 'IPFS upload complete!',
            'failed': 'Upload failed'
        },
        'tokenuri': {
            'active': 'Setting TokenURI...',
            'completed': 'TokenURI set!',
            'failed': 'TokenURI failed'
        }
    };

    return messages[stage]?.[status] || 'Processing...';
}

// Poll for task completion
function pollForTaskCompletion(tokenId, txHash) {
    let pollAttempts = 0;
    const maxPolls = 24; // Maximum polling attempts (2 minutes at 5-second intervals)
    const pollInterval = 5000; // Poll every 5 seconds
    const graceDelay = 2000; // 2 second grace period

    console.log(`🔄 Starting task polling for token ${tokenId} (after ${graceDelay / 1000}s grace period)`);

    // Show initial status
    busy('Mint confirmed! Starting NFT generation...');
    
    // Start polling after grace period
    setTimeout(() => {
        const checkTaskStatus = async () => {
            if (pollAttempts >= maxPolls) {
                console.warn(`⏰ Task polling timeout after ${maxPolls} attempts`);
                showTimeoutMessage(tokenId, txHash);
                return;
            }

            pollAttempts++;
            console.log(`📊 Polling attempt ${pollAttempts}/${maxPolls} for token ${tokenId}`);

            try {
                // Use the task status API endpoint
                const response = await fetch(`/api/task-status?id=${tokenId}`);

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }

                const data = await response.json();
                console.log('Task status response:', data);

                // Make status check case-insensitive
                const taskStatus = (data.status || data.state || '').toUpperCase();

                // Update timeline stages based on task status
                if (data.message) {
                    if (data.message.toLowerCase().includes('art') || data.message.toLowerCase().includes('generat')) {
                        updateTaskStage('art', 'active', 'Generating artwork...');
                    } else if (data.message.toLowerCase().includes('metadata') || data.message.toLowerCase().includes('trait')) {
                        updateTaskStage('art', 'completed', 'Artwork complete!');
                        updateTaskStage('metadata', 'active', 'Building metadata...');
                    } else if (data.message.toLowerCase().includes('ipfs') || data.message.toLowerCase().includes('upload')) {
                        updateTaskStage('art', 'completed', 'Artwork complete!');
                        updateTaskStage('metadata', 'completed', 'Metadata ready!');
                        updateTaskStage('ipfs', 'active', 'Uploading to IPFS...');
                    } else if (data.message.toLowerCase().includes('tokenuri') || data.message.toLowerCase().includes('finaliz')) {
                        updateTaskStage('art', 'completed', 'Artwork complete!');
                        updateTaskStage('metadata', 'completed', 'Metadata ready!');
                        updateTaskStage('ipfs', 'completed', 'IPFS upload complete!');
                        updateTaskStage('tokenuri', 'active', 'Setting TokenURI...');
                    }
                }

                // Handle completion
                if (taskStatus === 'COMPLETED') {
                    console.log('🎉 Task completed successfully!', data);

                    // Update all timeline stages to completed
                    updateTaskStage('art', 'completed', 'Artwork generated!');
                    updateTaskStage('metadata', 'completed', 'Metadata finalized!');
                    updateTaskStage('ipfs', 'completed', 'IPFS upload complete!');
                    updateTaskStage('tokenuri', 'completed', 'TokenURI set!');

                    showMintSuccess(tokenId, txHash);
                    return;
                } else if (taskStatus === 'FAILED') {
                    console.error('❌ Task failed:', data.message || data.error);
                    idle(`❌ NFT generation failed: ${data.message || 'Unknown error'}`);
                    return;
                } else if (taskStatus === 'IN_PROGRESS' || taskStatus === 'PROCESSING') {
                    busy(data.message || 'Your NFT is still processing...');
                    // Continue polling
                    setTimeout(checkTaskStatus, pollInterval);
                } else {
                    // Unknown status - continue polling with caution
                    console.warn('❓ Unknown task status:', taskStatus);
                    busy('Your NFT is still processing...');
                    setTimeout(checkTaskStatus, pollInterval * 1.5);
                }
            } catch (error) {
                console.error('❌ Error polling task status:', error);
                // Continue polling despite error, but with longer intervals
                setTimeout(checkTaskStatus, pollInterval * 2);
            }
        };

        // Start polling immediately after grace period
        checkTaskStatus();
    }, graceDelay);
}

// Show timeout message
function showTimeoutMessage(tokenId, txHash) {
    const link = txHash ? `https://explorer.vitruveo.xyz/tx/${txHash}` : '';
    idle(`⏰ Your NFT is still processing... It may take a few more minutes to generate. 
         ${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">View transaction</a>` : ''}
         ${tokenId ? `<br><a href="kitty.html?id=${tokenId}">Check NFT Status #${tokenId}</a>` : ''}`);
}

// Show mint success
function showMintSuccess(tokenId, txHash) {
    const link = txHash ? `https://explorer.vitruveo.xyz/tx/${txHash}` : '';
    idle(`🎉 Your Ninja Cat is ready! 
         ${link ? `<a href="${link}" target="_blank" rel="noopener noreferrer">View transaction</a>` : ''}
         ${tokenId ? `<br><a href="kitty.html?id=${tokenId}">View your NFT #${tokenId}</a>` : ''}`);
    
    // Show download section if available
    const downloadSection = document.getElementById('downloadSection');
    if (downloadSection) {
        downloadSection.style.display = 'block';
    }
}