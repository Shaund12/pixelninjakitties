#!/usr/bin/env node

/**
 * Supabase Database Setup Script
 * 
 * This script helps set up the Supabase database tables and functions
 * required for the wallet-based personalization system.
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // Service key for admin operations

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   SUPABASE_URL - Your Supabase project URL');
    console.error('   SUPABASE_SERVICE_KEY - Your Supabase service role key');
    console.error('');
    console.error('You can find these in your Supabase project dashboard:');
    console.error('   Settings → API → URL and Service Role Key');
    process.exit(1);
}

// Initialize Supabase client with service key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
    console.log('🚀 Setting up Supabase database for Pixel Ninja Kitties...');
    console.log('');

    try {
        // Read and execute the SQL schema
        const schemaPath = join(__dirname, 'supabase_schema.sql');
        const schema = readFileSync(schemaPath, 'utf8');
        
        console.log('📋 Creating database tables and functions...');
        
        // Split schema into individual statements
        const statements = schema.split(';').filter(stmt => stmt.trim());
        
        for (const statement of statements) {
            if (statement.trim()) {
                try {
                    const { error } = await supabase.rpc('exec_sql', { sql: statement.trim() + ';' });
                    if (error) {
                        console.warn(`⚠️  Warning executing statement: ${error.message}`);
                    }
                } catch (err) {
                    console.warn(`⚠️  Warning: ${err.message}`);
                }
            }
        }
        
        console.log('✅ Database schema setup complete!');
        console.log('');
        
        // Test the setup
        console.log('🧪 Testing database setup...');
        
        // Test basic table existence
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('count')
            .limit(1);
            
        if (usersError) {
            console.error('❌ Users table test failed:', usersError.message);
        } else {
            console.log('✅ Users table accessible');
        }
        
        const { data: favorites, error: favoritesError } = await supabase
            .from('favorites')
            .select('count')
            .limit(1);
            
        if (favoritesError) {
            console.error('❌ Favorites table test failed:', favoritesError.message);
        } else {
            console.log('✅ Favorites table accessible');
        }
        
        const { data: preferences, error: preferencesError } = await supabase
            .from('preferences')
            .select('count')
            .limit(1);
            
        if (preferencesError) {
            console.error('❌ Preferences table test failed:', preferencesError.message);
        } else {
            console.log('✅ Preferences table accessible');
        }
        
        const { data: activityLogs, error: activityLogsError } = await supabase
            .from('activity_logs')
            .select('count')
            .limit(1);
            
        if (activityLogsError) {
            console.error('❌ Activity logs table test failed:', activityLogsError.message);
        } else {
            console.log('✅ Activity logs table accessible');
        }
        
        console.log('');
        console.log('🎉 Supabase setup complete!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Add your Supabase URL and anon key to your .env file');
        console.log('2. Test the marketplace with wallet connection');
        console.log('3. Monitor the activity_logs table for user interactions');
        console.log('');
        console.log('Environment variables needed:');
        console.log('   SUPABASE_URL=' + SUPABASE_URL);
        console.log('   SUPABASE_ANON_KEY=<your_anon_key>');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Setup interrupted');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Setup terminated');
    process.exit(0);
});

main().catch(console.error);