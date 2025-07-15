import { getTaskStatus } from '../scripts/supabaseTaskManager.js';
import { setCorsHeaders, handleOptions } from '../scripts/serverlessInit.js';
import { sanitizeForLogging, createSafeErrorResponse } from '../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);
    
    if (handleOptions(req, res)) return;

    try {
        // Get task ID from URL path or query parameter
        const taskId = req.query.id ||
                       req.query.taskId ||
                       (req.url.match(/\/([^/]+)$/) || [])[1];

        if (!taskId) {
            return res.status(400).json({ error: 'Task ID is required' });
        }

        console.log(`🔍 Checking status for task: ${taskId}`);
        const taskStatus = await getTaskStatus(taskId);

        if (!taskStatus) {
            return res.status(404).json({ error: `Task ${taskId} not found` });
        }

        return res.status(200).json(taskStatus);
    } catch (error) {
        console.error(`❌ Error getting task status for ${req.query.id || req.query.taskId || 'unknown'}:`, sanitizeForLogging(error.message));
        return res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
}