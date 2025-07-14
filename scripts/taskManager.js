/**
 * Advanced Task Management System
 * Handles tracking, updating, and monitoring of asynchronous NFT generation tasks
 * Now using Supabase for persistent storage
 */

import crypto from 'crypto';
import { withDatabase } from './supabase.js';

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
 * Load metrics from Supabase
 */
async function loadMetrics() {
    try {
        return await withDatabase(async (client) => {
            const { data, error } = await client
                .from('metrics')
                .select('data')
                .eq('type', 'task_metrics')
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // Row not found, return default metrics
                    return metrics;
                }
                throw error;
            }

            if (data) {
                metrics = { ...metrics, ...data.data };
            }
            return metrics;
        }, 'Load task metrics');
    } catch (error) {
        console.error('Failed to load metrics from Supabase:', error);
        return metrics;
    }
}

/**
 * Save metrics to Supabase
 */
async function saveMetrics() {
    try {
        return await withDatabase(async (client) => {
            const { data, error } = await client
                .from('metrics')
                .upsert({
                    type: 'task_metrics',
                    data: metrics,
                    updated_at: new Date().toISOString()
                }, {
                    onConflict: 'type'
                });

            if (error) {
                throw error;
            }

            return true;
        }, 'Save task metrics');
    } catch (error) {
        console.error('Failed to save metrics to Supabase:', error);
        return false;
    }
}

/**
 * Create a new task and store it in Supabase
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
        id: taskId,
        task_id: taskId,
        token_id: Number(tokenId),
        provider,
        status: TASK_STATES.PENDING,
        progress: 0,
        message: 'Task created',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        history: JSON.stringify([{
            time: new Date().toISOString(),
            status: TASK_STATES.PENDING,
            message: 'Task created'
        }]),
        timeout_at: options.timeout ? new Date(Date.now() + options.timeout).toISOString() : null,
        priority: options.priority || 'normal',
        provider_options: JSON.stringify(options.providerOptions || {}),
        estimated_completion_time: null,
        breed: options.breed || null,
        buyer: options.buyer || null,
        created_from: options.createdFrom || null,
        block_number: options.blockNumber || null,
        transaction_hash: options.transactionHash || null
    };

    try {
        // Store the task in Supabase
        await withDatabase(async (client) => {
            const { error } = await client
                .from('tasks')
                .insert([task]);

            if (error) {
                throw error;
            }
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
        return await withDatabase(async (client) => {
            // Get the current task
            const { data: task, error: fetchError } = await client
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            if (fetchError) {
                throw new Error(`Task ${taskId} not found`);
            }

            if (!task) {
                throw new Error(`Task ${taskId} not found`);
            }

            const now = new Date().toISOString();
            const history = JSON.parse(task.history || '[]');

            // Track status changes in history
            if (update.status && update.status !== task.status) {
                history.push({
                    time: now,
                    status: update.status,
                    message: update.message || `Status changed to ${update.status}`,
                    progress: update.progress || task.progress
                });
            }
            // Track progress updates
            else if (update.progress && update.progress !== task.progress) {
                history.push({
                    time: now,
                    status: task.status,
                    message: update.message || `Progress updated to ${update.progress}%`,
                    progress: update.progress
                });
            }
            // Track message updates
            else if (update.message && update.message !== task.message) {
                history.push({
                    time: now,
                    status: task.status,
                    message: update.message,
                    progress: task.progress
                });
            }

            // Calculate estimated completion time for tasks in progress
            let estimatedCompletionTime = task.estimated_completion_time;
            if (update.progress && update.progress > task.progress && update.progress < 100) {
                const createdAt = new Date(task.created_at);
                const elapsedTime = new Date(now) - createdAt;
                const estimatedTotalTime = (elapsedTime / update.progress) * 100;
                const estimatedTimeRemaining = estimatedTotalTime - elapsedTime;

                estimatedCompletionTime = new Date(new Date(now).getTime() + estimatedTimeRemaining).toISOString();
            }

            // Prepare update object
            const updateData = {
                status: update.status || task.status,
                progress: update.progress || task.progress,
                message: update.message || task.message,
                history: JSON.stringify(history),
                updated_at: now,
                estimated_completion_time: estimatedCompletionTime
            };

            // Add optional fields
            if (update.result) updateData.result = JSON.stringify(update.result);
            if (update.error) updateData.error = update.error;
            if (update.completedAt) updateData.completed_at = update.completedAt;
            if (update.failedAt) updateData.failed_at = update.failedAt;
            if (update.canceledAt) updateData.canceled_at = update.canceledAt;

            // Update task metrics when status changes to completed or failed
            await loadMetrics();
            if (update.status === TASK_STATES.COMPLETED && task.status !== TASK_STATES.COMPLETED) {
                metrics.completed++;
                metrics.active--;

                // Update average completion time
                const completionTime = new Date(now) - new Date(task.created_at);
                metrics.averageCompletionTime =
                    (metrics.averageCompletionTime * (metrics.completed - 1) + completionTime) / metrics.completed;
            }
            else if (update.status === TASK_STATES.FAILED && task.status !== TASK_STATES.FAILED) {
                metrics.failed++;
                metrics.active--;
            }

            // Save updated task to Supabase
            const { data: updatedTask, error: updateError } = await client
                .from('tasks')
                .update(updateData)
                .eq('id', taskId)
                .select()
                .single();

            if (updateError) {
                throw updateError;
            }

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
        return await withDatabase(async (client) => {
            const { data: task, error } = await client
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            // Check if task exists
            if (error || !task) {
                return {
                    status: TASK_STATES.UNKNOWN,
                    message: 'Task not found or expired',
                    taskId
                };
            }

            // Check for task timeout
            if (task.timeout_at && new Date() > new Date(task.timeout_at) &&
                ![TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.CANCELED].includes(task.status)) {
                await updateTask(taskId, {
                    status: TASK_STATES.TIMEOUT,
                    message: 'Task timed out'
                });
                task.status = TASK_STATES.TIMEOUT;
            }

            // Parse JSON fields
            const parsedTask = {
                ...task,
                history: JSON.parse(task.history || '[]'),
                provider_options: JSON.parse(task.provider_options || '{}'),
                result: task.result ? JSON.parse(task.result) : null,
                // Map database fields to original format for compatibility
                taskId: task.task_id,
                tokenId: task.token_id,
                createdAt: task.created_at,
                updatedAt: task.updated_at,
                timeoutAt: task.timeout_at,
                providerOptions: JSON.parse(task.provider_options || '{}'),
                estimatedCompletionTime: task.estimated_completion_time,
                completedAt: task.completed_at,
                failedAt: task.failed_at,
                canceledAt: task.canceled_at,
                blockNumber: task.block_number,
                transactionHash: task.transaction_hash,
                createdFrom: task.created_from
            };

            // Return full task or minimal info based on options
            if (options.minimal) {
                return {
                    taskId: parsedTask.taskId,
                    status: parsedTask.status,
                    progress: parsedTask.progress,
                    message: parsedTask.message,
                    updatedAt: parsedTask.updatedAt
                };
            }

            return parsedTask;
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
        completedAt: new Date().toISOString()
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
        failedAt: new Date().toISOString()
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
        return await withDatabase(async (client) => {
            const { data: task, error } = await client
                .from('tasks')
                .select('*')
                .eq('id', taskId)
                .single();

            if (error || !task) {
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
                canceledAt: new Date().toISOString()
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
        return await withDatabase(async (client) => {
            let query = client.from('tasks').select('*');

            // Apply filters
            if (filters.status) {
                query = query.eq('status', filters.status);
            }
            if (filters.provider) {
                query = query.eq('provider', filters.provider);
            }
            if (filters.tokenId) {
                query = query.eq('token_id', Number(filters.tokenId));
            }
            if (filters.minProgress) {
                query = query.gte('progress', filters.minProgress);
            }
            if (filters.createdAfter) {
                query = query.gte('created_at', new Date(filters.createdAfter).toISOString());
            }
            if (filters.createdBefore) {
                query = query.lte('created_at', new Date(filters.createdBefore).toISOString());
            }

            const { data: tasks, error } = await query;

            if (error) {
                throw error;
            }

            return (tasks || []).map(task => ({
                ...task,
                // Map database fields to original format for compatibility
                taskId: task.task_id,
                tokenId: task.token_id,
                createdAt: task.created_at,
                updatedAt: task.updated_at,
                timeoutAt: task.timeout_at,
                providerOptions: JSON.parse(task.provider_options || '{}'),
                estimatedCompletionTime: task.estimated_completion_time,
                history: JSON.parse(task.history || '[]'),
                result: task.result ? JSON.parse(task.result) : null,
                completedAt: task.completed_at,
                failedAt: task.failed_at,
                canceledAt: task.canceled_at,
                blockNumber: task.block_number,
                transactionHash: task.transaction_hash,
                createdFrom: task.created_from
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

        return await withDatabase(async (client) => {
            const { count: pendingCount, error: pendingError } = await client
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('status', TASK_STATES.PENDING);

            const { count: processingCount, error: processingError } = await client
                .from('tasks')
                .select('*', { count: 'exact', head: true })
                .eq('status', TASK_STATES.PROCESSING);

            const { count: totalCount, error: totalError } = await client
                .from('tasks')
                .select('*', { count: 'exact', head: true });

            if (pendingError || processingError || totalError) {
                throw pendingError || processingError || totalError;
            }

            return {
                ...metrics,
                totalTasks: totalCount || 0,
                activeTasks: metrics.active,
                pendingTasks: pendingCount || 0,
                processingTasks: processingCount || 0,
                averageCompletionTimeSeconds: Math.round(metrics.averageCompletionTime / 1000),
                taskCount: totalCount || 0
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
        return await withDatabase(async (client) => {
            const cutoffDate = new Date(Date.now() - maxAge).toISOString();

            const { data, error } = await client
                .from('tasks')
                .delete()
                .in('status', [TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.CANCELED, TASK_STATES.TIMEOUT])
                .lt('updated_at', cutoffDate)
                .select();

            if (error) {
                throw error;
            }

            return data ? data.length : 0;
        }, 'Cleanup tasks');
    } catch (error) {
        console.error('Failed to cleanup tasks:', error);
        return 0;
    }
}