import { createTask } from '../scripts/supabaseTaskManager.js';
import cronHandler from './cron.js';

export default async function handler(req, res) {
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }

    // Get parameters from query or body
    const data = req.method === 'POST' ? req.body : req.query;
    const { tokenId, breed, imageProvider, promptExtras, negativePrompt, paymentTx, payer } = data;
    
    if (!tokenId || !breed) {
      return res.status(400).json({
        error: 'Missing required parameters: tokenId and breed are required'
      });
    }

    console.log(`🔄 Regeneration request received for token #${tokenId}`);
    
    // Create a task in Supabase
    const taskId = await createTask(tokenId, imageProvider || 'dall-e', {
      breed,
      buyer: payer, // For regeneration, the buyer is the current payer
      isRegeneration: true,
      forceProcess: true, // Important: This flag ensures the token is processed even if previously handled
      promptExtras: promptExtras || undefined,
      negativePrompt: negativePrompt || undefined,
      paymentTx,
      createdFrom: 'web-ui',
      priority: 'high',
      status: 'PENDING' // Explicitly set status to ensure consistency
    });

    console.log(`✅ Created regeneration task ${taskId} for token #${tokenId}`);

    // Immediately trigger the cron job to process this task
    try {
      console.log('🔄 Triggering immediate task processing via cron handler');
      // Create a fake request and response object for the cron handler
      const cronReq = { method: 'POST', body: { immediate: true } };
      const cronRes = {
        status: () => ({ json: () => {} }),
        json: () => {}
      };
      
      // Call the cron handler directly
      await cronHandler(cronReq, cronRes);
      console.log('✅ Cron handler triggered successfully');
    } catch (cronError) {
      console.error('⚠️ Failed to trigger immediate processing:', cronError);
      // Continue anyway, since the scheduled cron job will eventually process the task
    }

    // Return success with task ID for polling
    return res.status(200).json({
      success: true,
      message: 'Regeneration task created successfully and processing triggered',
      taskId: taskId
    });
  } catch (error) {
    console.error('❌ Error creating regeneration task:', error);
    return res.status(500).json({
      error: 'Failed to create regeneration task',
      message: error.message
    });
  }
}