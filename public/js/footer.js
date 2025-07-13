document.addEventListener('DOMContentLoaded', function () {
    // Load footer component
    fetch('/components/footer.html')
        .then(response => response.text())
        .then(data => {
            document.getElementById('footer').innerHTML = data;

            // Update the current year in the copyright notice
            const yearElement = document.getElementById('current-year');
            if (yearElement) {
                yearElement.textContent = new Date().getFullYear();
            }

            // Add back to top functionality
            const backToTopBtn = document.getElementById('backToTopBtn');
            if (backToTopBtn) {
                backToTopBtn.addEventListener('click', function () {
                    window.scrollTo({
                        top: 0,
                        behavior: 'smooth'
                    });
                });

                // Show/hide button based on scroll position
                window.addEventListener('scroll', function () {
                    if (window.scrollY > 300) {
                        backToTopBtn.classList.add('visible');
                    } else {
                        backToTopBtn.classList.remove('visible');
                    }
                });
            }

            // Fetch real blockchain data
            fetchBlockchainStats();

            // Add CSS for the enhanced footer
            const footerStyles = document.createElement('style');
            footerStyles.id = 'ninja-footer-styles';

            if (!document.getElementById('ninja-footer-styles')) {
                footerStyles.innerHTML = `
                    .footer-container {
                        background: linear-gradient(180deg, #191a2a 0%, #0c0d14 100%);
                        color: #e0e0e0;
                        padding: 3rem 0 0;
                        position: relative;
                        overflow: hidden;
                        border-top: 1px solid rgba(138,101,255,0.3);
                        box-shadow: 0 -10px 30px rgba(138,101,255,0.15);
                    }
                    
                    /* Animated background elements */
                    .footer-bg-elements {
                        position: absolute;
                        top: 0;
                        left: 0;
                        width: 100%;
                        height: 100%;
                        z-index: 0;
                        opacity: 0.4;
                        overflow: hidden;
                    }
                    
                    .ninja-star {
                        position: absolute;
                        width: 20px;
                        height: 20px;
                        background: rgba(138,101,255,0.5);
                        clip-path: polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%);
                        animation: float 15s infinite linear;
                    }
                    
                    .star1 {
                        top: 10%;
                        left: 10%;
                        opacity: 0.7;
                        animation-duration: 20s;
                    }
                    
                    .star2 {
                        top: 30%;
                        right: 20%;
                        opacity: 0.5;
                        width: 15px;
                        height: 15px;
                        animation-duration: 25s;
                        animation-delay: 5s;
                    }
                    
                    .star3 {
                        bottom: 20%;
                        left: 30%;
                        opacity: 0.3;
                        width: 12px;
                        height: 12px;
                        animation-duration: 30s;
                        animation-delay: 2s;
                    }
                    
                    @keyframes float {
                        0% { transform: translate(0, 0) rotate(0deg); }
                        25% { transform: translate(100px, 50px) rotate(90deg); }
                        50% { transform: translate(200px, -30px) rotate(180deg); }
                        75% { transform: translate(100px, -100px) rotate(270deg); }
                        100% { transform: translate(0, 0) rotate(360deg); }
                    }
                    
                    /* Main footer content */
                    .footer-content {
                        display: flex;
                        flex-wrap: wrap;
                        justify-content: space-between;
                        max-width: 1200px;
                        margin: 0 auto;
                        padding: 0 1.5rem;
                        z-index: 1;
                        position: relative;
                    }
                    
                    .footer-section {
                        flex: 1;
                        min-width: 200px;
                        margin-bottom: 2rem;
                        padding: 0 1rem;
                    }
                    
                    .footer-section h3 {
                        color: #fff;
                        margin-bottom: 1rem;
                        font-size: 1.4rem;
                    }
                    
                    .footer-section h4 {
                        color: #8a65ff;
                        margin-bottom: 1rem;
                        font-weight: 600;
                        position: relative;
                        padding-bottom: 0.5rem;
                    }
                    
                    .footer-section h4::after {
                        content: '';
                        position: absolute;
                        left: 0;
                        bottom: 0;
                        height: 3px;
                        width: 40px;
                        background: linear-gradient(135deg, #8a65ff, #2775ca);
                        border-radius: 2px;
                    }
                    
                    .footer-logo {
                        margin-bottom: 1rem;
                        filter: drop-shadow(0 0 10px rgba(138,101,255,0.5));
                    }
                    
                    .pulse-glow {
                        animation: pulse-glow 3s infinite;
                    }
                    
                    @keyframes pulse-glow {
                        0% { filter: drop-shadow(0 0 5px rgba(138,101,255,0.3)); }
                        50% { filter: drop-shadow(0 0 15px rgba(138,101,255,0.7)); }
                        100% { filter: drop-shadow(0 0 5px rgba(138,101,255,0.3)); }
                    }
                    
                    /* Blockchain Stats */
                    .blockchain-stats {
                        display: flex;
                        gap: 1rem;
                        margin-top: 1rem;
                        padding-top: 1rem;
                        border-top: 1px solid rgba(138,101,255,0.2);
                        flex-wrap: wrap;
                    }
                    
                    .stat-item {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        min-width: 80px;
                        margin-bottom: 0.5rem;
                    }
                    
                    .stat-value {
                        font-size: 1.1rem;
                        font-weight: 700;
                        color: #8a65ff;
                    }
                    
                    .stat-label {
                        font-size: 0.8rem;
                        color: #999;
                    }
                    
                    /* Contract status display */
                    .contract-status {
                        display: flex;
                        align-items: center;
                        gap: 8px;
                        margin-top: 1rem;
                        font-size: 0.9rem;
                    }
                    
                    .status-indicator {
                        width: 12px;
                        height: 12px;
                        border-radius: 50%;
                        background: #666;
                    }
                    
                    .status-active {
                        background: #4ade80;
                        box-shadow: 0 0 8px rgba(74, 222, 128, 0.6);
                    }
                    
                    .status-paused {
                        background: #f87171;
                        box-shadow: 0 0 8px rgba(248, 113, 113, 0.6);
                    }
                    
                    .status-test {
                        background: #facc15;
                        box-shadow: 0 0 8px rgba(250, 204, 21, 0.6);
                    }
                    
                    .footer-links {
                        list-style: none;
                        padding: 0;
                        margin: 0;
                    }
                    
                    .footer-links li {
                        margin-bottom: 0.7rem;
                    }
                    
                    .footer-links a {
                        color: #b0b0b0;
                        text-decoration: none;
                        transition: all 0.2s;
                        position: relative;
                        padding-left: 0;
                    }
                    
                    .footer-links a:before {
                        content: "→";
                        position: absolute;
                        left: -15px;
                        opacity: 0;
                        transition: all 0.2s;
                        color: #8a65ff;
                    }
                    
                    .footer-links a:hover {
                        color: #fff;
                        padding-left: 15px;
                    }
                    
                    .footer-links a:hover:before {
                        opacity: 1;
                        left: 0;
                    }
                    
                    .social-links {
                        display: flex;
                        gap: 1rem;
                        margin-top: 1rem;
                    }
                    
                    .social-icon {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 40px;
                        height: 40px;
                        border-radius: 50%;
                        background: rgba(255,255,255,0.05);
                        color: #8a65ff;
                        transition: all 0.3s;
                        border: 1px solid rgba(138,101,255,0.3);
                    }
                    
                    .social-icon:hover {
                        background: linear-gradient(135deg, #8a65ff, #2775ca);
                        color: #fff;
                        transform: translateY(-3px);
                        box-shadow: 0 5px 15px rgba(138,101,255,0.4);
                    }
                    
                    /* Disclaimer section */
                    .footer-disclaimer {
                        background: rgba(0,0,0,0.2);
                        padding: 1.5rem;
                        text-align: center;
                        max-width: 1000px;
                        margin: 0 auto;
                        border-radius: 8px;
                        font-size: 0.9rem;
                        color: #999;
                        position: relative;
                        z-index: 1;
                        border-top: 1px solid rgba(138,101,255,0.1);
                    }
                    
                    .footer-disclaimer a {
                        color: #8a65ff;
                        text-decoration: underline;
                        transition: all 0.2s;
                    }
                    
                    .footer-disclaimer a:hover {
                        color: #fff;
                    }
                    
                    /* Bottom section with copyright and back to top */
                    .footer-bottom {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        padding: 1.5rem;
                        border-top: 1px solid rgba(255,255,255,0.1);
                        margin-top: 2rem;
                        position: relative;
                        z-index: 1;
                        flex-wrap: wrap;
                        gap: 1rem;
                    }
                    
                    .footer-copyright {
                        color: #888;
                        font-size: 0.9rem;
                    }
                    
                    #backToTopBtn {
                        display: flex;
                        align-items: center;
                        gap: 0.5rem;
                        background: rgba(138,101,255,0.1);
                        border: 1px solid rgba(138,101,255,0.3);
                        color: #8a65ff;
                        padding: 0.5rem 1rem;
                        border-radius: 8px;
                        cursor: pointer;
                        transition: all 0.3s;
                        font-family: 'Poppins', sans-serif;
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    
                    #backToTopBtn.visible {
                        opacity: 1;
                        transform: translateY(0);
                    }
                    
                    #backToTopBtn:hover {
                        background: linear-gradient(135deg, #8a65ff, #2775ca);
                        color: #fff;
                        transform: translateY(-2px);
                        box-shadow: 0 4px 12px rgba(138,101,255,0.3);
                    }
                    
                    /* Responsive adjustments */
                    @media (max-width: 768px) {
                        .footer-content {
                            flex-direction: column;
                        }
                        
                        .footer-section {
                            width: 100%;
                            margin-bottom: 2rem;
                            padding: 0;
                        }
                        
                        .social-links {
                            justify-content: center;
                        }
                        
                        .footer-bottom {
                            flex-direction: column;
                            text-align: center;
                        }
                    }
                    
                    @keyframes fadeIn {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                `;
                document.head.appendChild(footerStyles);
            }
        })
        .catch(error => {
            console.error('Error loading footer component:', error);
            document.getElementById('footer').innerHTML = '<p class="error">Footer could not be loaded</p>';
        });

    // Function to fetch real blockchain stats
    async function fetchBlockchainStats() {
        try {
            // Wait for window.NFT_CONFIG to be available
            let attempts = 0;
            const maxAttempts = 10;

            const checkConfig = async () => {
                if (window.NFT_CONFIG && window.ethers) {
                    try {
                        const provider = new ethers.JsonRpcProvider(window.NFT_CONFIG.RPC_URL);
                        const contract = new ethers.Contract(
                            window.NFT_CONFIG.CONTRACT_ADDRESS,
                            window.NFT_CONFIG.NFT_ABI,
                            provider
                        );

                        // Get total supply
                        const totalSupply = await contract.totalSupply();
                        updateStatElement('total-minted', totalSupply.toString());

                        // Get next token ID
                        const nextTokenId = await contract.nextTokenId();
                        updateStatElement('next-token-id', nextTokenId.toString());

                        // Get royalty percentage
                        const royaltyBps = await contract.royaltyBps();
                        const royaltyPercent = (Number(royaltyBps) / 100).toFixed(2) + '%';
                        updateStatElement('royalty-percent', royaltyPercent);

                        // Check contract status (paused/active/test mode)
                        const isPaused = await contract.paused();

                        // Fixed: Handle testMode properly - use a try-catch to handle if the function doesn't exist
                        let isTestMode = false;
                        try {
                            // Try the function as a property first
                            if (typeof contract.testMode === 'function') {
                                isTestMode = await contract.testMode();
                            } else {
                                // Try calling it directly - this might be what's causing the error
                                const testModeCall = await provider.call({
                                    to: window.NFT_CONFIG.CONTRACT_ADDRESS,
                                    data: '0xcd9ea342' // Function selector for testMode()
                                });
                                isTestMode = testModeCall !== '0x' && testModeCall !== '0x0000000000000000000000000000000000000000000000000000000000000000';
                            }
                        } catch (testModeError) {
                            console.warn("Could not check test mode status:", testModeError.message);
                            isTestMode = false;
                        }

                        const statusIndicator = document.getElementById('contract-status-indicator');
                        const statusText = document.getElementById('contract-status-text');

                        if (statusIndicator && statusText) {
                            if (isPaused) {
                                statusIndicator.className = 'status-indicator status-paused';
                                statusText.textContent = 'Contract Paused';
                            } else if (isTestMode) {
                                statusIndicator.className = 'status-indicator status-test';
                                statusText.textContent = 'Test Mode';
                            } else {
                                statusIndicator.className = 'status-indicator status-active';
                                statusText.textContent = 'Active';
                            }
                        }

                    } catch (error) {
                        console.error("Error fetching blockchain stats:", error);

                        // Add fallback UI updates when the data can't be loaded
                        const statusIndicator = document.getElementById('contract-status-indicator');
                        const statusText = document.getElementById('contract-status-text');

                        if (statusIndicator && statusText) {
                            statusIndicator.className = 'status-indicator';
                            statusText.textContent = 'Status Unknown';
                        }

                        updateStatElement('total-minted', '---');
                        updateStatElement('next-token-id', '---');
                        updateStatElement('royalty-percent', '---');
                    }
                } else if (attempts < maxAttempts) {
                    attempts++;
                    // Wait and try again
                    setTimeout(checkConfig, 500);
                } else {
                    // Max attempts reached, provide fallback UI
                    const statusIndicator = document.getElementById('contract-status-indicator');
                    const statusText = document.getElementById('contract-status-text');

                    if (statusIndicator && statusText) {
                        statusIndicator.className = 'status-indicator';
                        statusText.textContent = 'Could not connect';
                    }

                    updateStatElement('total-minted', '---');
                    updateStatElement('next-token-id', '---');
                    updateStatElement('royalty-percent', '---');
                }
            };

            // Start checking for config
            checkConfig();

        } catch (error) {
            console.error("Error in fetchBlockchainStats:", error);
        }
    }

    // Helper function to update stat elements
    function updateStatElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            if (value === '0') {
                element.textContent = '0';
            } else if (value) {
                // Format with commas for better readability
                if (!isNaN(value.replace('%', ''))) {
                    // If it's a number or percentage
                    const numValue = value.includes('%') ?
                        Number(value.replace('%', '')) :
                        Number(value);

                    element.textContent = isNaN(numValue) ?
                        value :
                        numValue.toLocaleString() + (value.includes('%') ? '%' : '');
                } else {
                    element.textContent = value;
                }
            }
            // Add a fade-in animation
            element.style.animation = 'fadeIn 0.5s';
        }
    }
});