// Ninja Casts: Shadow Frequencies - Enhanced Audio Player
(() => {
    // Define showToast early to avoid reference errors
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

    // Collection of ninja-themed, high-quality streaming sources
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
        'In stillness, find your true strength.',
        'The wise ninja listens to the silence between notes.',
        'Your concentration sharpens like a blade in moonlight.'
    ];

    // Secret dojo playlist for easter egg
    const dojoPlaylist = [
        {
            url: 'https://ice1.somafm.com/secretagent-128-mp3',
            name: 'Secret Agent',
            genre: 'Spy Ambient'
        },
        {
            url: 'https://ice1.somafm.com/deepspaceone-128-mp3',
            name: 'Deep Space One',
            genre: 'Space Ambient'
        },
        {
            url: 'https://ice1.somafm.com/missioncontrol-128-mp3',
            name: 'Mission Control',
            genre: 'Electronic'
        }
    ];

    // Enhanced player state with Supabase integration
    const playerState = {
        // Supabase client will be initialized
        supabase: null,
        userId: null,

        // Settings with defaults
        settings: {
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
        },

        // Initialize Supabase connection
        async initSupabase() {
            try {
                const { initializeSupabase } = await import('/js/supabase.js');
                this.supabase = await initializeSupabase();
                this.userId = this.getCurrentUserId();
                await this.loadSettings();
            } catch (error) {
                console.warn('Supabase not available, using localStorage fallback:', error);
                this.loadFromLocalStorage();
            }
        },

        getCurrentUserId() {
            // For development, use localStorage-based user ID
            let userId = localStorage.getItem('ninja_user_id');
            if (!userId) {
                userId = 'guest_' + Date.now();
                localStorage.setItem('ninja_user_id', userId);
            }
            return userId;
        },

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

                if (error && error.code !== 'PGRST116') {
                    throw error;
                }

                if (data) {
                    this.settings = { ...this.settings, ...data };
                } else {
                    await this.saveSettings();
                }
            } catch (error) {
                console.warn('Failed to load settings from Supabase:', error);
                this.loadFromLocalStorage();
            }
        },

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
                // Silently fall back to localStorage - expected if table doesn't exist
                this.saveToLocalStorage();
            }
        },

        loadFromLocalStorage() {
            const mappings = {
                'ninja_audio_volume': 'volume',
                'ninja_audio_index': 'stream_index',
                'ninja_audio_visualizer_skin': 'visualizer_skin',
                'ninja_audio_focus_mode': 'focus_mode',
                'ninja_audio_ai_commentary': 'ai_commentary',
                'ninja_audio_expanded': 'is_expanded',
                'ninja_audio_visible': 'is_visible',
                'ninja_audio_visualizer': 'show_visualizer'
            };

            for (const [key, setting] of Object.entries(mappings)) {
                const value = localStorage.getItem(key);
                if (value !== null) {
                    if (setting === 'volume') {
                        this.settings[setting] = parseFloat(value);
                    } else if (setting === 'stream_index') {
                        this.settings[setting] = parseInt(value, 10);
                    } else if (setting !== 'visualizer_skin') {
                        this.settings[setting] = value === 'true';
                    } else {
                        this.settings[setting] = value;
                    }
                }
            }
        },

        saveToLocalStorage() {
            localStorage.setItem('ninja_audio_volume', this.settings.volume);
            localStorage.setItem('ninja_audio_index', this.settings.stream_index);
            localStorage.setItem('ninja_audio_visualizer_skin', this.settings.visualizer_skin);
            localStorage.setItem('ninja_audio_focus_mode', this.settings.focus_mode);
            localStorage.setItem('ninja_audio_ai_commentary', this.settings.ai_commentary);
            localStorage.setItem('ninja_audio_expanded', this.settings.is_expanded);
            localStorage.setItem('ninja_audio_visible', this.settings.is_visible);
            localStorage.setItem('ninja_audio_visualizer', this.settings.show_visualizer);
        },

        // Getters and setters with auto-save
        get currentIndex() { return this.settings.stream_index; },
        set currentIndex(value) {
            this.settings.stream_index = value;
            this.saveSettings();
        },

        get isPlaying() { return this.settings.is_playing || false; },
        set isPlaying(value) {
            this.settings.is_playing = value;
            this.saveSettings();
        },

        get volume() { return this.settings.volume; },
        set volume(value) {
            this.settings.volume = value;
            this.saveSettings();
        },

        get isExpanded() { return this.settings.is_expanded; },
        set isExpanded(value) {
            this.settings.is_expanded = value;
            this.saveSettings();
        },

        get isVisible() { return this.settings.is_visible; },
        set isVisible(value) {
            this.settings.is_visible = value;
            this.saveSettings();
        },

        get showVisualizer() { return this.settings.show_visualizer; },
        set showVisualizer(value) {
            this.settings.show_visualizer = value;
            this.saveSettings();
        },

        get visualizerSkin() { return this.settings.visualizer_skin; },
        set visualizerSkin(value) {
            this.settings.visualizer_skin = value;
            this.saveSettings();
        },

        get focusMode() { return this.settings.focus_mode; },
        set focusMode(value) {
            this.settings.focus_mode = value;
            this.saveSettings();
        },

        get aiCommentary() { return this.settings.ai_commentary; },
        set aiCommentary(value) {
            this.settings.ai_commentary = value;
            this.saveSettings();
        }
    };

    // Focus mode timer variables
    const focusTimer = null;
    let focusTimeLeft = 25 * 60; // 25 minutes in seconds
    let focusPaused = false;

    // AI Commentary timer
    let aiCommentaryInterval = null;

    // Easter egg variables
    let idleTimer = null;
    let lastActivity = Date.now();

    // Performance optimization flags
    let isVisualizerActive = false;
    let visualizerThrottleTimer = null;
    const VISUALIZER_FPS = 30;

    // Initialize the enhanced Ninja Casts player
    async function initGlobalAudioPlayer() {
        // Only create player if it doesn't exist already
        if (document.getElementById('ninja-casts-player')) return;

        // Initialize state management
        await playerState.initSupabase();

        // Create enhanced styles with ninja theming
        const style = document.createElement('style');
        style.textContent = `
            #ninja-casts-player {
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: linear-gradient(145deg, #1a1a2e, #16213e);
                border-radius: 20px;
                box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6), 
                            0 0 0 1px rgba(138, 101, 255, 0.3),
                            inset 0 2px 4px rgba(255, 255, 255, 0.1);
                color: white;
                font-family: 'Poppins', -apple-system, BlinkMacSystemFont, sans-serif;
                z-index: 999;
                transition: all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1);
                overflow: hidden;
                width: 420px;
                border: 2px solid rgba(138, 101, 255, 0.4);
                user-select: none;
                backdrop-filter: blur(15px);
            }
            
            #ninja-casts-player.minimized {
                width: 200px;
                height: 95px;
                border-radius: 15px;
            }
            
            #ninja-casts-player.expanded {
                width: 440px;
                height: 340px;
            }

            .ninja-cat-avatar {
                position: absolute;
                top: -15px;
                left: 15px;
                width: 45px;
                height: 45px;
                background: linear-gradient(145deg, #8a65ff, #6b4bd6);
                border-radius: 50%;
                border: 3px solid rgba(255, 255, 255, 0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 24px;
                z-index: 1000;
                animation: ninja-pulse 3s ease-in-out infinite;
                cursor: pointer;
                transition: transform 0.3s ease;
                box-shadow: 0 5px 15px rgba(138, 101, 255, 0.4);
            }

            .ninja-cat-avatar:hover {
                transform: scale(1.1) rotate(5deg);
            }

            .ninja-cat-avatar.meditating {
                animation: ninja-meditate 4s ease-in-out infinite;
            }

            .ninja-cat-avatar.kata {
                animation: ninja-kata 2s ease-in-out;
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

            @keyframes ninja-kata {
                0% { transform: scale(1) rotate(0deg); }
                25% { transform: scale(1.1) rotate(10deg); }
                50% { transform: scale(1.2) rotate(-5deg); }
                75% { transform: scale(1.1) rotate(8deg); }
                100% { transform: scale(1) rotate(0deg); }
            }

            .player-header {
                background: linear-gradient(90deg, rgba(138, 101, 255, 0.15), transparent);
                padding: 25px 25px 15px 80px;
                border-bottom: 1px solid rgba(138, 101, 255, 0.1);
            }

            .player-title {
                font-size: 18px;
                font-weight: 700;
                color: #e0e0ff;
                margin: 0;
                text-shadow: 0 1px 2px rgba(0,0,0,0.5);
            }

            .player-subtitle {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.7);
                margin: 2px 0 0 0;
                font-style: italic;
            }

            .minimized .player-header {
                padding: 15px 15px 5px 60px;
            }

            .minimized .player-title {
                font-size: 14px;
            }

            .minimized .player-subtitle {
                font-size: 10px;
            }

            .stream-carousel {
                display: flex;
                overflow-x: auto;
                gap: 12px;
                padding: 15px 20px;
                scrollbar-width: thin;
                scrollbar-color: rgba(138, 101, 255, 0.3) transparent;
                scroll-behavior: smooth;
                scroll-snap-type: x mandatory;
                position: relative;
            }

            .stream-carousel::-webkit-scrollbar {
                height: 4px;
            }

            .stream-carousel::-webkit-scrollbar-track {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 2px;
            }

            .stream-carousel::-webkit-scrollbar-thumb {
                background: rgba(138, 101, 255, 0.3);
                border-radius: 2px;
            }

            .stream-carousel::-webkit-scrollbar-thumb:hover {
                background: rgba(138, 101, 255, 0.5);
            }

            .stream-carousel:hover::-webkit-scrollbar {
                opacity: 1;
            }

            .carousel-container {
                position: relative;
                margin: 0 5px;
            }

            .carousel-nav-btn {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(138, 101, 255, 0.8);
                border: none;
                border-radius: 50%;
                width: 32px;
                height: 32px;
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                font-weight: bold;
                z-index: 10;
                transition: all 0.3s ease;
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
                opacity: 0;
                pointer-events: none;
            }

            .carousel-container:hover .carousel-nav-btn {
                opacity: 1;
                pointer-events: auto;
            }

            .carousel-nav-btn:hover {
                background: rgba(138, 101, 255, 1);
                transform: translateY(-50%) scale(1.1);
            }

            .carousel-nav-btn.prev {
                left: 5px;
            }

            .carousel-nav-btn.next {
                right: 5px;
            }

            .carousel-nav-btn:disabled {
                opacity: 0.3;
                cursor: not-allowed;
            }

            .stream-card {
                min-width: 140px;
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(138, 101, 255, 0.2);
                border-radius: 12px;
                padding: 12px;
                cursor: pointer;
                transition: all 0.3s ease;
                text-align: center;
                position: relative;
                overflow: hidden;
                flex-shrink: 0;
                scroll-snap-align: start;
            }

            .stream-card:before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(138, 101, 255, 0.1), transparent);
                transition: left 0.5s ease;
            }

            .stream-card:hover:before {
                left: 100%;
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
                font-size: 15px;
                font-weight: 600;
                color: white;
                margin-bottom: 4px;
                z-index: 1;
                position: relative;
                line-height: 1.2;
            }

            .stream-card-genre {
                font-size: 12px;
                color: rgba(255, 255, 255, 0.6);
                z-index: 1;
                position: relative;
                line-height: 1.2;
            }

            .expanded .stream-carousel {
                display: flex;
            }

            .minimized .stream-carousel {
                display: none;
            }

            .focus-mode-panel {
                background: rgba(255, 165, 0, 0.1);
                border: 1px solid rgba(255, 165, 0, 0.3);
                border-radius: 12px;
                padding: 15px;
                margin: 10px 15px;
                display: none;
            }

            .focus-mode-panel.active {
                display: block;
            }

            .focus-timer {
                font-size: 28px;
                font-weight: 700;
                color: #ffb347;
                text-align: center;
                margin-bottom: 10px;
                font-family: 'Courier New', monospace;
                text-shadow: 0 0 10px rgba(255, 179, 71, 0.3);
            }

            .focus-controls {
                display: flex;
                gap: 10px;
                justify-content: center;
            }

            .focus-btn {
                background: rgba(255, 165, 0, 0.2);
                border: 1px solid rgba(255, 165, 0, 0.4);
                border-radius: 8px;
                padding: 6px 12px;
                color: #ffb347;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.2s ease;
                font-weight: 500;
            }

            .focus-btn:hover {
                background: rgba(255, 165, 0, 0.3);
                transform: translateY(-1px);
            }

            .focus-btn:active {
                transform: translateY(0);
            }

            .ai-commentary {
                background: rgba(0, 255, 255, 0.08);
                border: 1px solid rgba(0, 255, 255, 0.3);
                border-radius: 12px;
                padding: 12px;
                margin: 10px 15px;
                font-size: 12px;
                color: #87ceeb;
                font-style: italic;
                text-align: center;
                display: none;
                animation: fade-in 0.5s ease-in-out;
                position: relative;
                overflow: hidden;
            }

            .ai-commentary:before {
                content: '🧠';
                position: absolute;
                top: 5px;
                right: 8px;
                font-size: 14px;
                opacity: 0.7;
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
                gap: 15px;
                padding: 15px 20px;
                justify-content: center;
                align-items: center;
                margin-top: 8px;
            }

            .skin-label {
                font-size: 11px;
                color: rgba(255, 255, 255, 0.6);
                margin-right: 5px;
            }

            .skin-option {
                width: 35px;
                height: 22px;
                border-radius: 8px;
                cursor: pointer;
                border: 2px solid transparent;
                transition: all 0.3s ease;
                position: relative;
                overflow: hidden;
            }

            .skin-option:hover {
                transform: scale(1.1);
            }

            .skin-option.active {
                border-color: white;
                box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
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

            .expanded .visualizer-skin-selector {
                display: flex;
            }

            .minimized .visualizer-skin-selector {
                display: none;
            }

            /* Enhanced controls styling */
            .player-controls {
                display: flex;
                align-items: center;
                gap: 18px;
                padding: 18px 20px;
                background: rgba(0, 0, 0, 0.1);
                border-radius: 0 0 20px 20px;
                margin-top: 5px;
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
                box-shadow: 0 6px 12px rgba(0,0,0,0.3);
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

            .play-btn.playing {
                animation: playing-pulse 2s infinite;
            }

            @keyframes playing-pulse {
                0%, 100% { box-shadow: 0 4px 15px rgba(138, 101, 255, 0.4); }
                50% { box-shadow: 0 4px 20px rgba(138, 101, 255, 0.7); }
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
                min-width: 0;
            }

            .stream-name {
                font-weight: 700;
                font-size: 15px;
                color: #e0e0ff;
                margin-bottom: 4px;
                text-shadow: 0 1px 2px rgba(0,0,0,0.3);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
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

            .minimized .stream-name {
                font-size: 12px;
            }

            .minimized .stream-metadata {
                font-size: 9px;
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
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.1);
                border: 1px solid rgba(255, 255, 255, 0.2);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: rgba(255, 255, 255, 0.8);
                transition: all 0.2s ease;
                backdrop-filter: blur(10px);
            }

            .action-btn:hover {
                background: rgba(255, 255, 255, 0.2);
                color: white;
                transform: scale(1.1);
            }

            .action-btn.active {
                background: rgba(138, 101, 255, 0.3);
                border-color: rgba(138, 101, 255, 0.5);
            }

            .action-btn input[type="checkbox"]:checked + svg {
                color: #8a65ff;
            }

            .minimized .action-btn {
                width: 28px;
                height: 28px;
            }

            /* Volume control */
            .volume-container {
                position: relative;
                display: flex;
                align-items: center;
            }

            .volume-slider-container {
                position: absolute;
                bottom: 50px;
                left: 50%;
                transform: translateX(-50%);
                background: rgba(35, 38, 58, 0.9);
                padding: 15px 8px;
                border-radius: 12px;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.5);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.3s ease, transform 0.3s ease;
                z-index: 1000;
                backdrop-filter: blur(10px);
            }

            .volume-container:hover .volume-slider-container {
                opacity: 1;
                pointer-events: auto;
                transform: translateX(-50%) translateY(-5px);
            }

            #volumeSlider {
                width: 100px;
                height: 6px;
                -webkit-appearance: none;
                appearance: none;
                background: rgba(255, 255, 255, 0.2);
                outline: none;
                border-radius: 3px;
                transform: rotate(-90deg);
            }

            #volumeSlider::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 18px;
                height: 18px;
                background: #a28aff;
                cursor: pointer;
                border-radius: 50%;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            }

            #volumeSlider::-moz-range-thumb {
                width: 18px;
                height: 18px;
                background: #a28aff;
                cursor: pointer;
                border-radius: 50%;
                border: none;
                box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            }

            /* Visualizer container */
            .visualizer-container {
                height: 50px;
                width: 100%;
                display: none;
                position: relative;
                margin: 8px 0;
                border-radius: 10px;
                overflow: hidden;
                background: rgba(0, 0, 0, 0.2);
            }

            .expanded .visualizer-container {
                display: block;
            }

            #audioVisualizer {
                width: 100%;
                height: 100%;
                border-radius: 10px;
            }

            /* Show player button */
            .show-player-button {
                position: fixed !important;
                bottom: 20px !important;
                right: 20px !important;
                background: linear-gradient(145deg, #8a65ff, #6b4bd6) !important;
                border-radius: 50% !important;
                width: 60px !important;
                height: 60px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                cursor: pointer !important;
                color: white !important;
                box-shadow: 0 8px 25px rgba(138, 101, 255, 0.6) !important;
                z-index: 2000 !important;
                border: none !important;
                padding: 0 !important;
                font-size: 28px !important;
                animation: ninja-pulse 2s infinite !important;
                transition: transform 0.3s ease !important;
            }

            .show-player-button:hover {
                transform: scale(1.1) !important;
            }

            /* Secret dojo easter egg */
            .dojo-easter-egg {
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
                backdrop-filter: blur(10px);
            }

            @keyframes dojo-appear {
                from { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
                to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            }

            .dojo-easter-egg.visible {
                display: block;
            }

            .dojo-title {
                font-size: 24px;
                color: #8a65ff;
                margin-bottom: 15px;
                font-weight: 700;
                text-shadow: 0 0 10px rgba(138, 101, 255, 0.5);
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

            /* Responsive design */
            @media (max-width: 768px) {
                #ninja-casts-player {
                    width: 320px;
                    bottom: 10px;
                    right: 10px;
                }
                
                #ninja-casts-player.minimized {
                    width: 180px;
                    height: 70px;
                }
                
                #ninja-casts-player.expanded {
                    width: 340px;
                    height: 300px;
                }
            }

            /* Drag handle */
            .player-drag-handle {
                width: 100%;
                height: 8px;
                cursor: grab;
                background: rgba(138, 101, 255, 0.1);
                border-radius: 20px 20px 0 0;
                position: relative;
            }
            
            .player-drag-handle:before {
                content: "";
                position: absolute;
                width: 40px;
                height: 4px;
                background: rgba(255, 255, 255, 0.4);
                border-radius: 2px;
                top: 2px;
                left: 50%;
                transform: translateX(-50%);
            }
            
            .player-drag-handle:active {
                cursor: grabbing;
            }
        `;

        // Create the enhanced player container
        const playerContainer = document.createElement('div');
        playerContainer.id = 'ninja-casts-player';
        playerContainer.className = playerState.isExpanded ? 'expanded' : 'minimized';
        playerContainer.style.display = playerState.isVisible ? 'block' : 'none';

        // Enhanced Player HTML structure with new features
        playerContainer.innerHTML = `
            <div class="player-drag-handle"></div>
            
            <div class="ninja-cat-avatar" id="ninjaCatAvatar">🥷</div>
            
            <div class="player-header">
                <h3 class="player-title">Ninja Casts</h3>
                <p class="player-subtitle">Shadow Frequencies</p>
            </div>
            
            <div class="carousel-container">
                <button class="carousel-nav-btn prev" id="carouselPrev" aria-label="Previous streams">‹</button>
                <div class="stream-carousel" id="streamCarousel">
                    ${streamingSources.map((stream, index) => `
                        <div class="stream-card ${index === playerState.currentIndex ? 'active' : ''}" 
                             data-index="${index}">
                            <div class="stream-card-name">${stream.name}</div>
                            <div class="stream-card-genre">${stream.genre}</div>
                        </div>
                    `).join('')}
                </div>
                <button class="carousel-nav-btn next" id="carouselNext" aria-label="Next streams">›</button>
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
                <button class="ninja-control-btn play-btn" id="audioToggle" aria-label="Toggle play">
                    <svg class="play-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21"></polygon>
                    </svg>
                    <svg class="pause-icon" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style="display: none;">
                        <rect x="6" y="4" width="4" height="16"></rect>
                        <rect x="14" y="4" width="4" height="16"></rect>
                    </svg>
                </button>
                
                <button class="ninja-control-btn" id="nextTrackBtn" aria-label="Next stream">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 4 15 12 5 20"></polygon>
                        <line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2"></line>
                    </svg>
                </button>
                
                <div class="volume-container">
                    <button class="ninja-control-btn" id="volumeBtn" aria-label="Volume">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    </button>
                    <div class="volume-slider-container">
                        <input type="range" id="volumeSlider" min="0" max="1" step="0.01" value="${playerState.volume}">
                    </div>
                </div>
                
                <div class="stream-info">
                    <div class="stream-name" id="currentStreamName">${streamingSources[0].name}</div>
                    <div class="stream-metadata">
                        <span class="live-indicator"></span>
                        <span id="streamGenre">${streamingSources[0].genre}</span>
                        <span>•</span>
                        <span id="streamBitrate">${streamingSources[0].bitrate}</span>
                    </div>
                </div>
                
                <button class="ninja-control-btn" id="focusToggle" aria-label="Focus Mode">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12,6 12,12 16,14"></polyline>
                    </svg>
                </button>
            </div>
            
            <div class="visualizer-container">
                <canvas id="audioVisualizer"></canvas>
            </div>
            
            <div class="visualizer-skin-selector" id="skinSelector">
                <span class="skin-label">Skin:</span>
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
                
                <label class="action-btn" title="Toggle Visualizer">
                    <input type="checkbox" id="visualizerToggle" style="display: none;" ${playerState.showVisualizer ? 'checked' : ''}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"></path>
                        <path d="M19 19V9a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"></path>
                        <path d="M14 7V4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2z"></path>
                    </svg>
                </label>
                
                <button class="action-btn" id="expandToggleBtn" title="Expand/Minimize" aria-label="Toggle expanded view">
                    <svg class="expand-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <polyline points="9 21 3 21 3 15"></polyline>
                        <line x1="21" y1="3" x2="14" y2="10"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                    <svg class="minimize-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: none;">
                        <polyline points="4 14 10 14 10 20"></polyline>
                        <polyline points="20 10 14 10 14 4"></polyline>
                        <line x1="14" y1="10" x2="21" y2="3"></line>
                        <line x1="3" y1="21" x2="10" y2="14"></line>
                    </svg>
                </button>
                
                <button class="action-btn" id="hidePlayerBtn" title="Hide Player" aria-label="Hide player">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            
            <audio id="audioPlayer" preload="none"></audio>
            
            <div class="stream-attribution">
                <span id="streamProvider">${streamingSources[0].provider}</span> • Tuned by the Silent Order
            </div>
        `;

        // Create the show button separately
        const showPlayerBtn = document.createElement('div');
        showPlayerBtn.id = 'showPlayerBtn';
        showPlayerBtn.className = 'show-player-button';
        showPlayerBtn.style.display = playerState.isVisible ? 'none' : 'flex';
        showPlayerBtn.innerHTML = '🥷';

        // Create secret dojo easter egg
        const dojoEasterEgg = document.createElement('div');
        dojoEasterEgg.id = 'dojoEasterEgg';
        dojoEasterEgg.className = 'dojo-easter-egg';
        dojoEasterEgg.innerHTML = `
            <div class="dojo-title">🏯 Secret Ninja Dojo</div>
            <p>You have discovered the hidden frequencies of the ancient order...</p>
            <ul class="dojo-playlist">
                ${dojoPlaylist.map(track => `
                    <li data-url="${track.url}" data-name="${track.name}" data-genre="${track.genre}">
                        ${track.name} - ${track.genre}
                    </li>
                `).join('')}
            </ul>
            <button class="focus-btn" id="closeDojo">Return to Shadows</button>
        `;

        // Add all elements to document
        document.head.appendChild(style);
        document.body.appendChild(playerContainer);
        document.body.appendChild(showPlayerBtn);
        document.body.appendChild(dojoEasterEgg);

        // Get DOM references
        const audioPlayer = document.getElementById('audioPlayer');
        const audioToggle = document.getElementById('audioToggle');
        const nextTrackBtn = document.getElementById('nextTrackBtn');
        const volumeSlider = document.getElementById('volumeSlider');
        const expandToggleBtn = document.getElementById('expandToggleBtn');
        const hidePlayerBtn = document.getElementById('hidePlayerBtn');
        const streamNameEl = document.getElementById('currentStreamName');
        const streamBitrateEl = document.getElementById('streamBitrate');
        const streamGenreEl = document.getElementById('streamGenre');
        const streamProviderEl = document.getElementById('streamProvider');
        const visualizerCanvas = document.getElementById('audioVisualizer');
        const visualizerToggle = document.getElementById('visualizerToggle');
        const dragHandle = document.querySelector('.player-drag-handle');

        // Info modal elements (may not exist in current HTML structure)
        const infoBtn = document.getElementById('infoBtn');
        const infoModal = document.getElementById('infoModal');
        const closeModalBtn = document.getElementById('closeModalBtn');

        // Enhanced DOM references
        const ninjaCatAvatar = document.getElementById('ninjaCatAvatar');
        const streamCarousel = document.getElementById('streamCarousel');
        const carouselPrev = document.getElementById('carouselPrev');
        const carouselNext = document.getElementById('carouselNext');
        const focusModePanel = document.getElementById('focusModePanel');
        const focusTimer = document.getElementById('focusTimer');
        const focusToggle = document.getElementById('focusToggle');
        const focusStart = document.getElementById('focusStart');
        const focusPause = document.getElementById('focusPause');
        const focusReset = document.getElementById('focusReset');
        const aiCommentary = document.getElementById('aiCommentary');
        const aiToggle = document.getElementById('aiToggle');
        const skinSelector = document.getElementById('skinSelector');
        const closeDojo = document.getElementById('closeDojo');

        // Initialize enhanced event listeners
        initEnhancedEventListeners();

        // Enhanced event listener initialization
        function initEnhancedEventListeners() {
            // Stream carousel selection
            streamCarousel.addEventListener('click', (e) => {
                const card = e.target.closest('.stream-card');
                if (card) {
                    const index = parseInt(card.dataset.index);
                    selectStream(index);
                }
            });

            // Carousel navigation buttons
            carouselPrev.addEventListener('click', () => {
                scrollCarousel(-1);
            });

            carouselNext.addEventListener('click', () => {
                scrollCarousel(1);
            });

            // Mouse wheel scrolling on carousel
            streamCarousel.addEventListener('wheel', (e) => {
                e.preventDefault();
                streamCarousel.scrollLeft += e.deltaY;
            });

            // Keyboard navigation
            document.addEventListener('keydown', (e) => {
                if (e.key === 'ArrowLeft' && e.target.tagName !== 'INPUT') {
                    e.preventDefault();
                    scrollCarousel(-1);
                } else if (e.key === 'ArrowRight' && e.target.tagName !== 'INPUT') {
                    e.preventDefault();
                    scrollCarousel(1);
                }
            });

            // Update carousel navigation state on scroll
            streamCarousel.addEventListener('scroll', updateCarouselNavigation);

            // Focus mode controls
            focusToggle.addEventListener('click', toggleFocusMode);
            focusStart.addEventListener('click', startFocusSession);
            focusPause.addEventListener('click', pauseFocusSession);
            focusReset.addEventListener('click', resetFocusSession);

            // AI commentary toggle
            aiToggle.addEventListener('click', toggleAiCommentary);

            // Visualizer skin selector
            skinSelector.addEventListener('click', (e) => {
                const skinOption = e.target.closest('.skin-option');
                if (skinOption) {
                    const skin = skinOption.dataset.skin;
                    selectVisualizerSkin(skin);
                }
            });

            // Ninja cat avatar interactions
            ninjaCatAvatar.addEventListener('click', toggleMeditationMode);

            // Secret dojo easter egg
            document.addEventListener('keydown', (e) => {
                if (e.altKey && e.shiftKey && e.key.toLowerCase() === 'n') {
                    showSecretDojo();
                    e.preventDefault();
                }
            });

            // Close dojo
            closeDojo.addEventListener('click', () => {
                document.getElementById('dojoEasterEgg').classList.remove('visible');
            });

            // Dojo playlist selection
            document.querySelectorAll('.dojo-playlist li').forEach(item => {
                item.addEventListener('click', () => {
                    const url = item.dataset.url;
                    const name = item.dataset.name;
                    const genre = item.dataset.genre;
                    playDojoTrack(url, name, genre);
                });
            });

            // Idle timer for kata easter egg
            resetIdleTimer();
            document.addEventListener('mousemove', resetIdleTimer);
            document.addEventListener('keypress', resetIdleTimer);
            document.addEventListener('click', resetIdleTimer);

            // Initialize expanded state UI
            updateExpandedState();

            // Initialize carousel navigation state
            updateCarouselNavigation();
        }

        // Enhanced stream selection
        function selectStream(index) {
            if (index === playerState.currentIndex) return;

            playerState.currentIndex = index;

            // Update carousel visual state
            document.querySelectorAll('.stream-card').forEach((card, i) => {
                card.classList.toggle('active', i === index);
            });

            updateStreamDisplay();

            // If playing, load new stream
            if (playerState.isPlaying) {
                loadAndPlayStream(true);
            }
        }

        // Carousel navigation functions
        function scrollCarousel(direction) {
            const cardWidth = 152; // 140px + 12px gap
            const scrollAmount = cardWidth * direction;
            streamCarousel.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }

        function updateCarouselNavigation() {
            const canScrollLeft = streamCarousel.scrollLeft > 0;
            const canScrollRight = streamCarousel.scrollLeft < 
                (streamCarousel.scrollWidth - streamCarousel.clientWidth);
            
            carouselPrev.disabled = !canScrollLeft;
            carouselNext.disabled = !canScrollRight;
        }

        // Enhanced stream display update
        function updateStreamDisplay() {
            const currentStream = streamingSources[playerState.currentIndex];
            streamNameEl.textContent = currentStream.name;
            streamGenreEl.textContent = currentStream.genre;
            streamBitrateEl.textContent = currentStream.bitrate;
            streamProviderEl.textContent = currentStream.provider;
        }

        // Focus mode functions
        function toggleFocusMode() {
            playerState.focusMode = !playerState.focusMode;
            focusModePanel.classList.toggle('active', playerState.focusMode);
            focusToggle.classList.toggle('active', playerState.focusMode);

            if (playerState.focusMode) {
                resetFocusSession();
                showAiCommentary('Focus mode activated. Let the flow guide you.');
            } else {
                if (focusTimer) clearInterval(focusTimer);
                focusTimer = null;
            }
        }

        function startFocusSession() {
            if (focusTimer) clearInterval(focusTimer);
            focusPaused = false;

            focusTimer = setInterval(() => {
                if (!focusPaused) {
                    focusTimeLeft--;
                    updateFocusDisplay();

                    if (focusTimeLeft <= 0) {
                        clearInterval(focusTimer);
                        focusTimer = null;
                        showFocusComplete();
                    }
                }
            }, 1000);
        }

        function pauseFocusSession() {
            focusPaused = !focusPaused;
            focusPause.textContent = focusPaused ? 'Resume' : 'Pause';
        }

        function resetFocusSession() {
            if (focusTimer) {
                clearInterval(focusTimer);
                focusTimer = null;
            }
            focusTimeLeft = playerState.settings.focus_duration * 60;
            focusPaused = false;
            focusPause.textContent = 'Pause';
            updateFocusDisplay();
        }

        function updateFocusDisplay() {
            const minutes = Math.floor(focusTimeLeft / 60);
            const seconds = focusTimeLeft % 60;
            focusTimer.textContent =
                `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }

        function showFocusComplete() {
            showAiCommentary('Focus session complete! Your inner ninja has grown stronger. 🥷');

            // Optional: Auto-pause audio
            if (playerState.isPlaying) {
                audioToggle.click();
            }
        }

        // AI Commentary system
        function toggleAiCommentary() {
            playerState.aiCommentary = !playerState.aiCommentary;
            aiToggle.classList.toggle('active', playerState.aiCommentary);

            if (playerState.aiCommentary) {
                startAiCommentary();
                showAiCommentary('AI commentary activated. The wisdom of the ancients flows through you.');
            } else {
                stopAiCommentary();
            }
        }

        function startAiCommentary() {
            if (aiCommentaryInterval) clearInterval(aiCommentaryInterval);

            // Show random commentary every 2-4 minutes
            aiCommentaryInterval = setInterval(() => {
                if (playerState.aiCommentary) {
                    showRandomAiCommentary();
                }
            }, (2 + Math.random() * 2) * 60 * 1000);
        }

        function stopAiCommentary() {
            if (aiCommentaryInterval) {
                clearInterval(aiCommentaryInterval);
                aiCommentaryInterval = null;
            }
            aiCommentary.classList.remove('visible');
        }

        function showRandomAiCommentary() {
            const message = aiCommentary[Math.floor(Math.random() * aiCommentary.length)];
            showAiCommentary(message);
        }

        function showAiCommentary(message) {
            aiCommentary.textContent = message;
            aiCommentary.classList.add('visible');

            setTimeout(() => {
                aiCommentary.classList.remove('visible');
            }, 5000);
        }

        // Visualizer skin selection
        function selectVisualizerSkin(skinName) {
            playerState.visualizerSkin = skinName;

            document.querySelectorAll('.skin-option').forEach(option => {
                option.classList.toggle('active', option.dataset.skin === skinName);
            });

            // Update visualizer colors if active
            if (isVisualizerActive) {
                updateVisualizerColors();
            }
        }

        function updateVisualizerColors() {
            // This would update the visualizer with the new skin colors
            // Implementation depends on the visualizer code
        }

        // Meditation mode toggle
        function toggleMeditationMode() {
            ninjaCatAvatar.classList.toggle('meditating');

            if (ninjaCatAvatar.classList.contains('meditating')) {
                showAiCommentary('Meditation mode activated. Feel the harmony of the frequencies.');
            } else {
                showAiCommentary('Returning to normal awareness. The ninja is ready.');
            }
        }

        // Secret dojo easter egg
        function showSecretDojo() {
            document.getElementById('dojoEasterEgg').classList.add('visible');
        }

        function playDojoTrack(url, name, genre) {
            // Add to streams temporarily
            const tempStream = {
                url: url,
                name: name,
                genre: genre,
                provider: 'Secret Dojo',
                bitrate: '128 kbps',
                theme: 'secret'
            };

            // Update display
            streamNameEl.textContent = name;
            streamGenreEl.textContent = genre;
            streamProviderEl.textContent = 'Secret Dojo';

            // Play the track
            audioPlayer.src = url;
            audioPlayer.play();

            // Hide dojo
            document.getElementById('dojoEasterEgg').classList.remove('visible');

            showAiCommentary('Ancient frequencies now flow through you...');
        }

        // Idle timer for kata easter egg
        function resetIdleTimer() {
            lastActivity = Date.now();

            if (idleTimer) clearTimeout(idleTimer);

            idleTimer = setTimeout(() => {
                if (Date.now() - lastActivity >= 5 * 60 * 1000) { // 5 minutes
                    performKataEasterEgg();
                }
            }, 5 * 60 * 1000);
        }

        function performKataEasterEgg() {
            ninjaCatAvatar.classList.add('kata');
            showAiCommentary('The ninja performs a kata move in the silence...');

            setTimeout(() => {
                ninjaCatAvatar.classList.remove('kata');
            }, 2000);
        }

        // Update expanded state UI
        function updateExpandedState() {
            const isExpanded = playerState.isExpanded;

            // Update expand/minimize button icons
            const expandIcon = expandToggleBtn.querySelector('.expand-icon');
            const minimizeIcon = expandToggleBtn.querySelector('.minimize-icon');

            if (isExpanded) {
                expandIcon.style.display = 'none';
                minimizeIcon.style.display = 'block';
            } else {
                expandIcon.style.display = 'block';
                minimizeIcon.style.display = 'none';
            }
        }

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
            const playerContainer = document.getElementById('ninja-casts-player');
            const showPlayerBtn = document.getElementById('showPlayerBtn');

            if (!playerContainer) return;

            if (playerState.isVisible) {
                // Hide the player
                playerContainer.style.display = 'none';
                showPlayerBtn.style.display = 'flex';
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

        // Enhanced keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'm') {
                toggleAudioPlayer();
                e.preventDefault();
            }

            // Alt+Shift+N for secret dojo (already implemented above)
            // Alt+Shift+R for reset (existing functionality)
            if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'r') {
                resetAudioPlayer();
                e.preventDefault();
            }
        });

        // Enhanced hide button functionality
        hidePlayerBtn.addEventListener('click', () => {
            toggleAudioPlayer();
            stopVisualizer();
            showToast('Player hidden. Press Alt+M to restore it', 'info', 5000);
        });

        // Enhanced show button functionality
        showPlayerBtn.addEventListener('click', () => {
            toggleAudioPlayer();

            if (playerState.isExpanded && playerState.showVisualizer && playerState.isPlaying && audioContext) {
                startVisualizer();
            }
        });

        // Expose enhanced global controls
        window.ninjaCasts = {
            show: () => {
                playerState.isVisible = true;
                const playerContainer = document.getElementById('ninja-casts-player');
                const showPlayerBtn = document.getElementById('showPlayerBtn');
                if (playerContainer) playerContainer.style.display = 'block';
                if (showPlayerBtn) showPlayerBtn.style.display = 'none';
            },
            hide: () => {
                playerState.isVisible = false;
                const playerContainer = document.getElementById('ninja-casts-player');
                const showPlayerBtn = document.getElementById('showPlayerBtn');
                if (playerContainer) playerContainer.style.display = 'none';
                if (showPlayerBtn) showPlayerBtn.style.display = 'flex';
            },
            toggle: toggleAudioPlayer,
            resetPosition: resetPlayerPosition,
            focusMode: toggleFocusMode,
            aiCommentary: toggleAiCommentary,
            secretDojo: showSecretDojo
        };

        // Legacy support
        window.ninjaAudio = window.ninjaCasts;

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
                    audioPlayer.crossOrigin = 'anonymous';
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

        // Enhanced reset function for the new player
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
                if (focusTimer) clearInterval(focusTimer);
                if (aiCommentaryInterval) clearInterval(aiCommentaryInterval);
                if (idleTimer) clearTimeout(idleTimer);

                // Clean up audio context
                if (audioContext && audioContext.state !== 'closed') {
                    try {
                        audioContext.close();
                    } catch (e) {
                        console.error('Error closing audio context:', e);
                    }
                }
            } catch (e) {
                console.error('Error during player reset:', e);
            }

            // Update UI
            const toggleBtn = document.getElementById('audioToggle');
            if (toggleBtn) {
                toggleBtn.classList.remove('playing');
                toggleBtn.querySelector('.play-icon').style.display = 'block';
                toggleBtn.querySelector('.pause-icon').style.display = 'none';
            }

            // Reset state
            playerState.isPlaying = false;

            // Show toast
            showToast('Ninja Casts has been reset', 'info');

            // Optional: Reload the component
            setTimeout(() => {
                document.getElementById('ninja-casts-player')?.remove();
                document.getElementById('showPlayerBtn')?.remove();
                document.getElementById('dojoEasterEgg')?.remove();
                initGlobalAudioPlayer();
            }, 500);
        };

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
            if (infoModal) {
                infoModal.style.display = 'block';
                setTimeout(() => {
                    infoModal.classList.add('visible');
                }, 10);
            }
        });

        // Close modal
        closeModalBtn?.addEventListener('click', () => {
            if (infoModal) {
                infoModal.classList.remove('visible');
                setTimeout(() => {
                    infoModal.style.display = 'none';
                }, 300);
            }
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

        // Enhanced expand/minimize toggle
        expandToggleBtn.addEventListener('click', () => {
            playerContainer.classList.toggle('expanded');
            playerContainer.classList.toggle('minimized');
            playerState.isExpanded = playerContainer.classList.contains('expanded');

            updateExpandedState();

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
    }

    // Initialize when DOM is ready with error handling
    try {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initGlobalAudioPlayer);
        } else {
            initGlobalAudioPlayer();
        }
    } catch (err) {
        console.error('Error initializing Ninja Casts player:', err);
    }
})();

