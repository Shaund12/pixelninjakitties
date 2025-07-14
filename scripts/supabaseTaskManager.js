/**
 * Supabase Task Manager Module
 * Handles task storage, updates, and retrieval using Supabase
 */

import { withSupabase } from './supabase.js';

// Task states
export const TASK_STATES = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELED: 'canceled',
    TIMEOUT: 'timeout'
};

/**
 * Create a new task
 * @param {number} tokenId - Token ID for the task
 * @param {string} provider - Image provider (e.g., 'dall-e')
 * @param {Object} metadata - Additional metadata for the task
 * @returns {Promise<string>} - Task ID
 */
export async function createTask(tokenId, provider, metadata = {}) {
    return await withSupabase(async (client) => {
        const taskId = `task_${tokenId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const id = taskId; // Use taskId as primary key

        const taskData = {
            id,
            task_id: taskId,
            token_id: tokenId,
            status: TASK_STATES.PENDING,
            progress: 0,
            message: 'Task created',
            metadata: {
                ...metadata,
                provider,
                tokenId,
                createdFrom: metadata.createdFrom || 'api'
            },
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { error } = await client
            .from('tasks')
            .insert([taskData])
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log(`✅ Created task ${taskId} for token #${tokenId}`);
        return taskId;
    }, `Create task for token ${tokenId}`);
}

/**
 * Update task status and progress
 * @param {string} taskId - Task ID to update
 * @param {Object} updates - Updates to apply
 * @returns {Promise<boolean>} - Update success
 */
export async function updateTask(taskId, updates) {
    return await withSupabase(async (client) => {
        const updateData = {
            ...updates,
            updated_at: new Date().toISOString()
        };

        const { error } = await client
            .from('tasks')
            .update(updateData)
            .eq('task_id', taskId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log(`✅ Updated task ${taskId}: ${updates.message || 'Status updated'}`);
        return true;
    }, `Update task ${taskId}`);
}

/**
 * Complete a task successfully
 * @param {string} taskId - Task ID to complete
 * @param {Object} result - Task result data
 * @returns {Promise<boolean>} - Success
 */
export async function completeTask(taskId, result) {
    return await withSupabase(async (client) => {
        const updateData = {
            status: TASK_STATES.COMPLETED,
            progress: 100,
            message: 'Task completed successfully',
            result,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        const { data, error } = await client
            .from('tasks')
            .update(updateData)
            .eq('task_id', taskId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log(`✅ Completed task ${taskId}`);
        return true;
    }, `Complete task ${taskId}`);
}

/**
 * Mark a task as failed
 * @param {string} taskId - Task ID to fail
 * @param {Error} error - Error that caused the failure
 * @returns {Promise<boolean>} - Success
 */
export async function failTask(taskId, error) {
    return await withSupabase(async (client) => {
        const updateData = {
            status: TASK_STATES.FAILED,
            message: `Task failed: ${error.message}`,
            error_message: error.stack || error.message,
            updated_at: new Date().toISOString()
        };

        const { data, dbError } = await client
            .from('tasks')
            .update(updateData)
            .eq('task_id', taskId)
            .select()
            .single();

        if (dbError) {
            throw dbError;
        }

        console.log(`❌ Failed task ${taskId}: ${error.message}`);
        return true;
    }, `Fail task ${taskId}`);
}

/**
 * Cancel a task
 * @param {string} taskId - Task ID to cancel
 * @returns {Promise<boolean>} - Success
 */
export async function cancelTask(taskId) {
    return await withSupabase(async (client) => {
        const updateData = {
            status: TASK_STATES.CANCELED,
            message: 'Task canceled',
            updated_at: new Date().toISOString()
        };

        const { data, error } = await client
            .from('tasks')
            .update(updateData)
            .eq('task_id', taskId)
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log(`🚫 Canceled task ${taskId}`);
        return true;
    }, `Cancel task ${taskId}`);
}

/**
 * Get task status
 * @param {string} taskId - Task ID to check
 * @returns {Promise<Object|null>} - Task status or null if not found
 */
export async function getTaskStatus(taskId) {
    return await withSupabase(async (client) => {
        const { data, error } = await client
            .from('tasks')
            .select('*')
            .eq('task_id', taskId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return null; // Task not found
            }
            throw error;
        }

        return data;
    }, `Get task status ${taskId}`);
}

/**
 * Get all tasks for a token
 * @param {number} tokenId - Token ID
 * @returns {Promise<Array>} - Array of tasks
 */
export async function getTasksForToken(tokenId) {
    return await withSupabase(async (client) => {
        const { data, error } = await client
            .from('tasks')
            .select('*')
            .eq('token_id', tokenId)
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        return data || [];
    }, `Get tasks for token ${tokenId}`);
}

/**
 * Get tasks by status
 * @param {string} status - Task status
 * @param {number} limit - Maximum number of tasks to return
 * @returns {Promise<Array>} - Array of tasks
 */
export async function getTasksByStatus(status, limit = 100) {
    return await withSupabase(async (client) => {
        const { data, error } = await client
            .from('tasks')
            .select('*')
            .eq('status', status)
            .order('created_at', { ascending: true })
            .limit(limit);

        if (error) {
            throw error;
        }

        return data || [];
    }, `Get tasks by status ${status}`);
}

/**
 * Get pending tasks
 * @param {number} limit - Maximum number of tasks to return
 * @returns {Promise<Array>} - Array of pending tasks
 */
export async function getPendingTasks(limit = 100) {
    return await getTasksByStatus(TASK_STATES.PENDING, limit);
}

/**
 * Get processing tasks
 * @param {number} limit - Maximum number of tasks to return
 * @returns {Promise<Array>} - Array of processing tasks
 */
export async function getProcessingTasks(limit = 100) {
    return await getTasksByStatus(TASK_STATES.PROCESSING, limit);
}

/**
 * Clean up old completed tasks
 * @param {number} daysOld - Remove tasks older than this many days
 * @returns {Promise<number>} - Number of tasks removed
 */
export async function cleanupOldTasks(daysOld = 30) {
    return await withSupabase(async (client) => {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const { data, error } = await client
            .from('tasks')
            .delete()
            .or(`status.eq.${TASK_STATES.COMPLETED},status.eq.${TASK_STATES.FAILED}`)
            .lt('updated_at', cutoffDate.toISOString());

        if (error) {
            throw error;
        }

        const deletedCount = data ? data.length : 0;
        console.log(`🧹 Cleaned up ${deletedCount} old tasks`);
        return deletedCount;
    }, 'Clean up old tasks');
}

/**
 * Get task statistics
 * @returns {Promise<Object>} - Task statistics
 */
export async function getTaskStatistics() {
    return await withSupabase(async (client) => {
        const { data, error } = await client
            .from('tasks')
            .select('status')
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        const stats = {
            total: data.length,
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            canceled: 0,
            timeout: 0
        };

        data.forEach(task => {
            stats[task.status] = (stats[task.status] || 0) + 1;
        });

        return stats;
    }, 'Get task statistics');
}