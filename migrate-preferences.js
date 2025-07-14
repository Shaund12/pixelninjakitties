/**
 * Migration script to move provider preferences from JSON file to Supabase
 */

import { withDatabase } from './scripts/supabase.js';
import fs from 'fs/promises';
import path from 'path';

async function migrateProviderPreferences() {
    const filePath = path.join(process.cwd(), 'provider-preferences.json');

    try {
        // Check if the old file exists
        const fileExists = await fs.access(filePath).then(() => true).catch(() => false);

        if (!fileExists) {
            console.log('No provider-preferences.json file found, skipping migration');
            return;
        }

        // Read the old JSON file
        const data = await fs.readFile(filePath, 'utf-8');
        const preferences = JSON.parse(data);

        console.log(`Found ${Object.keys(preferences).length} provider preferences to migrate`);

        // Migrate each preference to Supabase
        let migrated = 0;
        let failed = 0;

        for (const [tokenId, preference] of Object.entries(preferences)) {
            try {
                await withDatabase(async (client) => {
                    const { error } = await client
                        .from('provider_preferences')
                        .upsert({
                            token_id: parseInt(tokenId, 10),
                            provider: preference.provider,
                            options: preference.options || {},
                            timestamp: preference.timestamp ? new Date(preference.timestamp).toISOString() : new Date().toISOString()
                        }, {
                            onConflict: 'token_id'
                        });

                    if (error) {
                        throw error;
                    }
                });

                migrated++;
                console.log(`✅ Migrated token ${tokenId} preferences`);
            } catch (error) {
                failed++;
                console.error(`❌ Failed to migrate token ${tokenId}:`, error.message);
            }
        }

        console.log(`Migration completed: ${migrated} migrated, ${failed} failed`);

        // Optionally, backup and remove the old file
        if (migrated > 0) {
            await fs.rename(filePath, `${filePath}.backup`);
            console.log('Old preferences file backed up as provider-preferences.json.backup');
        }

    } catch (error) {
        console.error('Migration failed:', error);
    }
}

// Run migration if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    migrateProviderPreferences();
}

export { migrateProviderPreferences };