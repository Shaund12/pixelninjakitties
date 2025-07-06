/* global ethers */
import { CONTRACT_ADDRESS, USDC_ADDRESS, NFT_ABI, USDC_ABI, BREED_PRICES, TEST_MODE_MULTIPLIER } from './js/config.js';

const connectBtn = document.getElementById("connectBtn");
const mintBtn = document.getElementById("mintBtn");
const statusBox = document.getElementById("status");
const breedSel = document.getElementById("breed");
const priceLine = document.getElementById("price");
const priceValue = document.getElementById("priceValue");

let currentPrice;                                     // fetched on-chain
let account;
let isTestMode = false;

/* ─── UI helpers ───────────────────────────────── */
const busy = msg => { statusBox.style.display = "block"; statusBox.innerHTML = msg; mintBtn.disabled = true; };
const ready = msg => { statusBox.style.display = "block"; statusBox.innerHTML = msg; mintBtn.disabled = false; };
const idle = msg => { statusBox.style.display = "block"; statusBox.innerHTML = msg; mintBtn.disabled = true; };

/* ─── Fetch price from contract ─────────────────── */
async function loadPrice() {
    const selectedBreed = breedSel.value;
    const provider = new ethers.BrowserProvider(window.ethereum ?? {});

    // Use full ABI from config.js
    const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);

    try {
        // First try to check if test mode is active
        try {
            isTestMode = await nft.testMode();
            console.log("Test mode:", isTestMode);
        } catch (err) {
            console.log("Test mode not available in contract");
        }

        // Try new breed-based pricing first
        try {
            currentPrice = await nft.getBreedPrice(selectedBreed);
            console.log(`Using breed price for ${selectedBreed}: ${ethers.formatUnits(currentPrice, 6)} USDC`);
        } catch (err) {
            // Fall back to old global price
            try {
                console.log("Falling back to global price");
                currentPrice = await nft.price();
            } catch (err2) {
                console.error("Could not get price from contract:", err2);
                return idle("Error: Could not fetch price from contract");
            }
        }

        const human = ethers.formatUnits(currentPrice, 6);
        priceValue.textContent = `${human} USDC`;
        mintBtn.textContent = `Pay ${human} USDC & Mint`;
        ready("Ready to mint!");
    } catch (error) {
        console.error("Error loading price:", error);
        idle("Error loading price. Please refresh.");
    }
}

/* ─── Connect wallet ────────────────────────────── */
connectBtn.onclick = async () => {
    if (!window.ethereum) return idle("MetaMask not found.");
    try {
        const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
        account = addr;
        connectBtn.textContent = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
        await loadPrice();
    } catch (error) {
        console.error("Connection error:", error);
        idle("Failed to connect wallet.");
    }
};

/* ─── Handle breed change ─────────────────────── */
breedSel.addEventListener('change', async () => {
    if (account) {
        // Update price when breed changes (if wallet connected)
        await loadPrice();
    }
});

/* ─── Mint flow ─────────────────────────────────── */
mintBtn.onclick = async () => {
    if (!account) return idle("Connect wallet first.");
    const breed = breedSel.value;

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // Use ABI from config.js
        const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
        const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);

        // Re-fetch price in case it changed
        try {
            currentPrice = await nft.getBreedPrice(breed);
        } catch (e) {
            // Fall back to global price if breed-specific fails
            try {
                currentPrice = await nft.price();
            } catch (err) {
                return idle("Error: Could not fetch current price");
            }
        }

        /* 1️⃣ Approve if needed */
        busy(`Approving ${ethers.formatUnits(currentPrice, 6)} USDC…`);
        const allowance = await usdc.allowance(account, CONTRACT_ADDRESS);
        if (allowance < currentPrice) {
            const tx = await usdc.approve(CONTRACT_ADDRESS, currentPrice);
            await tx.wait();
        }

        /* 2️⃣ Buy */
        busy("Paying & minting…");
        const tx2 = await nft.buy(breed);
        await tx2.wait();

        const link = `https://explorer.vitruveo.xyz/tx/${tx2.hash}`;
        idle(`✅ Mint tx sent – <a href="${link}" target="_blank">view</a>. 
            Your ninja cat appears once the AI finishes rendering.`);
    } catch (error) {
        console.error("Mint error:", error);
        idle(`Error: ${error.message}`);
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Try to load the price even before wallet connection
    // This will only work if already connected, otherwise will be handled on connect
    if (window.ethereum && window.ethereum.selectedAddress) {
        account = window.ethereum.selectedAddress;
        connectBtn.textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
        await loadPrice();
    }
});