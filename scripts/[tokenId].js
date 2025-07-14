import { getTaskStatus, TASK_STATES } from '../../../scripts/supabaseTaskManager.js';

/**
 * API endpoint to retrieve NFT generation task status
 */
export default async function handler(req, res) {
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({
            error: 'Method not allowed',
            allowed: ['GET']
        });
    }

    const { taskId } = req.query;

    // Validate required query param
    if (!taskId) {
        return res.status(400).json({
            error: 'Missing taskId parameter',
            status: 'error'
        });
    }

    // Validate task ID format
    const taskIdPattern = /^task_\d+_[a-z0-9]+$/i;
    if (!taskIdPattern.test(taskId)) {
        return res.status(400).json({
            error: 'Invalid taskId format',
            status: 'error'
        });
    }

    try {
        // Optional query params
        const options = {
            minimal: req.query.minimal === 'true',
            includeHistory: req.query.history === 'true'
        };

        // Supabase-backed task status
        const taskData = await getTaskStatus(taskId, options);

        if (!taskData || taskData.status === TASK_STATES.UNKNOWN) {
            return res.status(404).json({
                error: 'Task not found',
                taskId,
                requestedAt: new Date().toISOString()
            });
        }

        // Optional timestamp formatting
        if (options.includeHistory && Array.isArray(taskData.history)) {
            taskData.history = taskData.history.map(entry => ({
                ...entry,
                time: new Date(entry.time).toISOString()
            }));
        }

        return res.status(200).json({
            ...taskData,
            requestedAt: new Date().toISOString()
        });

    } catch (err) {
        console.error(`❌ Failed to retrieve task ${taskId}:`, err);

        return res.status(500).json({
            error: 'Server error while retrieving task status',
            message: err.message,
            status: 'error',
            taskId
        });
    }
}
