import { ethers } from "ethers";
import { finalizeMint } from "../scripts/finalizeMint.js";

// Define serverless function handler for cron job
export default async function handler(req, res) {
    try {
        const {
            RPC_URL,
            CONTRACT_ADDRESS,
            PRIVATE_KEY,
            PLACEHOLDER_URI,
        } = process.env;

        if (!RPC_URL || !CONTRACT_ADDRESS || !PRIVATE_KEY || !PLACEHOLDER_URI) {
            return res.status(500).json({ error: 'Missing environment variables' });
        }

        const provider = new ethers.JsonRpcProvider(RPC_URL);
        const signer = new ethers.Wallet(PRIVATE_KEY, provider);

        const abi = [
            "event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)",
            "function tokenURI(uint256) view returns (string)",
            "function setTokenURI(uint256,string)"
        ];
        const nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
        const eventSig = nft.interface.getEvent("MintRequested").topicHash;

        // Get current block
        const latest = await provider.getBlockNumber();

        // Get stored last block from env or KV store
        let lastBlock = Number(process.env.LAST_PROCESSED_BLOCK || latest - 100);

        const logs = await provider.getLogs({
            address: CONTRACT_ADDRESS,
            fromBlock: lastBlock + 1,
            toBlock: latest,
            topics: [eventSig]
        });

        const results = [];

        for (const log of logs) {
            const { tokenId, buyer, breed } = nft.interface.parseLog(log).args;
            const id = Number(tokenId);

            console.log(`▶︎ MintRequested #${id} (${breed}) by ${buyer}`);
            results.push(`Processing #${id}`);

            /* 1️⃣ Placeholder */
            try {
                const current = await nft.tokenURI(id).catch(() => "");
                if (!current || current === "") {
                    const txPH = await nft.setTokenURI(id, PLACEHOLDER_URI);
                    await txPH.wait();
                    results.push(`• Placeholder set for #${id}`);
                }
            } catch (err) {
                results.push(`• Placeholder failed for #${id}: ${err.message}`);
            }

            /* 2️⃣ AI art → pin → final URI */
            try {
                const { tokenURI } = await finalizeMint({ breed, tokenId: id });
                const tx = await nft.setTokenURI(id, tokenURI);
                await tx.wait();
                results.push(`✔︎ Finalised #${id} → ${tokenURI}`);
            } catch (err) {
                results.push(`✖︎ Finalising #${id} failed: ${err.message}`);
            }
        }

        // Store latest block number (in production, you should use Vercel KV or similar)
        // This is simplified - you'd want a more persistent solution
        process.env.LAST_PROCESSED_BLOCK = String(latest);

        return res.status(200).json({
            processed: logs.length,
            results,
            lastProcessedBlock: latest
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}