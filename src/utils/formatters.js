/**
 * Centralized Formatting Utilities
 * Consolidates date, number, currency, and other formatting functions
 */

/**
 * Format a date timestamp for display
 * @param {number|string|Date} timestamp - Date to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted date string
 */
export function formatDate(timestamp, options = {}) {
    const {
        style = 'medium', // 'short', 'medium', 'long', 'relative'
        includeTime = false,
        locale = 'en-US'
    } = options;

    try {
        let date;

        if (!timestamp) {
            return 'Unknown date';
        }

        // Handle different timestamp formats
        if (typeof timestamp === 'number') {
            // If it's a Unix timestamp (seconds), convert to milliseconds
            date = timestamp < 10000000000 ? new Date(timestamp * 1000) : new Date(timestamp);
        } else if (typeof timestamp === 'string') {
            date = new Date(timestamp);
        } else if (timestamp instanceof Date) {
            date = timestamp;
        } else {
            return 'Invalid date';
        }

        if (isNaN(date.getTime())) {
            return 'Invalid date';
        }

        // Handle relative formatting
        if (style === 'relative') {
            return formatRelativeDate(date);
        }

        // Standard date formatting
        const dateOptions = {
            short: {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            },
            medium: {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                ...(includeTime && {
                    hour: '2-digit',
                    minute: '2-digit'
                })
            },
            long: {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                ...(includeTime && {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                })
            }
        };

        return date.toLocaleDateString(locale, dateOptions[style] || dateOptions.medium);
    } catch (error) {
        console.error('Error formatting date:', error);
        return 'Invalid date';
    }
}

/**
 * Format date in relative terms (e.g., "2 hours ago", "yesterday")
 * @param {Date} date - Date to format
 * @returns {string} Relative date string
 */
export function formatRelativeDate(date) {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
    } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months} month${months !== 1 ? 's' : ''} ago`;
    } else {
        const years = Math.floor(diffDays / 365);
        return `${years} year${years !== 1 ? 's' : ''} ago`;
    }
}

/**
 * Format numbers with proper thousands separators and decimals
 * @param {number|string} value - Number to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted number string
 */
export function formatNumber(value, options = {}) {
    const {
        decimals = 0,
        locale = 'en-US',
        compact = false, // Show as 1.2K, 1.5M, etc.
        style = 'decimal' // 'decimal', 'percent'
    } = options;

    try {
        const num = typeof value === 'string' ? parseFloat(value) : value;

        if (isNaN(num)) {
            return '0';
        }

        if (compact) {
            return formatCompactNumber(num, locale);
        }

        const formatOptions = {
            style: style,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        };

        return new Intl.NumberFormat(locale, formatOptions).format(num);
    } catch (error) {
        console.error('Error formatting number:', error);
        return '0';
    }
}

/**
 * Format numbers in compact notation (K, M, B, T)
 * @param {number} value - Number to format
 * @returns {string} Compact formatted number
 */
export function formatCompactNumber(value) {
    const num = Math.abs(value);
    const sign = value < 0 ? '-' : '';

    if (num >= 1e12) {
        return sign + (value / 1e12).toFixed(1) + 'T';
    } else if (num >= 1e9) {
        return sign + (value / 1e9).toFixed(1) + 'B';
    } else if (num >= 1e6) {
        return sign + (value / 1e6).toFixed(1) + 'M';
    } else if (num >= 1e3) {
        return sign + (value / 1e3).toFixed(1) + 'K';
    } else {
        return value.toString();
    }
}

/**
 * Format currency values with proper symbols and decimals
 * @param {number|string} value - Amount to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted currency string
 */
export function formatCurrency(value, options = {}) {
    const {
        currency = 'USD',
        locale = 'en-US',
        decimals = 2,
        symbol = true, // Show currency symbol
        compact = false
    } = options;

    try {
        const amount = typeof value === 'string' ? parseFloat(value) : value;

        if (isNaN(amount)) {
            return symbol ? '$0.00' : '0.00';
        }

        if (compact) {
            const formatted = formatCompactNumber(amount);
            return symbol ? `$${formatted}` : formatted;
        }

        const formatOptions = {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        };

        if (!symbol) {
            formatOptions.style = 'decimal';
            const formatted = new Intl.NumberFormat(locale, formatOptions).format(amount);
            return formatted;
        }

        return new Intl.NumberFormat(locale, formatOptions).format(amount);
    } catch (error) {
        console.error('Error formatting currency:', error);
        return symbol ? '$0.00' : '0.00';
    }
}

/**
 * Format cryptocurrency values with appropriate decimal places
 * @param {number|string} value - Crypto amount to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted crypto amount
 */
export function formatCrypto(value, options = {}) {
    const {
        symbol = 'ETH',
        decimals = 4,
        showSymbol = true,
        compact = false
    } = options;

    try {
        const amount = typeof value === 'string' ? parseFloat(value) : value;

        if (isNaN(amount)) {
            return showSymbol ? `0 ${symbol}` : '0';
        }

        let formatted;
        if (compact) {
            formatted = formatCompactNumber(amount);
        } else {
            // Use more decimals for small amounts
            const actualDecimals = amount < 0.01 ? Math.max(decimals, 6) : decimals;
            formatted = amount.toFixed(actualDecimals).replace(/\.?0+$/, '');
        }

        return showSymbol ? `${formatted} ${symbol}` : formatted;
    } catch (error) {
        console.error('Error formatting crypto:', error);
        return showSymbol ? `0 ${symbol}` : '0';
    }
}

/**
 * Format Wei values to Ether with appropriate precision
 * @param {string|number} weiValue - Value in Wei
 * @param {Object} options - Formatting options
 * @returns {string} Formatted Ether value
 */
export function formatWeiToEther(weiValue, options = {}) {
    const {
        decimals = 4,
        showSymbol = true,
        compact = false
    } = options;

    try {
        // Handle ethers.js BigNumber or string
        let wei;
        if (typeof weiValue === 'string') {
            wei = BigInt(weiValue);
        } else if (typeof weiValue === 'object' && weiValue.toString) {
            wei = BigInt(weiValue.toString());
        } else {
            wei = BigInt(weiValue);
        }

        // Convert Wei to Ether (divide by 10^18)
        const ether = Number(wei) / Math.pow(10, 18);

        return formatCrypto(ether, {
            symbol: 'ETH',
            decimals,
            showSymbol,
            compact
        });
    } catch (error) {
        console.error('Error formatting Wei to Ether:', error);
        return showSymbol ? '0 ETH' : '0';
    }
}

/**
 * Format percentage values
 * @param {number|string} value - Value to format as percentage
 * @param {Object} options - Formatting options
 * @returns {string} Formatted percentage string
 */
export function formatPercentage(value, options = {}) {
    const {
        decimals = 1,
        locale = 'en-US',
        showSign = false // Show + for positive values
    } = options;

    try {
        const num = typeof value === 'string' ? parseFloat(value) : value;

        if (isNaN(num)) {
            return '0%';
        }

        const formatted = new Intl.NumberFormat(locale, {
            style: 'percent',
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
            signDisplay: showSign ? 'always' : 'auto'
        }).format(num / 100); // Assuming input is already a percentage

        return formatted;
    } catch (error) {
        console.error('Error formatting percentage:', error);
        return '0%';
    }
}

/**
 * Format file sizes in human-readable format
 * @param {number} bytes - File size in bytes
 * @param {Object} options - Formatting options
 * @returns {string} Formatted file size
 */
export function formatFileSize(bytes, options = {}) {
    const {
        decimals = 1,
        binary = false // Use 1024 instead of 1000
    } = options;

    try {
        if (bytes === 0) return '0 B';

        const k = binary ? 1024 : 1000;
        const sizes = binary
            ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB']
            : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const size = bytes / Math.pow(k, i);

        return `${size.toFixed(decimals)} ${sizes[i]}`;
    } catch (error) {
        console.error('Error formatting file size:', error);
        return '0 B';
    }
}

/**
 * Format duration in human-readable format
 * @param {number} seconds - Duration in seconds
 * @param {Object} options - Formatting options
 * @returns {string} Formatted duration
 */
export function formatDuration(seconds, options = {}) {
    const {
        style = 'long', // 'short', 'long'
        maxUnits = 2 // Maximum number of units to show
    } = options;

    try {
        if (seconds < 0) return '0s';

        const units = [
            { name: 'year', short: 'y', seconds: 31536000 },
            { name: 'month', short: 'mo', seconds: 2592000 },
            { name: 'day', short: 'd', seconds: 86400 },
            { name: 'hour', short: 'h', seconds: 3600 },
            { name: 'minute', short: 'm', seconds: 60 },
            { name: 'second', short: 's', seconds: 1 }
        ];

        const parts = [];
        let remaining = Math.floor(seconds);

        for (const unit of units) {
            if (remaining >= unit.seconds && parts.length < maxUnits) {
                const count = Math.floor(remaining / unit.seconds);
                remaining -= count * unit.seconds;

                const unitName = style === 'short'
                    ? unit.short
                    : count === 1 ? unit.name : `${unit.name}s`;

                parts.push(style === 'short' ? `${count}${unit.short}` : `${count} ${unitName}`);
            }
        }

        if (parts.length === 0) {
            return style === 'short' ? '0s' : '0 seconds';
        }

        return parts.join(style === 'short' ? ' ' : ', ');
    } catch (error) {
        console.error('Error formatting duration:', error);
        return style === 'short' ? '0s' : '0 seconds';
    }
}

/**
 * Format blockchain transaction hash with ellipsis
 * @param {string} hash - Transaction hash
 * @param {number} startChars - Characters to show at start
 * @param {number} endChars - Characters to show at end
 * @returns {string} Formatted hash
 */
export function formatTxHash(hash, startChars = 6, endChars = 4) {
    if (!hash || typeof hash !== 'string') {
        return '';
    }

    if (hash.length <= startChars + endChars) {
        return hash;
    }

    return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
}

/**
 * Format blockchain address with ellipsis (alias for transaction hash formatting)
 * @param {string} address - Blockchain address
 * @param {number} startChars - Characters to show at start
 * @param {number} endChars - Characters to show at end
 * @returns {string} Formatted address
 */
export function formatAddress(address, startChars = 6, endChars = 4) {
    return formatTxHash(address, startChars, endChars);
}

/**
 * Format NFT token ID with appropriate padding or formatting
 * @param {string|number} tokenId - Token ID to format
 * @param {Object} options - Formatting options
 * @returns {string} Formatted token ID
 */
export function formatTokenId(tokenId, options = {}) {
    const {
        prefix = '#',
        minLength = 0,
        padChar = '0'
    } = options;

    try {
        const idStr = tokenId.toString();
        const paddedId = minLength > 0 ? idStr.padStart(minLength, padChar) : idStr;
        return `${prefix}${paddedId}`;
    } catch (error) {
        console.error('Error formatting token ID:', error);
        return `${prefix}${tokenId}`;
    }
}

/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} HTML-escaped text
 */
export function escapeHtml(text) {
    if (typeof text !== 'string') {
        return text;
    }

    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @param {string} ellipsis - Ellipsis string
 * @returns {string} Truncated text
 */
export function truncateText(text, maxLength, ellipsis = '...') {
    if (!text || typeof text !== 'string') {
        return text || '';
    }

    if (text.length <= maxLength) {
        return text;
    }

    return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Format text for proper title case
 * @param {string} text - Text to format
 * @returns {string} Title case text
 */
export function toTitleCase(text) {
    if (!text || typeof text !== 'string') {
        return text || '';
    }

    return text.replace(/\w\S*/g, (txt) =>
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
}

/**
 * Format camelCase or snake_case to readable text
 * @param {string} text - Text to format
 * @returns {string} Readable text
 */
export function toReadableText(text) {
    if (!text || typeof text !== 'string') {
        return text || '';
    }

    return text
        .replace(/([A-Z])/g, ' $1') // Add space before capital letters
        .replace(/_/g, ' ') // Replace underscores with spaces
        .replace(/\s+/g, ' ') // Normalize multiple spaces
        .trim()
        .toLowerCase()
        .replace(/^\w/, c => c.toUpperCase()); // Capitalize first letter
}