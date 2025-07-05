/* global ethers */
////////////////////////////////////////////////////////////////////////////////
//  UPDATE THESE FOUR CONSTANTS BEFORE DEPLOYING
////////////////////////////////////////////////////////////////////////////////
const NFT_ADDRESS = "0x832a887C02E8D6d84291B0732d8540F20f970DB6";          // Pixel Ninja Cats
const STAKING_ADDRESS = "0xb6f629155ED7dC4F5F1Df7c0E641871357845Df3";    // NinjaCatStakingRandom
const PCAT_ADDRESS = "0xF5af0a176D87A29f30be2464E780a9a020097DF5";     // ERC-20 reward
const METADATA_GATEWAY = "https://ipfs.io/ipfs/";    // or own gateway
////////////////////////////////////////////////////////////////////////////////

// ===== minimal ABIs we need ================================================
const nftAbi = [
    "function balanceOf(address) view returns(uint256)",
    "function tokenOfOwnerByIndex(address,uint256) view returns(uint256)",
    "function tokenURI(uint256) view returns(string)",
    "function isApprovedForAll(address,address) view returns(bool)",
    "function setApprovalForAll(address,bool)"
];

const stakingAbi = [
    "function stakes(uint256) view returns(address owner,uint48 stakedAt,uint64 nonce)",
    "function stake(uint256[] calldata)",
    "function claim(uint256[] calldata)",
    "function unstake(uint256[] calldata)"
];

const pcatAbi = [
    "function balanceOf(address) view returns(uint256)"
];

// ===== UI handles ===========================================================
const connectBtn = document.getElementById("connectBtn");
const ownedList = document.getElementById("ownedList");
const stakedList = document.getElementById("stakedList");
const ownedCount = document.getElementById("ownedCount");
const stakedCount = document.getElementById("stakedCount");
const pcatBalEl = document.getElementById("pcatBal");
const stakeBtn = document.getElementById("stakeBtn");
const unstakeBtn = document.getElementById("unstakeBtn");
const claimBtn = document.getElementById("claimBtn");
const logBox = document.getElementById("log");

let provider, signer, addr,
    nft, staking, pcat,
    ownedSel = new Set(), stakedSel = new Set();

connectBtn.onclick = async () => {
    if (window.ethereum == null) return alert("Install MetaMask first!");
    provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send("eth_requestAccounts", []);
    signer = await provider.getSigner();
    addr = await signer.getAddress();
    connectBtn.textContent =
        addr.slice(0, 6) + "…" + addr.slice(-4);

    nft = new ethers.Contract(NFT_ADDRESS, nftAbi, signer);
    staking = new ethers.Contract(STAKING_ADDRESS, stakingAbi, signer);
    pcat = new ethers.Contract(PCAT_ADDRESS, pcatAbi, signer);

    refreshUI();
};

// ===== Fetch & render =======================================================
async function refreshUI() {
    if (!addr) return;

    // balances -------------------------------------------------
    const owned = Number(await nft.balanceOf(addr));
    ownedCount.textContent = owned;

    const stakedIds = [];
    // brute-force iterate staked IDs by reading mapping;
    // in prod keep a subgraph or an events cache
    // we'll just test first 3000 IDs for demo
    for (let id = 1; id <= 3000; id++) {
        const info = await staking.stakes(id);
        if (info.owner === addr) stakedIds.push(id);
    }
    stakedCount.textContent = stakedIds.length;

    const pcatBal = ethers.formatUnits(await pcat.balanceOf(addr), 18);
    pcatBalEl.textContent = Number(pcatBal).toLocaleString();

    // NFT lists -----------------------------------------------
    ownedList.innerHTML = "";
    stakedList.innerHTML = "";
    ownedSel.clear(); stakedSel.clear();

    // helper to make an <img>
    const addImg = (parent, id, selSet) => {
        const img = document.createElement("img");
        img.className = "cat";
        img.title = "#" + id;
        img.onclick = () => {
            img.classList.toggle("sel");
            selToggle(selSet, id);
            toggleButtons();
        };
        parent.appendChild(img);

        nft.tokenURI(id).then(uri => {
            const url = uri.startsWith("ipfs://")
                ? uri.replace("ipfs://", METADATA_GATEWAY)
                : uri;
            fetch(url).then(r => r.json())
                .then(meta => {
                    const png = meta.image.startsWith("ipfs://")
                        ? meta.image.replace("ipfs://", METADATA_GATEWAY)
                        : meta.image;
                    img.src = png;
                }).catch(() => { });
        });
    };

    // load owned (unstaked) NFTs
    for (let i = 0; i < owned; i++) {
        const id = await nft.tokenOfOwnerByIndex(addr, i);
        if (stakedIds.includes(Number(id))) continue;  // skip if also staked
        addImg(ownedList, id, ownedSel);
    }

    // load staked NFTs
    stakedIds.forEach(id => addImg(stakedList, id, stakedSel));

    toggleButtons();
}

function selToggle(set, id) {
    set.has(id) ? set.delete(id) : set.add(id);
}

function toggleButtons() {
    stakeBtn.disabled = ownedSel.size === 0;
    unstakeBtn.disabled = stakedSel.size === 0;
    claimBtn.disabled = stakedSel.size === 0;
}

// ===== Actions ==============================================================
stakeBtn.onclick = async () => {
    await ensureApproval();
    const ids = Array.from(ownedSel);
    log(`Staking ${ids}`);
    const tx = await staking.stake(ids);
    await tx.wait();
    log(`✅ Staked`);
    refreshUI();
};

unstakeBtn.onclick = async () => {
    const ids = Array.from(stakedSel);
    log(`Un-staking ${ids}`);
    const tx = await staking.unstake(ids);
    await tx.wait();
    log(`✅ Un-staked`);
    refreshUI();
};

claimBtn.onclick = async () => {
    const ids = Array.from(stakedSel);
    log(`Claiming rewards …`);
    const tx = await staking.claim(ids);
    await tx.wait();
    log(`✅ Claimed`);
    refreshUI();
};

async function ensureApproval() {
    const isOk = await nft.isApprovedForAll(addr, STAKING_ADDRESS);
    if (isOk) return;
    const tx = await nft.setApprovalForAll(STAKING_ADDRESS, true);
    await tx.wait();
}

// ===== misc ================================================================
function log(txt) { const e = document.createElement("div"); e.textContent = txt; logBox.appendChild(e); }

/* auto-refresh every 60 s */
setInterval(() => addr && refreshUI(), 60_000);
