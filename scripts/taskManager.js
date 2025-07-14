/**
 * Advanced Task Management System
 * Handles tracking, updating, and monitoring of asynchronous NFT generation tasks
 * Now using MongoDB for persistent storage
 */

import crypto from 'crypto';
import { withDatabase } from './mongodb.js';

// Task metrics (loaded from MongoDB)
let metrics = {
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
 * Load metrics from MongoDB
 */
async function loadMetrics() {
    try {
        return await withDatabase(async (db) => {
            const metricsDoc = await db.collection('metrics').findOne({ type: 'task_metrics' });
            if (metricsDoc) {
                metrics = { ...metrics, ...metricsDoc.data };
            }
            return metrics;
        }, 'Load task metrics');
    } catch (error) {
        console.error('Failed to load metrics from MongoDB:', error);
        return metrics;
    }
}

/**
 * Save metrics to MongoDB
 */
async function saveMetrics() {
    try {
        return await withDatabase(async (db) => {
            const result = await db.collection('metrics').replaceOne(
                { type: 'task_metrics' },
                {
                    type: 'task_metrics',
                    data: metrics,
                    updatedAt: new Date()
                },
                { upsert: true }
            );
            return result.acknowledged;
        }, 'Save task metrics');
    } catch (error) {
        console.error('Failed to save metrics to MongoDB:', error);
        return false;
    }
}

/**
 * Create a new task and store it in MongoDB
 * @param {string|number} tokenId - The NFT token ID
 * @param {string} provider - The image provider to use
 * @param {Object} options - Additional task options
 * @returns {string} - The generated task ID
 */
export async function createTask(tokenId, provider, options = {}) {
    // Create a more secure task ID with timestamp and random component
    const timestamp = Date.now();
    const randomPart = crypto.randomBytes(8).toString('hex');
    const taskId = `task_${timestamp}_${randomPart}`;

    // Create the task with extended properties
    const task = {
        _id: taskId,
        taskId,
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

    try {
        // Store the task in MongoDB
        await withDatabase(async (db) => {
            await db.collection('tasks').insertOne(task);
        }, 'Create task');

        // Update metrics
        await loadMetrics();
        metrics.created++;
        metrics.active++;
        await saveMetrics();

        return taskId;
    } catch (error) {
        console.error(`Failed to create task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Update task status with detailed tracking
 * @param {string} taskId - The task ID to update
 * @param {Object} update - The properties to update
 * @returns {Object} - The updated task
 */
export async function updateTask(taskId, update) {
    try {
        return await withDatabase(async (db) => {
            const task = await db.collection('tasks').findOne({ _id: taskId });
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

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
            await loadMetrics();
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

            // Save updated task to MongoDB
            await db.collection('tasks').replaceOne({ _id: taskId }, updatedTask);

            // Save updated metrics
            await saveMetrics();

            return updatedTask;
        }, 'Update task');
    } catch (error) {
        console.error(`Failed to update task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Get task status with additional info
 * @param {string} taskId - The task ID to query
 * @param {Object} options - Options for retrieval
 * @returns {Object} - The task status
 */
export async function getTaskStatus(taskId, options = {}) {
    try {
        return await withDatabase(async (db) => {
            const task = await db.collection('tasks').findOne({ _id: taskId });

            // Check if task exists
            if (!task) {
                return {
                    status: TASK_STATES.UNKNOWN,
                    message: 'Task not found or expired',
                    taskId
                };
            }

            // Check for task timeout
            if (task.timeoutAt && new Date() > task.timeoutAt &&
                ![TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.CANCELED].includes(task.status)) {
                await updateTask(taskId, {
                    status: TASK_STATES.TIMEOUT,
                    message: 'Task timed out'
                });
                task.status = TASK_STATES.TIMEOUT;
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
        }, 'Get task status');
    } catch (error) {
        console.error(`Failed to get task status for ${taskId}:`, error);
        return {
            status: TASK_STATES.UNKNOWN,
            message: 'Error retrieving task status',
            taskId,
            error: error.message
        };
    }
}

/**
 * Mark a task as completed
 * @param {string} taskId - The task ID
 * @param {Object} result - The task result data
 * @returns {Object} - The updated task
 */
export async function completeTask(taskId, result) {
    return await updateTask(taskId, {
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
export async function failTask(taskId, error) {
    return await updateTask(taskId, {
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
export async function cancelTask(taskId, reason = 'User canceled') {
    try {
        return await withDatabase(async (db) => {
            const task = await db.collection('tasks').findOne({ _id: taskId });
            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            // Only pending or processing tasks can be canceled
            if (![TASK_STATES.PENDING, TASK_STATES.PROCESSING].includes(task.status)) {
                throw new Error(`Cannot cancel task in ${task.status} state`);
            }

            await loadMetrics();
            metrics.active--;
            await saveMetrics();

            return await updateTask(taskId, {
                status: TASK_STATES.CANCELED,
                message: `Task canceled: ${reason}`,
                canceledAt: new Date()
            });
        }, 'Cancel task');
    } catch (error) {
        console.error(`Failed to cancel task ${taskId}:`, error);
        throw error;
    }
}

/**
 * Get all tasks matching filter criteria
 * @param {Object} filters - Filter criteria
 * @returns {Array} - Matching tasks
 */
export async function getTasks(filters = {}) {
    try {
        return await withDatabase(async (db) => {
            // Build MongoDB query from filters
            const query = {};

            if (filters.status) query.status = filters.status;
            if (filters.provider) query.provider = filters.provider;
            if (filters.tokenId) query.tokenId = Number(filters.tokenId);
            if (filters.minProgress) query.progress = { $gte: filters.minProgress };

            // Add date range filters if provided
            if (filters.createdAfter || filters.createdBefore) {
                query.createdAt = {};
                if (filters.createdAfter) query.createdAt.$gte = new Date(filters.createdAfter);
                if (filters.createdBefore) query.createdAt.$lte = new Date(filters.createdBefore);
            }

            // Sort by creation date (most recent first)
            const tasks = await db.collection('tasks')
                .find(query)
                .sort({ createdAt: -1 })
                .toArray();
            
            return tasks.map(task => ({
                taskId: task.taskId,
                ...task
            }));
        }, 'Get tasks');
    } catch (error) {
        console.error('Failed to get tasks:', error);
        return [];
    }
}

/**
 * Get task metrics and statistics
 * @returns {Object} - Current metrics
 */
export async function getTaskMetrics() {
    try {
        await loadMetrics();

        return await withDatabase(async (db) => {
            const pendingCount = await db.collection('tasks').countDocuments({ status: TASK_STATES.PENDING });
            const processingCount = await db.collection('tasks').countDocuments({ status: TASK_STATES.PROCESSING });
            const totalCount = await db.collection('tasks').countDocuments();

            return {
                ...metrics,
                totalTasks: totalCount,
                activeTasks: metrics.active,
                pendingTasks: pendingCount,
                processingTasks: processingCount,
                averageCompletionTimeSeconds: Math.round(metrics.averageCompletionTime / 1000),
                taskCount: totalCount
            };
        }, 'Get task metrics');
    } catch (error) {
        console.error('Failed to get task metrics:', error);
        return {
            ...metrics,
            totalTasks: 0,
            activeTasks: 0,
            pendingTasks: 0,
            processingTasks: 0,
            averageCompletionTimeSeconds: 0,
            taskCount: 0
        };
    }
}

/**
 * Cleanup old tasks (call periodically)
 * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
 * @returns {number} - Number of tasks removed
 */
export async function cleanupTasks(maxAge = 24 * 60 * 60 * 1000) {
    try {
        return await withDatabase(async (db) => {
            const cutoffDate = new Date(Date.now() - maxAge);

            const result = await db.collection('tasks').deleteMany({
                status: {
                    $in: [TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.CANCELED, TASK_STATES.TIMEOUT]
                },
                updatedAt: { $lt: cutoffDate }
            });

            return result.deletedCount;
        }, 'Cleanup tasks');
    } catch (error) {
        console.error('Failed to cleanup tasks:', error);
        return 0;
    }
}