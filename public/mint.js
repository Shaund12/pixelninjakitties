﻿/* global ethers */
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

        const link = `https://explorer.vitruveo.xyz/tx/${tx2.hash}`;
        idle(`✅ Mint tx sent – <a href="${link}" target="_blank" rel="noopener noreferrer">view</a>. 
            Your ninja cat appears once the AI finishes rendering.`);
    } catch (error) {
        handleError(error, 'Mint error');
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    secureLog('DOM loaded, initializing mint interface');

    // Try to load the price even before wallet connection
    if (window.ethereum && window.ethereum.selectedAddress) {
        try {
            account = validateAddress(window.ethereum.selectedAddress);
            connectBtn.textContent = `${account.slice(0, 6)}…${account.slice(-4)}`;
            await loadPrice();
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