/* global ethers */
const connectBtn = document.getElementById("connectBtn");
const mintBtn = document.getElementById("mintBtn");
const statusBox = document.getElementById("status");
const breedSel = document.getElementById("breed");
const priceLine = document.getElementById("price");

const USDC = "0xbCfB3FCa16b12C7756CD6C24f1cC0AC0E38569CF";
const NFT = "0xC4C8770f40e8eF17b27ddD987eCb8669b0924Fd6";                 // ← fill after deploy
let PRICE;                                               // fetched on-chain
let account;

/* ─── UI helpers ───────────────────────────────── */
const busy = msg => { statusBox.innerHTML = msg; mintBtn.disabled = true; };
const ready = msg => { statusBox.innerHTML = msg; mintBtn.disabled = false; };
const idle = msg => { statusBox.innerHTML = msg; mintBtn.disabled = true; };

/* ─── Fetch price from contract ─────────────────── */
async function loadPrice() {
    const provider = new ethers.BrowserProvider(window.ethereum ?? {});
    const nft = new ethers.Contract(NFT, ["function price() view returns(uint256)"], provider);
    PRICE = await nft.price();                              // raw (6-dec)
    const human = ethers.formatUnits(PRICE, 6);
    priceLine.textContent = `Price: ${human} USDC`;
    mintBtn.textContent = `Pay ${human} USDC & Mint`;
}

/* ─── Connect wallet ────────────────────────────── */
connectBtn.onclick = async () => {
    if (!window.ethereum) return idle("MetaMask not found.");
    const [addr] = await window.ethereum.request({ method: "eth_requestAccounts" });
    account = addr;
    connectBtn.textContent = `${addr.slice(0, 6)}…${addr.slice(-4)}`;
    await loadPrice();
    ready("Wallet connected.");
};

/* ─── Mint flow ─────────────────────────────────── */
mintBtn.onclick = async () => {
    if (!account) return idle("Connect wallet first.");
    const breed = breedSel.value;

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    const usdc = new ethers.Contract(
        USDC,
        ["function allowance(address,address) view returns(uint256)",
            "function approve(address,uint256) returns (bool)"],
        signer
    );
    const nft = new ethers.Contract(
        NFT,
        ["function buy(string) returns(uint256)", "function price() view returns(uint256)"],
        signer
    );

    // Re-fetch in case owner changed price mid-session
    PRICE = await nft.price();

    /* 1️⃣ Approve if needed */
    busy(`Approving ${ethers.formatUnits(PRICE, 6)} USDC …`);
    const allowance = await usdc.allowance(account, NFT);
    if (allowance < PRICE) {
        const tx = await usdc.approve(NFT, PRICE);
        await tx.wait();
    }

    /* 2️⃣ Buy */
    busy("Paying & minting …");
    const tx2 = await nft.buy(breed);
    await tx2.wait();

    const link = `https://explorer.vitruveo.xyz/tx/${tx2.hash}`;
    idle(`✅ Mint tx sent – <a href="${link}" target="_blank">view</a>. 
        Your ninja cat appears once the AI finishes rendering.`);
};
