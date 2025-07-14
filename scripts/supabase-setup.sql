-- Supabase Database Setup Script
-- This script creates the necessary tables for the pixelninjakitties application

-- Create the state table that the application is looking for
CREATE TABLE IF NOT EXISTS public.state (
    type VARCHAR(50) PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_state_updated_at ON public.state(updated_at);

-- Create tasks table for task management
CREATE TABLE IF NOT EXISTS public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id VARCHAR(100) UNIQUE NOT NULL,
    token_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for tasks table
CREATE INDEX IF NOT EXISTS idx_tasks_token_id ON public.tasks(token_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON public.tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON public.tasks(updated_at);

-- Create metrics table for performance tracking
CREATE TABLE IF NOT EXISTS public.metrics (
    type VARCHAR(50) PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert initial state if not exists
INSERT INTO public.state (type, state, updated_at) 
VALUES ('cron', '{"lastProcessedBlock": 0, "processedTokens": [], "pendingTasks": []}', NOW())
ON CONFLICT (type) DO NOTHING;

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_state_updated_at BEFORE UPDATE ON public.state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_metrics_updated_at BEFORE UPDATE ON public.metrics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();