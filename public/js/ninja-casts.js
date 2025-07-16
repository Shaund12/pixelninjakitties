// Enhanced Ninja Casts: Shadow Frequencies - Premium Audio Experience
(() => {
    // Collection of ninja-themed streaming sources
    const streamingSources = [
        {
            url: 'https://ice1.somafm.com/dronezone-128-mp3',
            name: 'Shadow Frequencies',
            bitrate: '128 kbps',
            genre: 'Ambient Ninja',
            provider: 'SomaFM',
            theme: 'shadow'
        },
        {
            url: 'https://radio4.cdm-radio.com:18020/stream-mp3-Zen',
            name: 'Zen Temple',
            bitrate: '192 kbps',
            genre: 'Meditation Dojo',
            provider: 'CDM-Radio',
            theme: 'zen'
        },
        {
            url: 'https://icecast.cloudradionetwork.com:8037/spacedreams',
            name: 'Moonlight Serenade',
            bitrate: '128 kbps',
            genre: 'Cosmic Ninja',
            provider: 'Cloud Radio',
            theme: 'moon'
        },
        {
            url: 'https://streams.calmradio.com/api/36/128/stream',
            name: 'Inner Peace',
            bitrate: '128 kbps',
            genre: 'Tranquil Focus',
            provider: 'Calm Radio',
            theme: 'peace'
        },
        {
            url: 'https://streaming.live365.com/b05055_128mp3',
            name: 'Dream Realm',
            bitrate: '128 kbps',
            genre: 'Sleeping Ninja',
            provider: 'Live365',
            theme: 'dream'
        }
    ];

    // Visualizer skins configuration
    const visualizerSkins = {
        katana_wave: {
            name: 'Katana Wave',
            colors: ['#8a65ff', '#9e7fff', '#b39dff'],
            style: 'bars'
        },
        sakura_pulse: {
            name: 'Sakura Pulse',
            colors: ['#ff6b9d', '#ff8a9b', '#ffa8c9'],
            style: 'circles'
        },
        shadow_mode: {
            name: 'Shadow Mode',
            colors: ['#444466', '#666688', '#8888aa'],
            style: 'waves'
        }
    };

    // AI DJ Commentary messages
    const aiCommentary = [
        'The blade is silent, but it never sleeps…',
        'In the quiet, a storm prepares.',
        'Focus flows like water, sharp like steel.',
        'The shadow knows what the light cannot see.',
        'Breathe with the rhythm of the ancient ways.',
        'Your mind is the sharpest weapon in the dojo.',
        'Let the frequencies guide your inner ninja.',
        'In stillness, find your true strength.'
    ];

    // Enhanced player state management with Supabase integration
    class NinjaPlayerState {
        constructor() {
            this.supabase = null;
            this.userId = null;
            this.settings = this.getDefaultSettings();
            this.initSupabase();
        }

        getDefaultSettings() {
            return {
                volume: 0.5,
                stream_index: 0,
                visualizer_skin: 'katana_wave',
                focus_mode: false,
                focus_duration: 25,
                ai_commentary: false,
                is_expanded: false,
                is_visible: true,
                show_visualizer: true,
                position_x: 20,
                position_y: 20
            };
        }

        async initSupabase() {
            try {
                // Import Supabase client
                const { initializeSupabase } = await import('/js/supabase.js');
                this.supabase = await initializeSupabase();

                // Try to get user from wallet or create mock user for now
                this.userId = this.getCurrentUserId();

                // Load settings from database
                await this.loadSettings();
            } catch (error) {
                console.warn('Supabase not available, using localStorage fallback:', error);
                this.loadFromLocalStorage();
            }
        }

        getCurrentUserId() {
            // For now, use a mock user ID or localStorage-based ID
            // In production, this would come from wallet connection
            let userId = localStorage.getItem('ninja_user_id');
            if (!userId) {
                userId = 'guest_' + Date.now();
                localStorage.setItem('ninja_user_id', userId);
            }
            return userId;
        }

        async loadSettings() {
            if (!this.supabase || !this.userId) {
                return this.loadFromLocalStorage();
            }

            try {
                const { data, error } = await this.supabase
                    .from('ninja_player_settings')
                    .select('*')
                    .eq('user_id', this.userId)
                    .single();

                if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
                    throw error;
                }

                if (data) {
                    this.settings = { ...this.settings, ...data };
                } else {
                    // Create default settings for new user
                    await this.saveSettings();
                }
            } catch (error) {
                console.warn('Failed to load settings from Supabase:', error);
                this.loadFromLocalStorage();
            }
        }

        async saveSettings() {
            if (!this.supabase || !this.userId) {
                return this.saveToLocalStorage();
            }

            try {
                const { error } = await this.supabase
                    .from('ninja_player_settings')
                    .upsert({
                        user_id: this.userId,
                        ...this.settings,
                        last_updated: new Date().toISOString()
                    });

                if (error) throw error;
            } catch (error) {
                console.warn('Failed to save settings to Supabase:', error);
                this.saveToLocalStorage();
            }
        }

        loadFromLocalStorage() {
            const keys = [
                'ninja_audio_volume', 'ninja_audio_index', 'ninja_audio_visualizer_skin',
                'ninja_audio_focus_mode', 'ninja_audio_ai_commentary', 'ninja_audio_expanded',
                'ninja_audio_visible', 'ninja_audio_visualizer'
            ];

            keys.forEach(key => {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    const settingKey = key.replace('ninja_audio_', '');
                    this.settings[settingKey] = key.includes('volume') ? parseFloat(value) :
                                               key.includes('index') ? parseInt(value, 10) :
                                               value === 'true';
                }
            });
        }

        saveToLocalStorage() {
            localStorage.setItem('ninja_audio_volume', this.settings.volume);
            localStorage.setItem('ninja_audio_index', this.settings.stream_index);
            localStorage.setItem('ninja_audio_visualizer_skin', this.settings.visualizer_skin);
            localStorage.setItem('ninja_audio_focus_mode', this.settings.focus_mode);
            localStorage.setItem('ninja_audio_ai_commentary', this.settings.ai_commentary);
            localStorage.setItem('ninja_audio_expanded', this.settings.is_expanded);
            localStorage.setItem('ninja_audio_visible', this.settings.is_visible);
            localStorage.setItem('ninja_audio_visualizer', this.settings.show_visualizer);
        }

        // Getters and setters with auto-save
        get volume() { return this.settings.volume; }
        set volume(value) { this.settings.volume = value; this.saveSettings(); }

        get streamIndex() { return this.settings.stream_index; }
        set streamIndex(value) { this.settings.stream_index = value; this.saveSettings(); }

        get visualizerSkin() { return this.settings.visualizer_skin; }
        set visualizerSkin(value) { this.settings.visualizer_skin = value; this.saveSettings(); }

        get focusMode() { return this.settings.focus_mode; }
        set focusMode(value) { this.settings.focus_mode = value; this.saveSettings(); }

        get aiCommentary() { return this.settings.ai_commentary; }
        set aiCommentary(value) { this.settings.ai_commentary = value; this.saveSettings(); }

        get isExpanded() { return this.settings.is_expanded; }
        set isExpanded(value) { this.settings.is_expanded = value; this.saveSettings(); }

        get isVisible() { return this.settings.is_visible; }
        set isVisible(value) { this.settings.is_visible = value; this.saveSettings(); }

        get showVisualizer() { return this.settings.show_visualizer; }
        set showVisualizer(value) { this.settings.show_visualizer = value; this.saveSettings(); }
    }

    // Global state instance
    const playerState = new NinjaPlayerState();

    // Initialize the enhanced Ninja Casts player
    function initNinjaCastsPlayer() {
        // Only create player if it doesn't exist already
        if (document.getElementById('ninja-casts-player')) return;

        // Create the enhanced CSS with ninja theming
        const style = document.createElement('style');
        style.textContent = `
            #ninja-casts-player {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: linear-gradient(145deg, #1a1a2e, #16213e);
                border-radius: 20px;
                box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6), 
                            0 0 0 1px rgba(138, 101, 255, 0.2),
                            inset 0 2px 4px rgba(255, 255, 255, 0.1);
                color: white;
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 999;
                transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
                overflow: hidden;
                width: 360px;
                border: 2px solid rgba(138, 101, 255, 0.4);
                user-select: none;
                backdrop-filter: blur(15px);
            }
            
            #ninja-casts-player.minimized {
                width: 200px;
                height: 70px;
                border-radius: 15px;
            }
            
            #ninja-casts-player.expanded {
                width: 380px;
                height: 280px;
            }

            .ninja-cat-avatar {
                position: absolute;
                top: -15px;
                left: 15px;
                width: 40px;
                height: 40px;
                background: linear-gradient(145deg, #8a65ff, #6b4bd6);
                border-radius: 50%;
                border: 3px solid rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 20px;
                z-index: 1000;
                animation: ninja-pulse 3s ease-in-out infinite;
                cursor: pointer;
                transition: transform 0.3s ease;
            }

            .ninja-cat-avatar:hover {
                transform: scale(1.1) rotate(5deg);
            }

            .ninja-cat-avatar.meditating {
                animation: ninja-meditate 4s ease-in-out infinite;
            }

            @keyframes ninja-pulse {
                0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(138, 101, 255, 0.7); }
                50% { transform: scale(1.05); box-shadow: 0 0 0 10px rgba(138, 101, 255, 0); }
            }

            @keyframes ninja-meditate {
                0%, 100% { transform: scale(1) rotate(0deg); }
                25% { transform: scale(1.02) rotate(1deg); }
                75% { transform: scale(1.02) rotate(-1deg); }
            }

            .player-header {
                background: linear-gradient(90deg, rgba(138, 101, 255, 0.1), transparent);
                padding: 15px 20px 10px 70px;
                border-bottom: 1px solid rgba(138, 101, 255, 0.1);
            }

            .player-title {
                font-size: 16px;
                font-weight: 700;
                color: #e0e0ff;
                margin: 0;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            }

            .player-subtitle {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.7);
                margin: 2px 0 0 0;
                font-style: italic;
            }

            .stream-carousel {
                display: flex;
                overflow-x: auto;
                gap: 10px;
                padding: 10px 15px;
                scrollbar-width: none;
                -ms-overflow-style: none;
            }

            .stream-carousel::-webkit-scrollbar {
                display: none;
            }

            .stream-card {
                min-width: 120px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(138, 101, 255, 0.2);
                border-radius: 12px;
                padding: 8px 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                text-align: center;
            }

            .stream-card.active {
                background: rgba(138, 101, 255, 0.3);
                border-color: rgba(138, 101, 255, 0.8);
                box-shadow: 0 0 15px rgba(138, 101, 255, 0.3);
            }

            .stream-card:hover {
                background: rgba(138, 101, 255, 0.2);
                transform: translateY(-2px);
            }

            .stream-card-name {
                font-size: 11px;
                font-weight: 600;
                color: white;
                margin-bottom: 2px;
            }

            .stream-card-genre {
                font-size: 9px;
                color: rgba(255, 255, 255, 0.6);
            }

            .focus-mode-panel {
                background: rgba(255, 165, 0, 0.1);
                border: 1px solid rgba(255, 165, 0, 0.3);
                border-radius: 10px;
                padding: 12px;
                margin: 10px 15px;
                display: none;
            }

            .focus-mode-panel.active {
                display: block;
            }

            .focus-timer {
                font-size: 24px;
                font-weight: 700;
                color: #ffb347;
                text-align: center;
                margin-bottom: 8px;
                font-family: 'Courier New', monospace;
            }

            .focus-controls {
                display: flex;
                gap: 8px;
                justify-content: center;
            }

            .focus-btn {
                background: rgba(255, 165, 0, 0.2);
                border: 1px solid rgba(255, 165, 0, 0.4);
                border-radius: 6px;
                padding: 4px 8px;
                color: #ffb347;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.2s ease;
            }

            .focus-btn:hover {
                background: rgba(255, 165, 0, 0.3);
            }

            .ai-commentary {
                background: rgba(0, 255, 255, 0.05);
                border: 1px solid rgba(0, 255, 255, 0.2);
                border-radius: 10px;
                padding: 10px;
                margin: 10px 15px;
                font-size: 12px;
                color: #87ceeb;
                font-style: italic;
                text-align: center;
                display: none;
                animation: fade-in 0.5s ease-in-out;
            }

            .ai-commentary.visible {
                display: block;
            }

            @keyframes fade-in {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            .visualizer-skin-selector {
                display: flex;
                gap: 8px;
                padding: 8px 15px;
                justify-content: center;
            }

            .skin-option {
                width: 30px;
                height: 20px;
                border-radius: 6px;
                cursor: pointer;
                border: 2px solid transparent;
                transition: all 0.2s ease;
                position: relative;
            }

            .skin-option.active {
                border-color: white;
                box-shadow: 0 0 10px rgba(255, 255, 255, 0.3);
            }

            .skin-option.katana_wave {
                background: linear-gradient(45deg, #8a65ff, #9e7fff);
            }

            .skin-option.sakura_pulse {
                background: linear-gradient(45deg, #ff6b9d, #ff8a9b);
            }

            .skin-option.shadow_mode {
                background: linear-gradient(45deg, #444466, #666688);
            }

            .easter-egg-dojo {
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(0, 0, 0, 0.95);
                border: 2px solid #8a65ff;
                border-radius: 20px;
                padding: 30px;
                color: white;
                text-align: center;
                z-index: 10000;
                display: none;
                animation: dojo-appear 0.5s ease-in-out;
            }

            @keyframes dojo-appear {
                from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }

            .easter-egg-dojo.visible {
                display: block;
            }

            .dojo-title {
                font-size: 24px;
                color: #8a65ff;
                margin-bottom: 15px;
                font-weight: 700;
            }

            .dojo-playlist {
                list-style: none;
                padding: 0;
                margin: 15px 0;
            }

            .dojo-playlist li {
                padding: 8px 0;
                border-bottom: 1px solid rgba(138, 101, 255, 0.2);
                cursor: pointer;
                transition: color 0.2s ease;
            }

            .dojo-playlist li:hover {
                color: #8a65ff;
            }

            /* Enhanced controls styling */
            .player-controls {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 15px;
                background: rgba(0, 0, 0, 0.1);
            }

            .ninja-control-btn {
                background: linear-gradient(145deg, rgba(138, 101, 255, 0.2), rgba(138, 101, 255, 0.1));
                border: 1px solid rgba(138, 101, 255, 0.3);
                border-radius: 50%;
                width: 42px;
                height: 42px;
                display: flex;
                align-items: center;
                justify-content: center;
                color: #a28aff;
                cursor: pointer;
                transition: all 0.3s ease;
                padding: 0;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2), 
                            inset 0 1px 2px rgba(255,255,255,0.1);
            }

            .ninja-control-btn:hover {
                background: linear-gradient(145deg, rgba(138, 101, 255, 0.4), rgba(138, 101, 255, 0.2));
                transform: translateY(-2px);
                box-shadow: 0 6px 12px rgba(0,0,0,0.3), 
                            inset 0 1px 2px rgba(255,255,255,0.2);
            }

            .play-btn {
                background: linear-gradient(145deg, #8a65ff, #6b4bd6);
                color: white;
                width: 48px;
                height: 48px;
                box-shadow: 0 4px 15px rgba(138, 101, 255, 0.4);
            }

            .play-btn:hover {
                background: linear-gradient(145deg, #9e7fff, #8a65ff);
                box-shadow: 0 6px 20px rgba(138, 101, 255, 0.6);
            }

            .minimized .ninja-control-btn {
                width: 36px;
                height: 36px;
            }

            .minimized .play-btn {
                width: 40px;
                height: 40px;
            }

            /* Enhanced info display */
            .stream-info {
                flex: 1;
                padding-left: 10px;
            }

            .stream-name {
                font-weight: 700;
                font-size: 15px;
                color: #e0e0ff;
                margin-bottom: 3px;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
            }

            .stream-metadata {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.7);
                display: flex;
                gap: 8px;
                align-items: center;
            }

            .live-indicator {
                width: 6px;
                height: 6px;
                background: #00ff00;
                border-radius: 50%;
                animation: pulse-live 2s infinite;
            }

            @keyframes pulse-live {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.5; }
            }

            /* Action buttons */
            .player-actions {
                position: absolute;
                top: 15px;
                right: 15px;
                display: flex;
                gap: 8px;
            }

            .action-btn {
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: rgba(255, 255, 255, 0.8);
                transition: all 0.2s ease;
            }

            .action-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                color: white;
                transform: scale(1.1);
            }

            /* Responsive design */
            @media (max-width: 768px) {
                #ninja-casts-player {
                    width: 300px;
                    bottom: 10px;
                    right: 10px;
                }
                
                #ninja-casts-player.minimized {
                    width: 180px;
                }
                
                #ninja-casts-player.expanded {
                    width: 320px;
                }
            }
        `;

        // Continue with the rest of the implementation...
        // This is just the beginning of the enhanced player
        // The actual implementation would be much longer

        document.head.appendChild(style);

        // Create the player container
        const playerContainer = document.createElement('div');
        playerContainer.id = 'ninja-casts-player';
        playerContainer.className = playerState.isExpanded ? 'expanded' : 'minimized';
        playerContainer.style.display = playerState.isVisible ? 'block' : 'none';

        // Player HTML structure
        playerContainer.innerHTML = `
            <div class="ninja-cat-avatar" id="ninjaCatAvatar">🥷</div>
            
            <div class="player-header">
                <h3 class="player-title">Ninja Casts</h3>
                <p class="player-subtitle">Shadow Frequencies</p>
            </div>
            
            <div class="stream-carousel" id="streamCarousel">
                ${streamingSources.map((stream, index) => `
                    <div class="stream-card ${index === playerState.streamIndex ? 'active' : ''}" 
                         data-index="${index}">
                        <div class="stream-card-name">${stream.name}</div>
                        <div class="stream-card-genre">${stream.genre}</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="focus-mode-panel" id="focusModePanel">
                <div class="focus-timer" id="focusTimer">25:00</div>
                <div class="focus-controls">
                    <button class="focus-btn" id="focusStart">Start</button>
                    <button class="focus-btn" id="focusPause">Pause</button>
                    <button class="focus-btn" id="focusReset">Reset</button>
                </div>
            </div>
            
            <div class="ai-commentary" id="aiCommentary"></div>
            
            <div class="player-controls">
                <button class="ninja-control-btn play-btn" id="playToggle">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21"></polygon>
                    </svg>
                </button>
                
                <button class="ninja-control-btn" id="nextBtn">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 4 15 12 5 20"></polygon>
                        <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>
                    </svg>
                </button>
                
                <div class="stream-info">
                    <div class="stream-name" id="currentStreamName">${streamingSources[0].name}</div>
                    <div class="stream-metadata">
                        <span class="live-indicator"></span>
                        <span id="streamGenre">${streamingSources[0].genre}</span>
                        <span>•</span>
                        <span id="streamBitrate">${streamingSources[0].bitrate}</span>
                    </div>
                </div>
                
                <button class="ninja-control-btn" id="focusToggle">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12,6 12,12 16,14"></polyline>
                    </svg>
                </button>
            </div>
            
            <div class="visualizer-skin-selector" id="skinSelector">
                ${Object.keys(visualizerSkins).map(skin => `
                    <div class="skin-option ${skin} ${skin === playerState.visualizerSkin ? 'active' : ''}" 
                         data-skin="${skin}" 
                         title="${visualizerSkins[skin].name}"></div>
                `).join('')}
            </div>
            
            <div class="player-actions">
                <button class="action-btn" id="aiToggle" title="Toggle AI Commentary">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                    </svg>
                </button>
                
                <button class="action-btn" id="expandToggle" title="Expand/Minimize">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                </button>
                
                <button class="action-btn" id="hidePlayer" title="Hide Player">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            
            <audio id="ninjaAudio" preload="none"></audio>
        `;

        // Add secret dojo easter egg
        const dojoEasterEgg = document.createElement('div');
        dojoEasterEgg.id = 'dojoEasterEgg';
        dojoEasterEgg.className = 'easter-egg-dojo';
        dojoEasterEgg.innerHTML = `
            <div class="dojo-title">🏯 Secret Ninja Dojo</div>
            <p>You have discovered the hidden frequencies of the ancient order...</p>
            <ul class="dojo-playlist">
                <li data-url="https://ice1.somafm.com/secretagent-128-mp3">Secret Agent</li>
                <li data-url="https://ice1.somafm.com/deepspaceone-128-mp3">Deep Space One</li>
                <li data-url="https://ice1.somafm.com/missioncontrol-128-mp3">Mission Control</li>
            </ul>
            <button class="focus-btn" onclick="document.getElementById('dojoEasterEgg').classList.remove('visible')">
                Return to Shadows
            </button>
        `;

        document.body.appendChild(playerContainer);
        document.body.appendChild(dojoEasterEgg);

        // Initialize event listeners and functionality
        initializeNinjaCastsEvents();

        // Show initial stream info
        updateStreamDisplay();

        // Start AI commentary if enabled
        if (playerState.aiCommentary) {
            startAiCommentary();
        }

        // Initialize focus mode if active
        if (playerState.focusMode) {
            document.getElementById('focusModePanel').classList.add('active');
        }
    }

    // Initialize event listeners
    function initializeNinjaCastsEvents() {
        // Stream carousel selection
        document.getElementById('streamCarousel').addEventListener('click', (e) => {
            const card = e.target.closest('.stream-card');
            if (card) {
                const index = parseInt(card.dataset.index);
                selectStream(index);
            }
        });

        // Focus mode controls
        document.getElementById('focusToggle').addEventListener('click', toggleFocusMode);
        document.getElementById('focusStart').addEventListener('click', startFocusSession);
        document.getElementById('focusPause').addEventListener('click', pauseFocusSession);
        document.getElementById('focusReset').addEventListener('click', resetFocusSession);

        // AI commentary toggle
        document.getElementById('aiToggle').addEventListener('click', toggleAiCommentary);

        // Visualizer skin selector
        document.getElementById('skinSelector').addEventListener('click', (e) => {
            const skinOption = e.target.closest('.skin-option');
            if (skinOption) {
                const skin = skinOption.dataset.skin;
                selectVisualizerSkin(skin);
            }
        });

        // Ninja cat avatar click for meditation mode
        document.getElementById('ninjaCatAvatar').addEventListener('click', toggleMeditationMode);

        // Easter egg: Alt+Shift+N for secret dojo
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'n') {
                document.getElementById('dojoEasterEgg').classList.add('visible');
                e.preventDefault();
            }
        });

        // Basic controls
        document.getElementById('playToggle').addEventListener('click', togglePlayback);
        document.getElementById('nextBtn').addEventListener('click', nextStream);
        document.getElementById('expandToggle').addEventListener('click', toggleExpanded);
        document.getElementById('hidePlayer').addEventListener('click', hidePlayer);
    }

    // Stream selection function
    function selectStream(index) {
        playerState.streamIndex = index;

        // Update carousel visual state
        document.querySelectorAll('.stream-card').forEach((card, i) => {
            card.classList.toggle('active', i === index);
        });

        updateStreamDisplay();
    }

    // Update stream display
    function updateStreamDisplay() {
        const currentStream = streamingSources[playerState.streamIndex];
        document.getElementById('currentStreamName').textContent = currentStream.name;
        document.getElementById('streamGenre').textContent = currentStream.genre;
        document.getElementById('streamBitrate').textContent = currentStream.bitrate;
    }

    // Focus mode functions
    function toggleFocusMode() {
        playerState.focusMode = !playerState.focusMode;
        document.getElementById('focusModePanel').classList.toggle('active', playerState.focusMode);

        if (playerState.focusMode) {
            resetFocusSession();
        }
    }

    let focusTimer = null;
    let focusTimeLeft = 25 * 60; // 25 minutes in seconds

    function startFocusSession() {
        if (focusTimer) clearInterval(focusTimer);

        focusTimer = setInterval(() => {
            focusTimeLeft--;
            updateFocusDisplay();

            if (focusTimeLeft <= 0) {
                clearInterval(focusTimer);
                focusTimer = null;
                showFocusComplete();
            }
        }, 1000);
    }

    function pauseFocusSession() {
        if (focusTimer) {
            clearInterval(focusTimer);
            focusTimer = null;
        }
    }

    function resetFocusSession() {
        if (focusTimer) {
            clearInterval(focusTimer);
            focusTimer = null;
        }
        focusTimeLeft = playerState.settings.focus_duration * 60;
        updateFocusDisplay();
    }

    function updateFocusDisplay() {
        const minutes = Math.floor(focusTimeLeft / 60);
        const seconds = focusTimeLeft % 60;
        document.getElementById('focusTimer').textContent =
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    function showFocusComplete() {
        const commentary = document.getElementById('aiCommentary');
        commentary.textContent = 'Focus session complete! Your inner ninja has grown stronger. 🥷';
        commentary.classList.add('visible');

        setTimeout(() => {
            commentary.classList.remove('visible');
        }, 5000);
    }

    // AI Commentary system
    function toggleAiCommentary() {
        playerState.aiCommentary = !playerState.aiCommentary;

        if (playerState.aiCommentary) {
            startAiCommentary();
        } else {
            stopAiCommentary();
        }
    }

    let aiCommentaryInterval = null;

    function startAiCommentary() {
        if (aiCommentaryInterval) clearInterval(aiCommentaryInterval);

        // Show random commentary every 3-5 minutes
        aiCommentaryInterval = setInterval(() => {
            showAiCommentary();
        }, (3 + Math.random() * 2) * 60 * 1000);
    }

    function stopAiCommentary() {
        if (aiCommentaryInterval) {
            clearInterval(aiCommentaryInterval);
            aiCommentaryInterval = null;
        }
        document.getElementById('aiCommentary').classList.remove('visible');
    }

    function showAiCommentary() {
        const commentary = document.getElementById('aiCommentary');
        const message = aiCommentary[Math.floor(Math.random() * aiCommentary.length)];
        commentary.textContent = message;
        commentary.classList.add('visible');

        setTimeout(() => {
            commentary.classList.remove('visible');
        }, 4000);
    }

    // Visualizer skin selection
    function selectVisualizerSkin(skinName) {
        playerState.visualizerSkin = skinName;

        document.querySelectorAll('.skin-option').forEach(option => {
            option.classList.toggle('active', option.dataset.skin === skinName);
        });
    }

    // Meditation mode toggle
    function toggleMeditationMode() {
        const avatar = document.getElementById('ninjaCatAvatar');
        avatar.classList.toggle('meditating');

        if (avatar.classList.contains('meditating')) {
            showAiCommentary();
        }
    }

    // Basic playback controls
    function togglePlayback() {
        // Implementation would connect to actual audio element
        console.log('Toggle playback');
    }

    function nextStream() {
        const nextIndex = (playerState.streamIndex + 1) % streamingSources.length;
        selectStream(nextIndex);
    }

    function toggleExpanded() {
        playerState.isExpanded = !playerState.isExpanded;
        document.getElementById('ninja-casts-player').classList.toggle('expanded', playerState.isExpanded);
        document.getElementById('ninja-casts-player').classList.toggle('minimized', !playerState.isExpanded);
    }

    function hidePlayer() {
        playerState.isVisible = false;
        document.getElementById('ninja-casts-player').style.display = 'none';

        // Show restore button
        showRestoreButton();
    }

    function showRestoreButton() {
        const restoreBtn = document.createElement('button');
        restoreBtn.id = 'restoreNinjaCasts';
        restoreBtn.innerHTML = '🥷';
        restoreBtn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: linear-gradient(145deg, #8a65ff, #6b4bd6);
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            z-index: 1000;
            animation: ninja-pulse 2s infinite;
        `;

        restoreBtn.addEventListener('click', () => {
            playerState.isVisible = true;
            document.getElementById('ninja-casts-player').style.display = 'block';
            restoreBtn.remove();
        });

        document.body.appendChild(restoreBtn);
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNinjaCastsPlayer);
    } else {
        initNinjaCastsPlayer();
    }
})();