/**
 * server.js
 * ───────────────────────────────────────────────────────────────
 * • Serves static mint site   →  http://localhost:5000
 * • Polls chain every 15 s for MintRequested logs (no RPC filters)
 * • Instantly sets placeholder sprite URI
 * • Generates AI art → pins via w3up → overwrites tokenURI
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { finalizeMint } from "./scripts/finalizeMint.js";

/* ───── Env checks ───────────────────────────────────────────── */
const {
    RPC_URL,
    CONTRACT_ADDRESS,
    PRIVATE_KEY,
    PLACEHOLDER_URI,
    PORT = 5000
} = process.env;

if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY || !PLACEHOLDER_URI) {
    console.error("❌  Missing env vars – check .env");
    process.exit(1);
}

/* ───── Static site (front-end) ──────────────────────────────── */
const app = express();
app.use(cors());
app.use(express.static("public"));                // index.html, mint.js …
app.listen(PORT, () => console.log(`Static site on :${PORT}`));

/* ───── Provider + signer + contract ─────────────────────────── */
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
    "event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)",
    "function tokenURI(uint256) view returns (string)",
    "function setTokenURI(uint256,string)"
];
const nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
const eventSig = nft.interface.getEvent("MintRequested").topicHash;

/* ───── Manual log-polling loop (no filters created) ─────────── */
let lastBlock = await provider.getBlockNumber();

console.log("Listener started — polling every 15 s …");

setInterval(async () => {
    try {
        const latest = await provider.getBlockNumber();
        if (latest <= lastBlock) return;

        const logs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock: lastBlock + 1,
            toBlock: latest,
            topics: [eventSig]
        });
        lastBlock = latest;

        for (const log of logs) {
            const { tokenId, buyer, breed } = nft.interface.parseLog(log).args;
            const id = Number(tokenId);

            console.log(`▶︎ MintRequested  #${id}  (${breed})  by ${buyer}`);

            /* 1️⃣  Placeholder */
            try {
                const current = await nft.tokenURI(id).catch(() => "");
                if (!current || current === "") {
                    const txPH = await nft.setTokenURI(id, PLACEHOLDER_URI);
                    await txPH.wait();
                    console.log(`  • Placeholder set`);
                }
            } catch (err) {
                console.error(`  • Placeholder failed`, err);
            }

            /* 2️⃣  AI art → pin → final URI */
            try {
                const { tokenURI } = await finalizeMint({ breed, tokenId: id });
                const tx = await nft.setTokenURI(id, tokenURI);
                await tx.wait();
                console.log(`✔︎ Finalised #${id} ➜ ${tokenURI}`);
            } catch (err) {
                console.error(`✖︎ Finalising #${id} failed`, err);
            }
        }
    } catch (err) {
        console.error("Polling error:", err);
    }
}, 15_000);          // poll interval = 15 s

/* ───── Graceful shutdown ───────────────────────────────────── */
process.on("SIGINT", () => {
    console.log("\nShutting down listener …");
    process.exit(0);
});
