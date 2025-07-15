import { getTaskStatus } from '../../scripts/supabaseTaskManager.js';
import { setCorsHeaders, handleOptions } from '../../scripts/serverlessInit.js';
import { sanitizeForLogging, createSafeErrorResponse } from '../../scripts/securityUtils.js';

export default async function handler(req, res) {
    setCorsHeaders(res);

    if (handleOptions(req, res)) return;

    try {
        // Get taskId from URL (Next.js style)
        const { taskId } = req.query;

        // Basic validation
        if (!taskId || typeof taskId !== 'string' || taskId.length > 100) {
            return res.status(400).json({ error: 'Invalid task ID' });
        }

        const status = await getTaskStatus(taskId);
        res.json(status);
    } catch (error) {
        console.error('Error in /api/task/:taskId:', sanitizeForLogging(error.message));
        res.status(500).json(createSafeErrorResponse(error, process.env.NODE_ENV === 'development'));
    }
}