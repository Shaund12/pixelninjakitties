import js from '@eslint/js';

export default [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                global: 'readonly',
                window: 'readonly',
                document: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                prompt: 'readonly',
                fetch: 'readonly',
                crypto: 'readonly',
                ethers: 'readonly'
            }
        },
        rules: {
            // Security rules
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',

            // Code quality rules
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            'no-console': 'off', // Allow console for server logging
            'no-debugger': 'warn',
            'prefer-const': 'error',
            'no-var': 'error',

            // Security best practices
            'no-prototype-builtins': 'error',
            'no-constructor-return': 'error',
            'no-duplicate-imports': 'error',
            'no-self-compare': 'error',
            'no-unmodified-loop-condition': 'error',
            'no-unreachable-loop': 'error',
            'no-useless-backreference': 'error',

            // General best practices
            'radix': 'error',
            'yoda': 'error'
        }
    },
    {
        files: ['**/*.js'],
        rules: {
            // Additional rules for all JS files
            'no-mixed-spaces-and-tabs': 'error',
            'no-trailing-spaces': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { 'avoidEscape': true }]
        }
    },
    {
        files: ['server.js', 'scripts/**/*.js', 'api/**/*.js'],
        languageOptions: {
            globals: {
                exports: 'readonly',
                module: 'readonly',
                require: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly'
            }
        }
    },
    {
        files: ['public/**/*.js'],
        languageOptions: {
            globals: {
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                history: 'readonly',
                XMLHttpRequest: 'readonly',
                FormData: 'readonly',
                File: 'readonly',
                FileReader: 'readonly',
                Blob: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                Headers: 'readonly',
                Request: 'readonly',
                Response: 'readonly',
                AbortController: 'readonly',
                AbortSignal: 'readonly',
                Event: 'readonly',
                EventTarget: 'readonly',
                CustomEvent: 'readonly',
                MutationObserver: 'readonly',
                IntersectionObserver: 'readonly',
                ResizeObserver: 'readonly',
                performance: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                // Third-party libraries
                confetti: 'readonly',
                QRCode: 'readonly',
                particlesJS: 'readonly',
                THREE: 'readonly',
                Chart: 'readonly',
                gsap: 'readonly',
                showToast: 'readonly',
                weaponFilter: 'readonly'
            }
        }
    }
];