/* ------------------------------------------------------------ *
 *  wallet.js – shared MetaMask helper for every front-end page *
 * ------------------------------------------------------------ */

/* global ethers */
import { RPC_URL } from './config.js';

/* ---------- 1. Providers ------------------------------------ */
export const browserProvider = new ethers.BrowserProvider(window.ethereum);
export const rpcProvider = new ethers.JsonRpcProvider(RPC_URL);

/* ---------- 2. Tiny util ------------------------------------ */
export const short = a => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

/* ---------- 3. Address cache (localStorage) ----------------- */
let cachedAddr = localStorage.getItem('pnc_addr') || null;

/**
 * Read the currently-connected address.
 * • `prompt : true` → pops MetaMask                       (eth_requestAccounts)
 * • `prompt : false` → silent, returns [] if not granted  (eth_accounts)
 */
export async function getAddress({ prompt = false } = {}) {
    if (cachedAddr && !prompt) return cachedAddr;

    const method = prompt ? 'eth_requestAccounts' : 'eth_accounts';
    const accounts = await window.ethereum
        .request({ method })
        .catch(() => []);           // user rejected

    cachedAddr = accounts[0] || null;
    if (cachedAddr) localStorage.setItem('pnc_addr', cachedAddr);
    return cachedAddr;
}

/**
 * Connect button helper – guarantees a signer.
 * @param {HTMLButtonElement=} btn  (nav button, optional)
 */
export async function connectWallet(btn) {
    const addr = await getAddress({ prompt: true });
    if (!addr) throw new Error('User rejected connection');

    /* we already have permission – build signer without a 2nd prompt */
    const signer = await browserProvider.getSigner(addr);
    if (btn) {
        btn.textContent = short(addr);
        btn.classList.add('connected');
    }
    return { addr, signer };
}

/* ---------- 4. Auto-label nav button on every page ---------- */
document.addEventListener('DOMContentLoaded', async () => {
    const btn = document.getElementById('connectBtn');
    if (!btn) return;                        // some pages don't have a button

    const addr = await getAddress();         // silent read
    if (addr) btn.textContent = short(addr);

    btn.onclick = () => connectWallet(btn).catch(console.error);
});

/* ---------- 5. Hard-reload on account / chain change -------- */
if (window.ethereum?.on) {
    /* Forget old address then reload so every page stays in sync */
    const hardReload = () => {
        localStorage.removeItem('pnc_addr');
        location.reload();
    };
    window.ethereum.on('accountsChanged', hardReload);
    window.ethereum.on('chainChanged', hardReload);
}
