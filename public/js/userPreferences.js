/**
 * User Preferences Manager
 * Handles user preferences storage and retrieval via Supabase
 */

import { initializeSupabase } from './supabase.js';

class UserPreferencesManager {
    constructor() {
        this.currentUser = null;
        this.preferences = null;
        this.supabase = null;
        this.init();
    }

    async init() {
        try {
            // Initialize Supabase client
            this.supabase = await initializeSupabase();

            // Try to get current user, but don't require authentication
            try {
                const { data: { user } } = await this.supabase.auth.getUser();
                this.currentUser = user || { id: 'anonymous_' + Date.now() };
            } catch (error) {
                // If auth fails, use anonymous session
                this.currentUser = { id: 'anonymous_' + Date.now() };
            }

            // Load preferences
            await this.loadPreferences();
        } catch (error) {
            console.error('Error initializing user preferences:', error);
            // Fallback to anonymous session if initialization fails
            this.currentUser = { id: 'anonymous_' + Date.now() };
            this.preferences = { theme: 'dark', viewMode: 'grid' };
        }
    }

    async loadPreferences() {
        if (!this.currentUser || !this.supabase) return;

        try {
            const { data, error } = await this.supabase
                .from('user_preferences')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .single();

            if (error && error.code !== 'PGRST116') { // Not found error
                console.error('Error loading preferences:', error);
                return;
            }

            if (data) {
                this.preferences = data;
            } else {
                // Create default preferences
                this.preferences = {
                    user_id: this.currentUser.id,
                    theme: 'dark',
                    view_mode: 'grid',
                    last_filters: {},
                    debug_mode: false,
                    items_per_page: 12
                };
                await this.savePreferences();
            }
        } catch (error) {
            console.error('Error loading preferences:', error);
        }
    }

    async savePreferences() {
        if (!this.currentUser || !this.preferences || !this.supabase) return;

        try {
            const { error } = await this.supabase
                .from('user_preferences')
                .upsert({
                    ...this.preferences,
                    updated_at: new Date().toISOString()
                });

            if (error) {
                console.error('Error saving preferences:', error);
            }
        } catch (error) {
            console.error('Error saving preferences:', error);
        }
    }

    // Get preference value
    get(key, defaultValue = null) {
        return this.preferences?.[key] || defaultValue;
    }

    // Set preference value
    async set(key, value) {
        if (!this.preferences) {
            await this.loadPreferences();
        }

        if (this.preferences) {
            this.preferences[key] = value;
            await this.savePreferences();
        }
    }

    // Get theme
    getTheme() {
        return this.get('theme', 'dark');
    }

    // Set theme
    async setTheme(theme) {
        await this.set('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }

    // Get view mode
    getViewMode() {
        return this.get('view_mode', 'grid');
    }

    // Set view mode
    async setViewMode(mode) {
        await this.set('view_mode', mode);
    }

    // Get last filters
    getLastFilters() {
        const filters = this.get('last_filters', {});
        if (typeof filters === 'string') {
            try {
                return JSON.parse(filters);
            } catch (error) {
                console.error('Error parsing last filters:', error);
                return {};
            }
        }
        return filters;
    }

    // Set last filters
    async setLastFilters(filters) {
        await this.set('last_filters', filters);
    }

    // Get debug mode
    getDebugMode() {
        return this.get('debug_mode', false);
    }

    // Set debug mode
    async setDebugMode(enabled) {
        await this.set('debug_mode', enabled);
    }

    // Get items per page
    getItemsPerPage() {
        return this.get('items_per_page', 12);
    }

    // Set items per page
    async setItemsPerPage(count) {
        await this.set('items_per_page', count);
    }
}

// Create singleton instance
const userPreferences = new UserPreferencesManager();

export { userPreferences };