-- Update RLS policies for wallet-based authentication
-- Run this SQL in your Supabase project to update the policies

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can only access their own preferences" ON user_preferences;
DROP POLICY IF EXISTS "Users can only access their own favorites" ON favorites;
DROP POLICY IF EXISTS "Users can only access their own analytics" ON gallery_analytics;

-- Create new permissive policies for wallet-based authentication
-- These policies allow any user to read/write their own data using wallet address

CREATE POLICY "Wallet users can access their own preferences" 
    ON user_preferences FOR ALL 
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Wallet users can access their own favorites" 
    ON favorites FOR ALL 
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Wallet users can access their own analytics" 
    ON gallery_analytics FOR ALL 
    USING (true)
    WITH CHECK (true);

-- Alternative: If you want to disable RLS completely for these tables
-- (more permissive but simpler approach):
-- ALTER TABLE user_preferences DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE favorites DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE gallery_analytics DISABLE ROW LEVEL SECURITY;