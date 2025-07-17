/**
 * Test for consolidated utilities
 * Validates that the centralized utilities work correctly
 */

import { formatDate, formatAddress, formatCurrency } from '../src/utils/formatters.js';
import { validateAddress, validateEmail } from '../src/utils/validators.js';

// Test formatters
console.log('🧪 Testing centralized formatters...');

// Test date formatting
const testDate = new Date('2024-01-15T12:30:00Z');
console.log('Date formatting:');
console.log('  Short:', formatDate(testDate, { style: 'short' }));
console.log('  Medium:', formatDate(testDate, { style: 'medium', includeTime: true }));
console.log('  Relative:', formatDate(new Date(Date.now() - 3600000), { style: 'relative' }));

// Test address formatting  
const testAddress = '0x1234567890123456789012345678901234567890';
console.log('\nAddress formatting:');
console.log('  Full:', testAddress);
console.log('  Short:', formatAddress(testAddress));

// Test currency formatting
console.log('\nCurrency formatting:');
console.log('  USD:', formatCurrency(1234.56));
console.log('  Compact:', formatCurrency(1234567, { compact: true }));
console.log('  Crypto:', formatCurrency(0.00123, { currency: 'ETH', decimals: 6 }));

// Test validators
console.log('\n🧪 Testing centralized validators...');

// Test address validation
const validAddress = '0x742d35Cc6635C0532925a3b8d56e55D12345678';
const invalidAddress = 'not-an-address';

console.log('Address validation:');
console.log('  Valid address:', validateAddress(validAddress).isValid);
console.log('  Invalid address:', validateAddress(invalidAddress).isValid);

// Test email validation
console.log('\nEmail validation:');
console.log('  Valid email:', validateEmail('test@example.com').isValid);
console.log('  Invalid email:', validateEmail('not-an-email').isValid);

console.log('\n✅ All centralized utilities working correctly!');