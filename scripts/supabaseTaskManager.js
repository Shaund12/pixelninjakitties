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

let supabase;
if (!supabaseUrl || !supabaseKey) {
    console.warn('⚠️ SUPABASE_URL and SUPABASE_ANON_KEY environment variables not set - using mock client');
    // Create mock client for development
    supabase = {
        from: (table) => ({
            select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }),
            insert: () => Promise.resolve({ data: [{ id: 'mock-id' }], error: null }),
            update: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
            delete: () => ({ lt: () => Promise.resolve({ data: [], error: null }) })
        })
    };
} else {
    supabase = createClient(supabaseUrl, supabaseKey);
}

// Task states
export const TASK_STATES = {
    PENDING: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    TIMEOUT: 'TIMEOUT',
};

/**
 * Create (or reuse) a task in Supabase.
 * If there's already a PENDING or IN_PROGRESS task for this token, return it.
 */
export async function createTask(tokenId, provider, options = {}) {
    const idStr = tokenId.toString();

    // Look for an existing non-terminal task to avoid duplicates
    const { data: existing, error: fetchErr } = await supabase
        .from('tasks')
        .select('id,status')
        .eq('token_id', idStr)
        .in('status', [TASK_STATES.PENDING, TASK_STATES.IN_PROGRESS])
        .limit(1)
        .single();

    if (fetchErr && fetchErr.code !== 'PGRST116') {
        console.error('❌ createTask lookup error:', fetchErr);
        throw fetchErr;
    }
    if (existing) {
        console.log(`ℹ️ Reusing existing task ${existing.id} (status=${existing.status}) for token ${idStr}`);
        return existing.id;
    }

    // Generate unique task ID
    const timestamp = Date.now();
    const randomPart = crypto.randomBytes(8).toString('hex');
    const taskId = `task_${timestamp}_${randomPart}`;

    // Build metadata payload
    const metadata = {
        ...(options.blockNumber && { blockNumber: options.blockNumber }),
        ...(options.transactionHash && { transactionHash: options.transactionHash }),
        ...(options.metadata && options.metadata),
    };

    const task = {
        id: taskId,
        token_id: idStr,
        status: TASK_STATES.PENDING,
        progress: 0,
        message: 'Task created',
        metadata: Object.keys(metadata).length ? metadata : null,
        token_uri: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        provider,
        provider_options: options.providerOptions || {},
        breed: options.breed || null,
        owner: options.buyer || options.owner || null,
        timeout_at: options.timeout
            ? new Date(Date.now() + options.timeout).toISOString()
            : null,
        priority: options.priority || 'normal',
        estimated_completion_time: null,
    };

    const { data, error } = await supabase
        .from('tasks')
        .insert([task])
        .select()
        .single();

    if (error) {
        console.error('❌ createTask insert failed:', error);
        throw error;
    }

    console.log(`✅ Task created in Supabase: ${taskId}`);
    return taskId;
}

/**
 * Update an existing task.
 * If you report progress > 0 && < 100, status auto‑upgrades to IN_PROGRESS.
 */
export async function updateTask(taskId, update) {
    const now = new Date().toISOString();

    // Build update payload
    const updateData = {
        updated_at: now,
        ...(update.status && { status: update.status }),
        ...(update.progress !== undefined && { progress: update.progress }),
        ...(update.message && { message: update.message }),
        ...(update.metadata && { metadata: update.metadata }),
        ...(update.token_uri && { token_uri: update.token_uri }),
        ...(update.provider && { provider: update.provider }),
        ...(update.provider_options && { provider_options: update.provider_options }),
        ...(update.completed_at && { completed_at: update.completed_at }),
        ...(update.failed_at && { failed_at: update.failed_at }),
    };

    // Auto‑bump to IN_PROGRESS if progress is in (0,100) and no explicit status
    if (
        update.progress !== undefined &&
        update.progress > 0 &&
        update.progress < 100 &&
        !updateData.status
    ) {
        updateData.status = TASK_STATES.IN_PROGRESS;
    }

    // Estimate remaining time if appropriate
    if (
        update.progress !== undefined &&
        update.progress > 0 &&
        update.progress < 100
    ) {
        const { data: orig } = await supabase
            .from('tasks')
            .select('created_at, progress')
            .eq('id', taskId)
            .single();

        if (orig && orig.progress < update.progress) {
            const createdMs = new Date(orig.created_at).getTime();
            const elapsed = Date.now() - createdMs;
            const totalEstimate = (elapsed / update.progress) * 100;
            const remaining = totalEstimate - elapsed;
            updateData.estimated_completion_time = new Date(Date.now() + remaining).toISOString();
        }
    }

    const { data, error } = await supabase
        .from('tasks')
        .update(updateData)
        .eq('id', taskId)
        .select()
        .single();

    if (error) {
        console.error(`❌ updateTask failed for ${taskId}:`, error);
        throw error;
    }
    return data;
}

/**
 * Fetch the latest status for a task.
 * Supports an optional `minimal` mode.
 */
export async function getTaskStatus(taskId, options = {}) {
    const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('id', taskId)
        .single();

    if (error) {
        // Not found → treat as failure
        if (error.code === 'PGRST116') {
            return { status: TASK_STATES.FAILED, message: 'Task not found', taskId };
        }
        console.error(`❌ getTaskStatus error for ${taskId}:`, error);
        throw error;
    }

    // Timeout check
    if (
        data.timeout_at &&
        new Date() > new Date(data.timeout_at) &&
        ![TASK_STATES.COMPLETED, TASK_STATES.FAILED].includes(data.status)
    ) {
        await updateTask(taskId, {
            status: TASK_STATES.TIMEOUT,
            message: 'Task timed out',
            failed_at: new Date().toISOString(),
        });
        data.status = TASK_STATES.TIMEOUT;
        data.message = 'Task timed out';
    }

    if (options.minimal) {
        return {
            taskId: data.id,
            status: data.status,
            progress: data.progress,
            message: data.message,
            token_uri: data.token_uri,
            updated_at: data.updated_at,
        };
    }
    return data;
}

/**
 * Mark a task completed
 */
export async function completeTask(taskId, result) {
    return updateTask(taskId, {
        status: TASK_STATES.COMPLETED,
        progress: 100,
        message: 'Task completed successfully',
        metadata: result.metadata || null,
        token_uri: result.tokenURI || result.token_uri || null,
        completed_at: new Date().toISOString(),
    });
}

/**
 * Mark a task failed
 */
export async function failTask(taskId, error) {
    return updateTask(taskId, {
        status: TASK_STATES.FAILED,
        message: error.message || 'Task failed',
        failed_at: new Date().toISOString(),
    });
}

/**
 * List tasks with optional filters
 */
export async function getTasks(filters = {}) {
    let q = supabase.from('tasks').select('*');
    if (filters.status) q = q.eq('status', filters.status);
    if (filters.provider) q = q.eq('provider', filters.provider);
    if (filters.token_id) q = q.eq('token_id', filters.token_id.toString());
    if (filters.minProgress) q = q.gte('progress', filters.minProgress);
    if (filters.createdAfter) q = q.gte('created_at', filters.createdAfter);
    if (filters.createdBefore) q = q.lte('created_at', filters.createdBefore);

    const { data, error } = await q;
    if (error) {
        console.error('❌ getTasks error:', error);
        throw error;
    }
    return data || [];
}

/**
 * Compute metrics (counts, average times)
 */
export async function getTaskMetrics() {
    const { data: all, error } = await supabase
        .from('tasks')
        .select('status, created_at, updated_at');

    if (error) {
        console.error('❌ getTaskMetrics error:', error);
        return {
            totalTasks: 0,
            pendingTasks: 0,
            inProgressTasks: 0,
            completedTasks: 0,
            failedTasks: 0,
            averageCompletionTimeSeconds: 0,
        };
    }

    const total = all.length;
    const pending = all.filter(t => t.status === TASK_STATES.PENDING).length;
    const inProg = all.filter(t => t.status === TASK_STATES.IN_PROGRESS).length;
    const completed = all.filter(t => t.status === TASK_STATES.COMPLETED).length;
    const failed = all.filter(t => t.status === TASK_STATES.FAILED).length;

    const done = all.filter(t => t.status === TASK_STATES.COMPLETED && t.created_at && t.updated_at);
    let avgMs = 0;
    if (done.length) {
        const sum = done.reduce((acc, t) => acc + (new Date(t.updated_at) - new Date(t.created_at)), 0);
        avgMs = sum / done.length;
    }

    return {
        totalTasks: total,
        pendingTasks: pending,
        inProgressTasks: inProg,
        completedTasks: completed,
        failedTasks: failed,
        averageCompletionTimeSeconds: Math.round(avgMs / 1000),
    };
}

/**
 * Cleanup old completed/failed tasks
 */
export async function cleanupTasks(maxAge = 24 * 60 * 60 * 1000) {
    const cutoff = new Date(Date.now() - maxAge).toISOString();
    const { data, error } = await supabase
        .from('tasks')
        .delete()
        .in('status', [TASK_STATES.COMPLETED, TASK_STATES.FAILED, TASK_STATES.TIMEOUT])
        .lt('updated_at', cutoff);

    if (error) {
        console.error('❌ cleanupTasks error:', error);
        throw error;
    }
    return data?.length || 0;
}

/**
 * Print SQL snippet if table doesn’t exist
 */
export async function initializeSupabaseTables() {
    const { error } = await supabase.from('tasks').select('id').limit(1);
    if (error && error.code === '42P01') {
        console.log('⚠️ Tasks table missing. Please run:');
        console.log(`
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL,
  status TEXT   NOT NULL DEFAULT 'PENDING',
  progress INTEGER DEFAULT 0,
  message TEXT,
  metadata JSONB,
  token_uri TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  provider TEXT,
  provider_options JSONB DEFAULT '{}',
  breed TEXT,
  owner TEXT,
  timeout_at TIMESTAMPTZ,
  priority TEXT DEFAULT 'normal',
  estimated_completion_time TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT
);
CREATE INDEX idx_tasks_token_id   ON tasks(token_id);
CREATE INDEX idx_tasks_status     ON tasks(status);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
    `);
        return false;
    }
    if (error) {
        console.error('❌ initializeSupabaseTables error:', error);
        return false;
    }
    console.log('✅ Supabase tasks table is available');
    return true;
}
