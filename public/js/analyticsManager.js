/**
 * Analytics Manager
 * Handles logging of user interactions and gallery events
 */

import { supabase } from './supabaseClient.js';

class AnalyticsManager {
    constructor() {
        this.currentUser = null;
        this.debugMode = false;
        this.init();
    }

    async init() {
        try {
            // Get current user
            const { data: { user } } = await supabase.auth.getUser();
            
            if (!user) {
                // Sign in anonymously if no user
                const { data: { user: anonUser } } = await supabase.auth.signInAnonymously();
                this.currentUser = anonUser;
            } else {
                this.currentUser = user;
            }
        } catch (error) {
            console.error('Error initializing analytics:', error);
            this.useFallback = true;
        }
    }

    // Set debug mode
    setDebugMode(enabled) {
        this.debugMode = enabled;
    }

    // Log an event
    async logEvent(eventType, eventData = {}) {
        if (this.debugMode) {
            console.log(`📊 Analytics: ${eventType}`, eventData);
        }

        if (this.useFallback) {
            // Just log to console in fallback mode
            console.log(`Analytics (fallback): ${eventType}`, eventData);
            return;
        }

        if (!this.currentUser) return;

        try {
            const { error } = await supabase
                .from('gallery_analytics')
                .insert({
                    user_id: this.currentUser.id,
                    event_type: eventType,
                    event_data: eventData
                });

            if (error) {
                console.error('Error logging analytics event:', error);
            }
        } catch (error) {
            console.error('Error logging analytics event:', error);
        }
    }

    // Log filter change
    async logFilterChange(filterType, filterValue) {
        await this.logEvent('filter_change', {
            filter_type: filterType,
            filter_value: filterValue,
            timestamp: new Date().toISOString()
        });
    }

    // Log infinite scroll load
    async logInfiniteScrollLoad(page, itemsLoaded) {
        await this.logEvent('infinite_scroll_load', {
            page,
            items_loaded: itemsLoaded,
            timestamp: new Date().toISOString()
        });
    }

    // Log modal open
    async logModalOpen(tokenId) {
        await this.logEvent('modal_open', {
            token_id: tokenId,
            timestamp: new Date().toISOString()
        });
    }

    // Log theme change
    async logThemeChange(theme) {
        await this.logEvent('theme_change', {
            theme,
            timestamp: new Date().toISOString()
        });
    }

    // Log view mode change
    async logViewModeChange(viewMode) {
        await this.logEvent('view_mode_change', {
            view_mode: viewMode,
            timestamp: new Date().toISOString()
        });
    }

    // Log search query
    async logSearchQuery(query, resultCount) {
        await this.logEvent('search_query', {
            query,
            result_count: resultCount,
            timestamp: new Date().toISOString()
        });
    }

    // Log page load
    async logPageLoad(loadTime, tokenCount) {
        await this.logEvent('page_load', {
            load_time: loadTime,
            token_count: tokenCount,
            timestamp: new Date().toISOString()
        });
    }

    // Log RPC call latency
    async logRPCLatency(callType, latency) {
        await this.logEvent('rpc_latency', {
            call_type: callType,
            latency,
            timestamp: new Date().toISOString()
        });
    }

    // Log error
    async logError(errorType, errorMessage, errorData = {}) {
        await this.logEvent('error', {
            error_type: errorType,
            error_message: errorMessage,
            error_data: errorData,
            timestamp: new Date().toISOString()
        });
    }

    // Get analytics data (for debug mode)
    async getAnalyticsData(limit = 100) {
        if (!this.currentUser) return [];

        try {
            const { data, error } = await supabase
                .from('gallery_analytics')
                .select('*')
                .eq('user_id', this.currentUser.id)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) {
                console.error('Error getting analytics data:', error);
                return [];
            }

            return data;
        } catch (error) {
            console.error('Error getting analytics data:', error);
            return [];
        }
    }

    // Get performance stats
    async getPerformanceStats() {
        if (!this.currentUser) return {};

        try {
            const { data, error } = await supabase
                .from('gallery_analytics')
                .select('event_type, event_data, created_at')
                .eq('user_id', this.currentUser.id)
                .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()) // Last 24 hours
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error getting performance stats:', error);
                return {};
            }

            // Process the data to extract performance metrics
            const stats = {
                totalEvents: data.length,
                pageLoads: data.filter(d => d.event_type === 'page_load').length,
                averageLoadTime: 0,
                totalScrollLoads: data.filter(d => d.event_type === 'infinite_scroll_load').length,
                averageRPCLatency: 0,
                errorCount: data.filter(d => d.event_type === 'error').length
            };

            // Calculate averages
            const loadTimes = data
                .filter(d => d.event_type === 'page_load' && d.event_data.load_time)
                .map(d => d.event_data.load_time);
            
            if (loadTimes.length > 0) {
                stats.averageLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
            }

            const rpcLatencies = data
                .filter(d => d.event_type === 'rpc_latency' && d.event_data.latency)
                .map(d => d.event_data.latency);
            
            if (rpcLatencies.length > 0) {
                stats.averageRPCLatency = rpcLatencies.reduce((a, b) => a + b, 0) / rpcLatencies.length;
            }

            return stats;
        } catch (error) {
            console.error('Error getting performance stats:', error);
            return {};
        }
    }
}

// Create singleton instance
const analyticsManager = new AnalyticsManager();

export { analyticsManager };