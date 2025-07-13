// Enhanced Global Audio Player with Stream Details and UI Controls
(() => {
    // Collection of high-quality, reliable meditation/ambient streams
    const streamingSources = [
        {
            url: "https://ice1.somafm.com/dronezone-128-mp3",
            name: "SomaFM Drone Zone",
            bitrate: "128 kbps",
            genre: "Ambient, Atmospheric",
            provider: "SomaFM"
        },
        {
            url: "https://radio4.cdm-radio.com:18020/stream-mp3-Zen",
            name: "CDM Zen Radio",
            bitrate: "192 kbps",
            genre: "Meditation, Eastern",
            provider: "CDM-Radio"
        },
        {
            url: "https://icecast.cloudradionetwork.com:8037/spacedreams",
            name: "Space Dreams",
            bitrate: "128 kbps",
            genre: "Ambient, Space",
            provider: "Cloud Radio"
        },
        {
            url: "https://streams.calmradio.com/api/36/128/stream",
            name: "Calm Radio - Zen",
            bitrate: "128 kbps",
            genre: "Meditation, Relaxation",
            provider: "Calm Radio"
        },
        {
            url: "https://streaming.live365.com/b05055_128mp3",
            name: "Ambient Sleeping Pill",
            bitrate: "128 kbps",
            genre: "Ambient, Sleep",
            provider: "Live365"
        }
    ];

    // Player state management with localStorage for persistence
    const playerState = {
        get currentIndex() {
            return parseInt(localStorage.getItem('ninja_audio_index') || '0');
        },
        set currentIndex(value) {
            localStorage.setItem('ninja_audio_index', value.toString());
        },
        get isPlaying() {
            return localStorage.getItem('ninja_audio_playing') === 'true';
        },
        set isPlaying(value) {
            localStorage.setItem('ninja_audio_playing', value.toString());
        },
        get volume() {
            return parseFloat(localStorage.getItem('ninja_audio_volume') || '0.5');
        },
        set volume(value) {
            localStorage.setItem('ninja_audio_volume', value.toString());
        },
        get isExpanded() {
            return localStorage.getItem('ninja_audio_expanded') === 'true';
        },
        set isExpanded(value) {
            localStorage.setItem('ninja_audio_expanded', value.toString());
        },
        get isVisible() {
            return localStorage.getItem('ninja_audio_visible') !== 'false';
        },
        set isVisible(value) {
            localStorage.setItem('ninja_audio_visible', value.toString());
        },
        get showVisualizer() {
            return localStorage.getItem('ninja_audio_visualizer') !== 'false';
        },
        set showVisualizer(value) {
            localStorage.setItem('ninja_audio_visualizer', value.toString());
        }
    };

    // Performance optimization flags
    let isVisualizerActive = false;
    let visualizerThrottleTimer = null;
    const VISUALIZER_FPS = 30; // Limit frames per second for visualization

    // Initialize the player when DOM is ready
    function initGlobalAudioPlayer() {
        // Only create player if it doesn't exist already
        if (document.getElementById('ninja-audio-player')) return;

        // First create the style element (create it BEFORE using it)
        const style = document.createElement('style');
        style.textContent = `
            #ninja-audio-player {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: linear-gradient(145deg, #292d3e, #1e2132);
                border-radius: 16px;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 
                            0 0 0 1px rgba(138, 101, 255, 0.1),
                            inset 0 1px 1px rgba(255, 255, 255, 0.06);
                color: white;
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 999;
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                overflow: hidden;
                width: 310px;
                border: 1px solid rgba(138, 101, 255, 0.3);
                user-select: none;
                backdrop-filter: blur(10px);
            }
            
            #ninja-audio-player.minimized {
                width: 180px;
                height: 60px;
                border-radius: 12px;
            }
            
            #ninja-audio-player.expanded {
                width: 310px;
                height: 170px;
            }
            
            .player-drag-handle {
                width: 100%;
                height: 8px;
                cursor: grab;
                background: rgba(138, 101, 255, 0.1);
                border-radius: 16px 16px 0 0;
                position: relative;
            }
            
            .player-drag-handle:before {
                content: "";
                position: absolute;
                width: 40px;
                height: 4px;
                background: rgba(255, 255, 255, 0.3);
                border-radius: 2px;
                top: 2px;
                left: 50%;
                transform: translateX(-50%);
            }
            
            .player-drag-handle:active {
                cursor: grabbing;
            }
            
            .player-main {
                padding: 10px 15px;
                display: flex;
                flex-direction: column;
                gap: 10px;
            }
            
            .player-controls {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .audio-button {
                background: rgba(138, 101, 255, 0.15);
                border: none;
                border-radius: 50%;
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #a28aff;
                cursor: pointer;
                transition: all 0.2s ease;
                padding: 0;
                box-shadow: 0 2px 5px rgba(0,0,0,0.15), 
                            inset 0 1px 1px rgba(255,255,255,0.1);
            }
            
            .audio-button:hover {
                background: rgba(138, 101, 255, 0.3);
                transform: scale(1.05);
                box-shadow: 0 3px 8px rgba(0,0,0,0.2), 
                            inset 0 1px 1px rgba(255,255,255,0.15);
            }
            
            .audio-button:active {
                transform: scale(0.95);
                box-shadow: 0 1px 2px rgba(0,0,0,0.1), 
                            inset 0 1px 1px rgba(0,0,0,0.1);
            }
            
            .play-button {
                background: linear-gradient(145deg, #9a7aff, #8361e9);
                color: white;
                box-shadow: 0 3px 10px rgba(138, 101, 255, 0.4), 
                            inset 0 1px 1px rgba(255,255,255,0.2);
            }
            
            .play-button:hover {
                background: linear-gradient(145deg, #a48bff, #8d6eff);
            }
            
            .play-button svg {
                transform: translateX(1px);
            }
            
            .play-icon, .pause-icon {
                position: absolute;
                transition: opacity 0.2s ease, transform 0.2s ease;
            }
            
            .play-icon {
                opacity: 1;
            }
            
            .pause-icon {
                opacity: 0;
            }
            
            .audio-button.playing .play-icon {
                opacity: 0;
            }
            
            .audio-button.playing .pause-icon {
                opacity: 1;
            }
            
            .volume-container {
                position: relative;
                display: flex;
                align-items: center;
            }
            
            .volume-slider-container {
                position: absolute;
                bottom: 45px;
                background: #23263a;
                padding: 12px 6px;
                border-radius: 10px;
                box-shadow: 0 5px 20px rgba(0, 0, 0, 0.4), 
                            0 0 0 1px rgba(138, 101, 255, 0.2);
                transform: translateX(-40%);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s ease, transform 0.3s ease;
                z-index: 1000;
            }
            
            .volume-container:hover .volume-slider-container {
                opacity: 1;
                pointer-events: auto;
                transform: translateX(-40%) translateY(-5px);
            }
            
            #volumeSlider {
                width: 80px;
                height: 5px;
                -webkit-appearance: none;
                appearance: none;
                background: rgba(255, 255, 255, 0.2);
                outline: none;
                border-radius: 2px;
                transform: rotate(-90deg);
            }
            
            #volumeSlider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 14px;
                height: 14px;
                background: #a28aff;
                cursor: pointer;
                border-radius: 50%;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            
            #volumeSlider::-moz-range-thumb {
                width: 14px;
                height: 14px;
                background: #a28aff;
                cursor: pointer;
                border-radius: 50%;
                border: none;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }
            
            .player-info {
                display: flex;
                flex-direction: column;
                overflow: hidden;
                padding-left: 3px;
            }
            
            .stream-name {
                font-weight: 600;
                font-size: 14px;
                white-space: nowrap;
                text-overflow: ellipsis;
                overflow: hidden;
                color: #f0f0f0;
                text-shadow: 0 1px 2px rgba(0,0,0,0.2);
            }
            
            .stream-details {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.6);
                display: flex;
                align-items: center;
                gap: 5px;
                margin-top: 1px;
            }
            
            .separator {
                font-size: 8px;
                opacity: 0.6;
            }
            
            .visualizer-container {
                height: 45px;
                width: 100%;
                display: none;
                position: relative;
                margin-top: 5px;
                border-radius: 8px;
                overflow: hidden;
            }
            
            #ninja-audio-player.expanded .visualizer-container {
                display: block;
            }
            
            #audioVisualizer {
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.2);
                border-radius: 8px;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
            }
            
            .visualizer-toggle {
                position: absolute;
                right: 5px;
                top: 5px;
                font-size: 10px;
                background: rgba(35, 38, 58, 0.7);
                padding: 3px 6px;
                border-radius: 10px;
                backdrop-filter: blur(5px);
            }
            
            .toggle {
                display: flex;
                align-items: center;
                cursor: pointer;
                user-select: none;
            }
            
            .toggle input {
                opacity: 0;
                width: 0;
                height: 0;
            }
            
            .toggle-slider {
                position: relative;
                display: inline-block;
                width: 24px;
                height: 14px;
                background-color: rgba(255, 255, 255, 0.15);
                border-radius: 7px;
                margin-right: 5px;
                transition: 0.3s;
                box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.2);
            }
            
            .toggle-slider:before {
                position: absolute;
                content: "";
                height: 10px;
                width: 10px;
                left: 2px;
                bottom: 2px;
                background-color: white;
                border-radius: 50%;
                transition: 0.3s;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
            }
            
            .toggle input:checked + .toggle-slider {
                background-color: #8a65ff;
            }
            
            .toggle input:checked + .toggle-slider:before {
                transform: translateX(10px);
            }
            
            .toggle-label {
                color: rgba(255, 255, 255, 0.8);
                text-shadow: 0 1px 1px rgba(0,0,0,0.3);
            }
            
            .stream-attribution {
                font-size: 10px;
                color: rgba(255, 255, 255, 0.5);
                text-align: center;
                margin-bottom: 8px;
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 4px;
            }
            
            .info-button {
                background: none;
                border: none;
                color: rgba(255, 255, 255, 0.5);
                cursor: pointer;
                padding: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0.7;
                transition: opacity 0.2s;
            }
            
            .info-button:hover {
                opacity: 1;
            }
            
            .info-modal {
                display: none;
                position: fixed;
                z-index: 1001;
                left: 0;
                top: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.7);
                opacity: 0;
                transition: opacity 0.3s;
                backdrop-filter: blur(3px);
            }
            
            .info-modal.visible {
                opacity: 1;
            }
            
            .info-modal-content {
                background: linear-gradient(145deg, #292d3e, #1e2132);
                margin: 15% auto;
                padding: 25px;
                border: 1px solid rgba(138, 101, 255, 0.3);
                border-radius: 16px;
                width: 80%;
                max-width: 450px;
                color: white;
                position: relative;
                box-shadow: 0 15px 40px rgba(0, 0, 0, 0.5);
                backdrop-filter: blur(10px);
            }
            
            .info-modal-content h3 {
                margin-top: 0;
                color: #a28aff;
                font-size: 1.4em;
                font-weight: 600;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                margin-bottom: 15px;
            }
            
            .info-modal-content p {
                margin: 10px 0;
                font-size: 14px;
                line-height: 1.5;
                color: rgba(255, 255, 255, 0.9);
            }
            
            .info-modal-content ul {
                margin: 5px 0;
                padding-left: 20px;
                color: rgba(255, 255, 255, 0.9);
            }
            
            .info-modal-content li {
                margin: 8px 0;
                line-height: 1.4;
            }
            
            .info-modal-content kbd {
                display: inline-block;
                padding: 2px 5px;
                font-family: monospace;
                font-size: 12px;
                background: rgba(0, 0, 0, 0.2);
                border: 1px solid rgba(255, 255, 255, 0.2);
                border-radius: 4px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
                margin: 0 2px;
            }
            
            .info-modal-content small {
                color: rgba(255, 255, 255, 0.6);
                font-size: 11px;
            }
            
            .close-modal {
                position: absolute;
                top: 15px;
                right: 15px;
                font-size: 24px;
                color: rgba(255, 255, 255, 0.7);
                background: none;
                border: none;
                cursor: pointer;
                padding: 0;
                line-height: 1;
                width: 30px;
                height: 30px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
            }
            
            .close-modal:hover {
                color: white;
                background: rgba(255, 255, 255, 0.1);
            }
            
            .player-actions {
                position: absolute;
                top: 10px;
                right: 10px;
                display: flex;
                gap: 5px;
            }
            
            .action-button {
                width: 24px;
                height: 24px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.07);
                border: none;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: rgba(255, 255, 255, 0.7);
                padding: 0;
                transition: all 0.2s ease;
            }
            
            .action-button:hover {
                background: rgba(255, 255, 255, 0.15);
                color: white;
            }
            
            .expand-icon, .minimize-icon {
                position: absolute;
                transition: opacity 0.2s ease;
            }
            
            .expand-icon {
                opacity: 1;
            }
            
            .minimize-icon {
                opacity: 0;
            }
            
            #ninja-audio-player.expanded .expand-icon {
                opacity: 0;
            }
            
            #ninja-audio-player.expanded .minimize-icon {
                opacity: 1;
            }
            
            .show-player-button {
                position: fixed !important;
                bottom: 20px !important;
                right: 20px !important;
                background: linear-gradient(145deg, #9a7aff, #8361e9) !important;
                border-radius: 50% !important;
                width: 45px !important;
                height: 45px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                color: white !important;
                box-shadow: 0 5px 20px rgba(138, 101, 255, 0.5) !important;
                z-index: 2000 !important;
                border: none !important;
                padding: 0 !important;
                animation: pulse-attention 2s infinite !important;
                transition: transform 0.2s ease, box-shadow 0.2s ease !important;
            }
            
            .show-player-button:hover {
                transform: scale(1.1) !important;
                box-shadow: 0 5px 25px rgba(138, 101, 255, 0.7) !important;
            }
            
            @keyframes pulse-attention {
                0% { transform: scale(1); box-shadow: 0 5px 20px rgba(138, 101, 255, 0.4); }
                50% { transform: scale(1.05); box-shadow: 0 5px 25px rgba(138, 101, 255, 0.7); }
                100% { transform: scale(1); box-shadow: 0 5px 20px rgba(138, 101, 255, 0.4); }
            }
            
            /* Sparkle animation for loader */
            @keyframes sparkle {
                0% { transform: scale(0) rotate(0deg); opacity: 0; }
                50% { opacity: 1; }
                100% { transform: scale(1.5) rotate(360deg); opacity: 0; }
            }
            
            .sparkle-loading {
                position: relative;
            }
            
            .sparkle-loading:before,
            .sparkle-loading:after {
                content: "";
                position: absolute;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: radial-gradient(circle, #a28aff 0%, transparent 70%);
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                z-index: -1;
                animation: sparkle 1.5s infinite;
            }
            
            .sparkle-loading:after {
                animation-delay: 0.5s;
                width: 15px;
                height: 15px;
            }
            
            /* For minimalist mode */
            #ninja-audio-player.minimized .player-info {
                max-width: 110px;
            }
            
            #ninja-audio-player.minimized .player-controls {
                gap: 8px;
            }
            
            #ninja-audio-player.minimized .audio-button {
                width: 30px;
                height: 30px;
            }
            
            #ninja-audio-player.minimized .stream-attribution {
                display: none;
            }
            
            /* Context menu styles */
            .player-context-menu {
                position: absolute;
                background: linear-gradient(145deg, #292d3e, #1e2132);
                border: 1px solid rgba(138, 101, 255, 0.3);
                border-radius: 8px;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
                padding: 8px 0;
                min-width: 150px;
                z-index: 2000;
                opacity: 0;
                transform: scale(0.95);
                transform-origin: top left;
                transition: opacity 0.15s ease, transform 0.15s ease;
            }
            
            .player-context-menu.visible {
                opacity: 1;
                transform: scale(1);
            }
            
            .context-menu-item {
                padding: 8px 15px;
                color: rgba(255, 255, 255, 0.85);
                cursor: pointer;
                font-size: 13px;
                transition: background 0.2s;
                display: flex;
                align-items: center;
            }
            
            .context-menu-item:hover {
                background: rgba(138, 101, 255, 0.15);
                color: white;
            }
            
            .context-menu-item svg {
                margin-right: 8px;
                width: 14px;
                height: 14px;
            }
        `;

        // Create the player container
        const playerContainer = document.createElement('div');
        playerContainer.id = 'ninja-audio-player';
        playerContainer.className = playerState.isExpanded ? 'expanded' : 'minimized';
        playerContainer.style.display = playerState.isVisible ? 'block' : 'none';

        // Player HTML structure - removing the showPlayerBtn from the player container
        playerContainer.innerHTML = `
        <div class="player-drag-handle"></div>
        <div class="player-main">
            <audio id="audioPlayer" preload="none"></audio>
            
            <div class="player-controls">
                <button id="audioToggle" class="audio-button play-button" aria-label="Toggle play">
                    <svg class="play-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 3 19 12 5 21"></polygon>
                    </svg>
                    <svg class="pause-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="4" width="4" height="16"></rect>
                        <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                </button>
                <button id="nextTrackBtn" class="audio-button" aria-label="Next track">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="5 4 15 12 5 20"></polygon>
                        <line x1="19" y1="5" x2="19" y2="19"></line>
                    </svg>
                </button>
                
                <div class="volume-container">
                    <button id="volumeBtn" class="audio-button" aria-label="Volume">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    </button>
                    <div class="volume-slider-container">
                        <input type="range" id="volumeSlider" min="0" max="1" step="0.01" value="${playerState.volume}">
                    </div>
                </div>
            </div>
            
            <div class="player-info">
                <div class="stream-name">Ninja Meditation</div>
                <div class="stream-details">
                    <span id="streamBitrate" class="bitrate">128 kbps</span>
                    <span class="separator">•</span>
                    <span id="streamGenre" class="genre">Ambient</span>
                </div>
            </div>
            
            <div class="visualizer-container">
                <canvas id="audioVisualizer"></canvas>
                <div class="visualizer-toggle">
                    <label class="toggle">
                        <input type="checkbox" id="visualizerToggle" ${playerState.showVisualizer ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                        <span class="toggle-label">Visualizer</span>
                    </label>
                </div>
            </div>
        </div>
        
        <div class="stream-attribution">
            <span id="streamProvider">SomaFM</span> free stream
            <button id="infoBtn" class="info-button" aria-label="Stream info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                </svg>
            </button>
        </div>
        
        <div class="player-actions">
            <button id="expandToggleBtn" class="action-button" aria-label="Toggle expanded view">
                <svg class="expand-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="15 3 21 3 21 9"></polyline>
                    <polyline points="9 21 3 21 3 15"></polyline>
                    <line x1="21" y1="3" x2="14" y2="10"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
                <svg class="minimize-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="4 14 10 14 10 20"></polyline>
                    <polyline points="20 10 14 10 14 4"></polyline>
                    <line x1="14" y1="10" x2="21" y2="3"></line>
                    <line x1="3" y1="21" x2="10" y2="14"></line>
                </svg>
            </button>
            <button id="hidePlayerBtn" class="action-button" aria-label="Hide player">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        </div>
        
        <div id="infoModal" class="info-modal">
            <div class="info-modal-content">
                <button class="close-modal">&times;</button>
                <h3>Ninja Meditation Audio</h3>
                <p>Enhance your coding experience with ambient meditation music.</p>
                <p><strong>Attribution:</strong> All streams are provided by their respective owners and are freely available online.</p>
                <p><strong>Keyboard Shortcuts:</strong></p>
                <ul>
                    <li><kbd>Alt</kbd> + <kbd>M</kbd> - Show/hide player</li>
                    <li><kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>R</kbd> - Reset player (if frozen)</li>
                </ul>
                <p><small>Music provided by: SomaFM, CDM-Radio, Cloud Radio, Calm Radio, and Live365</small></p>
            </div>
        </div>
    `;

        // Create the show button separately as its own element
        const showPlayerBtn = document.createElement('div');
        showPlayerBtn.id = 'showPlayerBtn';
        showPlayerBtn.className = 'show-player-button';
        showPlayerBtn.style.display = playerState.isVisible ? 'none' : 'flex';
        showPlayerBtn.innerHTML = `
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18V5l12 7-12 7z"></path>
            <path d="M3 18V5"></path>
        </svg>
    `;

        // Ensure show button is ALWAYS in a fixed position at the bottom right
        showPlayerBtn.style.cssText = `
        display: ${playerState.isVisible ? 'none' : 'flex'} !important;
        position: fixed !important;
        bottom: 20px !important;
        right: 20px !important;
        z-index: 2000 !important;
        background: linear-gradient(145deg, #9a7aff, #8361e9) !important;
        border-radius: 50% !important;
        width: 45px !important;
        height: 45px !important;
        align-items: center !important;
        justify-content: center !important;
        cursor: pointer !important;
        color: white !important;
        box-shadow: 0 5px 20px rgba(138, 101, 255, 0.5) !important;
        border: none !important;
        padding: 0 !important;
        animation: pulse-attention 2s infinite !important;
        transition: transform 0.2s ease, box-shadow 0.2s ease !important;
    `;

        // Add all elements to document in correct order
        document.head.appendChild(style);
        document.body.appendChild(playerContainer);
        document.body.appendChild(showPlayerBtn);

        // Get DOM references
        const audioPlayer = document.getElementById('audioPlayer');
        const audioToggle = document.getElementById('audioToggle');
        const nextTrackBtn = document.getElementById('nextTrackBtn');
        const volumeSlider = document.getElementById('volumeSlider');
        const expandToggleBtn = document.getElementById('expandToggleBtn');
        const hidePlayerBtn = document.getElementById('hidePlayerBtn');
        const streamNameEl = document.querySelector('.stream-name');
        const streamBitrateEl = document.getElementById('streamBitrate');
        const streamGenreEl = document.getElementById('streamGenre');
        const streamProviderEl = document.getElementById('streamProvider');
        const visualizerCanvas = document.getElementById('audioVisualizer');
        const visualizerToggle = document.getElementById('visualizerToggle');
        const infoBtn = document.getElementById('infoBtn');
        const infoModal = document.getElementById('infoModal');
        const closeModalBtn = document.querySelector('.close-modal');
        const dragHandle = document.querySelector('.player-drag-handle');

        // Function to reset player position
        function resetPlayerPosition() {
            if (!playerContainer) return;

            // Clear any custom positioning
            playerContainer.style.left = '';
            playerContainer.style.top = '';
            playerContainer.style.right = '20px';
            playerContainer.style.bottom = '20px';

            // Apply transition for smooth movement
            playerContainer.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';

            // Show toast notification
            showToast('Player position reset to corner', 'info');
        }

        // Double-click on drag handle to reset position
        dragHandle.addEventListener('dblclick', resetPlayerPosition);

        // Add context menu for the player
        let contextMenu = null;

        playerContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();

            // Remove existing context menu if present
            if (contextMenu) {
                document.body.removeChild(contextMenu);
            }

            // Create context menu
            contextMenu = document.createElement('div');
            contextMenu.className = 'player-context-menu';
            contextMenu.innerHTML = `
                <div class="context-menu-item" id="resetPositionMenuItem">
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none">
                        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                        <path d="M3 3v5h5"></path>
                    </svg>
                    Reset Position
                </div>
            `;

            // Position the context menu
            contextMenu.style.left = `${e.pageX}px`;
            contextMenu.style.top = `${e.pageY}px`;

            // Add to DOM
            document.body.appendChild(contextMenu);

            // Show with animation
            setTimeout(() => {
                contextMenu.classList.add('visible');
            }, 10);

            // Add event listener for reset position menu item
            document.getElementById('resetPositionMenuItem').addEventListener('click', () => {
                resetPlayerPosition();
                hideContextMenu();
            });

            // Hide menu when clicking elsewhere
            document.addEventListener('click', hideContextMenu);
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') hideContextMenu();
            });
        });

        // Function to hide context menu
        function hideContextMenu() {
            if (contextMenu) {
                contextMenu.classList.remove('visible');
                setTimeout(() => {
                    if (contextMenu && contextMenu.parentNode) {
                        document.body.removeChild(contextMenu);
                    }
                    contextMenu = null;
                }, 150);

                document.removeEventListener('click', hideContextMenu);
            }
        }

        // Audio context and analyzer variables
        let audioContext = null;
        let analyser = null;
        let dataArray = null;
        let source = null;
        let animationFrame = null;

        // Initialize audio context
        function initAudioContext() {
            if (audioContext) return; // Don't initialize twice

            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioContext.createAnalyser();

                // Connect audio nodes
                source = audioContext.createMediaElementSource(audioPlayer);
                source.connect(analyser);
                analyser.connect(audioContext.destination);

                // Set up analyzer with optimized settings
                analyser.fftSize = 128; // Smaller FFT size for better performance
                analyser.smoothingTimeConstant = 0.8; // Smoother transitions
                const bufferLength = analyser.frequencyBinCount;
                dataArray = new Uint8Array(bufferLength);

                // Start visualizing if enabled
                if (playerState.showVisualizer) {
                    startVisualizer();
                }
            } catch (e) {
                console.error('Web Audio API is not supported in this browser', e);
                // Disable visualizer if not supported
                playerState.showVisualizer = false;
                if (visualizerToggle) {
                    visualizerToggle.checked = false;
                }
            }
        }

        // Function to toggle audio player visibility
        function toggleAudioPlayer() {
            const playerContainer = document.getElementById('ninja-audio-player');
            const showPlayerBtn = document.getElementById('showPlayerBtn');

            if (!playerContainer) return;

            if (playerState.isVisible) {
                // Hide the player
                playerContainer.style.display = 'none';

                // Always position the show button in the bottom right corner
                showPlayerBtn.style.cssText = `
                    display: flex !important;
                    position: fixed !important;
                    bottom: 20px !important;
                    right: 20px !important;
                    z-index: 2000 !important;
                `;

                playerState.isVisible = false;
            } else {
                // Show the player
                playerContainer.style.display = 'block';
                showPlayerBtn.style.display = 'none';
                playerState.isVisible = true;

                // Check if player is off-screen and reset position if needed
                const rect = playerContainer.getBoundingClientRect();
                const isOffScreen = (
                    rect.left < 0 ||
                    rect.top < 0 ||
                    rect.right > window.innerWidth ||
                    rect.bottom > window.innerHeight
                );

                if (isOffScreen) {
                    resetPlayerPosition();
                }
            }
        }

        // Add keyboard shortcut (Alt+M) to toggle player
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'm') {
                toggleAudioPlayer();
                e.preventDefault(); // Prevent default browser behavior
            }
        });

        // Enhance the hide button functionality
        hidePlayerBtn.addEventListener('click', () => {
            toggleAudioPlayer();
            stopVisualizer();

            // Show a toast notification about the keyboard shortcut
            showToast('Player hidden. Press Alt+M to restore it', 'info', 5000);
        });

        // Make sure the show button works and is always in fixed position
        showPlayerBtn.addEventListener('click', () => {
            toggleAudioPlayer();

            if (playerState.isExpanded && playerState.showVisualizer && playerState.isPlaying && audioContext) {
                startVisualizer();
            }
        });

        // Expose player controls globally for emergency recovery
        window.ninjaAudio = {
            show: () => {
                playerState.isVisible = true;
                const playerContainer = document.getElementById('ninja-audio-player');
                const showPlayerBtn = document.getElementById('showPlayerBtn');
                if (playerContainer) playerContainer.style.display = 'block';
                if (showPlayerBtn) showPlayerBtn.style.display = 'none';
            },
            hide: () => {
                playerState.isVisible = false;
                const playerContainer = document.getElementById('ninja-audio-player');
                const showPlayerBtn = document.getElementById('showPlayerBtn');
                if (playerContainer) playerContainer.style.display = 'none';
                if (showPlayerBtn) {
                    showPlayerBtn.style.cssText = `
                        display: flex !important;
                        position: fixed !important;
                        bottom: 20px !important;
                        right: 20px !important;
                        z-index: 2000 !important;
                    `;
                }
            },
            toggle: toggleAudioPlayer,
            resetPosition: resetPlayerPosition
        };

        // Start visualizer with performance optimizations
        function startVisualizer() {
            if (!analyser || isVisualizerActive || !playerState.showVisualizer) return;
            isVisualizerActive = true;
            visualize();
        }

        // Stop visualizer to save resources
        function stopVisualizer() {
            isVisualizerActive = false;
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
        }

        // Audio visualizer with throttling for better performance
        function visualize() {
            if (!analyser || !isVisualizerActive) return;

            const canvasCtx = visualizerCanvas.getContext('2d');
            if (!canvasCtx) return;

            const width = visualizerCanvas.width;
            const height = visualizerCanvas.height;

            function draw() {
                if (!isVisualizerActive || !playerState.isExpanded ||
                    !playerState.isVisible || !playerState.isPlaying ||
                    !playerState.showVisualizer) {
                    animationFrame = null;
                    return;
                }

                // Throttle visualization to improve performance
                animationFrame = requestAnimationFrame(draw);

                // Clear throttle timer if set
                if (visualizerThrottleTimer) {
                    return;
                }

                // Set throttle timer based on FPS
                visualizerThrottleTimer = setTimeout(() => {
                    visualizerThrottleTimer = null;
                }, 1000 / VISUALIZER_FPS);

                // Get frequency data
                analyser.getByteFrequencyData(dataArray);

                // Clear canvas
                canvasCtx.clearRect(0, 0, width, height);
                canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.1)';
                canvasCtx.fillRect(0, 0, width, height);

                // Optimize bar drawing - use fewer bars
                const barCount = Math.min(dataArray.length, 32);
                const barWidth = width / barCount;
                let x = 0;

                for (let i = 0; i < barCount; i++) {
                    // Use simpler calculation for bar height
                    const barHeight = (dataArray[i] / 255) * height * 0.8;

                    // Use gradient for better visual
                    const gradient = canvasCtx.createLinearGradient(0, height, 0, height - barHeight);
                    gradient.addColorStop(0, '#8a65ff');
                    gradient.addColorStop(0.6, '#9e7fff');
                    gradient.addColorStop(1, '#b39dff');

                    canvasCtx.fillStyle = gradient;
                    canvasCtx.fillRect(x, height - barHeight, barWidth - 1, barHeight);

                    x += barWidth;
                }
            }

            draw();
        }

        // Update stream information
        function updateStreamInfo() {
            const currentStream = streamingSources[playerState.currentIndex];
            streamNameEl.textContent = currentStream.name;
            streamBitrateEl.textContent = currentStream.bitrate;
            streamGenreEl.textContent = currentStream.genre;
            streamProviderEl.textContent = currentStream.provider;
        }

        // Improved stream handling function to prevent freezes
        function loadAndPlayStream(userInitiated = false) {
            // Clear any previous errors
            audioPlayer.onerror = null;

            // Cancel any pending timers to avoid race conditions
            if (window.streamLoadTimeout) {
                clearTimeout(window.streamLoadTimeout);
            }

            const streamIndex = playerState.currentIndex;
            const currentStream = streamingSources[streamIndex];

            // Add loading effect
            audioToggle.classList.add('sparkle-loading');

            // Show toast if available
            if (userInitiated) {
                showToast?.(`Loading: ${currentStream.name}...`, 'info') ||
                    console.log(`Loading: ${currentStream.name}...`);
            }

            // Update stream info display immediately
            updateStreamInfo();

            // Initialize audio context on first user interaction
            if (userInitiated && !audioContext && playerState.showVisualizer) {
                try {
                    initAudioContext();
                } catch (e) {
                    console.warn('Audio context initialization failed:', e);
                    // Continue without visualizer
                    playerState.showVisualizer = false;
                }
            }

            // IMPORTANT: Release old audio resources before creating new ones
            if (audioPlayer) {
                try {
                    // Stop any current audio
                    audioPlayer.pause();

                    // Reset source and cancel any pending operations
                    audioPlayer.removeAttribute('src');
                    audioPlayer.load();
                } catch (e) {
                    console.warn('Error resetting audio player:', e);
                }
            }

            // Short delay to allow browser to free resources
            setTimeout(() => {
                // Set the audio source with crossOrigin for CORS support
                try {
                    audioPlayer.crossOrigin = "anonymous";
                    audioPlayer.src = currentStream.url;
                    audioPlayer.volume = Math.min(0.2, playerState.volume); // Start low and fade in

                    // Set timeout for loading - abort if taking too long
                    window.streamLoadTimeout = setTimeout(() => {
                        if (!audioPlayer || audioPlayer.readyState === 0) { // HAVE_NOTHING
                            console.warn('Stream loading timeout, trying next stream');
                            audioToggle.classList.remove('sparkle-loading');
                            safelyTryNextStream();
                        }
                    }, 8000); // 8 second timeout for loading

                    // Reset error handler - with safety checks
                    audioPlayer.onerror = (e) => {
                        console.error('Audio error occurred:', e);
                        if (window.streamLoadTimeout) {
                            clearTimeout(window.streamLoadTimeout);
                        }
                        audioToggle.classList.remove('sparkle-loading');
                        safelyTryNextStream();
                    };

                    // Handle stalled and timeout events
                    audioPlayer.addEventListener('stalled', handleStreamError);
                    audioPlayer.addEventListener('timeout', handleStreamError);

                    // Load audio - wrapped in try-catch
                    try {
                        audioPlayer.load();

                        // Play with defensive error handling
                        audioPlayer.play()
                            .then(() => {
                                if (window.streamLoadTimeout) {
                                    clearTimeout(window.streamLoadTimeout);
                                }

                                playerState.isPlaying = true;
                                audioToggle.classList.add('playing');
                                audioToggle.classList.remove('sparkle-loading');

                                // Fade in volume gradually
                                fadeVolumeIn();

                                // Start visualizer if needed
                                if (playerState.showVisualizer && audioContext) {
                                    startVisualizer();
                                }
                            })
                            .catch(err => {
                                console.error('Audio playback error:', err);
                                if (window.streamLoadTimeout) {
                                    clearTimeout(window.streamLoadTimeout);
                                }
                                audioToggle.classList.remove('sparkle-loading');
                                safelyTryNextStream();
                            });
                    } catch (loadError) {
                        console.error('Error during audio load/play:', loadError);
                        audioToggle.classList.remove('sparkle-loading');
                        safelyTryNextStream();
                    }
                } catch (sourceError) {
                    console.error('Error setting audio source:', sourceError);
                    audioToggle.classList.remove('sparkle-loading');
                    safelyTryNextStream();
                }
            }, 300); // Short delay before starting new stream
        }

        // Safely handle stream errors without freezing
        function handleStreamError(e) {
            console.warn('Stream error encountered:', e.type);
            // Prevent multiple error handling calls
            if (window._handlingStreamError) return;

            window._handlingStreamError = true;
            setTimeout(() => { window._handlingStreamError = false; }, 1000);

            safelyTryNextStream();
        }

        // Safely try next stream with protection against cascading failures
        function safelyTryNextStream() {
            // Stop the current stream cleanly
            try {
                if (audioPlayer) {
                    audioPlayer.pause();
                    audioPlayer.removeAttribute('src');
                    audioPlayer.load();
                }
            } catch (e) {
                console.warn('Error cleaning up audio player:', e);
            }

            // Prevent rapid cycling through broken streams
            if (window.streamRetryTimeout) {
                clearTimeout(window.streamRetryTimeout);
            }

            // Only try the next stream after a short delay
            window.streamRetryTimeout = setTimeout(() => {
                showToast?.('Stream unavailable, trying another...', 'warning') ||
                    console.log('Stream unavailable, trying another...');

                // Move to next stream
                playerState.currentIndex = (playerState.currentIndex + 1) % streamingSources.length;

                // Try to load the new stream
                loadAndPlayStream();
            }, 1000);
        }

        // Smoothly fade in volume
        function fadeVolumeIn() {
            let vol = audioPlayer.volume;
            const targetVol = playerState.volume;

            // Clear any existing fade intervals
            if (window.volumeFadeInterval) {
                clearInterval(window.volumeFadeInterval);
            }

            window.volumeFadeInterval = setInterval(() => {
                if (vol < targetVol) {
                    vol = Math.min(vol + 0.05, targetVol);

                    // Safety check to avoid errors
                    if (audioPlayer && !audioPlayer.paused) {
                        try {
                            audioPlayer.volume = vol;
                        } catch (e) {
                            console.warn('Error setting volume:', e);
                            clearInterval(window.volumeFadeInterval);
                        }
                    }
                } else {
                    clearInterval(window.volumeFadeInterval);
                }
            }, 100);
        }

        // Add a recovery function to reset the player if it freezes
        window.resetAudioPlayer = function () {
            // Stop any audio playback
            try {
                const audioPlayer = document.getElementById('audioPlayer');
                if (audioPlayer) {
                    audioPlayer.pause();
                    audioPlayer.removeAttribute('src');
                    audioPlayer.load();
                }

                // Clear any pending timers
                if (window.streamLoadTimeout) clearTimeout(window.streamLoadTimeout);
                if (window.streamRetryTimeout) clearTimeout(window.streamRetryTimeout);
                if (window.volumeFadeInterval) clearInterval(window.volumeFadeInterval);

                // Clean up audio context
                if (window.audioContext && window.audioContext.state !== 'closed') {
                    try {
                        window.audioContext.close();
                    } catch (e) {
                        console.error('Error closing audio context:', e);
                    }
                }
            } catch (e) {
                console.error('Error during player reset:', e);
            }

            // Update UI
            const toggleBtn = document.getElementById('audioToggle');
            if (toggleBtn) toggleBtn.classList.remove('playing', 'sparkle-loading');

            // Reset state
            playerState.isPlaying = false;

            // Show toast
            showToast?.('Audio player has been reset', 'info');

            // Optional: Reload the component
            setTimeout(() => {
                document.getElementById('ninja-audio-player')?.remove();
                document.getElementById('showPlayerBtn')?.remove();
                initGlobalAudioPlayer();
            }, 500);
        };

        // Add keyboard shortcut for emergency reset (Shift+Alt+R)
        document.addEventListener('keydown', function (e) {
            if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'r') {
                window.resetAudioPlayer();
                e.preventDefault();
            }
        });

        // Toggle play/pause with optimized fade
        audioToggle.addEventListener('click', () => {
            if (audioPlayer.paused || audioPlayer.ended) {
                // If paused, play the current stream
                loadAndPlayStream(true);
            } else {
                // If playing, pause with fade out
                let vol = audioPlayer.volume;
                const fadeInterval = setInterval(() => {
                    if (vol > 0.1) {
                        vol -= 0.1;
                        audioPlayer.volume = vol;
                    } else {
                        clearInterval(fadeInterval);
                        audioPlayer.pause();
                        playerState.isPlaying = false;
                        audioToggle.classList.remove('playing');
                        stopVisualizer(); // Stop visualizer to save resources
                    }
                }, 100);
            }
        });

        // Next track button
        nextTrackBtn.addEventListener('click', () => {
            playerState.currentIndex = (playerState.currentIndex + 1) % streamingSources.length;
            loadAndPlayStream(true);
        });

        // Volume slider
        volumeSlider.addEventListener('input', () => {
            const volume = parseFloat(volumeSlider.value);
            audioPlayer.volume = volume;
            playerState.volume = volume;
        });

        // Visualizer toggle
        visualizerToggle?.addEventListener('change', () => {
            playerState.showVisualizer = visualizerToggle.checked;

            if (playerState.showVisualizer) {
                if (!audioContext && playerState.isPlaying) {
                    initAudioContext();
                }
                startVisualizer();
            } else {
                stopVisualizer();
            }
        });

        // Info button modal
        infoBtn?.addEventListener('click', () => {
            infoModal.style.display = 'block';
            setTimeout(() => {
                infoModal.classList.add('visible');
            }, 10);
        });

        // Close modal
        closeModalBtn?.addEventListener('click', () => {
            infoModal.classList.remove('visible');
            setTimeout(() => {
                infoModal.style.display = 'none';
            }, 300);
        });

        // Close modal on outside click
        infoModal?.addEventListener('click', (event) => {
            if (event.target === infoModal) {
                infoModal.classList.remove('visible');
                setTimeout(() => {
                    infoModal.style.display = 'none';
                }, 300);
            }
        });

        // Expand/minimize toggle
        expandToggleBtn.addEventListener('click', () => {
            playerContainer.classList.toggle('expanded');
            playerContainer.classList.toggle('minimized');
            playerState.isExpanded = playerContainer.classList.contains('expanded');

            // Resize canvas for visualization if expanded
            if (playerState.isExpanded) {
                resizeVisualizer();

                if (playerState.showVisualizer && playerState.isPlaying && audioContext) {
                    startVisualizer();
                }
            } else {
                stopVisualizer();
            }
        });

        // Make the player draggable
        let isDragging = false;
        let dragOffsetX, dragOffsetY;

        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            dragOffsetX = e.clientX - playerContainer.getBoundingClientRect().left;
            dragOffsetY = e.clientY - playerContainer.getBoundingClientRect().top;
            playerContainer.style.transition = 'none';
        });

        // Use throttled mousemove for better performance
        let lastDragUpdate = 0;
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            // Throttle drag updates
            const now = Date.now();
            if (now - lastDragUpdate < 16) { // ~ 60fps
                return;
            }
            lastDragUpdate = now;

            const x = e.clientX - dragOffsetX;
            const y = e.clientY - dragOffsetY;

            // Keep player within viewport bounds
            const maxX = window.innerWidth - playerContainer.offsetWidth;
            const maxY = window.innerHeight - playerContainer.offsetHeight;

            const boundedX = Math.max(0, Math.min(x, maxX));
            const boundedY = Math.max(0, Math.min(y, maxY));

            playerContainer.style.right = 'auto';
            playerContainer.style.bottom = 'auto';
            playerContainer.style.left = `${boundedX}px`;
            playerContainer.style.top = `${boundedY}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                playerContainer.style.transition = 'all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
            }
        });

        // Resize visualizer on window resize with debounce
        let resizeTimeout;
        function resizeVisualizer() {
            if (visualizerCanvas) {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    visualizerCanvas.width = visualizerCanvas.offsetWidth;
                    visualizerCanvas.height = visualizerCanvas.offsetHeight;
                }, 200);
            }
        }

        window.addEventListener('resize', resizeVisualizer);
        resizeVisualizer();

        // Check if player goes off-screen during window resize
        window.addEventListener('resize', () => {
            if (!playerContainer || !playerState.isVisible) return;

            const rect = playerContainer.getBoundingClientRect();
            const isOffScreen = (
                rect.left < 0 ||
                rect.top < 0 ||
                rect.right > window.innerWidth ||
                rect.bottom > window.innerHeight
            );

            if (isOffScreen) {
                resetPlayerPosition();
            }
        });

        // Clean up resources properly
        function cleanupResources() {
            // Stop visualizer
            stopVisualizer();

            // Disconnect audio nodes if they exist
            if (source && audioContext) {
                try {
                    source.disconnect();
                    analyser?.disconnect();
                } catch (e) {
                    console.error('Error disconnecting audio nodes:', e);
                }
            }

            // Close audio context if it exists
            if (audioContext && audioContext.state !== 'closed') {
                try {
                    audioContext.close();
                } catch (e) {
                    console.error('Error closing audio context:', e);
                }
            }

            // Clear audio element
            if (audioPlayer) {
                audioPlayer.pause();
                audioPlayer.src = '';
                audioPlayer.load();
            }

            // Reset variables
            audioContext = null;
            analyser = null;
            source = null;
            dataArray = null;
        }

        // Clean up on page unload
        window.addEventListener('beforeunload', cleanupResources);

        // Public cleanup method to be called externally if needed
        window.cleanupAudioPlayer = cleanupResources;

        // Resume playing if it was playing before
        if (playerState.isPlaying) {
            loadAndPlayStream();
        } else {
            // Update UI for initial state
            updateStreamInfo();
        }

        // Define showToast if it doesn't exist
        if (typeof showToast !== 'function') {
            window.showToast = (message, type, duration = 3000) => {
                const toast = document.createElement('div');
                toast.className = `global-toast ${type || 'info'}`;
                toast.textContent = message;
                toast.style.cssText = `
                    position: fixed;
                    bottom: 100px;
                    right: 20px;
                    background: #23263a;
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 5px 20px rgba(0,0,0,0.4);
                    z-index: 10000;
                    opacity: 0;
                    transition: opacity 0.3s;
                    font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
                    font-size: 14px;
                `;
                document.body.appendChild(toast);

                // Show the toast
                setTimeout(() => {
                    toast.style.opacity = '1';
                }, 10);
                // Hide and remove after duration
                setTimeout(() => {
                    toast.style.opacity = '0';
                    setTimeout(() => toast.remove(), 300);
                }, duration);

                return toast;
            };
        }
    }

    // Initialize when DOM is ready with error handling
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initGlobalAudioPlayer);
        } else {
            initGlobalAudioPlayer();
        }
    } catch (err) {
        console.error('Error initializing audio player:', err);
    }
})();

