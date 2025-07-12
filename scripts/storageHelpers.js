import fs from 'fs/promises';
import path from 'path';

/**
 * Creates a simple file-based storage system
 * @param {string} filename - The filename to use for storage
 * @returns {Object} Storage API
 */
export function createStorage(filename) {
    const filePath = path.join(process.cwd(), filename);

    // Initialize storage
    let cache = {};

    // Load initial data
    (async () => {
        try {
            const data = await fs.readFile(filePath, 'utf8');
            cache = JSON.parse(data);
            console.log(`Storage loaded: ${Object.keys(cache).length} items from ${filename}`);
        } catch (err) {
            // File doesn't exist or other error
            console.log(`Creating new storage file: ${filename}`);
            await fs.writeFile(filePath, '{}', 'utf8');
        }
    })();

    return {
        async get(key) {
            return cache[key];
        },

        async set(key, value) {
            cache[key] = value;
            await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8');
            return value;
        },

        async delete(key) {
            delete cache[key];
            await fs.writeFile(filePath, JSON.stringify(cache, null, 2), 'utf8');
        },

        async getAll() {
            return { ...cache };
        }
    };
}