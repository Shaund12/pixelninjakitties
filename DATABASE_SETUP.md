# Database Setup for Pixel Ninja Kitties

This application supports both MongoDB and Supabase (PostgreSQL) as database backends.

## Supabase Setup

If you're using Supabase and encountering the error `relation "public.state" does not exist`, follow these steps:

1. **Go to your Supabase dashboard**
2. **Navigate to the SQL Editor**
3. **Run the following SQL to create the required table:**

```sql
-- Create the state table that the application is looking for
CREATE TABLE IF NOT EXISTS public.state (
    type VARCHAR(50) PRIMARY KEY,
    state JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_state_updated_at ON public.state(updated_at);

-- Insert initial cron state
INSERT INTO public.state (type, state, updated_at) 
VALUES ('cron', '{"lastProcessedBlock": 0, "processedTokens": [], "pendingTasks": []}', NOW())
ON CONFLICT (type) DO NOTHING;
```

4. **Set your environment variables:**
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Your Supabase anon key

## MongoDB Setup

If you prefer to use MongoDB:

1. **Set your environment variable:**
   - `MONGODB_URI`: Your MongoDB connection string

2. **The application will automatically create the required collections.**

## Environment Variables

The application will automatically detect which database to use based on the environment variables:

- If `SUPABASE_URL` and `SUPABASE_ANON_KEY` are set, it will use Supabase
- If `MONGODB_URI` is set, it will use MongoDB
- If neither is set, the application will throw an error

## Error Resolution

The specific error mentioned in the issue:

```
relation "public.state" does not exist
```

This error occurs when the Supabase deployment is missing the `public.state` table. Run the SQL script above in your Supabase dashboard to resolve this issue.

## Testing

To test your database connection, you can use the test script:

```bash
node scripts/test-database.js
```

This will verify that the database connection works and the state table is accessible.