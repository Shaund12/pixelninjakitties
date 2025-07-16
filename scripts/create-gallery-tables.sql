-- Gallery personalization tables for Supabase
-- Run this SQL in your Supabase project to create the required tables

-- User preferences table
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id TEXT PRIMARY KEY,
    theme TEXT DEFAULT 'dark' CHECK (theme IN ('light', 'dark')),
    view_mode TEXT DEFAULT 'grid' CHECK (view_mode IN ('grid', 'list')),
    last_filters JSONB DEFAULT '{}',
    debug_mode BOOLEAN DEFAULT FALSE,
    items_per_page INTEGER DEFAULT 12,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
    user_id TEXT NOT NULL,
    token_id TEXT NOT NULL,
    added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (user_id, token_id)
);

-- Gallery analytics table (for tracking user interactions)
CREATE TABLE IF NOT EXISTS gallery_analytics (
    id SERIAL PRIMARY KEY,
    user_id TEXT,
    event_type TEXT NOT NULL,
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_token_id ON favorites(token_id);
CREATE INDEX IF NOT EXISTS idx_favorites_added_at ON favorites(added_at);
CREATE INDEX IF NOT EXISTS idx_gallery_analytics_user_id ON gallery_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_gallery_analytics_event_type ON gallery_analytics(event_type);
CREATE INDEX IF NOT EXISTS idx_gallery_analytics_created_at ON gallery_analytics(created_at);

-- Update trigger for user_preferences
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER IF NOT EXISTS update_user_preferences_updated_at 
    BEFORE UPDATE ON user_preferences 
    FOR EACH ROW 
    EXECUTE FUNCTION update_user_preferences_updated_at();

-- RLS (Row Level Security) policies for user data protection
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_analytics ENABLE ROW LEVEL SECURITY;

-- Only allow users to access their own data
CREATE POLICY IF NOT EXISTS "Users can only access their own preferences" 
    ON user_preferences FOR ALL 
    USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users can only access their own favorites" 
    ON favorites FOR ALL 
    USING (auth.uid()::text = user_id);

CREATE POLICY IF NOT EXISTS "Users can only access their own analytics" 
    ON gallery_analytics FOR ALL 
    USING (auth.uid()::text = user_id);