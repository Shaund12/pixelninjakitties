// Constants for contracts
const NFT_ADDRESS = '0x2D732b0Bb33566A13E586aE83fB21d2feE34e906';      // Pixel Ninja Cats
const STAKING_ADDRESS = '0x5f3F46411c3418E94dF14A64C4706CF562455064';  // NinjaCatStakingPro
const PCAT_ADDRESS = '0xF5af0a176D87A29f30be2464E780a9a020097DF5';     // ERC-20 reward
const METADATA_GATEWAY = 'https://ipfs.io/ipfs/';                      // or own gateway

// Complete staking ABI for NinjaCatStakingPro
const stakingAbi = [
    // Basic functions
    'function stakes(uint256) view returns(address owner, uint48 stakedAt, uint8 rarityTier, uint8 boostFactor, bool hasClaimedToday)',
    'function stake(uint256[] calldata)',
    'function claim(uint256[] calldata)',
    'function unstake(uint256[] calldata)',
    'function emergencyUnstake(uint256[] calldata)',
    'function applyBoost(uint256[] calldata, uint8)',

    // Read functions
    'function owner() view returns(address)',
    'function ninjaCats() view returns(address)',
    'function pcat() view returns(address)',
    'function getPendingRewards(uint256) view returns(uint256)',
    'function getPendingRewardsDetailed(uint256) view returns(uint256 baseReward, uint256 timeMultiplier, uint256 boostMultiplier, uint256 finalReward, uint256 stakingDays)',
    'function getAllPendingRewards(address) view returns(uint256)',
    'function userStats(address) view returns(uint256 totalStaked, uint256 totalRewardsClaimed, uint256 stakingSince)',
    'function getTopStakers(uint256) view returns(address[] addresses, uint256[] totals, uint256[] rewards)',
    'function getStakedTokensByUser(address) view returns(uint256[])',
    'function contractPaused() view returns(bool)',
    'function emergencyUnstakeFee() view returns(uint256)',

    // Events
    'event Staked(address indexed user, uint256 indexed tokenId, uint8 rarityTier, uint48 stakedAt, uint256 totalUserStaked)',
    'event Unstaked(address indexed user, uint256 indexed tokenId, uint48 stakedAt, uint256 stakingDuration, uint256 remainingUserStaked)',
    'event Rewarded(address indexed user, uint256 amount, uint256 indexed tokenId, uint8 rarityTier, uint256 stakingDays, uint256 timeMultiplier, uint256 boostMultiplier)',
    'event EmergencyUnstake(address indexed user, uint256 indexed tokenId, uint256 penaltyAmount, uint256 stakingDuration)'
];

const nftAbi = [
    'function balanceOf(address) view returns(uint256)',
    'function tokenOfOwnerByIndex(address,uint256) view returns(uint256)',
    'function tokenURI(uint256) view returns(string)',
    'function isApprovedForAll(address,address) view returns(bool)',
    'function setApprovalForAll(address,bool)',
    'function ownerOf(uint256) view returns(address)'
];

const pcatAbi = [
    'function balanceOf(address) view returns(uint256)',
    'function decimals() view returns(uint8)',
    'function approve(address, uint256) returns(bool)'
];

// State variables
let nftContract, stakingContract, pcatContract;
let userAddress = null;
const selectedUnstaked = new Set();
const selectedStaked = new Set();
let initialized = false;
let walletCheckInterval = null;
let contractPaused = false;
let emergencyFeePercentage = 10;

// ===== Safe DOM Element References ========================================
// This function safely gets DOM elements and won't throw if they don't exist
function getElement(id) {
    const element = document.getElementById(id);
    return element;
}

// Get UI elements safely
const connectBtn = getElement('connectBtn');
const ownedList = getElement('ownedList');
const stakedList = getElement('stakedList');
const ownedCount = getElement('ownedCount');
const stakedCount = getElement('stakedCount');
const pixBalance = getElement('pixBalance');
const pendingRewards = getElement('pendingRewards');
const stakeBtn = getElement('stakeBtn');
const unstakeBtn = getElement('unstakeBtn');
const claimBtn = getElement('claimBtn');
const emergencyUnstakeBtn = getElement('emergencyUnstakeBtn');
const boostBtn = getElement('boostBtn');
const boostCost = getElement('boostCost');
const boostSlider = getElement('boostSlider');
const boostValue = getElement('boostValue');
const totalStaked = getElement('totalStaked');
const stakingAPR = getElement('stakingAPR');
const totalRewards = getElement('totalRewards');
const leaderboardBody = getElement('leaderboardBody');
const log = getElement('log');

// ===== Wallet Integration =================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM Content loaded for stake.js');
    // Wait for wallet.js to be fully loaded before initializing
    await waitForWalletJs();

    // Update UI elements that might have been loaded after our initial check
    refreshDOMElements();

    // Override connect button's default behavior
    if (connectBtn) {
        // Remove any existing click handlers
        connectBtn.removeAttribute('onclick');
        connectBtn.onclick = async function () {
            try {
                // Check if we already have an address
                if (userAddress) {
                    return; // Already connected
                }

                // If wallet.js is loaded, use its connection function
                if (typeof window.connectWallet === 'function') {
                    logMessage('Connecting wallet...');
                    connectBtn.textContent = 'Connecting...';
                    connectBtn.disabled = true;

                    await window.connectWallet(connectBtn);

                    // Get the address from wallet.js
                    const connection = await window.getWalletConnection();
                    if (connection?.address) {
                        userAddress = connection.address;
                        await initializeContracts(connection.signer);
                    }
                } else {
                    // Fallback to direct connection if wallet.js isn't available
                    await connectWalletDirect();
                }
            } catch (error) {
                console.error('Connection error:', error);
                logMessage(`Connection error: ${error.message}`, 'error');
                if (connectBtn) {
                    connectBtn.disabled = false;
                    connectBtn.textContent = 'Connect Wallet';
                }
            }
        };
    }

    // Listen for wallet events from wallet.js
    window.addEventListener('wallet:connected', async (event) => {
        if (event.detail?.address) {
            userAddress = event.detail.address;

            if (!initialized && event.detail.signer) {
                await initializeContracts(event.detail.signer);
            }
        }
    });

    window.addEventListener('wallet:disconnected', () => {
        resetUI();
    });

    // Check if wallet is already connected from wallet.js
    try {
        const connection = await safeGetConnection();
        if (connection?.address) {
            userAddress = connection.address;
            await initializeContracts(connection.signer);
        }
    } catch (error) {
        console.warn('Could not check wallet connection:', error);
    }

    // Set up action buttons
    if (stakeBtn) stakeBtn.onclick = stakeSelected;
    if (unstakeBtn) unstakeBtn.onclick = unstakeSelected;
    if (claimBtn) claimBtn.onclick = claimRewards;
    if (emergencyUnstakeBtn) emergencyUnstakeBtn.onclick = emergencyUnstakeSelected;
    if (boostBtn) boostBtn.onclick = applyBoost;

    // Set up boost slider
    if (boostSlider) {
        boostSlider.addEventListener('input', updateBoostCost);
    }

    // Setup leaderboard refresh
    if (getElement('refreshLeaderboard')) {
        getElement('refreshLeaderboard').onclick = loadLeaderboard;
    }
});

// Re-check for UI elements that might have been loaded after initial check
function refreshDOMElements() {
    // Re-check all DOM elements that might have been loaded after our initial check
    const elements = {
        connectBtn: 'connectBtn',
        ownedList: 'ownedList',
        stakedList: 'stakedList',
        ownedCount: 'ownedCount',
        stakedCount: 'stakedCount',
        pixBalance: 'pixBalance',
        pendingRewards: 'pendingRewards',
        stakeBtn: 'stakeBtn',
        unstakeBtn: 'unstakeBtn',
        claimBtn: 'claimBtn',
        emergencyUnstakeBtn: 'emergencyUnstakeBtn',
        boostBtn: 'boostBtn',
        boostCost: 'boostCost',
        boostSlider: 'boostSlider',
        boostValue: 'boostValue',
        totalStaked: 'totalStaked',
        stakingAPR: 'stakingAPR',
        totalRewards: 'totalRewards',
        leaderboardBody: 'leaderboardBody',
        log: 'log'
    };

    // Update global variables for any elements that now exist
    for (const [variable, id] of Object.entries(elements)) {
        const element = document.getElementById(id);
        if (element) {
            window[variable] = element;
        }
    }
}

// Wait for wallet.js to be fully loaded
function waitForWalletJs() {
    return new Promise((resolve) => {
        // If wallet.js already loaded, resolve immediately
        if (typeof window.connectWallet === 'function') {
            clearInterval(walletCheckInterval);
            return resolve();
        }

        // Set up interval to check for wallet.js
        let attempts = 0;
        walletCheckInterval = setInterval(() => {
            if (typeof window.connectWallet === 'function') {
                clearInterval(walletCheckInterval);
                resolve();
            }

            attempts++;
            if (attempts > 50) { // Stop after ~5 seconds (50 * 100ms)
                clearInterval(walletCheckInterval);
                console.warn('Wallet.js not loaded after 5 seconds, continuing anyway');
                resolve();
            }
        }, 100);
    });
}

// Safely get connection from wallet.js
async function safeGetConnection() {
    if (typeof window.getWalletConnection === 'function') {
        return await window.getWalletConnection();
    }
    return null;
}

// Direct connection fallback if wallet.js is not available
async function connectWalletDirect() {
    if (window.ethereum == null) {
        throw new Error('No wallet detected! Please install MetaMask.');
    }

    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    const signer = await provider.getSigner();
    userAddress = await signer.getAddress();

    if (connectBtn) {
        connectBtn.textContent = formatAddress(userAddress);
        connectBtn.disabled = false;
        connectBtn.classList.add('connected');
    }

    await initializeContracts(signer);
}

// Format address for display
function formatAddress(address) {
    return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : '';
}

// Initialize contracts with signer
async function initializeContracts(signer) {
    if (!userAddress || !signer) return;

    try {
        refreshDOMElements(); // Make sure we have all DOM elements

        // Get provider either from wallet.js or create new one
        const provider = window.walletModule?.browserProvider ||
            new ethers.BrowserProvider(window.ethereum);

        // Initialize contracts with signer
        nftContract = new ethers.Contract(NFT_ADDRESS, nftAbi, signer);
        stakingContract = new ethers.Contract(STAKING_ADDRESS, stakingAbi, signer);
        pcatContract = new ethers.Contract(PCAT_ADDRESS, pcatAbi, signer);

        initialized = true;
        logMessage(`Connected: ${formatAddress(userAddress)}`);

        // Update UI
        if (connectBtn) {
            connectBtn.textContent = formatAddress(userAddress);
            connectBtn.classList.add('connected');
            connectBtn.disabled = false;
        }

        // Check if contract is paused
        try {
            contractPaused = await stakingContract.contractPaused();
            if (contractPaused) {
                logMessage('⚠️ Staking contract is currently paused', 'warning');
            }

            // Get emergency unstake fee
            emergencyFeePercentage = await stakingContract.emergencyUnstakeFee();
            logMessage(`Emergency unstake fee: ${emergencyFeePercentage}%`, 'info');
        } catch (e) {
            console.warn('Could not check contract status:', e);
        }

        // Load initial data
        await refreshData();

        // Set auto-refresh interval
        startAutoRefresh();
    } catch (error) {
        console.error('Failed to initialize contracts:', error);
        logMessage(`Initialization error: ${error.message}`, 'error');
        throw error;
    }
}

// Log a message to the UI
function logMessage(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);

    if (!log) return;

    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${type}`;

    const now = new Date();
    const time = now.toLocaleTimeString();

    logEntry.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-message">${message}</span>
    `;

    log.appendChild(logEntry);
    log.scrollTop = log.scrollHeight;
}

// Reset UI when wallet disconnects
function resetUI() {
    userAddress = null;
    initialized = false;
    selectedUnstaked.clear();
    selectedStaked.clear();

    // Reset UI elements - with null checks
    if (ownedCount) ownedCount.textContent = '–';
    if (stakedCount) stakedCount.textContent = '–';
    if (pixBalance) pixBalance.textContent = '–';
    if (pendingRewards) pendingRewards.textContent = '–';

    if (ownedList) ownedList.innerHTML = '<p class="empty-message">Connect wallet to view your cats</p>';
    if (stakedList) stakedList.innerHTML = '<p class="empty-message">Connect wallet to view staked cats</p>';

    if (leaderboardBody) leaderboardBody.innerHTML = '<tr><td colspan="4">Connect wallet to view leaderboard</td></tr>';

    // Reset buttons
    if (stakeBtn) stakeBtn.disabled = true;
    if (unstakeBtn) unstakeBtn.disabled = true;
    if (claimBtn) claimBtn.disabled = true;
    if (emergencyUnstakeBtn) emergencyUnstakeBtn.disabled = true;
    if (boostBtn) boostBtn.disabled = true;

    // Reset connect button
    if (connectBtn) {
        connectBtn.classList.remove('connected');
        connectBtn.textContent = 'Connect Wallet';
        connectBtn.disabled = false;
    }

    logMessage('Wallet disconnected');
}

// ===== Data Loading =======================================================
// Refresh all data
async function refreshData() {
    if (!initialized || !userAddress) return;

    try {
        refreshDOMElements(); // Refresh DOM elements references

        // Display loading states
        if (ownedList) ownedList.innerHTML = '<p class="loading">Loading your cats...</p>';
        if (stakedList) stakedList.innerHTML = '<p class="loading">Loading staked cats...</p>';

        // Load global stats
        updateGlobalStats();

        // Load leaderboard
        loadLeaderboard();

        // Load data in parallel
        await Promise.all([
            loadOwnedNFTs(),
            loadStakedNFTs(),
            loadPixBalance(),
            estimatePendingRewards()
        ]);

        updateButtonStates();
        updateBoostCost();

    } catch (error) {
        console.error('Error refreshing data:', error);
        logMessage(`Error loading data: ${error.message}`, 'error');
    }
}

// Update global statistics about staking
async function updateGlobalStats() {
    try {
        if (totalStaked) totalStaked.textContent = 'Loading...';
        if (stakingAPR) stakingAPR.textContent = 'Loading...';
        if (totalRewards) totalRewards.textContent = 'Loading...';

        // Create a read-only contract instance using the provider
        const provider = window.walletModule?.rpcProvider ||
            new ethers.JsonRpcProvider('https://rpc.vitruveo.xyz');

        const readOnlyStakingContract = new ethers.Contract(
            STAKING_ADDRESS,
            stakingAbi,  // Use the stakingAbi that includes events
            provider
        );

        try {
            // Count staked NFTs
            const stakedCount = await countTotalStakedNFTs(provider);
            if (totalStaked) totalStaked.textContent = stakedCount !== null ?
                stakedCount.toString() : '—';

            // Set APR based on FAQ (25%)
            if (stakingAPR) stakingAPR.textContent = '25%';

            // Get total rewards from events
            const totalRewardsIssued = await getTotalRewardsIssued(provider);
            if (totalRewards) totalRewards.textContent = totalRewardsIssued !== null ?
                Math.floor(totalRewardsIssued).toLocaleString() : '—';

            logMessage('Statistics updated from blockchain', 'info');
        } catch (error) {
            console.error('Error getting blockchain stats:', error);
            // Set fallback values
            if (totalStaked) totalStaked.textContent = '—';
            if (stakingAPR) stakingAPR.textContent = '25%';
            if (totalRewards) totalRewards.textContent = '—';
        }
    } catch (error) {
        console.error('Error loading global statistics:', error);

        // Set fallback values
        if (totalStaked) totalStaked.textContent = '—';
        if (stakingAPR) stakingAPR.textContent = '25%';
        if (totalRewards) totalRewards.textContent = '—';
    }
}

// Count total staked NFTs using events
async function countTotalStakedNFTs(provider) {
    try {
        // Create contract instance
        const contract = new ethers.Contract(
            STAKING_ADDRESS,
            stakingAbi,
            provider
        );

        // Get current block number
        const currentBlock = await provider.getBlockNumber();

        // Look back up to 100,000 blocks (or however many make sense for your chain)
        const fromBlock = Math.max(0, currentBlock - 100000);

        // Get stake/unstake events
        const stakedFilter = contract.filters.Staked();
        const unstakedFilter = contract.filters.Unstaked();

        const stakedEvents = await contract.queryFilter(stakedFilter, fromBlock);
        const unstakedEvents = await contract.queryFilter(unstakedFilter, fromBlock);

        // Track which NFTs are staked (accounting for unstaking)
        const stakedTokens = new Set();

        for (const event of stakedEvents) {
            stakedTokens.add(event.args.tokenId.toString());
        }

        for (const event of unstakedEvents) {
            stakedTokens.delete(event.args.tokenId.toString());
        }

        return stakedTokens.size;
    } catch (error) {
        console.error('Error counting staked NFTs:', error);
        return null;
    }
}

// Get total rewards issued
async function getTotalRewardsIssued(provider) {
    try {
        // Create contract instance
        const contract = new ethers.Contract(
            STAKING_ADDRESS,
            stakingAbi,
            provider
        );

        // Get current block
        const currentBlock = await provider.getBlockNumber();

        // Look back a reasonable number of blocks
        const fromBlock = Math.max(0, currentBlock - 100000);

        // Get reward events
        const rewardFilter = contract.filters.Rewarded();
        const rewardEvents = await contract.queryFilter(rewardFilter, fromBlock);

        // Sum up rewards
        let totalRewards = 0n; // Use BigInt for precise calculations

        for (const event of rewardEvents) {
            totalRewards += event.args.amount;
        }

        // Convert to readable number with 18 decimals
        return Number(ethers.formatUnits(totalRewards, 18));
    } catch (error) {
        console.error('Error getting total rewards:', error);
        return null;
    }
}

// Load the leaderboard data
async function loadLeaderboard() {
    if (!leaderboardBody || !initialized) return;

    leaderboardBody.innerHTML = '<tr><td colspan="4" class="loading-text">Loading leaderboard data...</td></tr>';

    try {
        // Get top 10 stakers
        const [addresses, totals, rewards] = await stakingContract.getTopStakers(10);

        if (addresses.length === 0) {
            leaderboardBody.innerHTML = '<tr><td colspan="4">No stakers found</td></tr>';
            return;
        }

        // Clear the table and add new rows
        leaderboardBody.innerHTML = '';

        addresses.forEach((address, index) => {
            // Create a new row
            const row = document.createElement('tr');

            // Highlight user's row
            if (address.toLowerCase() === userAddress.toLowerCase()) {
                row.classList.add('user-row');
            }

            // Create the rank cell
            const rankCell = document.createElement('td');
            rankCell.textContent = (index + 1).toString();

            // Create the address cell
            const addressCell = document.createElement('td');
            addressCell.textContent = formatAddress(address);

            // Create the staked count cell
            const stakedCell = document.createElement('td');
            stakedCell.textContent = totals[index].toString();

            // Create the rewards cell
            const rewardsCell = document.createElement('td');
            rewardsCell.textContent = Math.floor(Number(ethers.formatUnits(rewards[index], 18))).toLocaleString();

            // Append cells to row
            row.appendChild(rankCell);
            row.appendChild(addressCell);
            row.appendChild(stakedCell);
            row.appendChild(rewardsCell);

            // Append row to table body
            leaderboardBody.appendChild(row);
        });

    } catch (error) {
        console.error('Error loading leaderboard:', error);
        leaderboardBody.innerHTML = '<tr><td colspan="4">Failed to load leaderboard data</td></tr>';
    }
}

// Improved pending rewards estimation
async function estimatePendingRewards() {
    if (!pendingRewards || !stakingContract || !userAddress) return;

    pendingRewards.textContent = 'Calculating...';

    try {
        // Use the contract's built-in function to get total pending rewards
        const totalRewards = await stakingContract.getAllPendingRewards(userAddress);

        // Format the rewards
        pendingRewards.textContent = ethers.formatUnits(totalRewards, 18);
    } catch (error) {
        console.error('Error estimating rewards:', error);

        // Fallback to manual calculation
        try {
            // Get user's staked tokens
            const stakedIds = await getStakedIds();

            if (stakedIds.length === 0) {
                pendingRewards.textContent = '0.00';
                return;
            }

            // Calculate rewards based on individual tokens
            let totalEstimatedRewards = 0;

            for (const id of stakedIds) {
                try {
                    const pendingReward = await stakingContract.getPendingRewards(id);
                    totalEstimatedRewards += Number(ethers.formatUnits(pendingReward, 18));
                } catch (e) {
                    console.warn(`Error getting rewards for token ${id}:`, e);
                }
            }

            pendingRewards.textContent = totalEstimatedRewards.toFixed(2);
        } catch (fallbackError) {
            console.error('Error in fallback reward estimation:', fallbackError);
            pendingRewards.textContent = 'Error';
        }
    }
}


// Stake selected NFTs
async function stakeSelected() {
    if (!initialized || selectedUnstaked.size === 0) return;

    try {
        // Disable button during operation
        if (stakeBtn) stakeBtn.disabled = true;
        logMessage(`Preparing to stake ${selectedUnstaked.size} cats...`);

        // Show confirmation modal if available
        if (window.showConfirmationModal) {
            window.showConfirmationModal(
                'Confirm Staking',
                `Are you sure you want to stake ${selectedUnstaked.size} Ninja Cats?`,
                performStaking
            );
        } else {
            // If no modal function, proceed directly
            await performStaking();
        }
    } catch (error) {
        console.error('Error in stake button handler:', error);
        logMessage(`Error: ${error.message}`, 'error');
        if (stakeBtn) stakeBtn.disabled = selectedUnstaked.size === 0;
    }
}

// Perform actual staking
async function performStaking() {
    try {
        // Ensure approval
        const isApproved = await nftContract.isApprovedForAll(userAddress, STAKING_ADDRESS);
        if (!isApproved) {
            logMessage('Requesting approval for staking contract...');
            const tx = await nftContract.setApprovalForAll(STAKING_ADDRESS, true);
            logMessage('Approval transaction sent. Waiting for confirmation...');
            await tx.wait();
            logMessage('✅ Approval granted');
        }

        // Stake tokens
        const tokenIds = Array.from(selectedUnstaked);
        logMessage(`Staking ${tokenIds.join(', ')}...`);

        const tx = await stakingContract.stake(tokenIds);
        logMessage('Staking transaction sent. Waiting for confirmation...');
        await tx.wait();

        logMessage('✅ Successfully staked your cats!', 'success');

        // Clear selection and refresh
        selectedUnstaked.clear();
        await refreshData();

    } catch (error) {
        console.error('Staking error:', error);
        logMessage(`Error staking: ${error.message}`, 'error');
    } finally {
        updateButtonStates();
    }
}

// Unstake selected NFTs
async function unstakeSelected() {
    if (!initialized || selectedStaked.size === 0) return;

    try {
        // Disable button during operation
        if (unstakeBtn) unstakeBtn.disabled = true;
        logMessage(`Preparing to unstake ${selectedStaked.size} cats...`);

        // Show confirmation modal if available
        if (window.showConfirmationModal) {
            window.showConfirmationModal(
                'Confirm Unstaking',
                `Are you sure you want to unstake ${selectedStaked.size} Ninja Cats?`,
                performUnstaking
            );
        } else {
            // If no modal function, proceed directly
            await performUnstaking();
        }
    } catch (error) {
        console.error('Error in unstake button handler:', error);
        logMessage(`Error: ${error.message}`, 'error');
        if (unstakeBtn) unstakeBtn.disabled = selectedStaked.size === 0;
    }
}

// Perform actual unstaking
async function performUnstaking() {
    try {
        // Unstake tokens
        const tokenIds = Array.from(selectedStaked);
        logMessage(`Unstaking ${tokenIds.join(', ')}...`);

        const tx = await stakingContract.unstake(tokenIds);
        logMessage('Unstaking transaction sent. Waiting for confirmation...');
        await tx.wait();

        logMessage('✅ Successfully unstaked your cats!', 'success');

        // Clear selection and refresh
        selectedStaked.clear();
        await refreshData();

    } catch (error) {
        console.error('Unstaking error:', error);
        logMessage(`Error unstaking: ${error.message}`, 'error');
    } finally {
        updateButtonStates();
    }
}

// Claim rewards
async function claimRewards() {
    if (!initialized) return;

    // Get IDs to claim for - use selected or all if none selected
    let tokenIds = Array.from(selectedStaked);
    if (tokenIds.length === 0) {
        // If no specific tokens selected, claim for all staked tokens
        tokenIds = await getStakedIds();
    }

    if (tokenIds.length === 0) {
        logMessage('No staked cats to claim rewards for', 'warning');
        return;
    }

    try {
        // Disable button during operation
        if (claimBtn) claimBtn.disabled = true;
        logMessage(`Preparing to claim rewards for ${tokenIds.length} cats...`);

        // Show confirmation modal if available
        if (window.showConfirmationModal) {
            window.showConfirmationModal(
                'Confirm Claim',
                `Are you sure you want to claim rewards for ${tokenIds.length} Ninja Cats?`,
                () => performClaiming(tokenIds)
            );
        } else {
            // If no modal function, proceed directly
            await performClaiming(tokenIds);
        }
    } catch (error) {
        console.error('Error in claim button handler:', error);
        logMessage(`Error: ${error.message}`, 'error');
        if (claimBtn) claimBtn.disabled = false;
    }
}

// Perform actual claiming
async function performClaiming(tokenIds) {
    try {
        // First check eligibility for claiming
        logMessage('Checking eligibility for claiming rewards...');

        // Log the token IDs we're claiming for better debugging
        logMessage(`Token IDs to claim: ${tokenIds.join(', ')}`, 'info');

        // Get staking info for these tokens to display more details
        const stakingInfoPromises = tokenIds.map(id => getTokenStakingInfo(id));
        const stakingInfos = await Promise.all(stakingInfoPromises);
        const validInfos = stakingInfos.filter(info => info !== null);

        if (validInfos.length === 0) {
            logMessage('No valid staked tokens found', 'warning');
            return;
        }

        // Display staking details to help diagnose issues
        for (const info of validInfos) {
            logMessage(`Token #${info.tokenId}: Staked ${info.daysStaked.toFixed(1)} days ago`, 'info');

            // Check if we have rewards info to help diagnose issues
            if (info.rewards) {
                const finalReward = parseFloat(info.rewards.finalReward);
                logMessage(`Token #${info.tokenId}: Has ${finalReward.toFixed(2)} PIX pending`, 'info');

                // If reward is 0, log a warning
                if (finalReward <= 0) {
                    logMessage(`Token #${info.tokenId}: No rewards available yet`, 'warning');
                }
            }
        }

        // Check if any tokens have rewards
        const tokensWithRewards = validInfos.filter(info =>
            info.rewards && parseFloat(info.rewards.finalReward) > 0
        );

        if (tokensWithRewards.length === 0) {
            logMessage('None of your staked tokens have rewards to claim yet', 'warning');
            logMessage('Rewards accumulate over time. Please check back later.', 'info');
            return;
        }

        // Only claim for tokens that have rewards
        const tokenIdsWithRewards = tokensWithRewards.map(info => info.tokenId);

        if (tokenIdsWithRewards.length !== tokenIds.length) {
            logMessage(`Only ${tokenIdsWithRewards.length} of ${tokenIds.length} tokens have rewards to claim`, 'warning');
            tokenIds = tokenIdsWithRewards; // Update to only claim tokens with rewards
        }

        // Claim rewards
        logMessage(`Claiming rewards for ${tokenIds.length} cats...`);

        try {
            // Check if the claim would fail by estimating gas first
            try {
                logMessage('Estimating transaction gas...', 'info');
                await stakingContract.claim.estimateGas(tokenIds);
                logMessage('Gas estimation successful, proceeding with claim', 'info');
            } catch (gasError) {
                // Gas estimation failed, check for specific errors
                console.error('Gas estimation failed:', gasError);

                // Get the error message
                const errorMessage = gasError.message || String(gasError);
                logMessage(`Gas estimation error: ${errorMessage}`, 'error');

                // Check for common issues
                if (errorMessage.toLowerCase().includes('not enough time')) {
                    logMessage('⚠️ Cannot claim yet: Minimum staking period not met', 'warning');
                } else if (errorMessage.toLowerCase().includes('no rewards') ||
                    errorMessage.toLowerCase().includes('zero amount')) {
                    logMessage('⚠️ No rewards available to claim yet', 'warning');
                } else {
                    logMessage('Contract would reject this transaction. Please try again later.', 'warning');
                }

                return; // Exit early since the transaction would fail
            }

            // If we get here, gas estimation succeeded
            const tx = await stakingContract.claim(tokenIds);
            logMessage('Claim transaction sent. Waiting for confirmation...', 'info');
            logMessage(`Transaction hash: ${tx.hash}`, 'info');

            await tx.wait();
            logMessage('✅ Successfully claimed rewards!', 'success');
        } catch (error) {
            // Extract revert reason if possible
            console.error('Claim transaction failed:', error);

            // Log more details about the error
            logMessage(`Transaction error type: ${error.constructor.name}`, 'error');

            if (error.data) {
                logMessage(`Contract error code: ${error.data}`, 'error');
            }

            if (error.transaction) {
                logMessage(`Failed transaction: ${error.transaction.hash}`, 'info');
            }

            // Check for common issues
            const errorStr = error.toString().toLowerCase();
            if (errorStr.includes('not enough time') || errorStr.includes('minimum period')) {
                logMessage('⚠️ Cannot claim yet: Minimum staking period not met', 'warning');
                logMessage('The contract requires tokens to be staked for a minimum period', 'info');
            } else if (errorStr.includes('no rewards') || errorStr.includes('zero amount')) {
                logMessage('⚠️ No rewards available to claim yet', 'warning');
                logMessage('Rewards may take time to accumulate', 'info');
            } else if (errorStr.includes('user denied') || errorStr.includes('user rejected')) {
                logMessage('Transaction was rejected in your wallet', 'warning');
            } else {
                logMessage(`Error claiming: ${error.message}`, 'error');
                logMessage("This could be because the minimum staking period hasn't passed, or there are no rewards yet", 'info');
            }
        }

        // Refresh PIX balance and pending rewards
        await Promise.all([
            loadPixBalance(),
            estimatePendingRewards()
        ]);

    } catch (error) {
        console.error('Claim process error:', error);
        logMessage(`Error in claim process: ${error.message}`, 'error');
    } finally {
        if (claimBtn) claimBtn.disabled = false;
    }
}

// Load owned NFTs
async function loadOwnedNFTs() {
    if (!ownedList || !ownedCount) return;

    try {
        // Get balance
        const balance = await nftContract.balanceOf(userAddress);
        if (ownedCount) ownedCount.textContent = balance.toString();

        // Clear list and selections
        ownedList.innerHTML = '';
        selectedUnstaked.clear();

        if (Number(balance) > 0) {
            // Get staked tokens to filter them out
            const stakedIds = await getStakedIds();
            const stakedIdsSet = new Set(stakedIds.map(id => id.toString()));

            // Load tokens
            for (let i = 0; i < balance; i++) {
                const id = await nftContract.tokenOfOwnerByIndex(userAddress, i);

                // Skip if token is staked
                if (stakedIdsSet.has(id.toString())) continue;

                createNFTCard(id, ownedList, selectedUnstaked, false);
            }

            // Show message if no unstaked tokens
            if (ownedList.children.length === 0) {
                ownedList.innerHTML = '<p class="empty-message">No unstaked cats found</p>';
            }
        } else {
            ownedList.innerHTML = '<p class="empty-message">You don\'t own any cats</p>';
        }
    } catch (error) {
        console.error('Error loading owned NFTs:', error);
        ownedList.innerHTML = '<p class="error">Failed to load your cats</p>';
    }
}

// Get all staked token IDs
async function getStakedIds() {
    try {
        // First attempt: use the contract's built-in function
        try {
            const stakedTokens = await stakingContract.getStakedTokensByUser(userAddress);
            if (stakedTokens.length > 0) {
                return stakedTokens.map(id => Number(id));
            }
        } catch (e) {
            console.warn('Could not use getStakedTokensByUser, falling back to scanning:', e);
        }

        // Fallback: scan for tokens
        const stakedIds = [];

        // IMPORTANT: Log the current staking address being used
        logMessage(`Using staking contract: ${STAKING_ADDRESS}`);

        // First check if we know any specific token IDs that should be staked
        // Add any known token IDs you've recently staked here
        const knownStakedIds = [];

        // Try looking up specific staked tokens first
        if (knownStakedIds.length > 0) {
            logMessage(`Checking ${knownStakedIds.length} known token IDs...`);
            for (const id of knownStakedIds) {
                const isStaked = await checkIfTokenStaked(id);
                if (isStaked) stakedIds.push(id);
            }
        }

        // If we still don't have any staked tokens, search in a broader range
        if (stakedIds.length === 0) {
            // Increased maximum token ID range to check
            const maxTokensToCheck = 3000; // Increase from 500 to 3000
            const batchSize = 50; // Larger batch size for efficiency

            logMessage(`Searching for staked tokens (IDs 1-${maxTokensToCheck})...`);

            // Create a progress indicator
            let lastProgressLog = 0;

            for (let start = 1; start <= maxTokensToCheck; start += batchSize) {
                const end = Math.min(start + batchSize - 1, maxTokensToCheck);

                // Log progress every 10% to avoid cluttering the log
                const progress = Math.round((start / maxTokensToCheck) * 100);
                if (progress >= lastProgressLog + 10) {
                    logMessage(`Searching... ${progress}% complete`);
                    lastProgressLog = progress;
                }

                // Check tokens in parallel
                const promises = [];
                for (let id = start; id <= end; id++) {
                    promises.push(checkIfTokenStaked(id));
                }

                const results = await Promise.all(promises);
                results.forEach(id => {
                    if (id !== null) stakedIds.push(id);
                });
            }
        }

        // Log the results
        if (stakedIds.length > 0) {
            logMessage(`Found ${stakedIds.length} staked token(s): ${stakedIds.join(', ')}`);
        } else {
            logMessage('No staked tokens found in the searched range');
        }

        return stakedIds;
    } catch (error) {
        console.error('Error getting staked tokens:', error);
        logMessage(`Error searching for staked tokens: ${error.message}`, 'error');
        return [];
    }
}

// Enhanced check if a token is staked by the current user
async function checkIfTokenStaked(id) {
    try {
        const info = await stakingContract.stakes(id);

        // Debug: log the structure of the first stake info we encounter
        if (id === 1 || id % 1000 === 0) {
            console.log(`Token ${id} stake info:`, info);
        }

        // Check if this token is staked by the current user
        if (info && typeof info === 'object') {
            // Convert to lowercase for case-insensitive comparison
            const infoOwner = (typeof info.owner === 'string') ?
                info.owner.toLowerCase() : info.owner;
            const currentUser = userAddress.toLowerCase();

            if (infoOwner === currentUser) {
                return id;
            }
        }
        return null;
    } catch (error) {
        // Only log detailed errors for specific IDs to avoid console spam
        if (id === 1 || id % 1000 === 0) {
            console.warn(`Error checking token ${id}:`, error);
        }
        return null;
    }
}

// Add a new utility function to check a specific token ID
window.checkSpecificToken = async function (tokenId) {
    if (!initialized || !stakingContract) {
        logMessage('Please connect your wallet first', 'warning');
        return;
    }

    logMessage(`Checking if token #${tokenId} is staked...`);

    try {
        const info = await stakingContract.stakes(tokenId);
        console.log(`Token #${tokenId} stake info:`, info);

        if (info && typeof info === 'object') {
            const infoOwner = (typeof info.owner === 'string') ?
                info.owner.toLowerCase() : info.owner;

            if (infoOwner === userAddress.toLowerCase()) {
                logMessage(`✅ Token #${tokenId} is staked by you!`, 'success');
                logMessage(`Rarity Tier: ${info.rarityTier}, Boost: ${info.boostFactor}%`, 'info');

                // Get detailed reward info
                const [baseReward, timeMultiplier, boostMultiplier, finalReward, stakingDays] =
                    await stakingContract.getPendingRewardsDetailed(tokenId);

                logMessage(`Staking Days: ${stakingDays}, Base Reward: ${ethers.formatUnits(baseReward, 18)} PIX`, 'info');
                logMessage(`Time Multiplier: ${timeMultiplier}%, Boost: ${boostMultiplier}%`, 'info');
                logMessage(`Pending Rewards: ${ethers.formatUnits(finalReward, 18)} PIX`, 'info');

            } else if (infoOwner && infoOwner !== '0x0000000000000000000000000000000000000000') {
                logMessage(`Token #${tokenId} is staked by another user: ${infoOwner}`, 'warning');
            } else {
                logMessage(`Token #${tokenId} is not staked`, 'info');
            }
        } else {
            logMessage(`Token #${tokenId} is not staked`, 'info');
        }
    } catch (error) {
        console.error(`Error checking token ${tokenId}:`, error);
        logMessage(`Error checking token: ${error.message}`, 'error');
    }
};

// Load staked NFTs
async function loadStakedNFTs() {
    if (!stakedList || !stakedCount) return;

    try {
        // Get staked tokens
        const stakedIds = await getStakedIds();
        if (stakedCount) stakedCount.textContent = stakedIds.length.toString();

        // Clear list and selections
        stakedList.innerHTML = '';
        selectedStaked.clear();

        if (stakedIds.length > 0) {
            // Add all staked tokens to the list
            stakedIds.forEach(id => {
                createNFTCard(id, stakedList, selectedStaked, true);
            });
        } else {
            stakedList.innerHTML = '<p class="empty-message">No staked cats found</p>';
        }
    } catch (error) {
        console.error('Error loading staked NFTs:', error);
        stakedList.innerHTML = '<p class="error">Failed to load staked cats</p>';
    }
}

// Load PIX token balance
async function loadPixBalance() {
    if (!pixBalance) return;

    try {
        // Get balance
        const balance = await pcatContract.balanceOf(userAddress);

        // Try to get decimals, use 18 as fallback
        let decimals = 18;
        try {
            decimals = await pcatContract.decimals();
        } catch (e) {
            console.warn("Couldn't get token decimals, using default 18");
        }

        // Format and display
        const formattedBalance = ethers.formatUnits(balance, decimals);
        pixBalance.textContent = Number(formattedBalance).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    } catch (error) {
        console.error('Error loading PIX balance:', error);
        pixBalance.textContent = 'Error';
    }
}

// ===== NFT Cards =========================================================
// Function to get token staking details
async function getTokenStakingInfo(tokenId) {
    if (!stakingContract || !userAddress) return null;

    try {
        const info = await stakingContract.stakes(tokenId);

        // Ensure the token is staked by the current user
        if (info && info.owner.toLowerCase() === userAddress.toLowerCase()) {
            // Get current timestamp and calculate how long the token has been staked
            const currentTime = Math.floor(Date.now() / 1000);
            const stakedAt = Number(info.stakedAt);
            const stakingDuration = currentTime - stakedAt;
            const daysStaked = stakingDuration / (60 * 60 * 24);

            // Get detailed reward information
            let rewardDetails;
            try {
                const [baseReward, timeMultiplier, boostMultiplier, finalReward, stakingDays] =
                    await stakingContract.getPendingRewardsDetailed(tokenId);

                rewardDetails = {
                    baseReward: ethers.formatUnits(baseReward, 18),
                    timeMultiplier: Number(timeMultiplier),
                    boostMultiplier: Number(boostMultiplier),
                    finalReward: ethers.formatUnits(finalReward, 18),
                    stakingDays: Number(stakingDays)
                };
            } catch (e) {
                console.warn(`Could not get detailed rewards for token ${tokenId}:`, e);
                rewardDetails = null;
            }

            return {
                owner: info.owner,
                stakedAt: stakedAt,
                stakedAtDate: new Date(stakedAt * 1000).toLocaleString(),
                daysStaked: daysStaked,
                rarityTier: Number(info.rarityTier),
                boostFactor: Number(info.boostFactor),
                hasClaimedToday: info.hasClaimedToday,
                rewards: rewardDetails,
                tokenId: tokenId
            };
        }
        return null;
    } catch (error) {
        console.error(`Error getting staking info for token ${tokenId}:`, error);
        return null;
    }
}

// Improved NFT card with better staking info display
function createNFTCard(tokenId, container, selectionSet, isStaked) {
    if (!container) return null;

    // Create card element
    const card = document.createElement('div');
    card.className = 'nft-card';
    card.dataset.tokenId = tokenId.toString();

    // Add placeholder content with improved staking info layout
    card.innerHTML = `
    <div class="nft-image placeholder"></div>
    <div class="nft-info">
      <h3>Cat #${tokenId}</h3>
      <p class="nft-id">ID: ${tokenId}</p>
      ${isStaked ? `<div class="stake-info">
        <p class="stake-loading"><i class="bi bi-hourglass-split"></i> Loading stake info...</p>
      </div>` : ''}
    </div>
  `;

    // Add click handler for selection
    card.onclick = function () {
        card.classList.toggle('selected');
        if (card.classList.contains('selected')) {
            selectionSet.add(tokenId.toString());
        } else {
            selectionSet.delete(tokenId.toString());
        }
        updateButtonStates();
    };

    // Add card to container
    container.appendChild(card);

    // Load metadata asynchronously
    loadMetadata(tokenId, card);

    // If staked, load and display staking info
    if (isStaked) {
        getTokenStakingInfo(tokenId).then(info => {
            if (info && card) {
                const stakeInfoEl = card.querySelector('.stake-info');
                if (stakeInfoEl) {
                    // Format the date
                    const stakeDate = new Date(info.stakedAt * 1000);
                    const dateStr = stakeDate.toLocaleDateString();
                    const daysStaked = parseFloat(info.daysStaked);

                    // Apply different classes based on staking duration
                    let statusClass = '';
                    if (daysStaked < 1) {
                        statusClass = 'recent-stake';
                    } else if (daysStaked > 7) {
                        statusClass = 'long-stake';
                    }

                    // Get rarity tier name
                    const rarityName = getRarityNameFromTier(info.rarityTier);

                    // Format reward info if available
                    let rewardInfo = '';
                    if (info.rewards) {
                        rewardInfo = `
                            <p class="stake-reward">
                                <i class="bi bi-coin"></i> Rewards: ${parseFloat(info.rewards.finalReward).toFixed(2)} PIX
                                <span class="multiplier-info">
                                    (Time: ${info.rewards.timeMultiplier}%, Boost: ${info.rewards.boostMultiplier}%)
                                </span>
                            </p>
                        `;
                    } else {
                        // Fallback calculation if rewards info not available
                        const baseRate = getRarityBaseRate(info.rarityTier);
                        rewardInfo = `
                            <p class="stake-reward">
                                <i class="bi bi-coin"></i> Est. Rewards: ${(daysStaked * baseRate).toFixed(1)} PIX
                            </p>
                        `;
                    }

                    stakeInfoEl.innerHTML = `
                        <p class="stake-date"><i class="bi bi-calendar-check"></i> Staked: ${dateStr}</p>
                        <p class="stake-time ${statusClass}"><i class="bi bi-clock-history"></i> Days: ${daysStaked.toFixed(1)}</p>
                        <p class="stake-rarity"><i class="bi bi-stars"></i> ${rarityName} ${info.boostFactor > 0 ? `<span class="boost-badge">+${info.boostFactor}%</span>` : ''}</p>
                        ${rewardInfo}
                    `;
                }
            }
        }).catch(err => console.warn('Failed to load stake info:', err));
    }

    return card;
}

// Helper to get rarity name from tier
function getRarityNameFromTier(tier) {
    switch (tier) {
        case 1: return 'Common';
        case 2: return 'Rare';
        case 3: return 'Epic';
        case 4: return 'Legendary';
        default: return 'Common';
    }
}

// Helper to get base rate from rarity tier
function getRarityBaseRate(tier) {
    switch (tier) {
        case 1: return 10; // Common: 10 PIX/day
        case 2: return 20; // Rare: 20 PIX/day
        case 3: return 40; // Epic: 40 PIX/day
        case 4: return 80; // Legendary: 80 PIX/day
        default: return 10;
    }
}

// Load NFT metadata
async function loadMetadata(tokenId, card) {
    if (!card) return;

    try {
        const uri = await nftContract.tokenURI(tokenId);

        // Handle different URI formats
        let metadataUrl = uri;
        if (uri.startsWith('ipfs://')) {
            metadataUrl = uri.replace('ipfs://', METADATA_GATEWAY);
        }

        // Fetch metadata
        const response = await fetch(metadataUrl);
        const metadata = await response.json();

        // Process image URL
        let imageUrl = metadata.image;
        if (imageUrl.startsWith('ipfs://')) {
            imageUrl = imageUrl.replace('ipfs://', METADATA_GATEWAY);
        }

        // Update card with metadata
        const imageDiv = card.querySelector('.nft-image');
        if (imageDiv) {
            imageDiv.style.backgroundImage = `url('${imageUrl}')`;
            imageDiv.classList.remove('placeholder');

            // Add rarity badge if available
            if (metadata.attributes) {
                const rarityAttr = metadata.attributes.find(attr =>
                    attr.trait_type?.toLowerCase() === 'rarity' ||
                    attr.trait_type?.toLowerCase() === 'class' ||
                    attr.trait_type?.toLowerCase() === 'tier'
                );

                if (rarityAttr) {
                    const rarity = rarityAttr.value.toLowerCase();
                    imageDiv.innerHTML = `<span class="rarity-badge rarity-${rarity}">${rarity}</span>`;
                    card.dataset.rarity = rarity;
                }
            }
        }

        // Update name
        const nameEl = card.querySelector('h3');
        if (nameEl) {
            nameEl.textContent = metadata.name || `Cat #${tokenId}`;
        }

        // Update breed info if available
        if (metadata.attributes) {
            const breedAttr = metadata.attributes.find(attr =>
                attr.trait_type?.toLowerCase() === 'breed' ||
                attr.trait_type?.toLowerCase() === 'type'
            );

            if (breedAttr) {
                const idEl = card.querySelector('.nft-id');
                if (idEl) {
                    idEl.innerHTML = `ID: ${tokenId} <span class="breed">${breedAttr.value}</span>`;
                }
            }
        }
    } catch (error) {
        console.warn(`Error loading metadata for token ${tokenId}:`, error);
        // Card already has placeholder content
    }
}

// Add this function to explicitly refresh a specific staked NFT card
function refreshNFTCard(tokenId) {
    const stakedCard = document.querySelector(`.nft-card[data-token-id="${tokenId}"]`);
    if (!stakedCard) return;

    getTokenStakingInfo(tokenId).then(info => {
        if (!info) return;

        const stakeInfoEl = stakedCard.querySelector('.stake-info');
        if (!stakeInfoEl) return;

        // Format the date
        const stakeDate = new Date(info.stakedAt * 1000);
        const dateStr = stakeDate.toLocaleDateString();
        const daysStaked = parseFloat(info.daysStaked);

        // Apply different classes based on staking duration
        let statusClass = '';
        if (daysStaked < 1) {
            statusClass = 'recent-stake';
        } else if (daysStaked > 7) {
            statusClass = 'long-stake';
        }

        // Get rarity tier name
        const rarityName = getRarityNameFromTier(info.rarityTier);

        // Create a very visible boost indicator if boost exists
        const boostIndicator = info.boostFactor > 0 ?
            `<div class="boost-active-indicator">
                <i class="bi bi-lightning-charge-fill"></i>
                <span class="boost-value-large">+${info.boostFactor}% Boost Active</span>
             </div>` : '';

        // Format reward info with enhanced boost visibility
        let rewardInfo = '';
        if (info.rewards) {
            rewardInfo = `
                <p class="stake-reward">
                    <i class="bi bi-coin"></i> Rewards: ${parseFloat(info.rewards.finalReward).toFixed(2)} PIX
                    <span class="multiplier-info">
                        (Time: ${info.rewards.timeMultiplier}%, Boost: <span class="boost-value">${info.rewards.boostMultiplier}%</span>)
                    </span>
                </p>
            `;
        } else {
            // Fallback calculation if rewards info not available
            const baseRate = getRarityBaseRate(info.rarityTier);
            const boostedRate = baseRate * (1 + info.boostFactor / 100);
            rewardInfo = `
                <p class="stake-reward">
                    <i class="bi bi-coin"></i> Est. Rewards: ${(daysStaked * boostedRate).toFixed(1)} PIX
                </p>
            `;
        }

        stakeInfoEl.innerHTML = `
            ${boostIndicator}
            <p class="stake-date"><i class="bi bi-calendar-check"></i> Staked: ${dateStr}</p>
            <p class="stake-time ${statusClass}"><i class="bi bi-clock-history"></i> Days: ${daysStaked.toFixed(1)}</p>
            <p class="stake-rarity"><i class="bi bi-stars"></i> ${rarityName} ${info.boostFactor > 0 ? `<span class="boost-badge">+${info.boostFactor}%</span>` : ''}</p>
            ${rewardInfo}
        `;

        // Add a highlight effect to show the card was updated
        stakedCard.classList.add('card-updated');
        setTimeout(() => {
            stakedCard.classList.remove('card-updated');
        }, 3000);
    });
}

// Update button states
function updateButtonStates() {
    if (stakeBtn) stakeBtn.disabled = selectedUnstaked.size === 0 || !initialized || contractPaused;
    if (unstakeBtn) unstakeBtn.disabled = selectedStaked.size === 0 || !initialized || contractPaused;
    if (claimBtn) claimBtn.disabled = (stakedCount && parseInt(stakedCount.textContent || '0') === 0) || !initialized || contractPaused;
    if (emergencyUnstakeBtn) emergencyUnstakeBtn.disabled = selectedStaked.size === 0 || !initialized;
    if (boostBtn) boostBtn.disabled = selectedStaked.size === 0 || !initialized || contractPaused;
}

// Update boost cost calculation
function updateBoostCost() {
    if (!boostCost || !boostSlider || selectedStaked.size === 0) {
        if (boostCost) boostCost.textContent = '0';
        return;
    }

    const boostPercent = parseInt(boostSlider.value || '10');
    const tokenCount = selectedStaked.size;
    const cost = boostPercent * tokenCount * 10; // 10 PIX per percentage per token

    boostCost.textContent = cost.toLocaleString();

    // Update the boost value display
    if (boostValue) {
        boostValue.textContent = boostPercent + '%';
    }
}

// Emergency unstake selected NFTs
async function emergencyUnstakeSelected() {
    if (!initialized || selectedStaked.size === 0) return;

    try {
        // Disable button during operation
        if (emergencyUnstakeBtn) emergencyUnstakeBtn.disabled = true;

        const feeMessage = emergencyFeePercentage > 0 ?
            `This will incur a ${emergencyFeePercentage}% fee on your base rewards.` : '';

        logMessage(`Preparing for emergency unstake of ${selectedStaked.size} cats... ${feeMessage}`);

        // Show confirmation modal with warning
        if (window.showConfirmationModal) {
            window.showConfirmationModal(
                '⚠️ Confirm Emergency Unstake',
                `<p>Are you sure you want to emergency unstake ${selectedStaked.size} Ninja Cats?</p>
                <p class="warning-text">Warning: This will bypass the minimum staking period but may incur a ${emergencyFeePercentage}% fee.</p>`,
                performEmergencyUnstaking
            );
        } else {
            // If no modal function, proceed directly
            await performEmergencyUnstaking();
        }
    } catch (error) {
        console.error('Error in emergency unstake button handler:', error);
        logMessage(`Error: ${error.message}`, 'error');
        if (emergencyUnstakeBtn) emergencyUnstakeBtn.disabled = selectedStaked.size === 0;
    }
}



// Perform emergency unstaking
async function performEmergencyUnstaking() {
    try {
        // Emergency unstake tokens
        const tokenIds = Array.from(selectedStaked);
        logMessage(`Emergency unstaking ${tokenIds.join(', ')}...`);

        // Check if we need to approve PIX token for fee payment
        if (emergencyFeePercentage > 0) {
            // Calculate potential fee (rough estimate)
            const baseFeesPerToken = 10; // Base rate in PIX
            // Convert BigInt to Number for safe arithmetic
            const feePercentage = Number(emergencyFeePercentage);
            const estimatedFeeTotal = (baseFeesPerToken * tokenIds.length * feePercentage) / 100;

            logMessage(`You may be charged approximately ${estimatedFeeTotal.toFixed(2)} PIX in fees`);

            // Ensure PCAT approval
            try {
                await pcatContract.approve(STAKING_ADDRESS, ethers.parseUnits('1000000', 18)); // Approve a large amount
                logMessage('Approved PIX token for fee payment');
            } catch (approveError) {
                console.error('Approval error:', approveError);
                logMessage('Could not approve PIX token for fee payment', 'error');
                // Continue anyway - the contract will revert if payment fails
            }
        }

        const tx = await stakingContract.emergencyUnstake(tokenIds);
        logMessage('Emergency unstake transaction sent. Waiting for confirmation...');
        await tx.wait();

        logMessage('✅ Successfully emergency unstaked your cats!', 'success');

        // Clear selection and refresh
        selectedStaked.clear();
        await refreshData();

    } catch (error) {
        console.error('Emergency unstaking error:', error);
        logMessage(`Error emergency unstaking: ${error.message}`, 'error');
    } finally {
        updateButtonStates();
        if (emergencyUnstakeBtn) emergencyUnstakeBtn.disabled = false;
    }
}

// Apply boost to selected tokens
async function applyBoost() {
    if (!initialized || selectedStaked.size === 0 || contractPaused) return;

    try {
        // Disable button during operation
        if (boostBtn) boostBtn.disabled = true;

        // Get boost percentage
        const boostPercent = parseInt(boostSlider.value || '10');
        if (boostPercent <= 0 || boostPercent > 100) {
            logMessage('Invalid boost percentage. Please choose between 1-100%.', 'warning');
            return;
        }

        // Calculate cost
        const tokenCount = selectedStaked.size;
        const cost = boostPercent * tokenCount * 10; // 10 PIX per percentage per token

        logMessage(`Preparing to apply ${boostPercent}% boost to ${tokenCount} cats for ${cost} PIX...`);

        // Show confirmation modal
        if (window.showConfirmationModal) {
            window.showConfirmationModal(
                'Confirm Boost',
                `<p>Are you sure you want to apply a <strong>${boostPercent}%</strong> boost to ${tokenCount} cats?</p>
                <p>This will cost <strong>${cost} PIX</strong> tokens.</p>`,
                () => performBoost(boostPercent)
            );
        } else {
            // If no modal function, proceed directly
            await performBoost(boostPercent);
        }
    } catch (error) {
        console.error('Error in boost button handler:', error);
        logMessage(`Error: ${error.message}`, 'error');
        if (boostBtn) boostBtn.disabled = selectedStaked.size === 0 || contractPaused;
    }
}

// Perform actual boost application
async function performBoost(boostPercent) {
    try {
        // Get token IDs to boost
        const tokenIds = Array.from(selectedStaked);

        // Calculate total cost
        const cost = boostPercent * tokenIds.length * 10; // 10 PIX per percentage per token

        // Check if user has enough PIX
        const balance = await pcatContract.balanceOf(userAddress);
        if (Number(ethers.formatUnits(balance, 18)) < cost) {
            logMessage(`Insufficient PIX balance. You need ${cost} PIX.`, 'error');
            return;
        }

        // Approve the staking contract to take PIX if needed
        logMessage('Approving PIX token transfer...');
        await pcatContract.approve(STAKING_ADDRESS, ethers.parseUnits(cost.toString(), 18));

        // Apply boost
        logMessage(`Applying ${boostPercent}% boost to ${tokenIds.join(', ')}...`);
        const tx = await stakingContract.applyBoost(tokenIds, boostPercent);
        logMessage('Boost transaction sent. Waiting for confirmation...');
        await tx.wait();

        logMessage(`✅ Successfully applied ${boostPercent}% boost to your cats!`, 'success');

        // Show a more prominent success notification
        showBoostSuccessNotification(boostPercent, tokenIds.length);

        // Update each card individually for immediate feedback
        for (const tokenId of tokenIds) {
            refreshNFTCard(tokenId);
        }

        // Clear selection
        selectedStaked.clear();

        // Also do a full data refresh
        await loadPixBalance(); // Update PIX balance immediately

        // Wait a bit before full refresh to allow individual card updates to be seen
        setTimeout(() => {
            refreshData();
        }, 3000);

    } catch (error) {
        console.error('Boost error:', error);
        logMessage(`Error applying boost: ${error.message}`, 'error');
    } finally {
        updateButtonStates();
        if (boostBtn) boostBtn.disabled = false;
    }
}

// Show success notification for boost
function showBoostSuccessNotification(boostPercent, count) {
    // Create notification if container exists
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = 'notification success-notification';
    notification.innerHTML = `
        <div class="notification-icon"><i class="bi bi-lightning-charge-fill"></i></div>
        <div class="notification-content">
            <h4>Boost Applied Successfully!</h4>
            <p>+${boostPercent}% boost applied to ${count} cat${count > 1 ? 's' : ''}.</p>
        </div>
        <button class="notification-close">&times;</button>
    `;

    container.appendChild(notification);

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        notification.classList.add('notification-hiding');
        setTimeout(() => notification.remove(), 500);
    }, 5000);

    // Manual dismiss
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.classList.add('notification-hiding');
        setTimeout(() => notification.remove(), 500);
    });
}

// Start auto-refresh interval
function startAutoRefresh() {
    // Clear any existing interval
    if (window.refreshInterval) {
        clearInterval(window.refreshInterval);
    }

    // Set new interval (60 seconds)
    window.refreshInterval = setInterval(() => {
        if (initialized && userAddress) {
            refreshData();
        }
    }, 60000);
}