# Supabase Database Setup

This application now uses Supabase instead of MongoDB for data persistence. Follow these steps to set up your Supabase database.

## Environment Variables

Add these environment variables to your `.env` file:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Database Schema

Create the following tables in your Supabase dashboard:

### 1. Tasks Table (`tasks`)

```sql
CREATE TABLE tasks (
    id TEXT PRIMARY KEY,
    task_id TEXT UNIQUE NOT NULL,
    token_id BIGINT NOT NULL,
    provider TEXT NOT NULL,
    status TEXT NOT NULL,
    progress SMALLINT DEFAULT 0,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    history JSONB DEFAULT '[]'::jsonb,
    timeout_at TIMESTAMPTZ,
    priority TEXT DEFAULT 'normal',
    provider_options JSONB DEFAULT '{}'::jsonb,
    estimated_completion_time TIMESTAMPTZ,
    result JSONB,
    error TEXT,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ
);

-- Create indexes
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_token_id ON tasks(token_id);
CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
```

### 2. State Table (`state`)

```sql
CREATE TABLE state (
    id BIGSERIAL PRIMARY KEY,
    type TEXT UNIQUE NOT NULL,
    state JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index
CREATE UNIQUE INDEX idx_state_type ON state(type);
```

### 3. Metrics Table (`metrics`)

```sql
CREATE TABLE metrics (
    id BIGSERIAL PRIMARY KEY,
    type TEXT UNIQUE NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index
CREATE UNIQUE INDEX idx_metrics_type ON metrics(type);
```

## Row Level Security (RLS)

For security, you should enable RLS on all tables and create appropriate policies:

```sql
-- Enable RLS on all tables
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE state ENABLE ROW LEVEL SECURITY;
ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;

-- Create policies (adjust based on your security requirements)
-- These are examples - modify based on your authentication setup

-- Allow all operations for authenticated users (modify as needed)
CREATE POLICY "Allow all for authenticated users" ON tasks
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON state
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON metrics
    FOR ALL USING (auth.role() = 'authenticated');
```

## Testing the Setup

1. Start your application with the Supabase environment variables set
2. Visit `/api/supabase-test` to test the connection and verify tables are created
3. Check the `/api/health` endpoint to ensure Supabase is connected

## Migration from MongoDB

If you're migrating from MongoDB, you'll need to:

1. Export your existing MongoDB data
2. Transform the data to match the new Supabase schema
3. Import the data into your Supabase tables

The key differences:
- MongoDB `_id` becomes `id` in Supabase
- MongoDB `ObjectId` becomes `TEXT` in Supabase
- MongoDB `Date` objects become `TIMESTAMPTZ` in Supabase
- MongoDB field names with camelCase become snake_case in Supabase

## API Endpoints

- `/api/supabase-test` - Test Supabase connection and table structure
- `/api/health` - Health check including Supabase status
- `/api/task/:taskId` - Get task status (uses Supabase)

## Troubleshooting

1. **Connection Issues**: Verify your `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
2. **Table Not Found**: Ensure all tables are created with the correct schema
3. **Permission Errors**: Check your RLS policies if you have authentication enabled
4. **Data Type Errors**: Ensure your data matches the expected PostgreSQL types