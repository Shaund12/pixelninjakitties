# Migration Guide: MongoDB to Supabase

If you're currently using MongoDB and want to migrate to Supabase, or if you're getting Supabase errors but your code is using MongoDB, follow this guide.

## Identifying Your Current Database

Check your environment variables:
- If you have `MONGODB_URI` and your logs show MongoDB connections, you're using MongoDB
- If you have `SUPABASE_URL` and `SUPABASE_ANON_KEY`, you're configured for Supabase

## Migration Steps

### 1. Set up Supabase Database

1. Create a Supabase account and project
2. Run the database setup:
   ```bash
   npm run setup-supabase
   ```
3. Follow the instructions to execute the SQL in your Supabase dashboard

### 2. Update Environment Variables

Replace MongoDB variables with Supabase variables:

```bash
# Remove MongoDB variables
# MONGODB_URI=mongodb://...

# Add Supabase variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Update Your Application Code

Replace the MongoDB cron job with the Supabase version:

```javascript
// Instead of using api/cron.js (MongoDB version)
// Use api/cron-supabase.js (Supabase version)
```

For Vercel deployments, update your `vercel.json`:

```json
{
  "functions": {
    "api/cron-supabase.js": {
      "maxDuration": 300
    }
  },
  "crons": [
    {
      "path": "/api/cron-supabase",
      "schedule": "* * * * *"
    }
  ]
}
```

### 4. Data Migration (Optional)

If you have existing data in MongoDB that you want to migrate:

#### Export State Data from MongoDB

```javascript
// Run this script to export your MongoDB state
import { connectToMongoDB, loadState } from './scripts/mongodb.js';

await connectToMongoDB();
const cronState = await loadState('cron', {});
console.log('MongoDB state:', JSON.stringify(cronState, null, 2));
```

#### Import State Data to Supabase

```javascript
// Run this script to import state to Supabase
import { connectToSupabase, saveState } from './scripts/supabase.js';

await connectToSupabase();
const stateToImport = { /* your exported state here */ };
await saveState('cron', stateToImport);
console.log('State imported to Supabase');
```

### 5. Test the Migration

Run the Supabase test to ensure everything works:

```bash
npm run test-supabase
```

## Troubleshooting Migration Issues

### Environment Configuration Issues

If you see errors like:
- `Could not find the 'state_data' column`
- `Could not find the function public.create_table_if_not_exists`

This means your application is trying to connect to Supabase but the database schema isn't set up. Run:

```bash
npm run setup-supabase
```

### Mixed Database References

If your logs show both MongoDB and Supabase references, you might have:
- Old cached deployments
- Multiple environment configurations
- Different versions of code in different environments

**Solution**: Ensure all environments use the same database type and have the correct environment variables.

### Performance Considerations

**MongoDB vs Supabase**:
- MongoDB: Direct database access, may be faster for simple operations
- Supabase: REST API layer, includes built-in authentication and real-time features

**Data Structure**:
- Both use JSON/JSONB for flexible data storage
- State structure is compatible between both systems
- Task data models are identical

### Rollback Plan

If you need to rollback to MongoDB:

1. Restore your MongoDB environment variables
2. Use the original `api/cron.js` file
3. Update your deployment configuration
4. Import any new state data from Supabase back to MongoDB

## Production Deployment

### Vercel

1. Set environment variables in Vercel dashboard
2. Update `vercel.json` to use `api/cron-supabase.js`
3. Deploy and test

### Other Platforms

1. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your environment
2. Ensure your cron job calls the Supabase version
3. Test the database connection

## Why Migrate to Supabase?

**Advantages of Supabase**:
- Built-in authentication and authorization
- Real-time subscriptions
- Automatic API generation
- Built-in dashboard and monitoring
- Row Level Security (RLS)
- Better integration with modern web frameworks

**When to Use MongoDB**:
- You need complex aggregations
- You prefer direct database access
- You have existing MongoDB expertise
- You need specific MongoDB features

## Support

If you encounter issues during migration:

1. Check that all environment variables are set correctly
2. Verify the Supabase database schema was created
3. Test the connection with `npm run test-supabase`
4. Check the Supabase dashboard for error logs
5. Review the application logs for specific error messages