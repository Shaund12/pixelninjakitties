import { createTask } from '../scripts/supabaseTaskManager.js';

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
      forceProcess: true,
      promptExtras: promptExtras || undefined,
      negativePrompt: negativePrompt || undefined,
      paymentTx,
      createdFrom: 'web-ui',
      priority: 'high'
    });

    console.log(`✅ Created regeneration task ${taskId} for token #${tokenId}`);

    // Return success with task ID for polling
    return res.status(200).json({
      success: true,
      message: 'Regeneration task created successfully',
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