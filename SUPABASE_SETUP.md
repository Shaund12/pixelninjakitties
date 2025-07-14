# Supabase Setup Guide

This project now uses Supabase for task management instead of MongoDB. Here's how to set it up:

## 1. Environment Variables

Add these to your `.env` file:

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 2. Database Table Setup

Create the `tasks` table in your Supabase project with this SQL:

```sql
-- Create the tasks table
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

-- Create an updated_at trigger (optional but recommended)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tasks_updated_at 
    BEFORE UPDATE ON tasks 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();
```

## 3. Testing the Setup

You can test the Supabase connection by running:

```bash
node test-supabase.js
```

This will verify that:
- Supabase connection works
- Tasks can be created, updated, and completed
- All CRUD operations function correctly

## 4. Task States

The system uses these task states:

- `PENDING`: Task created but not started
- `IN_PROGRESS`: Task is being processed
- `COMPLETED`: Task finished successfully (shows "🎉 Mint Successful")
- `FAILED`: Task failed (shows error message)
- `TIMEOUT`: Task exceeded timeout limit (shows timeout message)

## 5. Key Features

- **Proper timing**: Frontend only shows success when task is COMPLETED AND has token_uri
- **Timeout handling**: 90-second timeout with user-friendly messages
- **Progress tracking**: Real-time progress updates during AI generation
- **Error handling**: Graceful failure states with retry options
- **Polling**: 2-second intervals for responsive UI updates

## 6. Migration from MongoDB

All MongoDB references have been removed:
- ❌ `mongodb` package removed from package.json
- ❌ `scripts/taskManager.js` (MongoDB-based) deleted
- ❌ `api/mongodb-test.js` removed
- ✅ `scripts/supabaseTaskManager.js` created
- ✅ All imports updated to use Supabase
- ✅ Health checks updated for Supabase

The system is now 100% Supabase-based with no MongoDB dependencies.