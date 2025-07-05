/* global ethers */
import {
    NFT_ABI, PCAT_ABI, STAKE_ABI,
    CONTRACT_ADDRESS, PCAT_ADDRESS, STAKE_ADDRESS,
    RPC_URL
} from './config.js';
import { getAddress, connectWallet, short } from './wallet.js';

const rpc = new ethers.JsonRpcProvider(RPC_URL);
const nft = new ethers.Contract(CONTRACT_ADDRESS, NFT_ABI, rpc);
const stake = new ethers.Contract(STAKE_ADDRESS, STAKE_ABI, rpc);
const pcat = new ethers.Contract(PCAT_ADDRESS, PCAT_ABI, rpc);

const ownedList = document.getElementById('ownedList');
const stakedList = document.getElementById('stakedList');
const stakeBtn = document.getElementById('stakeBtn');
const unstakeBtn = document.getElementById('unstakeBtn');
const claimBtn = document.getElementById('claimBtn');

let signer, nftW, stakeW;

/* ------- display data silently ------- */
(async () => {
    const addr = await getAddress();
    if (!addr) return;   // not connected yet

    document.getElementById('ownedCount').textContent = await nft.balanceOf(addr);
    document.getElementById('stakedCount').textContent = (await stake.tokensOfOwner(addr)).length;
    document.getElementById('pcatBal').textContent = ethers.formatUnits(await pcat.balanceOf(addr), 18);

    // render cats …
})();

/* ------- interactive buttons require signer ------- */
document.getElementById('connectBtn').onclick = async () => {
    const res = await connectWallet(document.getElementById('connectBtn'));
    signer = res.signer;
    nftW = nft.connect(signer);
    stakeW = stake.connect(signer);

    stakeBtn.disabled = unstakeBtn.disabled = claimBtn.disabled = false;
};

/* stake / unstake / claim logic left as exercise */
