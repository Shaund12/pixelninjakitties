# Supabase-Backed Personalization & Analytics

This document describes the new Supabase-powered personalization and analytics features for the Pixel Ninja Kitties marketplace.

## Overview

The marketplace now uses Supabase instead of localStorage for user data, providing:
- **Persistent favorites** that sync across devices
- **User preferences** including saved filters and searches
- **Activity tracking** for analytics and trending features
- **Real-time notifications** for marketplace events
- **Wallet-based authentication** using Web3 wallet addresses

## Features

### 1. Persistent Favorites
- Favorites are stored in Supabase and linked to wallet addresses
- No more losing favorites when switching devices or browsers
- Real-time sync across all user sessions

### 2. Saved Searches
- Users can save filter combinations for quick access
- Shareable search URLs (coming soon)
- Personalized search recommendations

### 3. Activity Analytics
- Track user interactions (views, favorites, purchases)
- Generate trending items based on recent activity
- Marketplace analytics dashboard

### 4. Real-time Notifications
- Live notifications for new listings
- Updates when favorited items are sold
- Real-time marketplace activity feed

### 5. Trending Carousel
- Dynamic carousel showing popular items
- Based on real user activity data
- Updates in real-time

## Database Schema

The system uses four main tables:

### `users`
- `user_id` (TEXT, PRIMARY KEY): Lowercase wallet address
- `created_at` (TIMESTAMP): Account creation time
- `last_activity` (TIMESTAMP): Last activity timestamp

### `favorites`
- `id` (UUID, PRIMARY KEY): Unique identifier
- `user_id` (TEXT, FOREIGN KEY): User wallet address
- `token_id` (INTEGER): NFT token ID
- `created_at` (TIMESTAMP): When favorited

### `preferences`
- `id` (UUID, PRIMARY KEY): Unique identifier
- `user_id` (TEXT, FOREIGN KEY): User wallet address
- `filters` (JSONB): Saved filter preferences
- `theme` (TEXT): UI theme preference
- `notifications` (BOOLEAN): Notification preferences
- `saved_searches` (JSONB): Array of saved search configurations

### `activity_logs`
- `id` (UUID, PRIMARY KEY): Unique identifier
- `user_id` (TEXT, FOREIGN KEY): User wallet address
- `event_type` (TEXT): Type of activity
- `token_id` (INTEGER): Related NFT token (if applicable)
- `metadata` (JSONB): Additional event data
- `timestamp` (TIMESTAMP): When the event occurred

## Setup Instructions

### 1. Supabase Project Setup

1. Create a new Supabase project at https://supabase.com
2. Copy your project URL and anon key from the API settings
3. Add environment variables to your `.env` file:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```

### 2. Database Schema Setup

Run the database setup script:
```bash
# Make sure you have SUPABASE_SERVICE_KEY in your environment
export SUPABASE_SERVICE_KEY=your-service-role-key
node utils/setupSupabase.js
```

Or manually execute the SQL schema:
```sql
-- Copy and paste the contents of utils/supabase_schema.sql
-- into your Supabase SQL editor
```

### 3. Enable Realtime

In your Supabase dashboard:
1. Go to Database → Replication
2. Enable realtime for the `activity_logs` table
3. This enables real-time notifications

### 4. Row Level Security (RLS)

The schema includes RLS policies that allow:
- Users to view all public data
- Users to manage their own favorites and preferences
- Activity logging for all users

## Usage Examples

### Favorites Management
```javascript
import { getFavorites, toggleFavorite } from '../utils/supabaseClient.js';

// Get user's favorites
const favorites = await getFavorites(walletAddress);

// Toggle favorite status
const result = await toggleFavorite(walletAddress, tokenId);
```

### Activity Logging
```javascript
import { logUserActivity } from '../utils/activityLogger.js';

// Log a listing view
await logUserActivity('view_listing', tokenId, {
    price: '100',
    currency: 'USDC',
    seller: '0x123...'
});
```

### Saved Searches
```javascript
import { savePreferences, loadPreferences } from '../utils/supabaseClient.js';

// Save current filter state
const preferences = await loadPreferences(walletAddress);
preferences.filters = { currency: 'usdc', sort: 'priceAsc' };
await savePreferences(walletAddress, preferences);
```

## Event Types

The system tracks various user activities:

- `view_listing`: User viewed an NFT listing
- `favorite`: User favorited an NFT
- `unfavorite`: User unfavorited an NFT
- `purchase`: User purchased an NFT
- `listing_created`: User created a listing
- `listing_cancelled`: User cancelled a listing
- `search`: User performed a search
- `filter_applied`: User applied filters
- `page_view`: User viewed a page
- `wallet_connected`: User connected their wallet

## Real-time Features

### Notifications
```javascript
// Subscribe to new listings
await subscribeToNewListings((payload) => {
    showNotification('New listing available!');
});

// Subscribe to user-specific notifications
await subscribeToUserNotifications(walletAddress, (payload) => {
    handleUserNotification(payload);
});
```

### Trending Items
```javascript
// Get trending tokens based on activity
const trending = await getTrendingTokens(5);
```

## Security Considerations

1. **Wallet-based Authentication**: Users are identified by their wallet address, not email/password
2. **No Sensitive Data**: No private keys or sensitive information stored
3. **Public Data**: All marketplace data is publicly viewable
4. **Activity Privacy**: Activity logs are anonymized and used for analytics only

## Troubleshooting

### Common Issues

1. **"Please connect your wallet" errors**
   - Make sure wallet is connected before using favorites
   - Check that wallet connector is properly initialized

2. **Favorites not syncing**
   - Verify Supabase connection
   - Check network connectivity
   - Ensure RLS policies are configured correctly

3. **Real-time notifications not working**
   - Verify realtime is enabled in Supabase
   - Check browser console for connection errors
   - Ensure proper subscription setup

### Debug Mode

Enable debug logging:
```javascript
localStorage.setItem('debug', 'supabase:*');
```

## Future Enhancements

- User profile pages with purchase history
- Social features (following users, comments)
- Advanced analytics dashboard
- Machine learning recommendations
- Cross-chain wallet support

## API Reference

See the JSDoc comments in the utility files for detailed API documentation:
- `utils/supabaseClient.js`: Core Supabase operations
- `utils/activityLogger.js`: Activity tracking
- `utils/walletConnector.js`: Wallet management