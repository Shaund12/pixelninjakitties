# Centralized Utilities Documentation

This document describes the consolidated utility modules that replace duplicated logic across the Ninja Kitties NFT site.

## Directory Structure

```
src/utils/
├── walletHelpers.js     # Wallet connection, address formatting, validation
├── apiClient.js         # Supabase client, favorites, preferences, activity logging
├── formatters.js        # Date, number, currency, file size, duration formatting
├── validators.js        # Form validation, address validation, input sanitization
└── imageGenerator.js    # Image generation utilities, prompt building, provider configs
```

## Usage Examples

### Wallet Helpers (`src/utils/walletHelpers.js`)

```javascript
import { 
    connectWallet, 
    getAddress, 
    short, 
    validateAddress 
} from '/src/utils/walletHelpers.js';

// Connect to wallet
const connection = await connectWallet();

// Get current address
const address = getAddress();

// Format address for display
const shortAddress = short(address); // "0x1234...5678"

// Validate address
const validation = validateAddress(address);
if (validation.isValid) {
    console.log('Valid address:', validation.value);
}
```

### API Client (`src/utils/apiClient.js`)

```javascript
import { 
    getFavorites, 
    toggleFavorite, 
    logActivity,
    loadPreferences 
} from '/src/utils/apiClient.js';

// Get user favorites
const favorites = await getFavorites(walletAddress);

// Toggle favorite status
const result = await toggleFavorite(walletAddress, tokenId);

// Log user activity
await logActivity(walletAddress, 'view', tokenId);

// Load user preferences
const prefs = await loadPreferences(walletAddress);
```

### Formatters (`src/utils/formatters.js`)

```javascript
import { 
    formatDate, 
    formatCurrency, 
    formatAddress,
    formatFileSize 
} from '/src/utils/formatters.js';

// Format dates with options
const date = formatDate(timestamp, { style: 'long', includeTime: true });
const relativeDate = formatDate(timestamp, { style: 'relative' });

// Format currency
const price = formatCurrency(1234.56); // "$1,234.56"
const compactPrice = formatCurrency(1000000, { compact: true }); // "$1.0M"

// Format addresses
const address = formatAddress('0x1234...'); // "0x1234...5678"

// Format file sizes
const size = formatFileSize(1024 * 1024); // "1.0 MB"
```

### Validators (`src/utils/validators.js`)

```javascript
import { 
    validateForm, 
    validateAddress, 
    validateEmail,
    ValidationSchema 
} from '/src/utils/validators.js';

// Validate form data
const formResult = validateForm(data, {
    address: ValidationSchema.address(),
    email: ValidationSchema.email(),
    amount: ValidationSchema.number({ positive: true })
});

if (formResult.isValid) {
    console.log('Form is valid:', formResult.data);
} else {
    console.log('Errors:', formResult.errors);
}
```

### Image Generator (`src/utils/imageGenerator.js`)

```javascript
import { 
    buildPrompt, 
    getProviderFallbackOrder,
    IMAGE_PROVIDERS 
} from '/src/utils/imageGenerator.js';

// Build prompt from NFT metadata
const prompt = buildPrompt(metadata, {
    style: 'anime',
    includeBackground: true,
    includeEffects: true
});

// Get provider fallback order
const providers = getProviderFallbackOrder('dall-e', {
    preferQuality: true
});
```

## Migration Guide

### Replacing Duplicated Functions

**Before (duplicated across files):**
```javascript
// In multiple files
function formatAddress(address) {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString();
}
```

**After (centralized):**
```javascript
// Single import statement
import { formatAddress, formatDate } from '/src/utils/formatters.js';

// Usage with enhanced options
const shortAddr = formatAddress(address); // Same result
const formattedDate = formatDate(timestamp * 1000, { style: 'medium' });
```

### Supabase Client Migration

**Before (3 separate implementations):**
```javascript
// Each file had its own Supabase setup
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(url, key);
// + 100+ lines of duplicate functions
```

**After (centralized):**
```javascript
// Single import with all functions
import { getFavorites, toggleFavorite, logActivity } from '/src/utils/apiClient.js';
// Functions work the same, but are centralized
```

## Benefits of Consolidation

1. **Consistency**: All formatting follows the same patterns and options
2. **Maintainability**: Bug fixes and updates happen in one place
3. **Feature Rich**: Centralized utilities have more options and error handling
4. **Type Safety**: Better validation and error messages
5. **Performance**: Shared instances and optimized implementations
6. **Testing**: Easier to test centralized logic

## Adding New Utilities

When adding new utility functions:

1. **Choose the right module**: 
   - `formatters.js` for display formatting
   - `validators.js` for input validation
   - `walletHelpers.js` for blockchain interactions
   - `apiClient.js` for database operations
   - `imageGenerator.js` for AI image generation

2. **Follow patterns**: Use options objects for configuration
3. **Add validation**: Check inputs and provide helpful error messages
4. **Export properly**: Use named exports for tree-shaking
5. **Document usage**: Add JSDoc comments with examples

## Naming Conventions

- **Functions**: Use camelCase (`formatDate`, `validateEmail`)
- **Constants**: Use UPPER_SNAKE_CASE (`WALLET_EVENTS`, `IMAGE_PROVIDERS`)
- **Options**: Use descriptive names (`includeTime`, `allowEmpty`)
- **Exports**: Prefer named exports over default exports

## Future Extensions

The centralized utilities can be extended with:

- **Caching**: Add memoization for expensive operations
- **Internationalization**: Support multiple locales in formatters
- **Themes**: Add theme-aware formatting options
- **Analytics**: Built-in usage tracking for utilities
- **Performance**: Add performance monitoring and optimization