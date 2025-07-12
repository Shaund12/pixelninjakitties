// Simple in-memory task storage (would use a database in production)
const tasks = new Map();

// Create a new task and store it
export function createTask(tokenId, provider) {
    const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    tasks.set(taskId, {
        tokenId,
        provider,
        status: 'pending',
        progress: 0,
        message: 'Task created',
        createdAt: new Date(),
        updatedAt: new Date()
    });

    return taskId;
}

// Update task status
export function updateTask(taskId, update) {
    if (!tasks.has(taskId)) {
        throw new Error(`Task ${taskId} not found`);
    }

    const task = tasks.get(taskId);
    const updatedTask = {
        ...task,
        ...update,
        updatedAt: new Date()
    };

    tasks.set(taskId, updatedTask);
    return updatedTask;
}

// Get task status
export function getTaskStatus(taskId) {
    if (!tasks.has(taskId)) {
        return {
            status: 'unknown',
            message: 'Task not found or expired'
        };
    }

    return tasks.get(taskId);
}

// Complete a task
export function completeTask(taskId, result) {
    return updateTask(taskId, {
        status: 'completed',
        progress: 100,
        result,
        message: 'Task completed successfully'
    });
}

// Mark task as failed
export function failTask(taskId, error) {
    return updateTask(taskId, {
        status: 'failed',
        message: error.message || 'Task failed',
        error: error.toString()
    });
}

// Cleanup old tasks (call periodically)
export function cleanupTasks() {
    const now = new Date();
    const expiryTime = 24 * 60 * 60 * 1000; // 24 hours

    tasks.forEach((task, taskId) => {
        if (now - task.updatedAt > expiryTime) {
            tasks.delete(taskId);
        }
    });
}