-- Supabase Schema for Wallet-Based User Management
-- This schema uses wallet addresses as user IDs instead of Supabase Auth

-- Enable RLS (Row Level Security)
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Create users table (wallet-based, not Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,  -- Wallet address (lowercase)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create favorites table
CREATE TABLE IF NOT EXISTS favorites (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_id INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure no duplicate favorites
    UNIQUE(user_id, token_id)
);

-- Create preferences table
CREATE TABLE IF NOT EXISTS preferences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    filters JSONB DEFAULT '{}'::jsonb,
    theme TEXT DEFAULT 'dark',
    notifications BOOLEAN DEFAULT true,
    saved_searches JSONB DEFAULT '[]'::jsonb,
    last_viewed TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- One preference record per user
    UNIQUE(user_id)
);

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    token_id INTEGER,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_token_id ON favorites(token_id);
CREATE INDEX IF NOT EXISTS idx_preferences_user_id ON preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type ON activity_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_token_id ON activity_logs(token_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_users_last_activity ON users(last_activity);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_event ON activity_logs(user_id, event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_token_event ON activity_logs(token_id, event_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp_event ON activity_logs(timestamp, event_type);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all operations for now, since we're using wallet addresses)
-- In a production environment, you might want to restrict these further

-- Users table policies
CREATE POLICY "Users can view all users" ON users
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own record" ON users
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own record" ON users
    FOR UPDATE USING (true);

-- Favorites table policies
CREATE POLICY "Users can view all favorites" ON favorites
    FOR SELECT USING (true);

CREATE POLICY "Users can manage their own favorites" ON favorites
    FOR ALL USING (true);

-- Preferences table policies
CREATE POLICY "Users can view their own preferences" ON preferences
    FOR SELECT USING (true);

CREATE POLICY "Users can manage their own preferences" ON preferences
    FOR ALL USING (true);

-- Activity logs table policies
CREATE POLICY "Users can view all activity logs" ON activity_logs
    FOR SELECT USING (true);

CREATE POLICY "Users can insert activity logs" ON activity_logs
    FOR INSERT WITH CHECK (true);

-- Create a function to get trending tokens
CREATE OR REPLACE FUNCTION get_trending_tokens(time_period INTERVAL DEFAULT '24 hours', limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    token_id INTEGER,
    activity_count BIGINT,
    last_activity TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.token_id,
        COUNT(*) as activity_count,
        MAX(a.timestamp) as last_activity
    FROM activity_logs a
    WHERE 
        a.token_id IS NOT NULL
        AND a.timestamp >= (NOW() - time_period)
        AND a.event_type IN ('view', 'favorite', 'purchase', 'listing_created')
    GROUP BY a.token_id
    ORDER BY activity_count DESC, last_activity DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get user activity summary
CREATE OR REPLACE FUNCTION get_user_activity_summary(wallet_address TEXT)
RETURNS TABLE (
    event_type TEXT,
    count BIGINT,
    last_occurrence TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.event_type,
        COUNT(*) as count,
        MAX(a.timestamp) as last_occurrence
    FROM activity_logs a
    WHERE a.user_id = LOWER(wallet_address)
    GROUP BY a.event_type
    ORDER BY count DESC;
END;
$$ LANGUAGE plpgsql;

-- Create a function to get marketplace stats
CREATE OR REPLACE FUNCTION get_marketplace_stats(time_period INTERVAL DEFAULT '24 hours')
RETURNS TABLE (
    total_users BIGINT,
    active_users BIGINT,
    total_favorites BIGINT,
    total_views BIGINT,
    total_purchases BIGINT,
    trending_tokens BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM users WHERE last_activity >= (NOW() - time_period)) as active_users,
        (SELECT COUNT(*) FROM favorites) as total_favorites,
        (SELECT COUNT(*) FROM activity_logs WHERE event_type = 'view' AND timestamp >= (NOW() - time_period)) as total_views,
        (SELECT COUNT(*) FROM activity_logs WHERE event_type = 'purchase' AND timestamp >= (NOW() - time_period)) as total_purchases,
        (SELECT COUNT(DISTINCT token_id) FROM activity_logs WHERE token_id IS NOT NULL AND timestamp >= (NOW() - time_period)) as trending_tokens;
END;
$$ LANGUAGE plpgsql;

-- Create a function to clean up old activity logs (optional, for maintenance)
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM activity_logs 
    WHERE timestamp < (NOW() - (days_to_keep || ' days')::INTERVAL);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;