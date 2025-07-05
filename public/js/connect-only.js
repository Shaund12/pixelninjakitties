// Standard ethers import that works consistently across pages
import { BrowserProvider } from "https://cdn.jsdelivr.net/npm/ethers@6.10.0/dist/ethers.min.js";

// Connection state management
const CONNECTION_KEY = 'ninja_cats_wallet';

// Format address for display
function formatAddress(address) {
    return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : 'Connect Wallet';
}

// Connect to wallet
async function connectWallet() {
    try {
        if (!window.ethereum) {
            throw new Error("No ethereum provider found. Please install MetaMask.");
        }

        // Request accounts (this will prompt the user if not already connected)
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

        if (!accounts || accounts.length === 0) {
            throw new Error("No accounts found. Please unlock MetaMask and try again.");
        }

        const address = accounts[0];

        // Save to localStorage immediately
        localStorage.setItem(CONNECTION_KEY, address);
        console.log("Connected and saved address:", address);

        // Update all connect buttons in the document
        updateAllButtons(address);

        return { address };
    } catch (error) {
        console.error("Connection error:", error);
        localStorage.removeItem(CONNECTION_KEY);

        // Reset all buttons
        document.querySelectorAll('[id^="connectBtn"]').forEach(button => {
            button.textContent = "Connect Wallet";
            button.classList.remove('connected');
        });

        // Show user-friendly error
        if (error.message.includes('rejected')) {
            alert("Connection rejected. Please try again.");
        } else if (error.message.includes('MetaMask')) {
            alert("Please install MetaMask to connect your wallet.");
        } else {
            alert("Failed to connect wallet: " + error.message);
        }

        throw error;
    }
}

// Update all connect buttons in the document
function updateAllButtons(address) {
    document.querySelectorAll('[id^="connectBtn"]').forEach(button => {
        button.textContent = formatAddress(address);
        button.classList.add('connected');

        // Ensure click handler is set up
        button.onclick = handleButtonClick;
    });
}

// Handle button clicks (connect or disconnect)
async function handleButtonClick() {
    const savedAddress = localStorage.getItem(CONNECTION_KEY);

    if (savedAddress) {
        // Already connected - show disconnection option
        if (confirm("Do you want to disconnect your wallet?")) {
            localStorage.removeItem(CONNECTION_KEY);

            // Reset all buttons
            document.querySelectorAll('[id^="connectBtn"]').forEach(button => {
                button.textContent = "Connect Wallet";
                button.classList.remove('connected');
            });
        }
    } else {
        // Connect new wallet
        await connectWallet();
    }
}

// Check for existing connection
function checkExistingConnection() {
    const savedAddress = localStorage.getItem(CONNECTION_KEY);

    if (savedAddress) {
        console.log("Found saved connection:", savedAddress);
        updateAllButtons(savedAddress);

        // Verify connection is still valid (do this after updating UI)
        if (window.ethereum) {
            window.ethereum.request({ method: 'eth_accounts' })
                .then(accounts => {
                    if (accounts.length === 0) {
                        console.log("No accounts connected, clearing saved connection");
                        localStorage.removeItem(CONNECTION_KEY);

                        // Reset all buttons
                        document.querySelectorAll('[id^="connectBtn"]').forEach(button => {
                            button.textContent = "Connect Wallet";
                            button.classList.remove('connected');
                        });
                    }
                })
                .catch(err => {
                    console.error("Error verifying account:", err);
                });
        }
    }
}

// Setup ethereum event listeners
function setupEventListeners() {
    if (window.ethereum) {
        window.ethereum.on('accountsChanged', (accounts) => {
            console.log("Accounts changed:", accounts);
            if (accounts.length === 0) {
                // User disconnected
                localStorage.removeItem(CONNECTION_KEY);

                // Reset all buttons
                document.querySelectorAll('[id^="connectBtn"]').forEach(button => {
                    button.textContent = "Connect Wallet";
                    button.classList.remove('connected');
                });
            } else {
                // User switched accounts
                localStorage.setItem(CONNECTION_KEY, accounts[0]);
                updateAllButtons(accounts[0]);
            }
        });

        window.ethereum.on('chainChanged', () => {
            // Reload the page when chain changes
            window.location.reload();
        });
    }
}

// Initialize wallet connection
function initWalletConnection() {
    console.log("Initializing wallet connection...");

    // Find all connect buttons
    const connectButtons = document.querySelectorAll('[id^="connectBtn"]');

    if (connectButtons.length === 0) {
        console.warn("No connect buttons found on page");
        return;
    }

    console.log(`Found ${connectButtons.length} connect button(s)`);

    // Set up click handlers for all buttons
    connectButtons.forEach(button => {
        button.onclick = handleButtonClick;
    });

    // Check for existing connection
    checkExistingConnection();

    // Set up event listeners
    setupEventListeners();
}

// Make sure everything is loaded before running
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWalletConnection);
} else {
    // If already loaded, run immediately
    initWalletConnection();
}

// Export for other modules to use
export async function getConnection() {
    const savedAddress = localStorage.getItem(CONNECTION_KEY);
    if (!savedAddress) return null;

    try {
        if (!window.ethereum) {
            throw new Error("No ethereum provider found");
        }

        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length === 0) {
            throw new Error("No connected accounts found");
        }

        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();

        return { provider, signer, address: accounts[0] };
    } catch (error) {
        console.error("Failed to restore connection:", error);
        return null;
    }
}