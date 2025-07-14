import { getTaskStatus } from '../scripts/supabaseTaskManager.js';

export default async function handler(req, res) {
  try {
    const taskId = req.query.id || (req.url.match(/\/([^/]+)$/) || [])[1];
    
    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    const status = await getTaskStatus(taskId);
    
    if (!status) {
      return res.status(404).json({ error: 'Task not found' });
    }

    return res.status(200).json(status);
  } catch (error) {
    console.error('Error fetching task status:', error);
    return res.status(500).json({
      error: 'Failed to fetch task status',
      message: error.message
    });
  }
}