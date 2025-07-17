/**
 * Comments Component
 * Handles comment display and posting for NFTs
 */

import { getComments, postComment, deleteComment, subscribeToComments } from '../js/supabaseClient.js';
import { getCurrentWalletAddress } from '../js/walletConnector.js';

class CommentsComponent {
    constructor() {
        this.currentWallet = null;
        this.comments = [];
        this.subscription = null;
        this.currentTokenId = null;
        this.init();
    }

    async init() {
        this.currentWallet = await getCurrentWalletAddress();
    }

    async loadComments(tokenId) {
        this.currentTokenId = tokenId;
        
        try {
            this.comments = await getComments(tokenId);
            this.renderComments();
            
            // Set up real-time subscription
            this.setupRealtimeSubscription(tokenId);
        } catch (error) {
            console.error('Error loading comments:', error);
            this.showError('Failed to load comments');
        }
    }

    async setupRealtimeSubscription(tokenId) {
        // Clean up existing subscription
        if (this.subscription) {
            this.subscription.unsubscribe();
        }

        this.subscription = await subscribeToComments(tokenId, (event, comment) => {
            switch (event) {
                case 'comment_added':
                    this.comments.push(comment);
                    this.renderComments();
                    break;
                case 'comment_deleted':
                    this.comments = this.comments.filter(c => c.id !== comment.id);
                    this.renderComments();
                    break;
            }
        });
    }

    createCommentsSection(tokenId) {
        const section = document.createElement('div');
        section.className = 'comments-section';
        section.innerHTML = `
            <div class="comments-header">
                <h3>Comments & Reviews</h3>
                <span class="comments-count" id="commentsCount">0</span>
            </div>
            <div class="comments-form-container">
                <div class="comments-form" id="commentsForm">
                    <textarea id="commentInput" placeholder="Share your thoughts about this NFT..." 
                              maxlength="1000" rows="3"></textarea>
                    <div class="comments-form-actions">
                        <div class="character-count">
                            <span id="characterCount">0</span>/1000
                        </div>
                        <button class="comments-submit-btn" id="submitComment">Post Comment</button>
                    </div>
                </div>
                <div class="comments-login-prompt" id="loginPrompt" style="display: none;">
                    <p>Connect your wallet to post comments</p>
                </div>
            </div>
            <div class="comments-list" id="commentsList">
                <div class="comments-loading">Loading comments...</div>
            </div>
        `;

        this.setupEventListeners(section);
        this.loadComments(tokenId);
        
        return section;
    }

    setupEventListeners(section) {
        const textarea = section.querySelector('#commentInput');
        const submitBtn = section.querySelector('#submitComment');
        const charCount = section.querySelector('#characterCount');

        // Character count
        textarea.addEventListener('input', (e) => {
            const length = e.target.value.length;
            charCount.textContent = length;
            charCount.style.color = length > 900 ? 'var(--error)' : 'var(--text-light)';
        });

        // Submit comment
        submitBtn.addEventListener('click', async () => {
            const comment = textarea.value.trim();
            if (comment && this.currentTokenId) {
                await this.submitComment(comment);
                textarea.value = '';
                charCount.textContent = '0';
            }
        });

        // Enter key to submit (with Shift+Enter for new line)
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitBtn.click();
            }
        });

        // Update UI based on wallet connection
        this.updateFormVisibility(section);
    }

    updateFormVisibility(section) {
        const form = section.querySelector('#commentsForm');
        const prompt = section.querySelector('#loginPrompt');
        
        if (this.currentWallet) {
            form.style.display = 'block';
            prompt.style.display = 'none';
        } else {
            form.style.display = 'none';
            prompt.style.display = 'block';
        }
    }

    async submitComment(commentText) {
        if (!this.currentWallet) {
            this.showError('Please connect your wallet to post comments');
            return;
        }

        if (!commentText.trim()) {
            this.showError('Comment cannot be empty');
            return;
        }

        try {
            await postComment(this.currentWallet, this.currentTokenId, commentText);
            this.showSuccess('Comment posted successfully');
        } catch (error) {
            console.error('Error posting comment:', error);
            this.showError('Failed to post comment');
        }
    }

    renderComments() {
        const container = document.getElementById('commentsList');
        const countElement = document.getElementById('commentsCount');
        
        if (!container) return;

        // Update count
        if (countElement) {
            countElement.textContent = this.comments.length;
        }

        if (this.comments.length === 0) {
            container.innerHTML = `
                <div class="comments-empty">
                    <p>No comments yet</p>
                    <p>Be the first to share your thoughts about this NFT!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="comments-items">
                ${this.comments.map(comment => this.renderComment(comment)).join('')}
            </div>
        `;

        // Add delete listeners
        container.querySelectorAll('.comment-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const commentId = e.target.dataset.commentId;
                await this.deleteComment(commentId);
            });
        });
    }

    renderComment(comment) {
        const createdDate = new Date(comment.created_at).toLocaleString();
        const isOwner = this.currentWallet && comment.user_id === this.currentWallet.toLowerCase();
        const userAddress = comment.user_id;
        const shortAddress = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;

        return `
            <div class="comment-item" data-comment-id="${comment.id}">
                <div class="comment-header">
                    <div class="comment-author">
                        <div class="comment-avatar">
                            ${shortAddress.charAt(0).toUpperCase()}
                        </div>
                        <div class="comment-author-info">
                            <span class="comment-author-name">${shortAddress}</span>
                            <span class="comment-date">${createdDate}</span>
                        </div>
                    </div>
                    ${isOwner ? `<button class="comment-delete-btn" data-comment-id="${comment.id}">Delete</button>` : ''}
                </div>
                <div class="comment-body">
                    ${this.formatCommentText(comment.body)}
                </div>
            </div>
        `;
    }

    formatCommentText(text) {
        // Basic text formatting (escape HTML and preserve line breaks)
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\n/g, '<br>');
    }

    async deleteComment(commentId) {
        if (!this.currentWallet) {
            this.showError('Please connect your wallet');
            return;
        }

        if (!confirm('Are you sure you want to delete this comment?')) {
            return;
        }

        try {
            await deleteComment(this.currentWallet, commentId);
            this.showSuccess('Comment deleted successfully');
        } catch (error) {
            console.error('Error deleting comment:', error);
            this.showError('Failed to delete comment');
        }
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showSuccess(message) {
        this.showToast(message, 'success');
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

    cleanup() {
        if (this.subscription) {
            this.subscription.unsubscribe();
            this.subscription = null;
        }
    }
}

// CSS Styles
const commentsStyles = `
    .comments-section {
        margin-top: 20px;
        padding: 20px;
        background: var(--card-bg);
        border: 1px solid var(--border);
        border-radius: 8px;
    }

    .comments-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 15px;
        border-bottom: 1px solid var(--border);
    }

    .comments-header h3 {
        margin: 0;
        color: var(--primary);
    }

    .comments-count {
        background: var(--primary);
        color: white;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
    }

    .comments-form-container {
        margin-bottom: 20px;
    }

    .comments-form {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }

    .comments-form textarea {
        width: 100%;
        padding: 12px;
        background: var(--background-light);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--text);
        font-family: inherit;
        font-size: 14px;
        resize: vertical;
        min-height: 80px;
    }

    .comments-form textarea:focus {
        outline: none;
        border-color: var(--primary);
    }

    .comments-form-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .character-count {
        font-size: 12px;
        color: var(--text-light);
    }

    .comments-submit-btn {
        background: var(--primary);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s ease;
    }

    .comments-submit-btn:hover {
        background: var(--primary-dark);
    }

    .comments-login-prompt {
        text-align: center;
        padding: 20px;
        background: var(--background-light);
        border: 1px solid var(--border);
        border-radius: 6px;
        color: var(--text-light);
    }

    .comments-loading {
        text-align: center;
        padding: 20px;
        color: var(--text-light);
    }

    .comments-empty {
        text-align: center;
        padding: 40px;
        color: var(--text-light);
    }

    .comments-items {
        display: flex;
        flex-direction: column;
        gap: 15px;
    }

    .comment-item {
        background: var(--background-light);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 15px;
        transition: all 0.2s ease;
    }

    .comment-item:hover {
        border-color: var(--primary);
    }

    .comment-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
    }

    .comment-author {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .comment-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: var(--primary);
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 500;
    }

    .comment-author-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .comment-author-name {
        font-weight: 500;
        color: var(--text);
        font-size: 14px;
    }

    .comment-date {
        font-size: 12px;
        color: var(--text-light);
    }

    .comment-delete-btn {
        background: var(--error);
        color: white;
        border: none;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        transition: background 0.2s ease;
    }

    .comment-delete-btn:hover {
        background: #d32f2f;
    }

    .comment-body {
        color: var(--text);
        line-height: 1.5;
        word-wrap: break-word;
    }

    @media (max-width: 768px) {
        .comments-section {
            padding: 15px;
        }
        
        .comments-form-actions {
            flex-direction: column;
            gap: 10px;
            align-items: flex-start;
        }
        
        .comment-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
        }
    }
`;

// Inject styles
const styleSheet = document.createElement('style');
styleSheet.textContent = commentsStyles;
document.head.appendChild(styleSheet);

// Export the component
export default CommentsComponent;