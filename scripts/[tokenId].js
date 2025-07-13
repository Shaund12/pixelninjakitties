import { getTaskStatus, TASK_STATES } from '../../../scripts/taskManager.js';

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

    // Basic request validation
    if (!taskId) {
        return res.status(400).json({
            error: 'Missing taskId parameter',
            status: 'error'
        });
    }

    // Task ID format validation with regex
    const taskIdPattern = /^task_\d+_[a-z0-9]+$/i;
    if (!taskIdPattern.test(taskId)) {
        return res.status(400).json({
            error: 'Invalid taskId format',
            status: 'error'
        });
    }

    try {
        // Get options from query parameters
        const options = {
            minimal: req.query.minimal === 'true',
            includeHistory: req.query.history === 'true'
        };

        // Retrieve task status
        const taskData = await getTaskStatus(taskId, options);

        // Return appropriate HTTP status based on task status
        if (taskData.status === TASK_STATES.UNKNOWN) {
            return res.status(404).json({
                ...taskData,
                requestedAt: new Date().toISOString()
            });
        }

        // Format history if included (and present)
        if (options.includeHistory && taskData.history) {
            taskData.history = taskData.history.map(entry => ({
                ...entry,
                time: entry.time.toISOString()
            }));
        }

        // Add request timestamp to response
        const response = {
            ...taskData,
            requestedAt: new Date().toISOString()
        };

        // Return with appropriate status code
        return res.status(200).json(response);

    } catch (error) {
        console.error(`Error retrieving task ${taskId}:`, error);

        return res.status(500).json({
            error: 'Server error while retrieving task status',
            message: error.message,
            status: 'error',
            taskId
        });
    }
}