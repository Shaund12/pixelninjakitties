/**
 * Advanced Task Management System
 * Handles tracking, updating, and monitoring of asynchronous NFT generation tasks
 */

import crypto from 'crypto';

// Simple in-memory task storage (would use a database in production)
const tasks = new Map();

// Task metrics
const metrics = {
    created: 0,
    completed: 0,
    failed: 0,
    active: 0,
    averageCompletionTime: 0
};

// Task states
export const TASK_STATES = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELED: 'canceled',
    TIMEOUT: 'timeout',
    UNKNOWN: 'unknown'
};

/**
 * Create a new task and store it
 * @param {string|number} tokenId - The NFT token ID
 * @param {string} provider - The image provider to use
 * @param {Object} options - Additional task options
 * @returns {string} - The generated task ID
 */
export function createTask(tokenId, provider, options = {}) {
    // Create a more secure task ID with timestamp and random component
    const timestamp = Date.now();
    const randomPart = crypto.randomBytes(8).toString('hex');
    const taskId = `task_${timestamp}_${randomPart}`;

    // Create the task with extended properties
    const task = {
        tokenId,
        provider,
        status: TASK_STATES.PENDING,
        progress: 0,
        message: 'Task created',
        createdAt: new Date(),
        updatedAt: new Date(),
        history: [{
            time: new Date(),
            status: TASK_STATES.PENDING,
            message: 'Task created'
        }],
        timeoutAt: options.timeout ? new Date(Date.now() + options.timeout) : null,
        priority: options.priority || 'normal',
        providerOptions: options.providerOptions || {},
        estimatedCompletionTime: null,
        ...options
    };

    // Store the task
    tasks.set(taskId, task);

    // Update metrics
    metrics.created++;
    metrics.active++;

    return taskId;
}

/**
 * Update task status with detailed tracking
 * @param {string} taskId - The task ID to update
 * @param {Object} update - The properties to update
 * @returns {Object} - The updated task
 */
export function updateTask(taskId, update) {
    if (!tasks.has(taskId)) {
        throw new Error(`Task ${taskId} not found`);
    }

    const task = tasks.get(taskId);
    const now = new Date();

    // Track status changes in history
    if (update.status && update.status !== task.status) {
        task.history.push({
            time: now,
            status: update.status,
            message: update.message || `Status changed to ${update.status}`,
            progress: update.progress || task.progress
        });
    }
    // Track progress updates
    else if (update.progress && update.progress !== task.progress) {
        task.history.push({
            time: now,
            status: task.status,
            message: update.message || `Progress updated to ${update.progress}%`,
            progress: update.progress
        });
    }
    // Track message updates
    else if (update.message && update.message !== task.message) {
        task.history.push({
            time: now,
            status: task.status,
            message: update.message,
            progress: task.progress
        });
    }

    // Calculate estimated completion time for tasks in progress
    if (update.progress && update.progress > task.progress && update.progress < 100) {
        const elapsedTime = now - task.createdAt;
        const estimatedTotalTime = (elapsedTime / update.progress) * 100;
        const estimatedTimeRemaining = estimatedTotalTime - elapsedTime;

        update.estimatedCompletionTime = new Date(now.getTime() + estimatedTimeRemaining);
    }

    // Create the updated task object
    const updatedTask = {
        ...task,
        ...update,
        updatedAt: now
    };

    // Update task metrics when status changes to completed or failed
    if (update.status === TASK_STATES.COMPLETED && task.status !== TASK_STATES.COMPLETED) {
        metrics.completed++;
        metrics.active--;

        // Update average completion time
        const completionTime = now - task.createdAt;
        metrics.averageCompletionTime =
            (metrics.averageCompletionTime * (metrics.completed - 1) + completionTime) / metrics.completed;
    }
    else if (update.status === TASK_STATES.FAILED && task.status !== TASK_STATES.FAILED) {
        metrics.failed++;
        metrics.active--;
    }

    tasks.set(taskId, updatedTask);
    return updatedTask;
}

/**
 * Get task status with additional info
 * @param {string} taskId - The task ID to query
 * @param {Object} options - Options for retrieval
 * @returns {Object} - The task status
 */
export function getTaskStatus(taskId, options = {}) {
    // Check if task exists
    if (!tasks.has(taskId)) {
        return {
            status: TASK_STATES.UNKNOWN,
            message: 'Task not found or expired',
            taskId
        };
    }

    const task = tasks.get(taskId);

    // Check for task timeout
    if (task.timeoutAt && new Date() > task.timeoutAt &&
        ![TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.CANCELED].includes(task.status)) {
        updateTask(taskId, {
            status: TASK_STATES.TIMEOUT,
            message: 'Task timed out'
        });
    }

    // Return full task or minimal info based on options
    if (options.minimal) {
        return {
            taskId,
            status: task.status,
            progress: task.progress,
            message: task.message,
            updatedAt: task.updatedAt
        };
    }

    return task;
}

/**
 * Mark a task as completed
 * @param {string} taskId - The task ID
 * @param {Object} result - The task result data
 * @returns {Object} - The updated task
 */
export function completeTask(taskId, result) {
    return updateTask(taskId, {
        status: TASK_STATES.COMPLETED,
        progress: 100,
        result,
        message: 'Task completed successfully',
        completedAt: new Date()
    });
}

/**
 * Mark a task as failed
 * @param {string} taskId - The task ID
 * @param {Error} error - The error that caused failure
 * @returns {Object} - The updated task
 */
export function failTask(taskId, error) {
    return updateTask(taskId, {
        status: TASK_STATES.FAILED,
        message: error.message || 'Task failed',
        error: error.toString(),
        failedAt: new Date()
    });
}

/**
 * Cancel a running task
 * @param {string} taskId - The task ID
 * @param {string} reason - The reason for cancellation
 * @returns {Object} - The updated task
 */
export function cancelTask(taskId, reason = 'User canceled') {
    if (!tasks.has(taskId)) {
        throw new Error(`Task ${taskId} not found`);
    }

    const task = tasks.get(taskId);

    // Only pending or processing tasks can be canceled
    if (![TASK_STATES.PENDING, TASK_STATES.PROCESSING].includes(task.status)) {
        throw new Error(`Cannot cancel task in ${task.status} state`);
    }

    metrics.active--;

    return updateTask(taskId, {
        status: TASK_STATES.CANCELED,
        message: `Task canceled: ${reason}`,
        canceledAt: new Date()
    });
}

/**
 * Get all tasks matching filter criteria
 * @param {Object} filters - Filter criteria
 * @returns {Array} - Matching tasks
 */
export function getTasks(filters = {}) {
    const result = [];

    tasks.forEach((task, taskId) => {
        let match = true;

        // Apply filters
        if (filters.status && task.status !== filters.status) match = false;
        if (filters.provider && task.provider !== filters.provider) match = false;
        if (filters.tokenId && task.tokenId != filters.tokenId) match = false;
        if (filters.minProgress && task.progress < filters.minProgress) match = false;

        if (match) {
            result.push({
                taskId,
                ...task
            });
        }
    });

    return result;
}

/**
 * Get task metrics and statistics
 * @returns {Object} - Current metrics
 */
export function getTaskMetrics() {
    return {
        ...metrics,
        totalTasks: metrics.created,
        activeTasks: metrics.active,
        pendingTasks: getTasks({ status: TASK_STATES.PENDING }).length,
        processingTasks: getTasks({ status: TASK_STATES.PROCESSING }).length,
        averageCompletionTimeSeconds: Math.round(metrics.averageCompletionTime / 1000),
        taskCount: tasks.size
    };
}

/**
 * Cleanup old tasks (call periodically)
 * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
 * @returns {number} - Number of tasks removed
 */
export function cleanupTasks(maxAge = 24 * 60 * 60 * 1000) {
    const now = new Date();
    let removed = 0;

    tasks.forEach((task, taskId) => {
        // Remove completed/failed/canceled tasks after expiry
        if ([TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.CANCELED, TASK_STATES.TIMEOUT].includes(task.status)) {
            if (now - task.updatedAt > maxAge) {
                tasks.delete(taskId);
                removed++;
            }
        }
    });

    return removed;
}