/* global ethers */
import { CONTRACT_ADDRESS, USDC_ADDRESS, NFT_ABI, USDC_ABI } from './js/config.js';

const connectBtn = document.getElementById("connectBtn");
const mintBtn = document.getElementById("mintBtn");
const statusBox = document.getElementById("status");
const breedSel = document.getElementById("breed");
const priceLine = document.getElementById("price");
const priceValue = document.getElementById("priceValue") || priceLine; // Fallback if priceValue doesn't exist

let currentPrice;                                     // fetched on-chain
let account;

/* ─── UI helpers ───────────────────────────────── */
const busy = msg => {
    statusBox.style.display = "block";
    statusBox.innerHTML = msg;
    mintBtn.disabled = true;
};
const ready = msg => {
    statusBox.style.display = "block";
    statusBox.innerHTML = msg;
    mintBtn.disabled = false;
};
const idle = msg => {
    statusBox.style.display = "block";
    statusBox.innerHTML = msg;
    mintBtn.disabled = true;
};

/* ─── Fetch price from contract ─────────────────── */
async function loadPrice() {
    const provider = new ethers.BrowserProvider(window.ethereum ?? {});

    try {
        // Use full ABI from config.js
        const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, provider);

        // Just use the global price function since we're on the old contract
        currentPrice = await nft.price();
        console.log(`Using global price: ${ethers.formatUnits(currentPrice, 6)} USDC`);

        const human = ethers.formatUnits(currentPrice, 6);

        // Update price display - handle both formats
        if (priceValue !== priceLine) {
            priceValue.textContent = `${human} USDC`;
        } else {
            priceLine.textContent = `Price: ${human} USDC`;
        }

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

/* ─── Mint flow ─────────────────────────────────── */
mintBtn.onclick = async () => {
    if (!account) return idle("Connect wallet first.");
    const breed = breedSel.value;

    try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        // Use ABIs from config.js
        const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, signer);
        const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);

        // Re-fetch price in case it changed
        currentPrice = await nft.price();

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
    if (window.ethereum && window.ethereum.selectedAddress) {
        account = window.ethereum.selectedAddress;
        connectBtn.textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
        await loadPrice();
    }
});