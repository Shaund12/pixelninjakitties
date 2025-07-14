-- Supabase Database Schema for Pixel Ninja Kitties
-- This file contains the SQL schema needed to create the tables in Supabase

-- Tasks table - stores all NFT generation tasks
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR(255) PRIMARY KEY,
    task_id VARCHAR(255) UNIQUE NOT NULL,
    token_id INTEGER NOT NULL,
    provider VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled', 'timeout')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    history JSONB DEFAULT '[]'::jsonb,
    timeout_at TIMESTAMP WITH TIME ZONE,
    priority VARCHAR(50) DEFAULT 'normal',
    provider_options JSONB DEFAULT '{}'::jsonb,
    estimated_completion_time TIMESTAMP WITH TIME ZONE,
    breed VARCHAR(100),
    buyer VARCHAR(100),
    created_from VARCHAR(100),
    block_number BIGINT,
    transaction_hash VARCHAR(100),
    result JSONB,
    error TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    canceled_at TIMESTAMP WITH TIME ZONE
);

-- State table - stores application state (cron state, etc.)
CREATE TABLE IF NOT EXISTS state (
    id SERIAL PRIMARY KEY,
    type VARCHAR(100) UNIQUE NOT NULL,
    state_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Metrics table - stores application metrics
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    type VARCHAR(100) UNIQUE NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Provider preferences table - stores user preferences for image providers
CREATE TABLE IF NOT EXISTS provider_preferences (
    id SERIAL PRIMARY KEY,
    token_id INTEGER UNIQUE NOT NULL,
    provider VARCHAR(100) NOT NULL,
    options JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tasks_token_id ON tasks(token_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_breed ON tasks(breed);
CREATE INDEX IF NOT EXISTS idx_tasks_block_number ON tasks(block_number);

CREATE INDEX IF NOT EXISTS idx_state_type ON state(type);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(type);
CREATE INDEX IF NOT EXISTS idx_provider_preferences_token_id ON provider_preferences(token_id);

-- RLS (Row Level Security) policies can be added here if needed
-- For now, we'll use the service role key which bypasses RLS