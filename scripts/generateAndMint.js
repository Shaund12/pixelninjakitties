// scripts/generateAndMint.js
import "dotenv/config";
import OpenAI from "openai";
import { create } from "@web3-storage/w3up-client";
import { ethers } from "ethers";
import { filesFromPaths } from "files-from-path";
import fs from "fs/promises";
import path from "path";
import os from "os";

export async function generateAndMint({ breed, toAddress, promptExtras = "" }) {
    /* ---------- 1. Build the artistic prompt ---------- */
    const prompt = `
    Pixel-art ninja ${breed} cat, retro 32×32 style, vibrant palette,
    action pose with katana, ${promptExtras}
    --no text, watermark, border
  `.replace(/\s+/g, " ").trim();

    const openai = new OpenAI();
    const imgResp = await openai.images.generate({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024"
    });
    const imageURL = imgResp.data[0].url;

    /* ---------- 2. Download & pin via w3up ---------- */
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "ainft-"));
    const imgPath = path.join(tmp, "image.png");
    const buf = await fetch(imageURL).then(r => r.arrayBuffer());
    await fs.writeFile(imgPath, Buffer.from(buf));

    const client = await create();
    const imageCid = await client.uploadFile((await filesFromPaths([imgPath]))[0]);

    const metadata = {
        name: `Ninja ${breed} #${Date.now()}`,
        description: `A unique on-chain pixel-art ninja ${breed} cat.`,
        attributes: [{ trait_type: "Breed", value: breed }],
        image: `ipfs://${imageCid}`
    };
    const metaPath = path.join(tmp, "meta.json");
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

    const metaCid = await client.uploadFile((await filesFromPaths([metaPath]))[0]);
    const tokenURI = `ipfs://${metaCid}`;

    /* ---------- 3. Call the contract ---------- */
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const nft = new ethers.Contract(
        process.env.CONTRACT_ADDRESS,
        ["function safeMint(address,string) external returns(uint256)"],
        signer
    );

    const tx = await nft.safeMint(toAddress, tokenURI);
    await tx.wait();

    return { tokenURI, txHash: tx.hash };
}
