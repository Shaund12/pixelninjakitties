# MongoDB to Supabase Migration

## Overview
This document describes the complete migration from MongoDB to Supabase for the Pixel Ninja Kitties project.

## Changes Made

### 1. New Supabase Integration
- **Created:** `scripts/supabase.js` - Complete Supabase connection and utility module
- **Added:** `@supabase/supabase-js` dependency to `package.json`
- **Removed:** `mongodb` dependency from `package.json`

### 2. Task Management System
- **Replaced:** `scripts/taskManager.js` with Supabase-based implementation
- **Backup:** Original MongoDB version saved as `scripts/taskManager-mongodb.js.bak`
- **Features:** All task management functionality now uses Supabase tables

### 3. Health Monitoring
- **Updated:** `scripts/healthCheck.js` to use Supabase health checks
- **Replaced:** MongoDB health checks with Supabase connectivity tests

### 4. Server Configuration
- **Updated:** `server.js` to use Supabase instead of MongoDB
- **Changed:** Connection initialization from `connectToMongoDB()` to `connectToSupabase()`

### 5. API Endpoints
- **Updated:** `api/cron.js` to use Supabase for state persistence
- **Updated:** `api/test-env.js` to test Supabase connection
- **Updated:** `api/mongodb-test.js` to test Supabase (renamed for backwards compatibility)
- **Backup:** Original MongoDB versions saved with `.bak` extension

### 6. Removed Files
- **Removed:** `scripts/mongodb.js` (backed up as `scripts/mongodb.js.bak`)
- **Removed:** MongoDB-specific implementations

## Environment Variables

### Required (New)
```env
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anonymous-key
```

### No Longer Required (Removed)
```env
MONGODB_URI=... # Not needed anymore
```

## Database Schema

### Supabase Tables
The migration creates the following tables in Supabase:

#### 1. `tasks` table
```sql
CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    task_id TEXT UNIQUE NOT NULL,
    token_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled', 'timeout')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    message TEXT,
    provider TEXT,
    breed TEXT,
    buyer TEXT,
    result JSONB,
    error_message TEXT,
    history JSONB DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- ... additional fields
);
```

#### 2. `state` table
```sql
CREATE TABLE IF NOT EXISTS state (
    type TEXT PRIMARY KEY,
    state_data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

#### 3. `metrics` table
```sql
CREATE TABLE IF NOT EXISTS metrics (
    type TEXT PRIMARY KEY,
    data JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## Migration Benefits

1. **Simplified Setup:** No need to manage MongoDB connection strings
2. **Better Integration:** Supabase provides built-in APIs and dashboard
3. **Improved Scalability:** Supabase handles scaling automatically
4. **Enhanced Security:** Built-in authentication and authorization
5. **Real-time Features:** Supabase provides real-time subscriptions if needed

## Testing

To test the migration:

1. Set up Supabase project and get credentials
2. Configure environment variables
3. Run the server and check for successful Supabase connection
4. Test API endpoints like `/api/health` and `/api/mongodb-test` (now tests Supabase)
5. Test cron functionality with `/api/cron`

## Error Resolution

If you see "MONGODB_URI not configured" error, it means:
1. Old MongoDB code is still being used somewhere
2. Environment variables need to be updated to use Supabase
3. The migration may not be complete

## Rollback Plan

If needed, you can rollback by:
1. Restoring `.bak` files to their original names
2. Reinstalling MongoDB dependency
3. Configuring MONGODB_URI environment variable
4. Reverting server.js changes

## Files Changed

### Modified Files:
- `package.json`
- `server.js`
- `scripts/healthCheck.js`
- `scripts/taskManager.js`
- `api/cron.js`
- `api/test-env.js`
- `api/mongodb-test.js`

### New Files:
- `scripts/supabase.js`

### Backup Files:
- `scripts/mongodb.js.bak`
- `scripts/taskManager-mongodb.js.bak`
- `api/cron-mongodb.js.bak`
- `api/test-env-mongodb.js.bak`
- `api/mongodb-test.js.bak`

## Next Steps

1. Set up Supabase project
2. Configure environment variables
3. Test all functionality
4. Remove backup files if migration is successful
5. Update deployment configurations to use Supabase credentials