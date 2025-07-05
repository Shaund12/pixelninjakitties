/* global ethers */
import './wallet.js';                            // boots nav button
import {
    NFT_ABI, USDC_ABI, CONTRACT_ADDRESS, USDC_ADDRESS
} from './config.js';
import {
    browserProvider, rpcProvider,
    connectWallet, short
} from './wallet.js';

/* DOM refs */
const breedSel = document.getElementById('breed');
const priceEl = document.getElementById('price');
const mintBtn = document.getElementById('mintBtn');
const statusEl = document.getElementById('status');

/* read-only contract */
const nftRead = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, rpcProvider);

/* --- show current price -------------------------------- */
const rawPrice = await nftRead.price();
priceEl.textContent = `Price: ${ethers.formatUnits(rawPrice, 6)} USDC`;
mintBtn.disabled = false;

/* --- mint flow ----------------------------------------- */
mintBtn.onclick = async () => {
    try {
        mintBtn.disabled = true;
        status('Connecting wallet…');
        const { signer, addr } = await connectWallet(document.getElementById('connectBtn'));

        /* get live contracts w/ signer */
        const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, signer);
        const usdcAddr = await nft.usdc().catch(() => USDC_ADDRESS);
        const usdc = new ethers.Contract(usdcAddr, USDC_ABI, signer);

        /* approve if needed */
        if ((await usdc.allowance(addr, CONTRACT_ADDRESS)) < rawPrice) {
            status('Approving USDC…');
            await (await usdc.approve(CONTRACT_ADDRESS, rawPrice)).wait();
        }

        /* mint */
        status('Minting…');
        const tx = await nft.buy(breedSel.value);
        await tx.wait();

        status(`✅ Minted! <a target="_blank" href="https://explorer-new.vitruveo.xyz/tx/${tx.hash}">view tx</a>`);
    } catch (err) {
        console.error(err);
        status('❌ ' + (err.info?.error?.message ?? err.message));
    } finally {
        mintBtn.disabled = false;
    }
};

function status(msg) { statusEl.innerHTML = msg; }
