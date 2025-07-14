#!/usr/bin/env node

/**
 * Supabase Database Setup Script
 * This script creates the necessary tables and functions in Supabase
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupSupabaseDatabase() {
    try {
        console.log('🔧 Setting up Supabase database...');

        // Validate environment variables
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY; // Service key for admin operations

        if (!supabaseUrl || !supabaseServiceKey) {
            throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables are required');
        }

        // Create Supabase client with service key for admin operations
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        console.log('✅ Connected to Supabase');

        // Read the schema SQL file
        const schemaPath = join(__dirname, 'supabase-schema.sql');
        const schemaSql = readFileSync(schemaPath, 'utf8');

        console.log('📄 Loaded schema SQL');

        // Split the SQL into individual statements
        const statements = schemaSql
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

        console.log(`🔄 Executing ${statements.length} SQL statements...`);

        // Execute each statement
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            console.log(`📝 Executing statement ${i + 1}/${statements.length}`);

            try {
                // Use the rpc function to execute raw SQL
                const { error } = await supabase.rpc('exec_sql', {
                    sql: statement
                });

                if (error) {
                    console.warn(`⚠️ Warning executing statement ${i + 1}: ${error.message}`);
                    console.log(`Statement was: ${statement.substring(0, 100)}...`);
                } else {
                    console.log(`✅ Statement ${i + 1} executed successfully`);
                }
            } catch (err) {
                console.warn(`⚠️ Warning executing statement ${i + 1}: ${err.message}`);
                console.log(`Statement was: ${statement.substring(0, 100)}...`);
            }
        }

        // Test the setup by checking if tables exist
        console.log('🔍 Verifying database setup...');

        const { data: tables, error: tablesError } = await supabase
            .from('information_schema.tables')
            .select('table_name')
            .eq('table_schema', 'public')
            .in('table_name', ['tasks', 'state', 'metrics']);

        if (tablesError) {
            console.warn('⚠️ Could not verify tables:', tablesError.message);
        } else {
            console.log('✅ Found tables:', tables.map(t => t.table_name));
        }

        // Test the functions
        console.log('🔍 Testing database functions...');

        try {
            const { error: testError } = await supabase.rpc('get_state_data', {
                state_type: 'test'
            });

            if (testError) {
                console.warn('⚠️ Function test warning:', testError.message);
            } else {
                console.log('✅ Database functions are working');
            }
        } catch (err) {
            console.warn('⚠️ Function test warning:', err.message);
        }

        console.log('🎉 Supabase database setup completed!');
        console.log('');
        console.log('Next steps:');
        console.log('1. Make sure SUPABASE_URL and SUPABASE_ANON_KEY are set in your environment');
        console.log('2. Update your application to use the Supabase connection');
        console.log('3. Test the connection with your application');

        process.exit(0);

    } catch (error) {
        console.error('❌ Database setup failed:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
}

// Alternative setup without service key (manual SQL execution)
async function setupWithAnonymousKey() {
    console.log('🔧 Setting up Supabase database (manual mode)...');
    console.log('');
    console.log('Since SUPABASE_SERVICE_KEY is not available, please execute the following SQL manually in your Supabase dashboard:');
    console.log('');

    const schemaPath = join(__dirname, 'supabase-schema.sql');
    const schemaSql = readFileSync(schemaPath, 'utf8');

    console.log('='.repeat(80));
    console.log(schemaSql);
    console.log('='.repeat(80));
    console.log('');
    console.log('Steps:');
    console.log('1. Go to your Supabase dashboard');
    console.log('2. Navigate to SQL Editor');
    console.log('3. Copy and paste the SQL above');
    console.log('4. Execute the SQL');
    console.log('5. Set SUPABASE_URL and SUPABASE_ANON_KEY in your environment');
    console.log('6. Test the connection');
}

// Run the setup
if (process.env.SUPABASE_SERVICE_KEY) {
    setupSupabaseDatabase();
} else {
    setupWithAnonymousKey();
}