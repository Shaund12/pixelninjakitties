import { initializeBlockchain, getEnvVars, setCorsHeaders, handleOptions } from '../../scripts/serverlessInit.js';
import { createTask, updateTask } from '../../scripts/supabaseTaskManager.js';
import {
    validateTokenId,
    validateBreed,
    validateImageProvider,
    validatePrompt,
    validateProviderOptions,
    sanitizeForLogging,
    createSafeErrorResponse
} from '../../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        // Get tokenId from URL (Next.js style)
        const { tokenId: tokenIdParam } = req.query;

        if (!tokenIdParam) {
            return res.status(400).json({ error: 'Token ID is required' });
        }

        const tokenId = validateTokenId(tokenIdParam);

        // Initialize blockchain components
        const { nft, processedTokens, mintQueue, providerPreferences } = await initializeBlockchain();
        const envVars = getEnvVars();

        // Check if the token has already been processed - BUT ALLOW REGENERATION
        const forceProcess = req.query.force === 'true';
        const isRegeneration = req.query.regenerate === 'true';

        if (processedTokens.has(tokenId) && !forceProcess) {
            console.log(`⏭️ Token #${tokenId} has already been processed, skipping`);
            return res.json({
                status: 'already_processed',
                message: `Token #${tokenId} has already been processed`,
                tokenId
            });
        }

        if (processedTokens.has(tokenId) && forceProcess) {
            console.log(`🔄 Force regenerating token #${tokenId} that was previously processed`);
        }

        // Validate and sanitize parameters
        const breed = validateBreed(req.query.breed || 'Tabby');
        const imageProvider = validateImageProvider(req.query.imageProvider || envVars.IMAGE_PROVIDER);
        const promptExtras = validatePrompt(req.query.promptExtras || '');
        const negativePrompt = validatePrompt(req.query.negativePrompt || '');
        const providerOptions = validateProviderOptions(req.query.providerOptions || '{}');

        console.log(`🎯 Processing token #${tokenId} with provider: ${imageProvider}`);

        // Store the user's provider preference for this token
        await providerPreferences.set(tokenId.toString(), {
            provider: imageProvider,
            timestamp: Date.now(),
            options: providerOptions
        });

        let current = 'unknown';
        let owner = 'unknown';

        try {
            current = await nft.tokenURI(tokenId);
        } catch (err) {
            console.log(`Could not get URI for token #${tokenId}: ${sanitizeForLogging(err.message)}`);
        }

        try {
            owner = await nft.ownerOf(tokenId);
        } catch (err) {
            console.log(`Could not get owner for token #${tokenId}: ${sanitizeForLogging(err.message)}`);
        }

        console.log(`🔄 Manually queueing token #${tokenId} (${breed}) using ${imageProvider}`);
        console.log(`   Current URI: ${sanitizeForLogging(current)}`);
        console.log(`   Owner: ${sanitizeForLogging(owner)}`);

        // Create a task for tracking
        const taskId = await createTask(tokenId, imageProvider, {
            breed,
            owner,
            providerOptions,
            timeout: 300000 // 5 minutes timeout
        });
        await updateTask(taskId, {
            status: 'IN_PROGRESS',
            message: 'Waiting in processing queue',
            breed,
            owner,
            provider: imageProvider,
            provider_options: providerOptions
        });

        // Add to processing queue with explicit provider and all options
        mintQueue.push({
            tokenId,
            buyer: owner !== 'unknown' ? owner : 'manual-request',
            breed,
            imageProvider,
            promptExtras,
            negativePrompt,
            providerOptions,
            taskId,
            forceProcess,
            isRegeneration
        });

        // Note: In serverless functions, we can't directly trigger processQueue
        // This would need to be handled by the cron job or other mechanism

        res.json({
            status: 'queued',
            taskId,
            tokenId,
            breed,
            imageProvider,
            currentURI: current,
            owner,
            options: providerOptions
        });
    } catch (err) {
        console.error('Error in /api/process/:tokenId:', sanitizeForLogging(err.message));
        res.status(400).json(createSafeErrorResponse(err, process.env.NODE_ENV === 'development'));
    }
}