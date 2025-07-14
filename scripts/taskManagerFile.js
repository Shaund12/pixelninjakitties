/**
 * File-based Task Management System
 * Handles tracking, updating, and monitoring of asynchronous NFT generation tasks
 * Uses local file storage instead of MongoDB
 */

import crypto from 'crypto';
import { createStorage } from './storageHelpers.js';

// Initialize storage systems
const taskStorage = createStorage('tasks.json');
const metricsStorage = createStorage('task-metrics.json');

// Task metrics (loaded from file)
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
 * Load metrics from file storage
 */
async function loadMetrics() {
    try {
        const savedMetrics = await metricsStorage.get('metrics');
        if (savedMetrics) {
            metrics = { ...metrics, ...savedMetrics };
        }
        return metrics;
    } catch (error) {
        console.error('Failed to load metrics from file:', error);
        return metrics;
    }
}

/**
 * Save metrics to file storage
 */
async function saveMetrics() {
    try {
        await metricsStorage.set('metrics', metrics);
        return true;
    } catch (error) {
        console.error('Failed to save metrics to file:', error);
        return false;
    }
}

/**
 * Create a new task and store it in file storage
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
        // Store the task in file storage
        await taskStorage.set(taskId, task);

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
        const task = await taskStorage.get(taskId);
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

        // Save updated task to file storage
        await taskStorage.set(taskId, updatedTask);

        // Save updated metrics
        await saveMetrics();

        return updatedTask;
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
        const task = await taskStorage.get(taskId);

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
        const task = await taskStorage.get(taskId);
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
        const allTasks = await taskStorage.getAll();
        const tasks = Object.values(allTasks);

        // Apply filters
        return tasks.filter(task => {
            if (filters.status && task.status !== filters.status) return false;
            if (filters.provider && task.provider !== filters.provider) return false;
            if (filters.tokenId && task.tokenId !== Number(filters.tokenId)) return false;
            if (filters.minProgress && task.progress < filters.minProgress) return false;
            
            if (filters.createdAfter && new Date(task.createdAt) < new Date(filters.createdAfter)) return false;
            if (filters.createdBefore && new Date(task.createdAt) > new Date(filters.createdBefore)) return false;
            
            return true;
        });
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
        
        const allTasks = await taskStorage.getAll();
        const tasks = Object.values(allTasks);
        
        const pendingCount = tasks.filter(task => task.status === TASK_STATES.PENDING).length;
        const processingCount = tasks.filter(task => task.status === TASK_STATES.PROCESSING).length;
        const totalCount = tasks.length;

        return {
            ...metrics,
            totalTasks: totalCount,
            activeTasks: metrics.active,
            pendingTasks: pendingCount,
            processingTasks: processingCount,
            averageCompletionTimeSeconds: Math.round(metrics.averageCompletionTime / 1000),
            taskCount: totalCount
        };
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
        const allTasks = await taskStorage.getAll();
        const cutoffDate = new Date(Date.now() - maxAge);
        let removedCount = 0;

        for (const [taskId, task] of Object.entries(allTasks)) {
            if ([TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.CANCELED, TASK_STATES.TIMEOUT].includes(task.status) &&
                new Date(task.updatedAt) < cutoffDate) {
                await taskStorage.delete(taskId);
                removedCount++;
            }
        }

        return removedCount;
    } catch (error) {
        console.error('Failed to cleanup tasks:', error);
        return 0;
    }
}