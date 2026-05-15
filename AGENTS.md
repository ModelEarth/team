# Guidance for Webroot, Python Servers and Rust API

This file provides guidance to Claude Code (claude.ai/code) and other AI CLI processes.
It applies to both this "team" submodule and its parent root folder and the root folder's other child repos and submodules.

## Development Commands

"push" always invokes the "./git.sh push" command.

## .NET / C#

Use [NET.md](../host/net/NET.md) for the shared .NET workflow across this webroot:
- `net/` is legacy ASP.NET Web Forms / .NET Framework-era code.
- `core/` is legacy .NET Core-era code.
- `host/net/` is the newer cross-platform .NET host for local development.
- The legacy `net/` and `core/` modules are intended to share a separate `.NET 4.x` backend on port `8004`.
- Shared local .NET settings should go in `../docker/.env`, not new XML-only local config files.

### Build and Run
- `cargo build` - Build the project
- `cargo run --bin partner_tools -- serve` - Start the REST API server  
- `cargo run --bin partner_tools -- init-db` - Initialize database schema
- `cargo check` - Check code without building
- `cargo clippy` - Run linting
- `cargo test` - Run tests

**For Development Without Database**: Export a demo database URL to prevent startup crashes:
```bash
export DATABASE_URL="postgres://demo:demo@localhost:5432/demo"
cargo run --bin partner_tools -- serve
```

### Development Mode
- Server host/port configurable via `SERVER_HOST`/`SERVER_PORT` environment variables
- **IMPORTANT**: Never use `cargo run serve` alone - it blocks the terminal and stops when you exit

### Background Development Server (ALWAYS USE THIS)
```bash
# ALWAYS use this command to start server - keeps running in background
# Used for .env database settings if the ones in .env are blank or don't connect - only needed for development without a database.
export COMMONS_HOST="localhost"
export COMMONS_PORT="5432" 
export COMMONS_NAME="demo"
export COMMONS_USER="demo"
export COMMONS_PASSWORD="demo"
export COMMONS_SSL_MODE="disable"
export EXIOBASE_HOST="localhost"
export EXIOBASE_PORT="5432"
export EXIOBASE_NAME="demo" 
export EXIOBASE_USER="demo"
export EXIOBASE_PASSWORD="demo"
export EXIOBASE_SSL_MODE="disable"
nohup cargo run --bin partner_tools -- serve > server.log 2>&1 &

# Check if dev server is running
curl http://localhost:8081/api/health

# Stop dev background server
lsof -ti:8081 | xargs kill -9
```

**Note for Development**: The server gracefully handles database connection failures and will start successfully even without a database connection. These environment variable exports are only needed if you want to override blank or invalid .env database settings. When no database is available, OAuth and non-database features work normally, while database-dependent features will return appropriate error messages.

### Alternative Commands (NOT RECOMMENDED)
- `cargo run serve` - Blocks terminal, stops when you exit (DO NOT USE)
- `cargo run -- serve` - Same issue, blocks terminal (DO NOT USE)

## Server Management

**Local hostnames**: For local servers, use `localhost` and avoid using `127.0.0.1` or other IP addresses.

**IMPORTANT**: Always check if an HTTP server is already running before attempting to start it. Use `lsof -ti:8887` to check if the HTTP server is running, then only start if needed. This prevents errors and duplicate HTTP server processes. Note: Rust API servers may need to be restarted for code changes.

### Start HTTP Server
When you type "start server", use the appropriate command for your environment:

**First check**: If `workflow/comfyui/main.py` exists, start ComfyUI on port 8887 instead of the standard HTTP server — ComfyUI provides its own web server. See below.

#### Option 1: OpenAI Codex (and other agents without shell script support)

```bash
nohup python3 desktop/install/server.py --port 8887 > /dev/null 2>&1 &
```

> **Note for OpenAI Codex**: Use this direct Python command instead of `quickstart.sh`. Codex sandboxes do not support executing shell scripts via `nohup ... &` in the same way — `quickstart.sh` may hang or fail silently because it sets up a virtual environment and sources shell functions that are not available in the Codex execution environment.

**What this command does:**
- Starts the Python HTTP server with server-side execution access via server.py on port 8887
- No virtual environment setup required — runs with the system Python 3

#### Option 2: Claude Code CLI and terminal users (recommended when available)

```bash
nohup ./desktop/install/quickstart.sh --cli --port 8887 > /dev/null 2>&1 &
```

**IMPORTANT**: When executing this command, always use this exact description:
"Start HTTP server with server-side python enabled on port 8887"

**What this command does:**
The quickstart.sh script automatically:
- Creates a virtual environment in `desktop/install/env/` if it doesn't exist
- Activates the virtual environment
- Checks for Claude API key configuration in `docker/.env`
- Installs the `anthropic` package if API key is configured
- Starts the Python HTTP server with server-side execution access via server.py on port 8887 (or next available port if 8887 is in use)

**For terminal users:** You do NOT need to manually create or activate a virtual environment before running this command - the script handles it automatically.

**If quickstart.sh does not exist**: Display the message "desktop quickstart.sh not available" and fall back to starting the server directly on the requested port (default 8887):
```bash
nohup python3 desktop/install/server.py --port [requested-port] > /dev/null 2>&1 &
```
If `server.py` also does not exist, fall back to the simple HTTP server:
```bash
nohup python3 -m http.server [requested-port] > /dev/null 2>&1 &
```

#### Option 3: Workflow repo — ComfyUI as the server on port 8887

When `workflow/comfyui/main.py` is present, start ComfyUI on port 8887 instead of
the standard HTTP server. ComfyUI includes its own aiohttp web server and serves the
workflow UI. Run from the webroot root folder:

```bash
lsof -ti:8887 > /dev/null 2>&1 || \
  nohup workflow/env/bin/python3 workflow/comfyui/main.py \
    --port 8887 --cpu > workflow/comfy.log 2>&1 &
```

**IMPORTANT**: `--cpu` disables local GPU/model inference. All LLM calls go through
external APIs configured at http://localhost:8887/chat/keys/ (stored in local cache
or `docker/.env`). No local model checkpoint files are needed.

**What this command does:**
- Starts ComfyUI's aiohttp server on port 8887
- Serves the ComfyUI graph UI and REST/WebSocket API
- CPU-only mode — no local model loading
- Logs to `workflow/comfy.log`

**Before first use**, install Python dependencies into `workflow/env/` (one-time build):
```bash
workflow/env/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu
workflow/env/bin/pip install av --only-binary=:all:
workflow/env/bin/pip install -r workflow/comfyui/requirements.txt \
  --extra-index-url https://download.pytorch.org/whl/cpu
```
Note: `av` (video support) requires `pkg-config` + FFmpeg to build from source;
`--only-binary=:all:` installs the available binary wheel and skips video if unavailable.

### Start HTTP Server (Simple)
When you type "start http", run:

```bash
python -m http.server 8887
```

**What this command does:**
- Starts a basic Python HTTP server on port 8887
- Serves static files only (no server-side execution)
- Simpler alternative to quickstart.sh for basic file serving
- Blocks the terminal (server stops when you close the terminal or press Ctrl+C)

**Use this when:**
- You only need to serve static HTML/CSS/JS files
- You don't need server-side Python execution
- You want a quick, simple server for development

### Start Data Pipeline Flask Server
When you type "start pipeline", refer to [data-pipeline/AGENTS.md](../data-pipeline/AGENTS.md#start-data-pipeline-flask-server) for the complete command.

**Quick summary:**
- Starts Flask server on port 5001 for data pipeline operations
- Executes data pipeline nodes with automatic Python dependency installation
- Uses dedicated virtual environment in `data-pipeline/flask/env/`
- See data-pipeline/AGENTS.md for full implementation details

### Start Flask Server
When you type "start flask", first check which servers are running, then ask the user which Flask server they want to start:

**Check server status:**
```bash
# Check if data-pipeline Flask is running
PIPELINE_RUNNING=$(lsof -ti:5001 > /dev/null 2>&1 && echo "yes" || echo "no")

# Check if cloud run Flask is running
CLOUD_RUNNING=$(lsof -ti:8100 > /dev/null 2>&1 && echo "yes" || echo "no")
```

**Question:** "Which Flask server do you want to start?"

**Options (append " - Running" to labels if server is already running):**
1. **Data Pipeline (port 5001)** [+ " - Running" if $PIPELINE_RUNNING = "yes"] - Execute data pipeline nodes with dependency management
2. **Cloud Run (port 8100)** [+ " - Running" if $CLOUD_RUNNING = "yes"] - Execute Jupyter notebooks from GitHub for Google Cloud
3. **Both** - Start/restart both Flask servers

#### Option 1: Data Pipeline Flask Server
If the server is already running (port 5001 in use):
1. Stop the existing server: `lsof -ti:5001 | xargs kill`
2. Wait 2 seconds: `sleep 2`
3. Then start it using the command from [data-pipeline/AGENTS.md](../data-pipeline/AGENTS.md#start-data-pipeline-flask-server)

If the server is not running:
- Start it using the command from [data-pipeline/AGENTS.md](../data-pipeline/AGENTS.md#start-data-pipeline-flask-server)

#### Option 2: Cloud Run Flask Server
If the server is already running (port 8100 in use):
1. Stop the existing server: `lsof -ti:8100 | xargs kill`
2. Wait 2 seconds: `sleep 2`
3. Then proceed with the command from [cloud/AGENTS.md](../cloud/AGENTS.md#start-cloud-flask-server) (which will also ask if you want local development or Google Cloud deployment)

If the server is not running:
- Proceed with the command from [cloud/AGENTS.md](../cloud/AGENTS.md#start-cloud-flask-server)

#### Option 3: Both Flask Servers
Check each server and restart if running, start if not:

**For Data Pipeline (port 5001):**
- If running: Stop with `lsof -ti:5001 | xargs kill`, wait 2 seconds, then start
- If not running: Start directly

**For Cloud Run (port 8100):**
- If running: Stop with `lsof -ti:8100 | xargs kill`, wait 2 seconds, then start
- If not running: Start directly

Execute both start commands sequentially (data-pipeline first, then cloud run).

**Summary:**
- **Data Pipeline**: Port 5001, executes data pipeline nodes, auto-installs Python dependencies
- **Cloud Run**: Port 8100, executes Jupyter notebooks from GitHub, cloud deployment ready

### Start Rust API Server
When you type "start rust", use the startup method that matches your environment.

#### OpenAI Codex, Claude Code CLI, and Similar Agent Runners

Do **not** rely on detached child processes such as `nohup`, `screen`, or `setsid` here. In these agent-runner environments, the runner may clean them up after the parent command exits.

Instead, start the Rust API in a long-lived PTY session and keep that PTY open:

```bash
cd team
cargo run --bin partner_tools -- serve
```

After the PTY-backed process is live, verify with:

```bash
curl http://localhost:8081/api/health
```

#### Terminal Users

For a regular interactive terminal outside agent runners, use the start script (checks if already running, then starts if needed):

```bash
bash team/start-rust.sh
```

The script waits until `http://localhost:8081/api/health` responds before reporting success, so do not treat the first compile delay as a startup failure.

If you need to verify manually after startup, use:

```bash
curl http://localhost:8081/api/health
```

Note: The team repository is a submodule located in the repository root directory. The Rust API server runs on port 8081. Requires Rust/Cargo to be installed on the system. The .env file resides in the docker directory (docker/.env relative to root) and is created from .env.example only if it doesn't already exist. If port `8081` is already occupied by some other process, the script exits with an error instead of claiming the Rust API started successfully.

### Start .NET Server
When you type "start net", run:

```bash
bash host/net/net.sh start
```

Notes:
- The shared .NET host uses `host/net/` and serves the current webroot root as the site root.
- The shared `.NET 10` host is intended for everything outside `/net/` and `/core/` and defaults to port `8010`.
- The legacy `/net/` and `/core/` paths are expected to be served by a `.NET 4.x` backend on port `8004`.
- Shared settings are loaded from `docker/.env` through `host/net/net.sh`.
- If the SDK is missing, use `bash host/net/net.sh install-sdk` or `bash host/net/net.sh start --install-sdk`.
- See `host/net/NET.md` for install, legacy `net` / `core`, and nginx manifest guidance.

### Start Arts Engine / Chat Server
- `start art` — Arts Engine Axum Rust API in `requests/engine/rust-api/`; full command: `cargo run --manifest-path requests/engine/rust-api/Cargo.toml` (port 8082)
- `start chat` — see `chat/AGENTS.md` for the full command (`node chat/server.mjs`, port 8888). This starts the chat app and mounts the `sanity/` Next.js site at `/sanity`; first run: `pnpm --prefix chat install` and `bun --cwd sanity install`

### Restart Server
When you type "restart", run this single command to restart the server in seconds:
```bash
cd $(git rev-parse --show-toplevel) && pkill -f "node.*index.js"; (cd server && NODE_ENV=production nohup node index.js > /dev/null 2>&1 &)
```

## Git Workflow

### IMPORTANT: Git Commit Policy

**NEVER add Claude Code attribution or co-authored-by lines to commits**

- Git: only run push/pull via `./git.sh` and only commit/push when the user explicitly asks.

### Standard Git Workflow

**CRITICAL**: Always pull before pushing to ensure you have the latest changes and avoid conflicts.

**When asked to push:**
1. **Pull first**: `./git.sh pull` - Get latest changes from all repositories
2. **Push changes**: `./git.sh push` - Push changes to all modified repositories

**Merge conflicts**: Automatically resolve only when the solution is clear and unambiguous. For complex conflicts, analyze the specific issues and present resolution options for the user to choose from.

### Submodule Detached HEAD

After a pull, submodules will be in detached HEAD state because `git submodule update` checks out a pinned commit, not a branch. Before staging or committing work in a submodule, always reattach:

```bash
git -C <submodule> checkout main
```

### Submodule Version Conflicts

When `git.sh safe_submodule_update` detects that a submodule's local commit is older than the remote (origin/main), **do not silently overwrite local work**. Instead:

1. **Identify the divergence**: Compare the local submodule commit with origin/main to understand what changed on each side.
2. **Merge, don't replace**: Use your intelligence to merge the remote changes into the local submodule branch:
   ```bash
   git -C <submodule> checkout main
   git -C <submodule> merge origin/main
   ```
3. **Resolve conflicts intelligently**: If merge conflicts arise, analyze the diff and resolve them — keeping both the remote improvements and the user's local changes where possible.
4. **Commit the merge in the submodule**, then update the parent repo's submodule pointer to the merged commit.
5. **Never use "preserve local" as a reason to let the local (older) commit overwrite what is already on GitHub** — that would push a regression. Preserving local work means merging it forward, not pushing it backward over the remote.

**Goal**: The result should be a commit that is newer than both the local and remote versions, containing both sets of changes, pushed to the submodule's origin/main.

6. **Before pushing, if a merge or overwrite occurred**, provide a localhost review link so the user can inspect the result:
   - Ensure the HTTP server is running on port 8887 (start it if needed — see Start HTTP Server above)
   - Output the relevant localhost URL, e.g.:
     `http://localhost:8887/<submodule>/<changed-path>/`
   - Wait for the user to confirm before running `./git.sh push`
   - If no merge or overwrite occurred (already up to date), proceed with the push without waiting.

When push or pull requests are received, ask the user:

1. Use our easeful Github git.sh script to handle submodules with error handling. (recommended)
2. Send the request directly to Github

The ./git.sh commands are `./git.sh push` and `./git.sh pull`

**IMPORTANT**: Always navigate to the root folder before running git.sh (see Repository Root Navigation section)

### Push Reporting Guidelines

- In either push (git.sh or direct), include commit info
- Keep commit messages clean and focused on the actual changes
- **ONLY report what was pushed in the current push operation**
- Do NOT describe or reference previous commits or earlier implementations
- Focus on the specific files and changes that were just committed
- Keep push summaries factual and limited to the immediate operation
- **Do NOT assume a PR was created** when git.sh reports "fork workflow" — if the current account is a collaborator on the target repo, the push succeeds directly without a PR. Only mention a PR if git.sh explicitly confirms one was created.

### Pull / Pull All
When you type "pull" or "pull all" and choose workflow #1 (direct), run this comprehensive pull workflow that pulls from all parent repos, submodules, and site repos:

```bash
./git.sh pull
```

### Push Commands
When a user says "push [name]" and chooses option 1 (git.sh script):

```bash
./git.sh push [name] [nopr] [nopull]
```

**Options:**
- `nopr` - Skip PR creation on push failures
- `nopull` - Skip auto-pull before push (use when history has diverged, after git filter-repo, or when you need to force push)

**Clarification:** If the user owns the target repo and direct push is expected to succeed, use plain `./git.sh push` without appending `nopr`. Reserve `nopr` for cases where the user explicitly wants to suppress PR fallback behavior.

**When to use `nopull`:**
- After using `git filter-repo` to clean git history (histories have diverged)
- When you need to force push without pulling first
- When you know the local history is correct and should overwrite remote
- **Warning**: Only use when you understand the implications of not pulling first

### Claude-Enhanced Commit Messages
When Claude Code invokes git.sh push operations:

1. **Analyze changes** in each repository before invoking git.sh
2. **Create specific commit messages** for each repository based on its actual changes
3. **Pass commit data** via CLAUDE_COMMIT_DATA environment variable in YAML format
4. **ONLY include valid repositories**: root folder, submodules, and site repos

**YAML format example:**
```bash
export CLAUDE_COMMIT_DATA="
the-repo-name:
  message: 'Custom message for commit.'
  files: ['css/file.css']
"
```

**Push command examples:**
```bash
./git.sh push
./git.sh push all
./git.sh push team
./git.sh push $(basename $(git rev-parse --show-toplevel))
./git.sh push localsite
```

#### Commit Message Requirements:
- **Repository-specific**: Each commit message describes only that repository's changes
- **No cross-references**: Don't mention other repositories' changes in individual commits
- **No Claude attribution**: Never include Claude Code credits or co-authored-by lines
- **Concise and factual**: Focus on what was changed, not implementation details

#### Default Commit Messages (Non-Claude):
When git.sh is invoked without Claude, default commit messages follow this format:
- **Single file**: "Updated filename.ext"
- **Multiple files**: "Updated file1.ext, file2.ext, file3.ext..." (first 3 unique filenames)
- **Many files**: "Updated file1.ext, file2.ext, file3.ext..." (shows "..." for 4+ files)

### Quick Commands for Repositories
- **"push [name] [nopr]"**: Intelligent push with PR fallback - tries submodule → standalone repo → root folder fallback
- **"pull [name]"**: Pull changes for specific repository (root folder, submodule, or extra repo)
- **"PR [submodule name]"**: Create pull request workflow
- **"push submodules [nopr]"**: Push all submodules with PR fallback when push fails
- **"push forks [nopr]"**: Push all extra repo forks and create PRs to parent repos
- **"push [nopr]"** or **"push all [nopr]"**: Complete push workflow with PR fallback - pushes root folder, all submodules, and all forks

**PR Fallback Behavior**: All push commands automatically create pull requests when direct push fails due to permission restrictions. Add 'nopr' or 'No PR' (case insensitive) at the end of any push command to skip PR creation.

### GitHub Account Management
The git.sh script automatically detects the current GitHub CLI user and adapts accordingly:

```bash
gh auth logout                    # Log out of current GitHub account
gh auth login                     # Log into different GitHub account
./git.sh auth                     # Refresh git credentials and update all remotes
```

When you switch GitHub accounts, the script will:
- **Automatically detect** the new user during pull/push operations
- **Clear cached git credentials** from previous account
- **Refresh authentication** to use new GitHub CLI credentials  
- **Change remote URLs** to point to the new user's forks
- **Create PRs** from the new user's account
- **Fork repositories** to the new user's account when needed

## Submodule Management

This repository contains git submodules configured in `.gitmodules` including:
- **localsite** - https://github.com/ModelEarth/localsite
- **feed** - https://github.com/modelearth/feed  
- **swiper** - https://github.com/modelearth/swiper
- **home** - https://github.com/ModelEarth/home
- **products** - https://github.com/modelearth/products
- **comparison** - https://github.com/modelearth/comparison
- **team** - https://github.com/modelearth/team
- **projects** - https://github.com/modelearth/projects
- **realitystream** - https://github.com/modelearth/realitystream
- **cloud** - https://github.com/modelearth/cloud
- **trade** - https://github.com/modelearth/trade
- **codechat** - https://github.com/modelearth/codechat
- **exiobase** - https://github.com/modelearth/exiobase
- **io** - https://github.com/modelearth/io
- **profile** - https://github.com/modelearth/profile
- **reports** - https://github.com/modelearth/reports
- **community-forecasting** - https://github.com/modelearth/community-forecasting

**IMPORTANT**: All directories listed above are git submodules, not regular directories. They appear as regular directories when browsing but are actually git submodule references. Always treat them as submodules in git operations.

### Upstream Repository Policy
**CRITICAL**: The maximum upstream level for all repositories is `modelearth`

- **Root folder and Submodules**: Upstream should point to `modelearth` or `ModelEarth` repositories only
- **Industry Repositories**: Upstream should point to `modelearth` repositories only  
- **Repository Hierarchy**: `user-fork` → `modelearth` (STOP - do not go higher)

### Repository Root Navigation
The CLI session is already pointed to the root folder directory. Do **not** prefix commands with `cd $(git rev-parse --show-toplevel)` — the `$()` substitution triggers unnecessary approval prompts. All `./git.sh` commands can be run directly.

To verify you're in the correct root repository:
```bash
git remote -v
# Should show: origin pointing to the root repo (folder name matches repo name)
```

**IMPORTANT FILE PATH POLICY**:
- **NEVER hardcode specific file paths** from any user's computer in code or documentation
- **NEVER include paths like `/Users/username/` or `C:\Users\`** in any commands or examples
- Always use relative paths, environment variables, or git commands to determine paths dynamically

### Supported Repository Names
- **Root repo**: current folder name — use `git remote -v` or `pwd` to confirm, not `$(basename $(git rev-parse --show-toplevel))`
- **Submodules**: Defined in `.gitmodules` file
- **Site Repos**: Defined in `.siterepos` file

## Site Repositories

### Site Repo List
Site repositories are used for specialized functionality and are cloned to the root folder directory (not submodules). These repositories are defined in the `.siterepos` file in the root folder using the same format as `.gitmodules`.

**IMPORTANT**: These site repos are cloned to the root folder directory and are NOT submodules. They provide specialized functionality that is only needed for the current instance of the root folder.

**Submodule note**: `data-pipeline` is a submodule (defined in `.gitmodules`) and should not be included in `.siterepos`.

## Development Standards

Unless instructed otherwise, create generic processes that are reusable using generic terms. 
Generic term examples in use: geoDataset and jsonList.
Transition away from the term "participants" to use "list" and other generic terms for any type of dataset.
The term "stream" will be used for a wide variety of parameter objects, including the variables from parameters.yaml which define feature datasets and a target dataset.

### Navigation Guidelines
- **Directory Restrictions**: If the user requests `cd ../`, first check if you are already in the root folder. If so, ignore the request so errors do not appear.
- **Root Detection**: Use `git rev-parse --show-toplevel` to determine the root folder
- **Security Boundaries**: Claude Code sessions are restricted to working within the root folder and its subdirectories

## Quick Commands

When you type "quick", add the following permissions block to setting.local.json under allow.
When you type "confirm" or "less quick", remove it:
```json
[
  "Bash(yarn setup)",
  "Bash(npx update-browserslist-db:*)",
  "Bash(mkdir:*)",
  "Bash(yarn build)",
  "Bash(cp:*)",
  "Bash(npx prisma generate:*)",
  "Bash(npx prisma migrate:*)",
  "Bash(pkill:*)",
  "Bash(curl:*)",
  "Bash(git submodule add:*)",
  "Bash(rm:*)",
  "Bash(find:*)",
  "Bash(ls:*)",
  "Bash(git add:*)",
  "Bash(git commit:*)",
  "Bash(git push:*)"
]
```

## Project Vision & Requirements

This is a **project posting, assignment and to-do tracking system** - an all-in-one partner tool for managing public-facing listings with searchable directories. The system enables collaboration between teams, organizations and clients to share opportunities, handle proposals, assign projects, and track progress.

Commons Database SQL schema overview:
- `/profile/crm`

### Core Features Required
1. **Project Management**: Post activities, join projects, track progress
2. **Team Collaboration**: Account-based teams and organizations  
3. **Directory System**: Searchable public listings with pagination
4. **Survey System**: Policy preferences and interests with 5-star ratings
5. **Auth Integration**: Google, GitHub, LinkedIn, email login + Admin Demo bypass
6. **AI Integration**: Smart insights and natural language search

## Architecture Overview

### Backend (Rust)
- **REST API Server**: Actix-web based HTTP server at `src/main.rs`
- **Database Layer**: PostgreSQL using SQLx with async connection pooling
- **CLI Interface**: Clap-based command structure with `serve` and `init-db` subcommands
- **Gemini AI Integration**: Uses `gemini_client_rust` for Google Gemini API

### Frontend (JAM Stack JavaScript)
- **Design Philosophy**: Notion-inspired aesthetic - modular, calm, ultra-minimal
- **Color Palette**: Light green, pastel blue, muted orange accents on neutral background (#F9FAFB)
- **Navigation**: Collapsible left sidebar with smooth animations
- **Routing**: HashRouter for static compatibility with deep linking support
- **No Build Required**: Frontend works directly without compilation
- **Favicon**: All HTML pages should include favicon with relative path to `img/logo/neighborhood/favicon.png`

#### Favicon Implementation
All HTML pages should include this favicon tag in the `<head>` section:
```html
<link rel="icon" type="image/x-icon" href="[relative-path]/img/logo/neighborhood/favicon.png">
```

**Relative Path Examples:**
- Root level pages: `href="img/logo/neighborhood/favicon.png"`
- Admin pages: `href="../img/logo/neighborhood/favicon.png"`
- Nested admin pages: `href="../../img/logo/neighborhood/favicon.png"`
- Deep nested pages: `href="../../../img/logo/neighborhood/favicon.png"`

### Database Schema
Complete CRM schema based on SuiteCRM/Salesforce structure:
- Core entities: users, accounts, contacts, leads, opportunities, projects
- Support entities: campaigns, documents, events, products, roles, calls
- Survey system: surveys, surveyquestionoptions, surveyquestionresponses
- Relationship tables for many-to-many associations
- All tables use UUID primary keys and include audit fields

### Environment Configuration
1. **Primary Database**: PostgreSQL (Azure/Google compatible) - COMMONS_HOST in .env file
2. **Trade Flow Database**: PostgreSQL (Azure/Google compatible) - EXIOBASE_HOST in .env file
3. **Fallback Handling**: When database connection fails, populate with informative placeholders rather than errors
4. **Security**: Store auth keys in separate config file excluded by `.gitignore`

### Web Server Configuration
The frontend can be served in two different configurations:

1. **Direct Repo Serving**: Web server points directly to the PartnerTools repository root
   - URLs: `http://localhost:8888/admin/import-data.html`
   - File paths: `preferences/projects/DFC-ActiveProjects.xlsx`

2. **Root Folder Container**: Repository is placed inside the root folder
   - URLs: `http://localhost:8887/team/admin/import-data.html`
   - File paths: `team/preferences/projects/DFC-ActiveProjects.xlsx`
   - Browser relative paths: `../preferences/projects/DFC-ActiveProjects.xlsx`

Root Folder Container (port 8887) is preferred since other repos can then reside in the same root folder.

### Key Dependencies
- **actix-web**: Web framework
- **sqlx**: Database toolkit with PostgreSQL driver
- **gemini_client_rust**: Gemini AI integration
- **tokio**: Async runtime
- **clap**: CLI argument parsing
- **serde**: Serialization framework
- **uuid**: UUID generation
- **chrono**: Date/time handling

### File Structure
- `src/main.rs` - Single-file application containing all logic
- `sql/suitecrm-postgres.sql` - Database schema reference  
- `projects/edit.html` - Frontend template
- `.bolt/prompt` - Original project specifications
- `Cargo.toml` - Project configuration and dependencies

### Database Initialization
Run `cargo run -- init-db` to create all tables with proper relationships and constraints. The schema supports full CRM functionality with foreign key relationships between entities.
