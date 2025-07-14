import { getTaskStatus } from '../scripts/supabaseTaskManager.js';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Get task ID from URL path or query parameter
  const taskId = req.query.id ||
                 req.query.taskId ||
                 (req.url.match(/\/([^/]+)$/) || [])[1];

  if (!taskId) {
    return res.status(400).json({ error: 'Task ID is required' });
  }

  try {
    console.log(`🔍 Checking status for task: ${taskId}`);
    const taskStatus = await getTaskStatus(taskId);

    if (!taskStatus) {
      return res.status(404).json({ error: `Task ${taskId} not found` });
    }

    return res.status(200).json(taskStatus);
  } catch (error) {
    console.error(`❌ Error getting task status for ${taskId}:`, error);
    return res.status(500).json({
      error: 'Failed to get task status',
      message: error.message
    });
  }
}