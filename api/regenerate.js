import { createTask } from '../scripts/supabaseTaskManager.js';
import { createClient } from '@supabase/supabase-js';
import cronHandler from './cron.js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// State key constant from cron.js
const PENDING_TASKS_KEY = 'pendingTasks';

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

    // CRITICAL: Add this task to the cron state's pendingTasks array
    try {
      console.log('📝 Adding task to cron state...');

      // 1. Fetch current pendingTasks from system_state
      const { data: stateData, error } = await supabase
        .from('system_state')
        .select('value')
        .eq('key', PENDING_TASKS_KEY)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to get pendingTasks: ${error.message}`);
      }

      // 2. Get existing tasks or create empty array
      const pendingTasks = stateData?.value || [];

      // 3. Add our new task to the pending tasks array
      pendingTasks.push({
        tokenId: Number(tokenId),
        breed,
        buyer: payer,
        taskId,
        createdAt: Date.now(),
        isRegeneration: true,
        forceProcess: true
      });

      // 4. Save the updated pendingTasks back to system_state
      const { error: saveError } = await supabase
        .from('system_state')
        .upsert({
          key: PENDING_TASKS_KEY,
          value: pendingTasks,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'key'
        });

      if (saveError) {
        throw new Error(`Failed to save pendingTasks: ${saveError.message}`);
      }

      console.log(`✅ Successfully added task to cron state (${pendingTasks.length} tasks pending)`);
    } catch (stateError) {
      console.error('⚠️ Failed to update cron state:', stateError);
      // Continue anyway as the cron job might still work
    }

    // Try to run the cron job immediately
    try {
      console.log('🔄 Triggering immediate task processing...');
      // Create a proper request and response object for the cron handler
      const cronReq = { method: 'POST', url: '/api/cron', query: {} };
      const cronRes = {
        status: (code) => ({ json: (data) => console.log(`Cron returned status ${code}:`, data) }),
        json: (data) => console.log('Cron completed:', data)
      };

      await cronHandler(cronReq, cronRes);
    } catch (cronError) {
      console.error('⚠️ Failed to trigger immediate processing:', cronError);
      // Continue anyway as the scheduled cron will run eventually
    }

    // Return success with task ID for polling
    return res.status(200).json({
      success: true,
      message: 'Regeneration task created successfully and added to processing queue',
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