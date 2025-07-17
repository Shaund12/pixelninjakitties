/**
 * Watchlist Component
 * Handles watchlist management and price alerts
 */

import { getWatchlist, addWatchlist, removeWatchlist, isWatchlisted } from '../js/supabaseClient.js';
import { getCurrentWalletAddress } from '../js/walletConnector.js';

class WatchlistComponent {
    constructor() {
        this.currentWallet = null;
        this.watchlistItems = [];
        this.init();
    }

    async init() {
        this.currentWallet = await getCurrentWalletAddress();
        if (this.currentWallet) {
            await this.loadWatchlist();
        }
    }

    async loadWatchlist() {
        try {
            this.watchlistItems = await getWatchlist(this.currentWallet);
            this.renderWatchlist();
        } catch (error) {
            console.error('Error loading watchlist:', error);
        }
    }

    createWatchlistButton(tokenId, currentPrice = null) {
        const button = document.createElement('button');
        button.className = 'watchlist-btn';
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
            </svg>
            <span>Add to Watchlist</span>
        `;
        
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showWatchlistModal(tokenId, currentPrice);
        });

        // Check if already watchlisted
        this.updateWatchlistButton(button, tokenId);
        
        return button;
    }

    async updateWatchlistButton(button, tokenId) {
        if (!this.currentWallet) return;

        try {
            const isWatchlisted = await isWatchlisted(this.currentWallet, tokenId);
            const span = button.querySelector('span');
            
            if (isWatchlisted) {
                button.classList.add('watchlisted');
                span.textContent = 'Remove from Watchlist';
                button.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.removeFromWatchlist(tokenId);
                };
            } else {
                button.classList.remove('watchlisted');
                span.textContent = 'Add to Watchlist';
                button.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.showWatchlistModal(tokenId);
                };
            }
        } catch (error) {
            console.error('Error checking watchlist status:', error);
        }
    }

    showWatchlistModal(tokenId, currentPrice = null) {
        const modal = document.createElement('div');
        modal.className = 'watchlist-modal';
        modal.innerHTML = `
            <div class="watchlist-modal-overlay">
                <div class="watchlist-modal-content">
                    <div class="watchlist-modal-header">
                        <h3>Add to Watchlist</h3>
                        <button class="watchlist-modal-close">&times;</button>
                    </div>
                    <div class="watchlist-modal-body">
                        <p>Get notified when NFT #${tokenId} drops to your target price:</p>
                        <div class="watchlist-form">
                            <label for="targetPrice">Target Price (ETH):</label>
                            <input type="number" id="targetPrice" step="0.001" min="0" placeholder="0.5" 
                                   ${currentPrice ? `value="${currentPrice * 0.9}"` : ''}>
                            <div class="watchlist-form-actions">
                                <button class="watchlist-btn-cancel">Cancel</button>
                                <button class="watchlist-btn-confirm">Add to Watchlist</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Event listeners
        modal.querySelector('.watchlist-modal-close').addEventListener('click', () => {
            this.closeModal(modal);
        });

        modal.querySelector('.watchlist-btn-cancel').addEventListener('click', () => {
            this.closeModal(modal);
        });

        modal.querySelector('.watchlist-btn-confirm').addEventListener('click', async () => {
            const targetPrice = parseFloat(modal.querySelector('#targetPrice').value);
            if (targetPrice && targetPrice > 0) {
                await this.addToWatchlist(tokenId, targetPrice);
                this.closeModal(modal);
            }
        });

        modal.querySelector('.watchlist-modal-overlay').addEventListener('click', (e) => {
            if (e.target === modal.querySelector('.watchlist-modal-overlay')) {
                this.closeModal(modal);
            }
        });
    }

    closeModal(modal) {
        modal.remove();
    }

    async addToWatchlist(tokenId, targetPrice) {
        if (!this.currentWallet) {
            this.showToast('Please connect your wallet first', 'error');
            return;
        }

        try {
            await addWatchlist(this.currentWallet, tokenId, targetPrice);
            this.showToast(`Added NFT #${tokenId} to your watchlist`, 'success');
            await this.loadWatchlist();
            
            // Update button if visible
            const button = document.querySelector(`[data-token-id="${tokenId}"] .watchlist-btn`);
            if (button) {
                this.updateWatchlistButton(button, tokenId);
            }
        } catch (error) {
            console.error('Error adding to watchlist:', error);
            this.showToast('Failed to add to watchlist', 'error');
        }
    }

    async removeFromWatchlist(tokenId) {
        if (!this.currentWallet) {
            this.showToast('Please connect your wallet first', 'error');
            return;
        }

        try {
            await removeWatchlist(this.currentWallet, tokenId);
            this.showToast(`Removed NFT #${tokenId} from your watchlist`, 'success');
            await this.loadWatchlist();
            
            // Update button if visible
            const button = document.querySelector(`[data-token-id="${tokenId}"] .watchlist-btn`);
            if (button) {
                this.updateWatchlistButton(button, tokenId);
            }
        } catch (error) {
            console.error('Error removing from watchlist:', error);
            this.showToast('Failed to remove from watchlist', 'error');
        }
    }

    renderWatchlist() {
        const container = document.getElementById('watchlistContainer');
        if (!container) return;

        if (this.watchlistItems.length === 0) {
            container.innerHTML = `
                <div class="watchlist-empty">
                    <p>Your watchlist is empty</p>
                    <p>Add NFTs to your watchlist to get price alerts</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="watchlist-header">
                <h3>My Watchlist (${this.watchlistItems.length})</h3>
            </div>
            <div class="watchlist-items">
                ${this.watchlistItems.map(item => this.renderWatchlistItem(item)).join('')}
            </div>
        `;
    }

    renderWatchlistItem(item) {
        const createdDate = new Date(item.created_at).toLocaleDateString();
        const isTriggered = item.triggered_at !== null;
        
        return `
            <div class="watchlist-item ${isTriggered ? 'triggered' : ''}">
                <div class="watchlist-item-info">
                    <h4>NFT #${item.token_id}</h4>
                    <p class="target-price">Target: ${item.target_price} ETH</p>
                    <p class="created-date">Added: ${createdDate}</p>
                    ${isTriggered ? `<p class="triggered-date">Triggered: ${new Date(item.triggered_at).toLocaleString()}</p>` : ''}
                </div>
                <div class="watchlist-item-actions">
                    <button class="watchlist-remove-btn" data-token-id="${item.token_id}">
                        Remove
                    </button>
                    <button class="watchlist-view-btn" data-token-id="${item.token_id}">
                        View NFT
                    </button>
                </div>
            </div>
        `;
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('show');
        }, 100);
        
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, 3000);
    }
}

// CSS Styles
const watchlistStyles = `
    .watchlist-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: transparent;
        border: 2px solid var(--primary);
        color: var(--primary);
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
    }

    .watchlist-btn:hover {
        background: var(--primary);
        color: white;
    }

    .watchlist-btn.watchlisted {
        background: var(--primary);
        color: white;
    }

    .watchlist-btn.watchlisted:hover {
        background: var(--error);
        border-color: var(--error);
    }

    .watchlist-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
    }

    .watchlist-modal-overlay {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .watchlist-modal-content {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        max-width: 400px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
    }

    .watchlist-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid var(--border);
    }

    .watchlist-modal-header h3 {
        margin: 0;
        color: var(--primary);
    }

    .watchlist-modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: var(--text-light);
    }

    .watchlist-modal-body {
        padding: 20px;
    }

    .watchlist-form {
        margin-top: 20px;
    }

    .watchlist-form label {
        display: block;
        margin-bottom: 8px;
        color: var(--text);
        font-weight: 500;
    }

    .watchlist-form input {
        width: 100%;
        padding: 10px;
        background: var(--background-light);
        border: 1px solid var(--border);
        border-radius: 4px;
        color: var(--text);
        font-size: 14px;
    }

    .watchlist-form-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
    }

    .watchlist-btn-cancel,
    .watchlist-btn-confirm {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
    }

    .watchlist-btn-cancel {
        background: var(--background-light);
        color: var(--text);
    }

    .watchlist-btn-cancel:hover {
        background: var(--border);
    }

    .watchlist-btn-confirm {
        background: var(--primary);
        color: white;
    }

    .watchlist-btn-confirm:hover {
        background: var(--primary-dark);
    }

    .watchlist-empty {
        text-align: center;
        padding: 40px;
        color: var(--text-light);
    }

    .watchlist-items {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .watchlist-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 15px;
        background: var(--background-light);
        border: 1px solid var(--border);
        border-radius: 6px;
        transition: all 0.2s ease;
    }

    .watchlist-item:hover {
        background: var(--card-bg);
    }

    .watchlist-item.triggered {
        border-color: var(--success);
        background: rgba(76, 175, 80, 0.1);
    }

    .watchlist-item-info h4 {
        margin: 0 0 5px 0;
        color: var(--primary);
    }

    .watchlist-item-info p {
        margin: 0;
        font-size: 12px;
        color: var(--text-light);
    }

    .watchlist-item-actions {
        display: flex;
        gap: 8px;
    }

    .watchlist-remove-btn,
    .watchlist-view-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
    }

    .watchlist-remove-btn {
        background: var(--error);
        color: white;
    }

    .watchlist-remove-btn:hover {
        background: #d32f2f;
    }

    .watchlist-view-btn {
        background: var(--primary);
        color: white;
    }

    .watchlist-view-btn:hover {
        background: var(--primary-dark);
    }

    .toast {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 4px;
        color: white;
        font-weight: 500;
        z-index: 1001;
        transform: translateX(100%);
        transition: transform 0.3s ease;
    }

    .toast.show {
        transform: translateX(0);
    }

    .toast-success {
        background: var(--success);
    }

    .toast-error {
        background: var(--error);
    }

    .toast-info {
        background: var(--primary);
    }
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = watchlistStyles;
document.head.appendChild(styleSheet);

// Export the component
export default WatchlistComponent;