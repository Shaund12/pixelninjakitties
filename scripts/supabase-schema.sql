-- Supabase Database Schema Setup for Pixel Ninja Kitties
-- This script creates the required tables and functions for the application

-- Create the tasks table
CREATE TABLE IF NOT EXISTS tasks (
    id VARCHAR PRIMARY KEY,
    task_id VARCHAR UNIQUE NOT NULL,
    token_id INTEGER NOT NULL,
    status VARCHAR NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled', 'timeout')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    message TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    result JSONB
);

-- Create the state table with state_data column
CREATE TABLE IF NOT EXISTS state (
    id SERIAL PRIMARY KEY,
    type VARCHAR UNIQUE NOT NULL,
    state_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create the metrics table
CREATE TABLE IF NOT EXISTS metrics (
    id SERIAL PRIMARY KEY,
    type VARCHAR UNIQUE NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tasks_token_id ON tasks(token_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX IF NOT EXISTS idx_tasks_task_id ON tasks(task_id);

CREATE INDEX IF NOT EXISTS idx_state_type ON state(type);
CREATE INDEX IF NOT EXISTS idx_metrics_type ON metrics(type);

-- Create the create_table_if_not_exists function
CREATE OR REPLACE FUNCTION create_table_if_not_exists(table_name TEXT, table_sql TEXT)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = table_name
    ) THEN
        RETURN FALSE; -- Table already exists
    END IF;
    
    -- Execute the CREATE TABLE statement
    EXECUTE table_sql;
    RETURN TRUE; -- Table was created
EXCEPTION
    WHEN duplicate_table THEN
        RETURN FALSE; -- Table already exists
    WHEN OTHERS THEN
        RAISE; -- Re-raise other errors
END;
$$ LANGUAGE plpgsql;

-- Create helper function to upsert state data
CREATE OR REPLACE FUNCTION upsert_state_data(state_type TEXT, state_data_json JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO state (type, state_data, updated_at)
    VALUES (state_type, state_data_json, NOW())
    ON CONFLICT (type) 
    DO UPDATE SET 
        state_data = EXCLUDED.state_data,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Create helper function to get state data
CREATE OR REPLACE FUNCTION get_state_data(state_type TEXT)
RETURNS JSONB AS $$
DECLARE
    result JSONB;
BEGIN
    SELECT state_data INTO result
    FROM state
    WHERE type = state_type;
    
    RETURN COALESCE(result, '{}'::JSONB);
END;
$$ LANGUAGE plpgsql;

-- Create helper function to upsert metrics data
CREATE OR REPLACE FUNCTION upsert_metrics_data(metrics_type TEXT, metrics_data_json JSONB)
RETURNS VOID AS $$
BEGIN
    INSERT INTO metrics (type, data, updated_at)
    VALUES (metrics_type, metrics_data_json, NOW())
    ON CONFLICT (type) 
    DO UPDATE SET 
        data = EXCLUDED.data,
        updated_at = EXCLUDED.updated_at;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at columns
CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_state_updated_at 
    BEFORE UPDATE ON state 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_metrics_updated_at 
    BEFORE UPDATE ON metrics 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant necessary permissions (adjust as needed for your setup)
-- Note: These would need to be adjusted based on your actual Supabase setup
-- ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE state ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

-- Example RLS policies (uncomment and adjust as needed)
-- CREATE POLICY "Enable all operations for authenticated users" ON tasks FOR ALL USING (true);
-- CREATE POLICY "Enable all operations for authenticated users" ON state FOR ALL USING (true);
-- CREATE POLICY "Enable all operations for authenticated users" ON metrics FOR ALL USING (true);