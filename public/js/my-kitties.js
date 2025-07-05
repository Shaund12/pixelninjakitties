/* global ethers, fetch */
// Import the CONNECTION_KEY from connect-only.js
const CONNECTION_KEY = 'ninja_cats_wallet';

// Keep your original imports for functionality
import './wallet.js';
import {
    CONTRACT_ADDRESS, NFT_ABI, RPC_URL
} from './config.js';
import {
    getAddress, connectWallet, short
} from './wallet.js';

const grid = document.getElementById('grid');
const count = document.getElementById('count');
const rpc = new ethers.JsonRpcProvider(RPC_URL);
const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, rpc);

// Check for persistent wallet connection from connect-only.js
document.addEventListener('DOMContentLoaded', () => {
    const savedAddress = localStorage.getItem(CONNECTION_KEY);
    if (savedAddress) {
        console.log("Using wallet from connect-only.js:", savedAddress);
        render(savedAddress);

        // Update any other UI elements if needed
        const connectBtn = document.getElementById('connectBtn');
        if (connectBtn) {
            connectBtn.textContent = short(savedAddress);
        }
    } else {
        // Fall back to your original connection system
        silentBoot();
    }
});

// Original silent boot logic
async function silentBoot() {
    const addr = await getAddress();
    if (addr) render(addr);
}

/* nav button re-uses connectWallet */
document.getElementById('connectBtn').addEventListener('click', async () => {
    // Check if already connected via connect-only.js
    const savedAddress = localStorage.getItem(CONNECTION_KEY);
    if (savedAddress) {
        render(savedAddress);
        return;
    }

    // Fall back to original connection
    const { addr } = await connectWallet(document.getElementById('connectBtn'));
    render(addr);
});

async function render(owner) {
    grid.innerHTML = '';                           // clear previous
    const bal = Number(await nft.balanceOf(owner));
    count.textContent = bal;
    if (!bal) { grid.innerHTML = '<p>No cats yet – go mint!</p>'; return; }

    for (let i = 0; i < bal; i++) {
        const id = await nft.tokenOfOwnerByIndex(owner, i);
        const uri = await nft.tokenURI(id);
        const meta = await (await fetch(uri.replace('ipfs://', 'https://ipfs.io/ipfs/'))).json();

        grid.insertAdjacentHTML('beforeend', `
      <div class="catTile" onclick="location.href='kitty.html?id=${id}'">
        <img src="${meta.image.replace('ipfs://', 'https://ipfs.io/ipfs/')}"
             class="pixel" alt="#${id}">
        <span>#${id}</span>
      </div>
    `);
    }
}