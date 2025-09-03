# Pixel Ninja Kitties - Development Instructions

Pixel Ninja Kitties is a **Node.js/Express NFT minting application** that generates AI-powered ninja cat artwork and metadata. The app features a web interface for minting NFTs with customizable traits, AI image generation from multiple providers (DALL-E, Stability AI, Hugging Face), and blockchain integration with the Vitruveo network.

**ALWAYS reference these instructions first and fallback to search or bash commands only when you encounter unexpected information that does not match the info here.**

## Critical Setup Requirements

### Node.js Environment
- **Required**: Node.js v20+ (tested with v20.19.4)
- **Package Manager**: npm 10+ (tested with v10.8.2)
- **Module Type**: ES modules (`"type": "module"` in package.json)

### Bootstrap the Repository
**NEVER CANCEL any build or install commands.** Follow these exact steps:

1. **Install Dependencies** (takes ~20 seconds):
   ```bash
   npm install
   ```
   - **TIMEOUT**: Set minimum 60 seconds, recommend 120 seconds for safety
   - **Expected**: ~600 packages, some deprecation warnings (normal)
   - **Expected**: 11 vulnerabilities (10 low, 1 critical) - this is known and acceptable
   - **DO NOT** run `npm audit fix` unless specifically needed

2. **Environment Setup** - Create `.env` file with these **REQUIRED** variables:
   ```env
   # Blockchain (Required)
   RPC_URL=https://rpc.vitruveo.xyz
   CONTRACT_ADDRESS=0x2D732b0Bb33566A13E586aE83fB21d2feE34e906
   PRIVATE_KEY=your_private_key_here
   PLACEHOLDER_URI=https://your-domain.com/placeholder.json

   # Database (Required)
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key-here

   # AI Providers (At least one required)
   OPENAI_API_KEY=sk-your-openai-key
   HUGGING_FACE_TOKEN=hf_your-token
   STABILITY_API_KEY=sk-your-stability-key

   # Server
   PORT=5000
   BASE_URL=http://localhost:5000
   IMAGE_PROVIDER=dall-e
   NODE_ENV=development
   ```

## Build and Test Commands

### Available Scripts
- **`npm run build`** - No actual build step (just echoes "No build step required")
- **`npm run start`** - Production server (`node server.js`)
- **`npm run dev`** - Development server with auto-reload (`nodemon server.js`)
- **`npm run test`** - Run metadata generation tests (**takes <1 second**)
- **`npm run lint`** - ESLint validation (**takes ~2 seconds**, shows many warnings/errors but runs successfully)
- **`npm run deploy`** - Deploy smart contract (**FAILS**: no hardhat.config.js file exists)

### Validation Commands
**Run these to validate your environment:**

1. **Test Dependencies Install**:
   ```bash
   npm install
   ```
   **Expected time**: 20 seconds. **NEVER CANCEL**.

2. **Run Test Suite**:
   ```bash
   npm test
   ```
   **Expected time**: 3-4 seconds. Must pass all tests.

3. **Lint Code** (optional, shows existing issues):
   ```bash
   npm run lint
   ```
   **Expected time**: 10-15 seconds. **Expected**: 123 problems (54 errors, 69 warnings) - this is the current state.

4. **Environment Test** (if server won't start):
   ```bash
   node -e "import('./api/test-env.js').then(m => console.log('Environment check available'))"
   ```

## Running the Application

### Development Mode
```bash
npm run dev
```
- **Requires**: Proper `.env` file with all required variables
- **Server runs on**: http://localhost:5000
- **Expected behavior**: Auto-reload on file changes with nodemon
- **Common failure**: Will crash if Supabase environment variables are missing

### Production Mode
```bash
npm start
```
- **Same requirements** as development mode
- **No auto-reload**: Manual restart required for changes

### Server Startup Issues
If server fails to start:
1. **Missing environment variables**: Check `.env` file against requirements above
2. **Supabase connection**: Verify `SUPABASE_URL` and `SUPABASE_ANON_KEY` are correct
3. **AI provider keys**: At least one of `OPENAI_API_KEY`, `HUGGING_FACE_TOKEN`, or `STABILITY_API_KEY` must be valid

## Application Structure

### Key Directories
- **`/api/`** - Serverless functions (Vercel-compatible)
- **`/scripts/`** - Backend utilities (task management, AI generation, blockchain)
- **`/public/`** - Frontend static files (HTML, CSS, JS)
- **`/__tests__/`** - Unit tests for metadata generation
- **`/utils/`** - Shared utilities

### Critical Files
- **`server.js`** - Main Express server, handles static files and background processes
- **`package.json`** - Dependencies and scripts
- **`.env`** - Environment configuration (create from `.env.example`)
- **`public/index.html`** - Main minting interface
- **`public/js/mint.js`** - Frontend minting logic and wallet integration

### Database (Supabase)
The application uses Supabase instead of MongoDB:
- **Table**: `tasks` - Tracks minting jobs and AI generation progress
- **States**: `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED`, `TIMEOUT`
- **Setup guide**: See `SUPABASE_SETUP.md` for SQL schema

## Manual Testing & Validation

### User Flow Testing
**ALWAYS test complete user scenarios after making changes:**

1. **Basic Frontend Testing**:
   ```bash
   # Start simple HTTP server to test frontend without backend
   cd public && python3 -m http.server 8080
   ```
   - Load http://localhost:8080 in browser
   - Verify interface loads correctly (breed selection, AI provider options)
   - **Expected**: Interface loads with some JavaScript errors (ethers.js missing) but UI is functional
   - **Screenshot available**: Frontend shows complete minting interface with breed selection

2. **Full Server Testing** (requires environment setup):
   ```bash
   npm run dev
   ```
   - Load http://localhost:5000
   - Connect wallet (if testing blockchain integration)
   - Select breed and AI provider options
   - Click "Mint Your Ninja Cat" button
   - Verify task creation and status polling

3. **API Endpoint Testing**:
   ```bash
   # Test environment validation (works without full setup)
   node -e "import('./api/test-env.js').then(m => console.log('Environment check available'))"
   ```
   - `/api/health` - Basic health check
   - `/api/health/detailed` - Comprehensive diagnostics
   - `/api/test-env` - Environment validation

### Manual Validation Scenarios
**Test these scenarios to ensure changes work correctly:**

1. **Environment Validation**:
   - **No .env file**: Server should fail with specific error about missing API keys
   - **Missing Supabase vars**: Server should fail with Supabase connection error
   - **Invalid API keys**: Should fail gracefully with helpful error messages

2. **Frontend Functionality**:
   - **Breed selection**: All 10 breeds should be available (Bengal, Siamese, Maine Coon, etc.)
   - **AI provider options**: DALL-E, Stability AI, HuggingFace options should be selectable
   - **Interface responsiveness**: UI should be clean and functional on desktop
   - **Navigation**: Footer links should work (Lore, Gallery, Marketplace, etc.)

3. **Test Suite Validation**:
   - **Metadata generation**: Tests breed affinity, trait generation, rarity calculation
   - **Deterministic output**: Same tokenId + breed should generate identical metadata
   - **Edge cases**: Unknown breeds should fallback gracefully
   - **Schema validation**: Generated metadata should pass JSON schema validation

### Expected Behavior Documentation
**Reference these when testing to verify normal operation:**

- **Frontend loads successfully** even without backend server
- **Mint button is disabled** until wallet connection (normal)
- **"Fetching price..." shows** when backend is not available (normal)
- **JavaScript errors about ethers.js** when CDN is blocked (normal in restricted environments)
- **Audio player widget** appears in bottom right (ninja-casts feature)
- **Responsive design** works on different screen sizes

## Code Quality

### Before Committing Changes
**ALWAYS run these validation steps:**

1. **Run tests**: `npm test` (must pass)
2. **Check code style**: `npm run lint` (warnings acceptable, fix critical errors)
3. **Test server startup**: `npm run dev` (must start without crashes)
4. **Manual validation**: Test the actual minting flow in browser

### Known Issues (Do Not Fix Unless Related to Your Task)
- **123 lint problems**: ESLint shows many warnings/errors - this is existing state
- **11 npm vulnerabilities**: Known issue in dependencies - do not fix unless critical
- **Deploy command fails**: No hardhat.config.js file - smart contract deployment is not set up
- **Missing hardhat project**: `npm run deploy` will fail

## Common Developer Tasks

### Environment Testing Without Full Setup
**Use these commands when you need to test without setting up Supabase:**

```bash
# Test frontend only (no backend needed)
cd public && python3 -m http.server 8080
# Visit: http://localhost:8080

# Test Node.js imports and basic functionality
node -e "import('./api/test-env.js').then(m => console.log('API imports work'))"

# Run test suite (works without environment setup)
npm test
```

### Adding New AI Provider
1. Update `public/js/mint.js` provider configuration (around line 12-50)
2. Modify `scripts/finalizeMint.js` generation logic
3. Test with proper API keys in `.env`
4. **Always test**: Frontend provider selection and backend generation

### Modifying Metadata
1. Edit `utils/metadata.js` for trait generation
2. Run `npm test` to verify changes (must pass all tests)
3. Update tests in `__tests__/metadata.spec.js` if needed
4. **Always verify**: Deterministic generation and rarity calculation

### Adding API Endpoints
1. Create new file in `/api/` directory (serverless function format)
2. Follow existing patterns (see `api/health.js` or `api/test-env.js`)
3. Test independently before integrating with frontend
4. **API functions are Vercel-compatible** - use proper export format

### Frontend Changes
1. Modify files in `/public/` directory
2. Test with simple HTTP server: `cd public && python3 -m http.server 8080`
3. Verify wallet connection and minting flow (if applicable)
4. **Always test**: Responsive design and JavaScript functionality

### Database/Supabase Changes
1. **Setup required**: Follow `SUPABASE_SETUP.md` for initial configuration
2. Schema changes: Update `utils/supabase_schema.sql`
3. Task management: Modify `scripts/supabaseTaskManager.js`
4. **Always test**: Task creation, status updates, and cleanup

## Debugging

### Server Won't Start
1. Check environment variables in `.env`
2. Verify Supabase connection
3. Test with: `node -e "import('./api/test-env.js')"`

### Tests Failing
1. Check imports in test files
2. Verify metadata utilities are working
3. Run individual test files if needed

### Frontend Issues
1. Open browser developer tools
2. Check console for JavaScript errors
3. Verify wallet connection and network setup

## Important Notes

- **No Build Step**: The application serves static files directly
- **ES Modules**: All imports use ES module syntax
- **Blockchain Network**: Configured for Vitruveo, not Ethereum mainnet
- **Serverless Ready**: API functions are Vercel-compatible
- **Database Migration**: Project migrated from MongoDB to Supabase

---

**Remember**: Always follow these instructions first. Only search or explore further if you encounter issues not covered here or if specific instructions fail to work as expected.