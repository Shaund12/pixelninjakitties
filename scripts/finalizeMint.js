/**
 * scripts/finalizeMint.js
 * ───────────────────────────────────────────────────────────────
 * Generates a 32 × 32 pixel-art Ninja-Cat sprite via DALL-E-3,
 * trims any stray palette bar, uploads PNG + JSON to IPFS
 * (Pinata first → w3-CLI fallback), and returns { tokenURI }.
 *
 * Required env:
 *   OPENAI_API_KEY
 * Optional env:
 *   PINATA_API_KEY  PINATA_SECRET_KEY   (for Pinata first-try)
 *   BASE_URL        (served /images + /metadata fallback)
 *
 * Extra dep (for loss-less auto-crop):
 *   npm i sharp
 */

import "dotenv/config";
import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";
import os from "os";
import FormData from "form-data";
import fetch from "node-fetch";
import { exec } from "child_process";
import { promisify } from "util";
const execAsync = promisify(exec);

/* ─── env ────────────────────────────────────────────────────── */
const {
    OPENAI_API_KEY,
    PINATA_API_KEY,
    PINATA_SECRET_KEY,
    BASE_URL
} = process.env;

if (!OPENAI_API_KEY) throw new Error("Missing OPENAI_API_KEY in .env");
const baseUrl = BASE_URL || "http://localhost:5000";
const isPinataConfigured = PINATA_API_KEY && PINATA_SECRET_KEY;

/* ─── optional sharp (auto-crop) ─────────────────────────────── */
let sharp;
try { sharp = (await import("sharp")).default; } catch { /* fine */ }

/* ─── OpenAI client ──────────────────────────────────────────── */
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

/* ─── helpers: IPFS uploads ──────────────────────────────────── */
async function uploadCLI(file) {
    try {
        const { stdout } = await execAsync(`w3 up "${file}"`);
        const m = stdout.match(/https:\/\/w3s\.link\/ipfs\/([a-zA-Z0-9]+)/);
        if (m?.[1]) return `ipfs://${m[1]}`;
    } catch (err) { console.error("CLI upload:", err.message); }
    return null;
}

async function uploadPinata(file, name) {
    if (!isPinataConfigured) return null;
    try {
        const form = new FormData();
        form.append("file", await fs.readFile(file), path.basename(file));
        form.append("pinataMetadata", JSON.stringify({ name }));
        form.append("pinataOptions", JSON.stringify({ cidVersion: 0 }));

        const res = await fetch(
            "https://api.pinata.cloud/pinning/pinFileToIPFS",
            {
                method: "POST",
                headers: {
                    pinata_api_key: PINATA_API_KEY,
                    pinata_secret_api_key: PINATA_SECRET_KEY
                },
                body: form
            }
        ).then(r => r.json());

        return res.IpfsHash ? `ipfs://${res.IpfsHash}` : null;
    } catch (err) { console.error("Pinata upload:", err.message); }
    return null;
}

async function putIPFS(file, name) {
    return (await uploadPinata(file, name)) || (await uploadCLI(file));
}

/* ─── tiny util: crop palette strip ≤ 20 px high ─────────────── */
async function autoCrop(src, dst) {
    if (!sharp) return fs.copyFile(src, dst);
    const img = sharp(src);
    const { width, height } = await img.metadata();
    const hScan = Math.min(20, height ?? 0);

    // sample every row – break when majority != uniform colour
    const buf = await img.raw().toBuffer();
    const rowW = width * 4;
    let cropTop = 0;

    for (let y = 0; y < hScan; y++) {
        const row = buf.subarray(y * rowW, (y + 1) * rowW);
        const [r0, g0, b0] = row;
        let same = 0;
        for (let x = 0; x < width; x++) {
            const o = x * 4;
            if (row[o] === r0 && row[o + 1] === g0 && row[o + 2] === b0) same++;
        }
        if (same / width < 0.7) { cropTop = y; break; }  // art starts here
    }

    if (!cropTop) return fs.copyFile(src, dst);

    await img.extract({
        left: 0,
        top: cropTop,
        width: width,
        height: (height ?? 0) - cropTop
    }).toFile(dst);
}

/* ─── main export ────────────────────────────────────────────── */
export async function finalizeMint({ breed, tokenId }) {
    console.log(`⏳  Generating Pixel Ninja ${breed} #${tokenId}`);

    try {
        /* 1️⃣  prompt */
        const prompt = [
            `32×32 pixel-art ninja ${breed} cat sprite,`,
            `mid-air attack pose with katana,`,
            `STRICT 4-colour palette inside character ONLY,`,
            `SNES-era clean dithering, hard 1-px outline,`,
            `transparent background,`,
            `NO palette strip, NO gradient bars, NO text, NO watermark, NO border`
        ].join(" ");

        const { data } = await openai.images.generate({
            model: "dall-e-3",
            prompt,
            n: 1,
            size: "1024x1024"
        });
        const imgURL = data[0].url;

        /* 2️⃣  temp dir + download */
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "pnc-"));
        const rawPNG = path.join(tmp, "raw.png");
        const nicePNG = path.join(tmp, "cat.png");
        await fs.writeFile(rawPNG, Buffer.from(await (await fetch(imgURL)).arrayBuffer()));
        await autoCrop(rawPNG, nicePNG);

        /* 3️⃣  local backup (/public/images) */
        const imagesDir = path.join(process.cwd(), "public", "images");
        const metaDir = path.join(process.cwd(), "public", "metadata");
        await fs.mkdir(imagesDir, { recursive: true });
        await fs.mkdir(metaDir, { recursive: true });
        await fs.copyFile(nicePNG, path.join(imagesDir, `${tokenId}.png`));

        /* 4️⃣  upload PNG */
        const imgCid = await putIPFS(nicePNG, `cat-${breed}-${tokenId}`);
        const image = imgCid || `${baseUrl}/images/${tokenId}.png`;

        /* 5️⃣  metadata */
        const meta = {
            name: `Pixel Ninja ${breed} #${tokenId}`,
            description: "AI-generated pixel ninja cat.",
            attributes: [{ trait_type: "Breed", value: breed }],
            image
        };
        const tmpMeta = path.join(tmp, "meta.json");
        await fs.writeFile(tmpMeta, JSON.stringify(meta, null, 2));

        const metaCid = await putIPFS(tmpMeta, `meta-${breed}-${tokenId}`);
        const tokenURI = metaCid || (() => {
            const local = path.join(metaDir, `${tokenId}.json`);
            fs.writeFile(local, JSON.stringify(meta, null, 2));
            return `${baseUrl}/metadata/${tokenId}.json`;
        })();

        /* 6️⃣  clean + return */
        fs.rm(tmp, { recursive: true, force: true }).catch(() => { });
        console.log(`✅  Finished #${tokenId} → ${tokenURI}`);
        return { tokenURI };
    }

    /* hard failure → fallback */
    catch (err) {
        console.error("❌  finalizeMint failed:", err);

        const fallback = {
            name: `Pixel Ninja ${breed} #${tokenId}`,
            description: "AI-generated pixel ninja cat.",
            attributes: [{ trait_type: "Breed", value: breed }],
            image: "https://ipfs.io/ipfs/bafybeialufrqtoq4hskervz2std2kmqasvphhwswpx53dg2aimpfpssnue/detailed_ninja_cat_64.png"
        };
        const metaDir = path.join(process.cwd(), "public", "metadata");
        await fs.mkdir(metaDir, { recursive: true });
        await fs.writeFile(
            path.join(metaDir, `${tokenId}.json`),
            JSON.stringify(fallback, null, 2)
        );
        const tokenURI = `${baseUrl}/metadata/${tokenId}.json`;
        console.log(`↪️  Fallback metadata saved: ${tokenURI}`);
        return { tokenURI };
    }
}
