import { getTaskStatus } from '../../scripts/taskManager.js';

export default async function handler(req, res) {
    const { taskId } = req.query;

    if (!taskId) {
        return res.status(400).json({ error: 'Missing taskId parameter' });
    }

    try {
        const status = await getTaskStatus(taskId);
        return res.status(200).json(status);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}