// scripts/generateAndMint.js
import 'dotenv/config';
import OpenAI from 'openai';
import { create } from '@web3-storage/w3up-client';
import { ethers } from 'ethers';
import { filesFromPaths } from 'files-from-path';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import { finalizeMint } from './finalizeMint.js';

/**
 * Generates an AI pixel-art ninja cat image, uploads to IPFS, and mints as NFT
 * with proper provider selection and error handling
 *
 * @param {Object} options - Configuration options
 * @param {string} options.breed - Cat breed for the NFT
 * @param {string} options.toAddress - Address to mint the NFT to
 * @param {string} [options.promptExtras] - Additional prompt details
 * @param {string} [options.imageProvider] - AI provider to use (dall-e, huggingface, stability)
 * @param {string} [options.negativePrompt] - Elements to avoid in the image
 * @param {Object} [options.providerOptions] - Provider-specific configuration options
 * @param {string} [options.txData] - JSON string from transaction data containing preferences
 * @param {Function} [options.progressCallback] - Function to report progress (0-100)
 * @returns {Promise<{tokenURI: string, txHash: string}>}
 */
export async function generateAndMint({
    breed,
    toAddress,
    promptExtras = '',
    imageProvider = process.env.IMAGE_PROVIDER || 'dall-e',
    negativePrompt = '',
    providerOptions = {},
    txData = null,
    progressCallback
}) {
    // Track timing and process stats
    const startTime = Date.now();
    const stats = {
        breed,
        imageProvider,
        startTime: new Date().toISOString(),
        success: false
    };

    // Report progress if callback provided
    const reportProgress = (percent, message) => {
        if (progressCallback) {
            progressCallback(Math.min(Math.floor(percent), 100), message);
        }
        console.log(`${percent}%: ${message}`);
    };

    reportProgress(5, 'Starting NFT generation process');

    try {
        // Extract parameters from transaction data if available
        if (txData && typeof txData === 'string') {
            try {
                const parsedData = JSON.parse(txData);

                // Override parameters with values from transaction data
                imageProvider = parsedData.imageProvider || imageProvider;
                promptExtras = parsedData.promptExtras || promptExtras;
                negativePrompt = parsedData.negativePrompt || negativePrompt;

                if (parsedData.providerOptions) {
                    providerOptions = parsedData.providerOptions;
                }

                console.log(`Using image provider from transaction data: ${imageProvider}`);
            } catch (e) {
                console.warn('Could not parse transaction data:', e.message);
            }
        }

        reportProgress(10, `Generating image for ${breed} with ${imageProvider}`);

        // Use either enhanced finalizeMint or fallback to standard approach
        let imageURL, metadata;
        const timestamp = Date.now();

        try {
            console.log(`Attempting enhanced image generation for ${breed} with ${imageProvider}...`);
            reportProgress(20, 'Generating AI artwork');

            // Use finalizeMint with the explicit provider choice
            const finalizeResult = await finalizeMint({
                breed,
                tokenId: timestamp.toString(),
                imageProvider,
                promptExtras,
                negativePrompt,
                providerOptions
            });

            // Extract data from the result for IPFS upload
            imageURL = finalizeResult.imageUri;
            metadata = finalizeResult.metadata;

            // Store provider info in stats
            stats.usedProvider = finalizeResult.provider;
            stats.model = finalizeResult.model;

            console.log(`Enhanced image generation successful via ${finalizeResult.provider}`);
            reportProgress(40, `Image successfully generated with ${finalizeResult.provider}`);
        } catch (err) {
            console.log(`Enhanced generation unavailable: ${err.message}, using standard approach`);
            reportProgress(30, 'Using fallback generation method');

            /* ---------- Standard prompt generation ---------- */
            const prompt = `
            Pixel-art ninja ${breed} cat, retro 32�32 style, vibrant palette,
            action pose with katana, ${promptExtras}
            --no text, watermark, border
            `.replace(/\s+/g, ' ').trim();

            const openai = new OpenAI();
            const imgResp = await openai.images.generate({
                model: 'dall-e-3',
                prompt,
                n: 1,
                size: '1024x1024'
            });
            imageURL = imgResp.data[0].url;
            stats.usedProvider = 'dall-e';
            stats.model = 'dall-e-3';

            reportProgress(40, 'Standard image generation successful');
        }

        /* ---------- 2. Download & pin via w3up ---------- */
        reportProgress(50, 'Downloading and preparing image');
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ainft-'));
        const imgPath = path.join(tmp, 'image.png');

        // Handle either a URL or a local file path
        if (imageURL.startsWith('http')) {
            const response = await fetch(imageURL);
            const buf = await response.arrayBuffer();
            await fs.writeFile(imgPath, Buffer.from(buf));
        } else if (imageURL.startsWith('file://')) {
            const localPath = imageURL.replace('file://', '');
            await fs.copyFile(localPath, imgPath);
        } else if (await fs.access(imageURL).then(() => true).catch(() => false)) {
            await fs.copyFile(imageURL, imgPath);
        } else {
            throw new Error(`Invalid image source: ${imageURL}`);
        }

        reportProgress(60, 'Uploading to IPFS');
        const client = await create();
        const imageCid = await client.uploadFile((await filesFromPaths([imgPath]))[0]);

        // Use enhanced metadata if available, otherwise create basic metadata
        metadata = metadata || {
            name: `Ninja ${breed} #${timestamp}`,
            description: `A unique on-chain pixel-art ninja ${breed} cat.`,
            attributes: [{ trait_type: 'Breed', value: breed }],
            image: `ipfs://${imageCid}`
        };

        // Add provider info to metadata
        if (!metadata.generationInfo) {
            metadata.generationInfo = {
                provider: stats.usedProvider,
                model: stats.model,
                timestamp: Date.now()
            };
        }

        // Ensure image points to our IPFS CID
        metadata.image = `ipfs://${imageCid}`;

        const metaPath = path.join(tmp, 'meta.json');
        await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2));

        const metaCid = await client.uploadFile((await filesFromPaths([metaPath]))[0]);
        const tokenURI = `ipfs://${metaCid}`;

        reportProgress(70, 'IPFS upload complete, preparing to mint');

        /* ---------- 3. Call the contract ---------- */
        reportProgress(75, 'Connecting to blockchain');
        const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const nft = new ethers.Contract(
            process.env.CONTRACT_ADDRESS,
            ['function safeMint(address,string) external returns(uint256)'],
            signer
        );

        reportProgress(80, 'Submitting transaction');
        const tx = await nft.safeMint(toAddress, tokenURI);
        console.log(`Transaction sent: ${tx.hash}`);
        reportProgress(85, 'Waiting for confirmation');

        const receipt = await tx.wait();
        console.log(`Transaction confirmed in block ${receipt.blockNumber}`);

        // Extract tokenId from the transaction receipt if possible
        let mintedTokenId = null;
        try {
            // Look for Transfer event from the contract
            const transferEvents = receipt.logs.filter(log => {
                try {
                    const parsedLog = nft.interface.parseLog(log);
                    return parsedLog?.name === 'Transfer';
                } catch {
                    return false;
                }
            }).map(log => nft.interface.parseLog(log));

            if (transferEvents && transferEvents.length > 0) {
                mintedTokenId = transferEvents[0].args.tokenId?.toString() ||
                    transferEvents[0].args[2]?.toString();
                console.log(`Minted token ID: ${mintedTokenId}`);
            }
        } catch (eventErr) {
            console.warn('Could not determine token ID:', eventErr);
        }

        reportProgress(100, 'NFT minted successfully');

        // Clean up temp directory
        fs.rm(tmp, { recursive: true, force: true }).catch(() => { });

        // Update stats
        stats.success = true;
        stats.endTime = new Date().toISOString();
        stats.totalMs = Date.now() - startTime;
        stats.txHash = tx.hash;
        stats.tokenId = mintedTokenId;

        return {
            tokenURI,
            txHash: tx.hash,
            tokenId: mintedTokenId,
            metadata,
            provider: stats.usedProvider,
            model: stats.model,
            stats
        };
    } catch (error) {
        // Comprehensive error handling
        console.error('Error in generateAndMint:', error);

        // Update stats with error information
        stats.success = false;
        stats.error = {
            message: error.message,
            code: error.code
        };
        stats.endTime = new Date().toISOString();
        stats.totalMs = Date.now() - startTime;

        // Provide a more user-friendly error message
        let userMessage = `Failed to generate and mint NFT: ${error.message}`;

        // Handle common error cases
        if (error.message.includes('insufficient funds')) {
            userMessage = 'Transaction failed: Insufficient funds for gas';
        } else if (error.message.includes('execution reverted')) {
            userMessage = 'Smart contract rejected the transaction';
        }

        const enhancedError = new Error(userMessage);
        enhancedError.originalError = error;
        enhancedError.stats = stats;
        throw enhancedError;
    }
}