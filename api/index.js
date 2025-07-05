import express from "express";
import cors from "cors";
import { ethers } from "ethers";
import { finalizeMint } from "../scripts/finalizeMint.js";

const app = express();
app.use(cors());

// Setup environment variables
const {
    RPC_URL,
    CONTRACT_ADDRESS,
    PRIVATE_KEY,
    PLACEHOLDER_URI,
} = process.env;

// Provider + signer + contract setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const abi = [
    "event MintRequested(uint256 indexed tokenId,address indexed buyer,string breed)",
    "function tokenURI(uint256) view returns (string)",
    "function setTokenURI(uint256,string)"
];
const nft = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);

// API routes
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export express app as serverless function
export default app;