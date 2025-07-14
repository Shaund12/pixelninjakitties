/**
 * Supabase Task Management System
 * Handles tracking, updating, and monitoring of asynchronous NFT generation tasks
 * Uses Supabase for persistent storage (NO MongoDB allowed)
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Task states
export const TASK_STATES = {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    TIMEOUT: 'TIMEOUT'
};

/**
 * Create a new task and store it in Supabase
 * @param {string|number} tokenId - The NFT token ID
 * @param {string} provider - The image provider to use
 * @param {Object} options - Additional task options
 * @returns {string} - The generated task ID
 */
export async function createTask(tokenId, provider, options = {}) {
    // Create a secure task ID with timestamp and random component
    const timestamp = Date.now();
    const randomPart = crypto.randomBytes(8).toString('hex');
    const taskId = `task_${timestamp}_${randomPart}`;

    // Create the task with extended properties
    const task = {
        id: taskId,
        token_id: tokenId.toString(),
        status: TASK_STATES.PENDING,
        progress: 0,
        message: 'Task created',
        metadata: null,
        token_uri: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider: provider,
        provider_options: options.providerOptions || {},
        breed: options.breed || null,
        owner: options.owner || null,
        timeout_at: options.timeout ? new Date(Date.now() + options.timeout).toISOString() : null,
        priority: options.priority || 'normal',
        estimated_completion_time: null,
        ...options
    };

    try {
        // Store the task in Supabase
        const { data, error } = await supabase
            .from('tasks')
            .insert([task])
            .select()
            .single();

        if (error) {
            console.error('Failed to create task in Supabase:', error);
            throw error;
        }

        console.log(`✅ Task created in Supabase: ${taskId}`);
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
        const now = new Date().toISOString();

        // Prepare update object with proper column names
        const updateData = {
            updated_at: now,
            ...(update.status && { status: update.status }),
            ...(update.progress !== undefined && { progress: update.progress }),
            ...(update.message && { message: update.message }),
            ...(update.metadata && { metadata: update.metadata }),
            ...(update.token_uri && { token_uri: update.token_uri }),
            ...(update.provider && { provider: update.provider }),
            ...(update.provider_options && { provider_options: update.provider_options })
        };

        // Calculate estimated completion time for tasks in progress
        if (update.progress && update.progress > 0 && update.progress < 100) {
            // Get the original task to calculate time elapsed
            const { data: originalTask } = await supabase
                .from('tasks')
                .select('created_at, progress')
                .eq('id', taskId)
                .single();

            if (originalTask && originalTask.progress < update.progress) {
                const createdAt = new Date(originalTask.created_at);
                const elapsedTime = Date.now() - createdAt.getTime();
                const estimatedTotalTime = (elapsedTime / update.progress) * 100;
                const estimatedTimeRemaining = estimatedTotalTime - elapsedTime;

                updateData.estimated_completion_time = new Date(Date.now() + estimatedTimeRemaining).toISOString();
            }
        }

        // Update task in Supabase
        const { data, error } = await supabase
            .from('tasks')
            .update(updateData)
            .eq('id', taskId)
            .select()
            .single();

        if (error) {
            console.error('Failed to update task in Supabase:', error);
            throw error;
        }

        return data;
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
        const { data, error } = await supabase
            .from('tasks')
            .select('*')
            .eq('id', taskId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Task not found
                return {
                    status: TASK_STATES.FAILED,
                    message: 'Task not found or expired',
                    taskId
                };
            }
            throw error;
        }

        // Check for task timeout
        if (data.timeout_at && new Date() > new Date(data.timeout_at) &&
            ![TASK_STATES.COMPLETED, TASK_STATES.FAILED].includes(data.status)) {
            await updateTask(taskId, {
                status: TASK_STATES.TIMEOUT,
                message: 'Task timed out'
            });
            data.status = TASK_STATES.TIMEOUT;
        }

        // Return minimal info or full task based on options
        if (options.minimal) {
            return {
                taskId: data.id,
                status: data.status,
                progress: data.progress,
                message: data.message,
                token_uri: data.token_uri,
                updated_at: data.updated_at
            };
        }

        return data;
    } catch (error) {
        console.error(`Failed to get task status for ${taskId}:`, error);
        return {
            status: TASK_STATES.FAILED,
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
        message: 'Task completed successfully',
        metadata: result.metadata || null,
        token_uri: result.tokenURI || result.token_uri || null,
        completed_at: new Date().toISOString()
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
        failed_at: new Date().toISOString()
    });
}

/**
 * Get all tasks matching filter criteria
 * @param {Object} filters - Filter criteria
 * @returns {Array} - Matching tasks
 */
export async function getTasks(filters = {}) {
    try {
        let query = supabase.from('tasks').select('*');

        // Apply filters
        if (filters.status) {
            query = query.eq('status', filters.status);
        }
        if (filters.provider) {
            query = query.eq('provider', filters.provider);
        }
        if (filters.token_id) {
            query = query.eq('token_id', filters.token_id.toString());
        }
        if (filters.minProgress) {
            query = query.gte('progress', filters.minProgress);
        }
        if (filters.createdAfter) {
            query = query.gte('created_at', filters.createdAfter);
        }
        if (filters.createdBefore) {
            query = query.lte('created_at', filters.createdBefore);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Failed to get tasks from Supabase:', error);
            throw error;
        }

        return data || [];
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
        // Get counts for different statuses
        const { data: allTasks, error } = await supabase
            .from('tasks')
            .select('status, created_at, updated_at');

        if (error) {
            console.error('Failed to get task metrics from Supabase:', error);
            return {
                totalTasks: 0,
                pendingTasks: 0,
                inProgressTasks: 0,
                completedTasks: 0,
                failedTasks: 0,
                averageCompletionTimeSeconds: 0
            };
        }

        const totalTasks = allTasks.length;
        const pendingTasks = allTasks.filter(t => t.status === TASK_STATES.PENDING).length;
        const inProgressTasks = allTasks.filter(t => t.status === TASK_STATES.IN_PROGRESS).length;
        const completedTasks = allTasks.filter(t => t.status === TASK_STATES.COMPLETED).length;
        const failedTasks = allTasks.filter(t => t.status === TASK_STATES.FAILED).length;

        // Calculate average completion time
        const completedTasksWithTimes = allTasks.filter(t =>
            t.status === TASK_STATES.COMPLETED && t.created_at && t.updated_at
        );

        let averageCompletionTime = 0;
        if (completedTasksWithTimes.length > 0) {
            const totalCompletionTime = completedTasksWithTimes.reduce((sum, task) => {
                const created = new Date(task.created_at);
                const updated = new Date(task.updated_at);
                return sum + (updated.getTime() - created.getTime());
            }, 0);
            averageCompletionTime = totalCompletionTime / completedTasksWithTimes.length;
        }

        return {
            totalTasks,
            pendingTasks,
            inProgressTasks,
            completedTasks,
            failedTasks,
            averageCompletionTimeSeconds: Math.round(averageCompletionTime / 1000)
        };
    } catch (error) {
        console.error('Failed to get task metrics:', error);
        return {
            totalTasks: 0,
            pendingTasks: 0,
            inProgressTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            averageCompletionTimeSeconds: 0
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
        const cutoffDate = new Date(Date.now() - maxAge).toISOString();

        const { data, error } = await supabase
            .from('tasks')
            .delete()
            .in('status', [TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.TIMEOUT])
            .lt('updated_at', cutoffDate);

        if (error) {
            console.error('Failed to cleanup tasks in Supabase:', error);
            throw error;
        }

        return data?.length || 0;
    } catch (error) {
        console.error('Failed to cleanup tasks:', error);
        return 0;
    }
}

/**
 * Initialize Supabase tables if they don't exist
 * Note: This would typically be done via Supabase migrations
 */
export async function initializeSupabaseTables() {
    try {
        // Test if the tasks table exists by trying to select from it
        const { data, error } = await supabase
            .from('tasks')
            .select('id')
            .limit(1);

        if (error && error.code === '42P01') {
            console.log('⚠️  Tasks table does not exist. Please create it in Supabase with the following schema:');
            console.log(`
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    token_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PENDING',
    progress INTEGER DEFAULT 0,
    message TEXT,
    metadata JSONB,
    token_uri TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    provider TEXT,
    provider_options JSONB DEFAULT '{}',
    breed TEXT,
    owner TEXT,
    timeout_at TIMESTAMP WITH TIME ZONE,
    priority TEXT DEFAULT 'normal',
    estimated_completion_time TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    error TEXT
);

-- Create indexes for performance
CREATE INDEX idx_tasks_token_id ON tasks(token_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);

-- System state table for tracking processed tokens and last block
CREATE TABLE system_state (
    id TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider preferences table
CREATE TABLE provider_preferences (
    token_id TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    options JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_provider_preferences_token_id ON provider_preferences(token_id);
CREATE INDEX idx_provider_preferences_provider ON provider_preferences(provider);
            `);
            return false;
        }

        console.log('✅ Supabase tasks table is available');
        return true;
    } catch (error) {
        console.error('Failed to initialize Supabase tables:', error);
        return false;
    }
}

/**
 * Get system state from Supabase
 * @param {string} key - The state key to retrieve
 * @param {any} defaultValue - Default value if key doesn't exist
 * @returns {Promise<any>} - The state value
 */
export async function getSystemState(key, defaultValue = null) {
    try {
        const { data, error } = await supabase
            .from('system_state')
            .select('value')
            .eq('id', key)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Row not found, return default value
                return defaultValue;
            }
            throw error;
        }

        return data?.value || defaultValue;
    } catch (error) {
        console.error(`Failed to get system state for key ${key}:`, error);
        return defaultValue;
    }
}

/**
 * Set system state in Supabase
 * @param {string} key - The state key to set
 * @param {any} value - The value to store
 * @returns {Promise<void>}
 */
export async function setSystemState(key, value) {
    try {
        const { error } = await supabase
            .from('system_state')
            .upsert({
                id: key,
                value: value,
                updated_at: new Date().toISOString()
            });

        if (error) {
            throw error;
        }

        console.log(`✅ System state updated for key: ${key}`);
    } catch (error) {
        console.error(`Failed to set system state for key ${key}:`, error);
        throw error;
    }
}

/**
 * Get provider preference for a token
 * @param {string} tokenId - The token ID
 * @returns {Promise<Object|null>} - The provider preference or null
 */
export async function getProviderPreference(tokenId) {
    try {
        const { data, error } = await supabase
            .from('provider_preferences')
            .select('*')
            .eq('token_id', tokenId.toString())
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // Row not found
                return null;
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error(`Failed to get provider preference for token ${tokenId}:`, error);
        return null;
    }
}

/**
 * Set provider preference for a token
 * @param {string} tokenId - The token ID
 * @param {string} provider - The provider name
 * @param {Object} options - Provider options
 * @returns {Promise<void>}
 */
export async function setProviderPreference(tokenId, provider, options = {}) {
    try {
        const { error } = await supabase
            .from('provider_preferences')
            .upsert({
                token_id: tokenId.toString(),
                provider,
                options,
                updated_at: new Date().toISOString()
            });

        if (error) {
            throw error;
        }

        console.log(`✅ Provider preference set for token ${tokenId}: ${provider}`);
    } catch (error) {
        console.error(`Failed to set provider preference for token ${tokenId}:`, error);
        throw error;
    }
}