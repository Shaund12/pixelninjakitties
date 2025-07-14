# Supabase Integration Setup

This document outlines how to set up Supabase for the Pixel Ninja Kitties project.

## Required Environment Variables

The following environment variables must be set:

```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

## Supabase Setup Steps

### 1. Create a Supabase Project

1. Go to [Supabase](https://supabase.com)
2. Create a new project
3. Wait for the project to be provisioned

### 2. Get Your Credentials

1. Go to Project Settings → API
2. Copy the `Project URL` (this is your `SUPABASE_URL`)
3. Copy the `anon public` key (this is your `SUPABASE_ANON_KEY`)

### 3. Create the Database Schema

Run the SQL commands in `supabase-schema.sql` in your Supabase SQL editor:

1. Go to the SQL Editor in your Supabase dashboard
2. Copy and paste the contents of `supabase-schema.sql`
3. Run the SQL commands

This will create the following tables:
- `tasks` - Stores NFT generation tasks
- `state` - Stores application state (cron state, etc.)
- `metrics` - Stores application metrics
- `provider_preferences` - Stores user preferences for image providers

### 4. Configure Environment Variables

Add the environment variables to your deployment platform:

**For Vercel:**
```bash
vercel env add SUPABASE_URL
vercel env add SUPABASE_ANON_KEY
```

**For local development:**
Create a `.env` file:
```bash
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Test the Integration

Run the test script to verify everything is working:

```bash
node test-supabase.js
```

## Migration from MongoDB

If you have existing data in MongoDB, you can use the migration script:

```bash
node migrate-preferences.js
```

This will migrate provider preferences from the old JSON file format to Supabase.

## Table Structure

### Tasks Table
- `id` - Primary key (task ID)
- `task_id` - Task identifier
- `token_id` - NFT token ID
- `provider` - Image generation provider
- `status` - Task status (pending, processing, completed, failed, canceled, timeout)
- `progress` - Task progress (0-100)
- `message` - Current status message
- `created_at` - Task creation timestamp
- `updated_at` - Last update timestamp
- `history` - JSON array of status changes
- `breed` - NFT breed
- `buyer` - Buyer address
- `result` - Task result data
- Other metadata fields...

### State Table
- `id` - Primary key
- `type` - State type (e.g., 'cron')
- `state_data` - JSON state data
- `updated_at` - Last update timestamp

### Metrics Table
- `id` - Primary key
- `type` - Metrics type (e.g., 'task_metrics')
- `data` - JSON metrics data
- `updated_at` - Last update timestamp

### Provider Preferences Table
- `id` - Primary key
- `token_id` - NFT token ID
- `provider` - Preferred image provider
- `options` - JSON provider options
- `timestamp` - Preference timestamp

## Security Considerations

- The `anon` key is used for public access and is safe to expose in client-side code
- Row Level Security (RLS) is not currently enabled but can be added for additional security
- Consider using the `service_role` key for server-side operations that need full access

## Troubleshooting

### Connection Issues
- Verify your `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
- Check that your Supabase project is active and not paused
- Ensure the database tables have been created

### Missing Data
- Run the migration script if you have existing data
- Check that the SQL schema was applied correctly
- Verify your application is using the correct environment variables

### Performance Issues
- The schema includes indexes for common queries
- Consider adding additional indexes based on your query patterns
- Monitor query performance in the Supabase dashboard

## Support

For issues specific to Supabase integration, check:
1. The test script output: `node test-supabase.js`
2. The health check endpoint: `/api/health`
3. The Supabase dashboard logs
4. The application logs for detailed error messages