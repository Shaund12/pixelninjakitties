// Get configuration from imported module
let NFT_CONFIG;

// Wait for config to be imported and set up
document.addEventListener('DOMContentLoaded', async function () {
    // Wait for NFT_CONFIG to be set by the module script
    let configCheckAttempts = 0;
    while (!window.NFT_CONFIG && configCheckAttempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 100));
        configCheckAttempts++;
    }

    NFT_CONFIG = window.NFT_CONFIG;

    // Initialize all functionality
    setupNFTCarousel();
    setupAnimatedBackgrounds();
    setupTraitInteractions();
    setup3DElementShowcase();
    setupTimelineAnimations();
    setupRarityCalculator();

    // Add this line to initialize the Oracle
    setupOracleConsultation();
});

// NFT Carousel setup
async function setupNFTCarousel() {
    const carouselTrack = document.getElementById('nftCarousel');
    const dotsContainer = document.getElementById('carouselDots');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const autoPlayBtn = document.getElementById('autoPlayBtn');
    const counterEl = document.getElementById('carouselCounter');

    // Get contract config from window global set by module script
    const config = NFT_CONFIG;
    if (!config) {
        console.error('Contract configuration not loaded');
        carouselTrack.innerHTML = '<div class="carousel-item"><p>Error loading ninja cats</p></div>';
        return;
    }

    try {
        const provider = new ethers.JsonRpcProvider(config.RPC_URL);
        const contract = new ethers.Contract(config.CONTRACT_ADDRESS, config.NFT_ABI, provider);

        // Get total supply
        const totalSupply = await contract.totalSupply();
        const tokenCount = Number(totalSupply);

        if (tokenCount <= 0) {
            carouselTrack.innerHTML = `
                <div class="carousel-item">
                    <img src="assets/detailed_ninja_cat_64.png" alt="Placeholder" style="width: 150px; margin-bottom: 1rem;">
                    <p>No ninja cats have been minted yet.<br>Be the first to summon a warrior!</p>
                </div>`;
            return;
        }

        // Update counter
        counterEl.textContent = `${tokenCount} Ninja Cats Found`;

        // We'll get up to 10 random cats to showcase
        const catsToShow = Math.min(10, tokenCount);
        const selectedTokens = [];

        // If we have few cats, show them all
        if (tokenCount <= 10) {
            for (let i = 0; i < tokenCount; i++) {
                selectedTokens.push(i);
            }
        } else {
            // Otherwise select some random ones (with a bias toward newer ones)
            // Always include the newest 3
            for (let i = 0; i < 3 && i < tokenCount; i++) {
                selectedTokens.push(tokenCount - 1 - i);
            }

            // Then add some random ones
            while (selectedTokens.length < catsToShow) {
                const randomIndex = Math.floor(Math.random() * tokenCount);
                if (!selectedTokens.includes(randomIndex)) {
                    selectedTokens.push(randomIndex);
                }
            }
        }

        // Clear loading indicator
        carouselTrack.innerHTML = '';

        // Create a fallback image
        const fallbackImage = 'assets/detailed_ninja_cat_64.png';

        // Create carousel items
        for (let i = 0; i < selectedTokens.length; i++) {
            const idx = selectedTokens[i];

            // Create placeholder item while we load the data
            const item = document.createElement('div');
            item.className = 'carousel-item';
            item.innerHTML = `
                <div class="loading-spinner"></div>
                <p>Loading Ninja Cat...</p>
            `;
            carouselTrack.appendChild(item);

            // Create dot
            const dot = document.createElement('div');
            dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
            dot.addEventListener('click', () => goToSlide(i));
            dotsContainer.appendChild(dot);

            try {
                // Get token ID for this index
                const tokenId = await contract.tokenByIndex(idx);

                // Get token URI and metadata
                const uri = await contract.tokenURI(tokenId);
                let metadata;

                if (uri.startsWith('ipfs://')) {
                    const ipfsHash = uri.replace('ipfs://', '');
                    const ipfsUrl = `https://ipfs.io/ipfs/${ipfsHash}`;
                    const response = await fetch(ipfsUrl);
                    metadata = await response.json();
                } else {
                    const response = await fetch(uri);
                    metadata = await response.json();
                }

                // Update the carousel item with the fetched data
                if (metadata && metadata.image) {
                    // Fix IPFS links
                    const imageUrl = metadata.image.startsWith('ipfs://')
                        ? metadata.image.replace('ipfs://', 'https://ipfs.io/ipfs/')
                        : metadata.image;

                    // Get breed for display
                    let breed = 'Ninja Cat';
                    if (metadata.attributes) {
                        const breedAttr = metadata.attributes.find(a => a.trait_type === 'Breed');
                        if (breedAttr) breed = breedAttr.value;
                    }

                    item.innerHTML = `
                        <img src="${imageUrl}" alt="${metadata.name}" class="carousel-image"
                             onerror="this.src='${fallbackImage}'">
                        <div class="carousel-caption">
                            ${metadata.name}
                            <div style="font-size: 0.8rem; color: #9e9e9e; margin-top: 0.3rem;">
                                ${breed} · Token #${tokenId}
                            </div>
                        </div>
                    `;

                    // Add click to view details
                    item.style.cursor = 'pointer';
                    item.addEventListener('click', () => {
                        window.location.href = `kitty.html?id=${tokenId}`;
                    });
                }
            } catch (err) {
                console.error('Error loading token:', err);
                item.innerHTML = `
                    <img src="${fallbackImage}" alt="Ninja Cat" class="carousel-image">
                    <div class="carousel-caption">Mysterious Ninja Cat</div>
                `;
            }
        }

        // Set up carousel functionality
        let currentSlide = 0;
        const slides = document.querySelectorAll('.carousel-item');
        const dots = document.querySelectorAll('.carousel-dot');

        function goToSlide(n) {
            currentSlide = n;
            carouselTrack.style.transform = `translateX(-${currentSlide * 100}%)`;

            // Update dots
            dots.forEach((dot, i) => {
                dot.classList.toggle('active', i === currentSlide);
            });
        }

        // Add event listeners for navigation
        prevBtn.addEventListener('click', () => {
            currentSlide = (currentSlide - 1 + slides.length) % slides.length;
            goToSlide(currentSlide);
        });

        nextBtn.addEventListener('click', () => {
            currentSlide = (currentSlide + 1) % slides.length;
            goToSlide(currentSlide);
        });

        // Auto-play functionality
        let interval;
        let isPlaying = false;

        function toggleAutoPlay() {
            if (isPlaying) {
                clearInterval(interval);
                autoPlayBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="5 3 19 12 5 21 5 3"></polygon>
                    </svg>
                    Auto-Play`;
            } else {
                interval = setInterval(() => {
                    currentSlide = (currentSlide + 1) % slides.length;
                    goToSlide(currentSlide);
                }, 4000);
                autoPlayBtn.innerHTML = `
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="6" y="4" width="4" height="16"></rect>
                        <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                    Pause`;
            }
            isPlaying = !isPlaying;
        }

        // Start autoplay by default
        toggleAutoPlay();

        // Add click handler for autoplay button
        autoPlayBtn.addEventListener('click', toggleAutoPlay);

        // Pause on hover
        carouselTrack.addEventListener('mouseenter', () => {
            if (isPlaying) {
                clearInterval(interval);
            }
        });

        carouselTrack.addEventListener('mouseleave', () => {
            if (isPlaying) {
                clearInterval(interval);
                interval = setInterval(() => {
                    currentSlide = (currentSlide + 1) % slides.length;
                    goToSlide(currentSlide);
                }, 4000);
            }
        });

    } catch (error) {
        console.error('Error setting up NFT carousel:', error);
        carouselTrack.innerHTML = `
            <div class="carousel-item">
                <img src="assets/detailed_ninja_cat_64.png" alt="Placeholder" style="width: 150px; margin-bottom: 1rem;">
                <p>Error loading ninja cats.<br>The ancient scrolls are currently unreadable.</p>
            </div>`;
    }
}

// Enhanced Oracle wisdom generator
function setupOracleConsultation() {
    const oracleButton = document.getElementById('consult-oracle');
    if (!oracleButton) return;

    oracleButton.addEventListener('click', function () {
        // Disable button during consultation
        oracleButton.disabled = true;

        // Intros for variety
        const introArray = [
            'The oracle purrs deeply and reveals: ',
            'Ancient whiskers twitch with digital wisdom: ',
            "The feline oracle's eyes glow and it speaks: ",
            'From the depths of blockchain wisdom comes this truth: ',
            'The Oracle of Nine Lives speaks: ',
            'The mystical cat considers your question and answers: ',
            '',  // Sometimes no intro
            '',
            '',
        ];

        // More natural and diverse wisdom array
        const wisdomArray = [
            'When the blockchain forks in two directions, the wise ninja cat follows both paths quietly, waiting to see which leads to truth. Only fools commit too early.',

            'Patience is the strongest hash function known to cat-kind. It cannot be broken by quantum computing, social engineering, or the temptation of quick profits.',

            "True decentralization requires at least nine independent nodes - one for each of a cat's lives. Anything less is merely a distributed database, vulnerable to central failure.",

            'Listen carefully: the loudest meows often signal the emptiest transactions. Watch instead the silent cats who build methodically in the shadows - they are creating something of lasting value.',

            'A private key lost is a digital soul departed. Guard your keys as carefully as a cat guards its territory, with vigilance and multiple secure backups.',

            "The most elegant smart contracts behave exactly like a cat's movement - they are efficient, predictable in outcome, yet impossible for outsiders to manipulate.",

            'Your code must land on its feet like a cat falling from any height. Build recovery mechanisms into everything you create, for exceptions are inevitable.',

            'Trust not the dog coins that promise infinite gains through memes alone. Their excited barking is often a disguise for their lack of utility and innovation.',

            "The immutable blockchain sees and records all transactions, just as a cat's eyes pierce the darkest night. Nothing is ever truly hidden from either.",

            'Short-term traders seeking quick pumps will inevitably be defeated by those with the patience to stake for the long hunt. The blockchain rewards those who think in years, not minutes.',

            'Code well-tested is like a cat well-groomed - it may take time, but prevents many painful problems later.',

            'Even the most curious cat avoids over-leveraged positions. They know that in markets, sudden movements can cause unexpected falls.',

            'A multi-signature wallet is like a pride of lions protecting their territory - no single point of weakness can compromise the whole.',

            'The best time to plant catnip is twenty blocks ago. The second best time is now.',

            'When the market panic reaches its peak, remember that a cat shows neither fear nor greed. True wealth comes to those with emotional discipline.'
        ];

        // Set eyes to 'thinking' state
        const eyes = document.querySelectorAll('.eye');
        eyes.forEach(eye => {
            eye.classList.add('thinking');
        });

        // Display loading state
        const wisdomElement = document.getElementById('oracle-wisdom');
        wisdomElement.textContent = 'The oracle is contemplating...';
        wisdomElement.classList.add('oracle-thinking');
        wisdomElement.classList.remove('revealed-wisdom', 'hidden-wisdom');

        // Add a delay to simulate the oracle thinking
        setTimeout(() => {
            // Select wisdom and intro
            const wisdom = wisdomArray[Math.floor(Math.random() * wisdomArray.length)];
            const intro = introArray[Math.floor(Math.random() * introArray.length)];

            // Reset animation states
            wisdomElement.classList.remove('oracle-thinking', 'revealed-wisdom');
            wisdomElement.classList.add('hidden-wisdom');

            // Set content and reveal
            setTimeout(() => {
                wisdomElement.textContent = intro + wisdom;
                wisdomElement.classList.add('revealed-wisdom');
                wisdomElement.classList.remove('hidden-wisdom');

                // Animate the oracle cat's eyes
                eyes.forEach(eye => {
                    eye.classList.remove('thinking');
                    eye.style.animation = 'blink 0.5s';
                    setTimeout(() => {
                        eye.style.animation = '';
                    }, 500);
                });

                // Re-enable button
                oracleButton.disabled = false;
            }, 300);
        }, 1500);
    });
}

// Setup animated backgrounds
function setupAnimatedBackgrounds() {
    // Setup particles.js
    if (window.particlesJS) {
        particlesJS('particles-js', {
            particles: {
                number: { value: 80, density: { enable: true, value_area: 800 } },
                color: { value: '#8a65ff' },
                shape: { type: 'circle' },
                opacity: { value: 0.2, random: true },
                size: { value: 3, random: true },
                line_linked: { enable: true, distance: 150, color: '#8a65ff', opacity: 0.1, width: 1 },
                move: { enable: true, speed: 1, direction: 'none', random: true, out_mode: 'out' }
            },
            interactivity: {
                detect_on: 'canvas',
                events: { onhover: { enable: true, mode: 'grab' }, onclick: { enable: true, mode: 'push' } }
            }
        });
    }

    // Setup digital rain
    const canvas = document.getElementById('digitalRain');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const characters = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲン';
        const columns = Math.floor(canvas.width / 20);
        const drops = [];

        for (let i = 0; i < columns; i++) {
            drops[i] = 1;
        }

        function drawRain() {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = '#8a65ff30';
            ctx.font = '15px monospace';

            for (let i = 0; i < drops.length; i++) {
                const text = characters[Math.floor(Math.random() * characters.length)];
                ctx.fillText(text, i * 20, drops[i] * 20);

                if (drops[i] * 20 > canvas.height && Math.random() > 0.975) {
                    drops[i] = 0;
                }

                drops[i]++;
            }
        }

        setInterval(drawRain, 50);
    }
}

// Setup trait interactions
function setupTraitInteractions() {
    document.querySelectorAll('.trait-interactive').forEach(element => {
        element.addEventListener('click', () => {
            const trait = element.dataset.trait;
            if (trait) {
                // Apply highlight effect
                document.querySelectorAll(`.trait-interactive[data-trait="${trait}"]`).forEach(el => {
                    el.classList.add('glowing');
                    setTimeout(() => {
                        el.classList.remove('glowing');
                    }, 2000);
                });
            }
        });
    });
}

// Timeline animations
function setupTimelineAnimations() {
    const timeline = document.querySelector('.ancient-scroll');
    if (!timeline) return;

    // Animate timeline nodes when they enter viewport
    const timelineMarkers = document.querySelectorAll('.timeline-marker');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate__animated', 'animate__fadeIn');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.2 });

    timelineMarkers.forEach(marker => {
        observer.observe(marker);
    });
}

// Rarity calculator functionality
function setupRarityCalculator() {
    const calculator = document.querySelector('.rarity-calculator');
    if (!calculator) return;

    const selects = calculator.querySelectorAll('.trait-selector select');
    if (!selects.length) return;

    const synergyPairs = [
        { breed: 'shadow', element: 'shadow', bonus: 15, description: 'Shadow Affinity' },
        { breed: 'bengal', element: 'fire', bonus: 10, description: 'Burning Stripes' },
        { weapon: 'ghostdagger', stance: 'shadow', bonus: 16, description: 'Ethereal Assassination' },
        { weapon: 'katana', stance: 'attack', bonus: 8, description: 'Blade Mastery' },
        { breed: 'nyan', element: 'cosmic', bonus: 15, description: 'Celestial Rainbow' }
    ];

    const rarityTiers = [
        { min: 120, name: 'Mythic', color: '#ef4444' },
        { min: 100, name: 'Legendary', color: '#f59e0b' },
        { min: 85, name: 'Epic', color: '#8b5cf6' },
        { min: 70, name: 'Rare', color: '#3b82f6' },
        { min: 60, name: 'Uncommon', color: '#10b981' },
        { min: 0, name: 'Common', color: '#6b7280' }
    ];

    selects.forEach(select => {
        select.addEventListener('change', calculateRarity);
    });

    // Calculate initial rarity on page load
    calculateRarity();

    function calculateRarity() {
        const breed = document.getElementById('breed-select').value;
        const element = document.getElementById('element-select').value;
        const weapon = document.getElementById('weapon-select').value;
        const stance = document.getElementById('stance-select').value;

        let baseScore = 50; // Default score
        const activeSynergies = [];

        // Check for synergies
        synergyPairs.forEach(synergy => {
            if ((synergy.breed && synergy.breed === breed && synergy.element && synergy.element === element) ||
                (synergy.weapon && synergy.weapon === weapon && synergy.stance && synergy.stance === stance)) {
                baseScore += synergy.bonus;
                activeSynergies.push({
                    description: synergy.description,
                    bonus: synergy.bonus
                });
            }
        });

        // Find the appropriate rarity tier
        const rarityTier = rarityTiers.find(tier => baseScore >= tier.min);

        // Update UI
        const scoreValueElement = document.querySelector('.score-value');
        if (scoreValueElement) {
            scoreValueElement.textContent = baseScore;
        }

        const rarityTierElement = document.querySelector('.rarity-tier');
        if (rarityTierElement && rarityTier) {
            rarityTierElement.textContent = rarityTier.name;
            rarityTierElement.style.background = rarityTier.color;
        }

        // Update synergy list
        const synergyList = document.getElementById('synergy-list');
        if (synergyList) {
            synergyList.innerHTML = '';

            if (activeSynergies.length > 0) {
                activeSynergies.forEach(synergy => {
                    const li = document.createElement('li');
                    li.textContent = `${synergy.description}: +${synergy.bonus} points`;
                    synergyList.appendChild(li);
                });
            } else {
                const li = document.createElement('li');
                li.textContent = 'No synergies activated';
                li.classList.add('no-synergy');
                synergyList.appendChild(li);
            }
        }
    }
}

// Setup 3D element showcase
function setup3DElementShowcase() {
    const container = document.getElementById('elementShowcase');
    if (!container || !window.THREE) return;

    // Setup scene
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });

    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    // Create elements
    const elements = [
        { name: 'Fire', color: 0xff3d00, position: new THREE.Vector3(-4, 0, 0) },
        { name: 'Water', color: 0x2979ff, position: new THREE.Vector3(-2, 0, 0) },
        { name: 'Earth', color: 0x8d6e63, position: new THREE.Vector3(0, 0, 0) },
        { name: 'Wind', color: 0xb2dfdb, position: new THREE.Vector3(2, 0, 0) },
        { name: 'Shadow', color: 0x4a148c, position: new THREE.Vector3(4, 0, 0) }
    ];

    const elementObjects = [];

    elements.forEach(element => {
        // Create element sphere
        const geometry = new THREE.SphereGeometry(0.5, 32, 32);
        const material = new THREE.MeshBasicMaterial({
            color: element.color,
            transparent: true,
            opacity: 0.7
        });
        const sphere = new THREE.Mesh(geometry, material);
        sphere.position.copy(element.position);

        // Add glow effect
        const glowGeometry = new THREE.SphereGeometry(0.7, 32, 32);
        const glowMaterial = new THREE.MeshBasicMaterial({
            color: element.color,
            transparent: true,
            opacity: 0.3
        });
        const glowSphere = new THREE.Mesh(glowGeometry, glowMaterial);
        sphere.add(glowSphere);

        scene.add(sphere);
        elementObjects.push(sphere);
    });

    // Position camera
    camera.position.z = 8;

    // Animation
    function animate() {
        requestAnimationFrame(animate);

        // Rotate elements
        elementObjects.forEach((obj, i) => {
            obj.rotation.y += 0.01 + (i * 0.002);
            obj.rotation.x += 0.005;

            // Float up and down
            obj.position.y = Math.sin(Date.now() * 0.001 + i) * 0.2;
        });

        renderer.render(scene, camera);
    }

    animate();

    // Resize handler
    window.addEventListener('resize', () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
    });
}