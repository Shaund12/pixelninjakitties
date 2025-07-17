/**
 * Settings Component
 * Handles user profile and preferences management
 */

import { loadPreferences, savePreferences } from '../js/supabaseClient.js';
import { getCurrentWalletAddress } from '../js/walletConnector.js';

class SettingsComponent {
    constructor() {
        this.currentWallet = null;
        this.preferences = {
            theme: 'dark',
            notifications: true,
            layoutMode: 'grid',
            itemsPerPage: 20,
            filters: {}
        };
        this.init();
    }

    async init() {
        this.currentWallet = await getCurrentWalletAddress();
        if (this.currentWallet) {
            await this.loadUserPreferences();
        }
    }

    async loadUserPreferences() {
        try {
            this.preferences = await loadPreferences(this.currentWallet);
        } catch (error) {
            console.error('Error loading preferences:', error);
        }
    }

    createSettingsPanel() {
        const panel = document.createElement('div');
        panel.className = 'settings-panel';
        panel.innerHTML = `
            <div class="settings-header">
                <h3>Settings</h3>
                <button class="settings-close-btn" id="settingsCloseBtn">&times;</button>
            </div>
            <div class="settings-content">
                <div class="settings-section">
                    <h4>Theme</h4>
                    <div class="settings-group">
                        <label class="settings-radio">
                            <input type="radio" name="theme" value="light" ${this.preferences.theme === 'light' ? 'checked' : ''}>
                            <span class="radio-custom"></span>
                            Light Theme
                        </label>
                        <label class="settings-radio">
                            <input type="radio" name="theme" value="dark" ${this.preferences.theme === 'dark' ? 'checked' : ''}>
                            <span class="radio-custom"></span>
                            Dark Theme
                        </label>
                    </div>
                </div>

                <div class="settings-section">
                    <h4>Layout</h4>
                    <div class="settings-group">
                        <label class="settings-radio">
                            <input type="radio" name="layout" value="grid" ${this.preferences.layoutMode === 'grid' ? 'checked' : ''}>
                            <span class="radio-custom"></span>
                            Grid View
                        </label>
                        <label class="settings-radio">
                            <input type="radio" name="layout" value="list" ${this.preferences.layoutMode === 'list' ? 'checked' : ''}>
                            <span class="radio-custom"></span>
                            List View
                        </label>
                    </div>
                </div>

                <div class="settings-section">
                    <h4>Items Per Page</h4>
                    <div class="settings-group">
                        <select class="settings-select" name="itemsPerPage">
                            <option value="10" ${this.preferences.itemsPerPage === 10 ? 'selected' : ''}>10 items</option>
                            <option value="20" ${this.preferences.itemsPerPage === 20 ? 'selected' : ''}>20 items</option>
                            <option value="50" ${this.preferences.itemsPerPage === 50 ? 'selected' : ''}>50 items</option>
                            <option value="100" ${this.preferences.itemsPerPage === 100 ? 'selected' : ''}>100 items</option>
                        </select>
                    </div>
                </div>

                <div class="settings-section">
                    <h4>Notifications</h4>
                    <div class="settings-group">
                        <label class="settings-checkbox">
                            <input type="checkbox" name="notifications" ${this.preferences.notifications ? 'checked' : ''}>
                            <span class="checkbox-custom"></span>
                            Enable notifications
                        </label>
                        <p class="settings-help">Get notified about watchlist price alerts and new activity</p>
                    </div>
                </div>

                <div class="settings-actions">
                    <button class="settings-btn-cancel" id="settingsCancelBtn">Cancel</button>
                    <button class="settings-btn-save" id="settingsSaveBtn">Save Changes</button>
                </div>
            </div>
        `;

        this.setupSettingsEventListeners(panel);
        return panel;
    }

    createSettingsButton() {
        const button = document.createElement('button');
        button.className = 'settings-btn';
        button.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M12 1v6M12 17v6M4.22 4.22l4.24 4.24M15.54 15.54l4.24 4.24M1 12h6M17 12h6M4.22 19.78l4.24-4.24M15.54 8.46l4.24-4.24"></path>
            </svg>
            Settings
        `;
        
        button.addEventListener('click', () => {
            this.showSettingsModal();
        });
        
        return button;
    }

    showSettingsModal() {
        if (!this.currentWallet) {
            this.showToast('Please connect your wallet first', 'error');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'settings-modal';
        modal.innerHTML = `
            <div class="settings-modal-overlay">
                <div class="settings-modal-content">
                    ${this.createSettingsPanel().innerHTML}
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Setup event listeners for modal
        this.setupSettingsEventListeners(modal);

        // Close modal when clicking overlay
        modal.querySelector('.settings-modal-overlay').addEventListener('click', (e) => {
            if (e.target === modal.querySelector('.settings-modal-overlay')) {
                this.closeModal(modal);
            }
        });
    }

    setupSettingsEventListeners(container) {
        const closeBtn = container.querySelector('#settingsCloseBtn');
        const cancelBtn = container.querySelector('#settingsCancelBtn');
        const saveBtn = container.querySelector('#settingsSaveBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.closeModal(container.closest('.settings-modal'));
            });
        }

        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.closeModal(container.closest('.settings-modal'));
            });
        }

        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.saveSettings(container);
            });
        }

        // Theme change listener
        container.querySelectorAll('input[name="theme"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.previewTheme(e.target.value);
                }
            });
        });
    }

    previewTheme(theme) {
        document.body.classList.toggle('light-theme', theme === 'light');
    }

    async saveSettings(container) {
        try {
            const formData = new FormData(container.querySelector('.settings-content'));
            
            const newPreferences = {
                ...this.preferences,
                theme: formData.get('theme'),
                layoutMode: formData.get('layout'),
                itemsPerPage: parseInt(formData.get('itemsPerPage')),
                notifications: formData.get('notifications') === 'on'
            };

            await savePreferences(this.currentWallet, newPreferences);
            this.preferences = newPreferences;
            
            this.applySettings(newPreferences);
            this.showToast('Settings saved successfully', 'success');
            this.closeModal(container.closest('.settings-modal'));
        } catch (error) {
            console.error('Error saving settings:', error);
            this.showToast('Failed to save settings', 'error');
        }
    }

    applySettings(preferences) {
        // Apply theme
        document.body.classList.toggle('light-theme', preferences.theme === 'light');
        
        // Apply layout mode
        const gridContainer = document.querySelector('.listings-grid');
        if (gridContainer) {
            gridContainer.classList.toggle('list-view', preferences.layoutMode === 'list');
        }
        
        // Dispatch custom event for other components to listen to
        window.dispatchEvent(new CustomEvent('settingsChanged', { 
            detail: preferences 
        }));
    }

    closeModal(modal) {
        if (modal) {
            modal.remove();
        }
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

    // Public method to get current preferences
    getPreferences() {
        return this.preferences;
    }
}

// CSS Styles
const settingsStyles = `
    .settings-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: var(--background-light);
        border: 1px solid var(--border);
        color: var(--text);
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
    }

    .settings-btn:hover {
        background: var(--card-bg);
        border-color: var(--primary);
    }

    .settings-modal {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: 1000;
    }

    .settings-modal-overlay {
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

    .settings-modal-content {
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 8px;
        max-width: 500px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
    }

    .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px;
        border-bottom: 1px solid var(--border);
    }

    .settings-header h3 {
        margin: 0;
        color: var(--primary);
    }

    .settings-close-btn {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: var(--text-light);
        padding: 0;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s ease;
    }

    .settings-close-btn:hover {
        background: var(--background-light);
    }

    .settings-content {
        padding: 20px;
    }

    .settings-section {
        margin-bottom: 24px;
    }

    .settings-section h4 {
        margin: 0 0 12px 0;
        color: var(--text);
        font-size: 16px;
        font-weight: 500;
    }

    .settings-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .settings-radio {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 4px 0;
    }

    .settings-radio input[type="radio"] {
        display: none;
    }

    .radio-custom {
        width: 16px;
        height: 16px;
        border: 2px solid var(--border);
        border-radius: 50%;
        position: relative;
        transition: all 0.2s ease;
    }

    .settings-radio input[type="radio"]:checked + .radio-custom {
        border-color: var(--primary);
    }

    .settings-radio input[type="radio"]:checked + .radio-custom::after {
        content: '';
        position: absolute;
        width: 8px;
        height: 8px;
        background: var(--primary);
        border-radius: 50%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .settings-checkbox {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        padding: 4px 0;
    }

    .settings-checkbox input[type="checkbox"] {
        display: none;
    }

    .checkbox-custom {
        width: 16px;
        height: 16px;
        border: 2px solid var(--border);
        border-radius: 3px;
        position: relative;
        transition: all 0.2s ease;
    }

    .settings-checkbox input[type="checkbox"]:checked + .checkbox-custom {
        border-color: var(--primary);
        background: var(--primary);
    }

    .settings-checkbox input[type="checkbox"]:checked + .checkbox-custom::after {
        content: '✓';
        position: absolute;
        color: white;
        font-size: 12px;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    .settings-select {
        width: 100%;
        padding: 8px 12px;
        background: var(--background-light);
        border: 1px solid var(--border);
        border-radius: 4px;
        color: var(--text);
        font-size: 14px;
        cursor: pointer;
    }

    .settings-select:focus {
        outline: none;
        border-color: var(--primary);
    }

    .settings-help {
        margin: 4px 0 0 24px;
        font-size: 12px;
        color: var(--text-light);
    }

    .settings-actions {
        display: flex;
        gap: 12px;
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid var(--border);
    }

    .settings-btn-cancel,
    .settings-btn-save {
        flex: 1;
        padding: 10px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: all 0.2s ease;
    }

    .settings-btn-cancel {
        background: var(--background-light);
        color: var(--text);
    }

    .settings-btn-cancel:hover {
        background: var(--border);
    }

    .settings-btn-save {
        background: var(--primary);
        color: white;
    }

    .settings-btn-save:hover {
        background: var(--primary-dark);
    }

    /* Light theme styles */
    .light-theme {
        --background: #ffffff;
        --background-light: #f5f5f5;
        --card-bg: #ffffff;
        --card-bg-hover: #f9f9f9;
        --text: #333333;
        --text-light: #666666;
        --text-muted: #999999;
        --border: #e0e0e0;
        --border-light: #f0f0f0;
    }

    /* List view styles */
    .listings-grid.list-view {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .listings-grid.list-view .listing-card {
        display: flex;
        flex-direction: row;
        align-items: center;
        padding: 16px;
        max-width: none;
    }

    .listings-grid.list-view .listing-card .listing-image {
        width: 80px;
        height: 80px;
        margin-right: 16px;
    }

    .listings-grid.list-view .listing-card .listing-info {
        flex: 1;
    }

    @media (max-width: 768px) {
        .settings-modal-content {
            width: 95%;
            max-height: 90vh;
        }
        
        .settings-actions {
            flex-direction: column;
        }
        
        .settings-btn-cancel,
        .settings-btn-save {
            width: 100%;
        }
    }
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = settingsStyles;
document.head.appendChild(styleSheet);

// Export the component
export default SettingsComponent;