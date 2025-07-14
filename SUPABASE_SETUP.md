# Supabase Database Setup for Pixel Ninja Kitties

This document explains how to set up and configure the Supabase database for the Pixel Ninja Kitties application.

## Prerequisites

- Supabase account and project
- Node.js environment with npm
- Environment variables configured

## Environment Variables

Add these environment variables to your deployment environment:

```bash
# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_KEY=your-service-key-here  # Optional, for automated setup

# Existing variables (blockchain, etc.)
RPC_URL=your-rpc-url
CONTRACT_ADDRESS=your-contract-address
PRIVATE_KEY=your-private-key
PLACEHOLDER_URI=your-placeholder-uri
IMAGE_PROVIDER=dall-e
```

## Database Setup

### Option 1: Automated Setup (Recommended)

If you have the `SUPABASE_SERVICE_KEY` environment variable set:

```bash
npm run setup-supabase
```

This will automatically create all required tables and functions.

### Option 2: Manual Setup

1. Go to your Supabase dashboard
2. Navigate to the SQL Editor
3. Copy and paste the contents of `scripts/supabase-schema.sql`
4. Execute the SQL

### Option 3: Manual SQL Execution

If you don't have the service key, run:

```bash
node scripts/setup-supabase.js
```

This will display the SQL that you need to execute manually in your Supabase dashboard.

## Database Schema

The setup creates the following tables:

### `tasks` table
- Stores NFT generation tasks
- Tracks status, progress, and results
- Includes metadata and error handling

### `state` table
- Stores application state (cron job state, etc.)
- Uses `state_data` JSONB column for flexible data storage
- Includes `type` field for different state types

### `metrics` table
- Stores application metrics and statistics
- Uses JSONB for flexible metric data

## Database Functions

The setup creates these PostgreSQL functions:

- `create_table_if_not_exists()` - Creates tables if they don't exist
- `upsert_state_data()` - Upserts state data by type
- `get_state_data()` - Retrieves state data by type
- `upsert_metrics_data()` - Upserts metrics data by type

## Using the Supabase Implementation

### For Development

To use the Supabase implementation locally:

1. Set up your environment variables
2. Run the database setup
3. Use the Supabase version of the cron job: `api/cron-supabase.js`

### For Production

1. Deploy the Supabase schema to your production database
2. Set the environment variables in your production environment
3. Update your cron job configuration to use the Supabase version

### Migration from MongoDB

If you're migrating from MongoDB:

1. The state structure is compatible - the MongoDB state will work with Supabase
2. Task data can be migrated using the same structure
3. The API interfaces are identical

## Testing the Setup

Test the database connection:

```bash
node -e "
import { connectToSupabase, supabaseHealthCheck } from './scripts/supabase.js';
await connectToSupabase();
console.log(await supabaseHealthCheck());
"
```

## Troubleshooting

### Common Issues

1. **"Could not find function"** - Make sure you executed the full schema SQL
2. **"Column does not exist"** - The `state_data` column should be created by the schema
3. **Connection errors** - Verify your `SUPABASE_URL` and `SUPABASE_ANON_KEY`

### Error Codes

- `PGRST204` - Column not found in schema cache
- `PGRST202` - Function not found in schema cache
- `42703` - Column does not exist in PostgreSQL

### Verification

Check that tables exist:

```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('tasks', 'state', 'metrics');
```

Check that functions exist:

```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('create_table_if_not_exists', 'upsert_state_data', 'get_state_data');
```

## Security Considerations

- Use Row Level Security (RLS) policies in production
- Store sensitive keys securely
- Use service key only for setup, anon key for runtime
- Consider IP restrictions for database access

## Support

If you encounter issues:

1. Check the Supabase logs in your dashboard
2. Verify all environment variables are set correctly
3. Ensure the database schema was created successfully
4. Check the application logs for specific error messages