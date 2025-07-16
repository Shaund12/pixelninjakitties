/**
 * Activity Logger for Supabase Integration
 * Handles logging of user actions and marketplace events
 */

import { logActivity } from './supabaseClient.js';
import { getCurrentWalletAddress } from './walletConnector.js';

// Activity event types
export const ACTIVITY_TYPES = {
    // Marketplace actions
    VIEW_LISTING: 'view_listing',
    FAVORITE: 'favorite',
    UNFAVORITE: 'unfavorite',
    PURCHASE: 'purchase',
    LISTING_CREATED: 'listing_created',
    LISTING_CANCELLED: 'listing_cancelled',
    
    // User actions
    SEARCH: 'search',
    FILTER_APPLIED: 'filter_applied',
    SEARCH_SAVED: 'search_saved',
    PREFERENCES_UPDATED: 'preferences_updated',
    
    // Page views
    PAGE_VIEW: 'page_view',
    MARKETPLACE_VIEW: 'marketplace_view',
    PROFILE_VIEW: 'profile_view',
    
    // Wallet actions
    WALLET_CONNECTED: 'wallet_connected',
    WALLET_DISCONNECTED: 'wallet_disconnected'
};

// Queue for offline activity logging
let activityQueue = [];
let isOnline = navigator.onLine;

// Listen for online/offline events
window.addEventListener('online', () => {
    isOnline = true;
    flushActivityQueue();
});

window.addEventListener('offline', () => {
    isOnline = false;
});

// Log activity with automatic wallet address detection
export async function logUserActivity(eventType, tokenId = null, metadata = {}) {
    try {
        const walletAddress = getCurrentWalletAddress();
        if (!walletAddress) {
            // Don't log activities for non-connected users
            return;
        }
        
        const activityData = {
            eventType,
            tokenId,
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                url: window.location.href
            }
        };
        
        if (isOnline) {
            await logActivity(walletAddress, eventType, tokenId, activityData.metadata);
        } else {
            // Queue for later when back online
            activityQueue.push({
                walletAddress,
                ...activityData
            });
        }
    } catch (error) {
        console.error('Error logging activity:', error);
        // Queue the activity for retry
        if (isOnline) {
            activityQueue.push({
                walletAddress: getCurrentWalletAddress(),
                eventType,
                tokenId,
                metadata
            });
        }
    }
}

// Flush queued activities when back online
async function flushActivityQueue() {
    if (activityQueue.length === 0) return;
    
    console.log(`Flushing ${activityQueue.length} queued activities`);
    
    const queue = [...activityQueue];
    activityQueue = [];
    
    for (const activity of queue) {
        try {
            await logActivity(
                activity.walletAddress,
                activity.eventType,
                activity.tokenId,
                activity.metadata
            );
        } catch (error) {
            console.error('Error flushing activity:', error);
            // Re-queue failed activities
            activityQueue.push(activity);
        }
    }
}

// Specific activity logging functions
export async function logPageView(pageName, metadata = {}) {
    await logUserActivity(ACTIVITY_TYPES.PAGE_VIEW, null, {
        pageName,
        ...metadata
    });
}

export async function logMarketplaceView(filters = {}) {
    await logUserActivity(ACTIVITY_TYPES.MARKETPLACE_VIEW, null, {
        filters,
        filtersCount: Object.keys(filters).length
    });
}

export async function logListingView(tokenId, listingData = {}) {
    await logUserActivity(ACTIVITY_TYPES.VIEW_LISTING, tokenId, {
        price: listingData.price,
        currency: listingData.currency,
        seller: listingData.seller,
        rarity: listingData.rarity
    });
}

export async function logFavoriteAction(tokenId, action, tokenData = {}) {
    const eventType = action === 'add' ? ACTIVITY_TYPES.FAVORITE : ACTIVITY_TYPES.UNFAVORITE;
    await logUserActivity(eventType, tokenId, {
        action,
        rarity: tokenData.rarity,
        breed: tokenData.breed
    });
}

export async function logPurchase(tokenId, purchaseData = {}) {
    await logUserActivity(ACTIVITY_TYPES.PURCHASE, tokenId, {
        price: purchaseData.price,
        currency: purchaseData.currency,
        seller: purchaseData.seller,
        transactionHash: purchaseData.transactionHash,
        gasFee: purchaseData.gasFee
    });
}

export async function logListingCreated(tokenId, listingData = {}) {
    await logUserActivity(ACTIVITY_TYPES.LISTING_CREATED, tokenId, {
        price: listingData.price,
        currency: listingData.currency,
        rarity: listingData.rarity,
        breed: listingData.breed
    });
}

export async function logListingCancelled(tokenId, metadata = {}) {
    await logUserActivity(ACTIVITY_TYPES.LISTING_CANCELLED, tokenId, metadata);
}

export async function logSearch(query, filters = {}, resultsCount = 0) {
    await logUserActivity(ACTIVITY_TYPES.SEARCH, null, {
        query,
        filters,
        resultsCount,
        filtersCount: Object.keys(filters).length
    });
}

export async function logFilterApplied(filterType, filterValue, resultsCount = 0) {
    await logUserActivity(ACTIVITY_TYPES.FILTER_APPLIED, null, {
        filterType,
        filterValue,
        resultsCount
    });
}

export async function logSearchSaved(searchName, filters = {}) {
    await logUserActivity(ACTIVITY_TYPES.SEARCH_SAVED, null, {
        searchName,
        filters,
        filtersCount: Object.keys(filters).length
    });
}

export async function logWalletAction(action, walletAddress = null) {
    const eventType = action === 'connect' ? ACTIVITY_TYPES.WALLET_CONNECTED : ACTIVITY_TYPES.WALLET_DISCONNECTED;
    
    // For wallet actions, we might not have a current address yet
    if (action === 'connect' && walletAddress) {
        await logActivity(walletAddress, eventType, null, {
            action,
            timestamp: new Date().toISOString()
        });
    } else if (action === 'disconnect') {
        await logUserActivity(eventType, null, { action });
    }
}

// Analytics helper functions
export function getActivityQueueLength() {
    return activityQueue.length;
}

export function clearActivityQueue() {
    activityQueue = [];
}

export function isActivityLoggingOnline() {
    return isOnline;
}

// Auto-log page views
let currentPage = null;

function autoLogPageView() {
    const pageName = window.location.pathname.split('/').pop().replace('.html', '') || 'home';
    
    if (pageName !== currentPage) {
        currentPage = pageName;
        logPageView(pageName, {
            referrer: document.referrer,
            loadTime: performance.now()
        });
    }
}

// Set up automatic page view logging
document.addEventListener('DOMContentLoaded', () => {
    // Log initial page view
    autoLogPageView();
    
    // Log page views on navigation (for SPAs)
    window.addEventListener('popstate', autoLogPageView);
    
    // Log page unload
    window.addEventListener('beforeunload', () => {
        if (currentPage) {
            logUserActivity('page_unload', null, {
                pageName: currentPage,
                timeOnPage: performance.now()
            });
        }
    });
});

// Periodic queue flush (every 30 seconds)
setInterval(() => {
    if (isOnline && activityQueue.length > 0) {
        flushActivityQueue();
    }
}, 30000);