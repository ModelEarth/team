# Guidance for Webroot, Python Servers and Rust API

This file provides guidance to Claude Code (claude.ai/code) and other AI CLI processes.
It applies to both this "team" submodule and its parent root folder and the root folder's other child repos and submodules.

## Development Commands

For pull, push and submodules, see the webroot's [AGENTS.md](../AGENTS.md) (or https://github.com/ModelEarth/webroot/blob/main/AGENTS.md when `team` is cloned on its own). [AGENTS-GitSh.md](AGENTS-GitSh.md) covers the git.sh scripted workflow, which is no longer used unless "git.sh" is directly requested.

## .NET / C#

Use [NET.md](../host/net/NET.md) for the shared .NET workflow across this webroot:
- `net/` is legacy ASP.NET Web Forms / .NET Framework-era code.
- `core/` is legacy .NET Core-era code.
- `host/net/` is the newer cross-platform .NET host for local development.
- The legacy `net/` and `core/` modules are intended to share a separate `.NET 4.x` backend on port `8004`.
- Shared local .NET settings should go in the `.env` set by `env_file` in `automation/paths.yaml` (outside webroot), not new XML-only local config files.

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
- Checks for Claude API key configuration in the `.env` set by `env_file` in `automation/paths.yaml`
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
or the `.env` set by `automation/paths.yaml`). No local model checkpoint files are needed.

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

Note: The team repository is a submodule located in the repository root directory. The Rust API server runs on port 8081. Requires Rust/Cargo to be installed on the system. Settings come from the `.env` named by `env_file` in `CloudRoot/automation/paths.yaml`, or the webroot's `automation/paths.yaml` when CloudRoot isn't present; the script warns if neither exists. If port `8081` is already occupied by some other process, the script exits with an error instead of claiming the Rust API started successfully.

### Start .NET Server
When you type "start net", run:

```bash
bash host/net/net.sh start
```

Notes:
- The shared .NET host uses `host/net/` and serves the current webroot root as the site root.
- The shared `.NET 10` host is intended for everything outside `/net/` and `/core/` and defaults to port `8010`.
- The legacy `/net/` and `/core/` paths are expected to be served by a `.NET 4.x` backend on port `8004`.
- Shared settings are loaded from the `.env` set by `automation/paths.yaml` through `host/net/net.sh`.
- If the SDK is missing, use `bash host/net/net.sh install-sdk` or `bash host/net/net.sh start --install-sdk`.
- See `host/net/NET.md` for install, legacy `net` / `core`, and nginx manifest guidance.

### Start Arts Engine / Chat Server
- `start art` — Arts Engine Axum Rust API in `requests/engine/rust-api/`; full command: `cargo run --manifest-path requests/engine/rust-api/Cargo.toml` (port 8082)
- `start chat` — **ask the user which mode first: webroot or chat repo** (see `chat/AGENTS.md`). Webroot mode = `node chat/server.mjs` from the webroot root (port **3700**; serves the chat app + sibling static repos). Chat-repo mode = `pnpm --prefix chat dev` (port **3700**; chat app only). In both, the chat app is at the server root — no `/chat` repo prefix. First run: `pnpm --prefix chat install`

### Start Workflow
When you type "start workflow", run both steps below from the webroot root folder:

**1. Start server** (Python / ComfyUI on port 8887 — Option 3 above):
```bash
lsof -ti:8887 > /dev/null 2>&1 || \
  nohup workflow/env/bin/python3 workflow/comfyui/main.py \
    --port 8887 --cpu > workflow/comfy.log 2>&1 &
```

**2. Start chat** (Node.js on port 3700 — see `chat/AGENTS.md`):
```bash
lsof -ti:3700 > /dev/null 2>&1 || \
  nohup node chat/server.mjs > /tmp/chat-dev.log 2>&1 &
```

**3. Start comfyui-deploy** (port 3001 — only if `CLERK_SECRET_KEY` is in the `.env` set by `automation/paths.yaml`):
```bash
export ENV_FILE="automation/$(sed -n 's/^[[:space:]]*env_file:[[:space:]]*//p' automation/paths.yaml | sed 's/[[:space:]]#.*$//; s/["'\'']//g')"
grep -q "CLERK_SECRET_KEY=sk_" "$ENV_FILE" 2>/dev/null && \
  { lsof -ti:3001 > /dev/null 2>&1 || \
    nohup bash -c 'set -a; source "$ENV_FILE"; set +a; PORT=3001 pnpm --prefix workflow/comfyui-deploy/web dev' \
      > /tmp/comfydeploy-dev.log 2>&1 &; }
```

comfyui-deploy does not auto-load the `.env`, so Clerk keys must be sourced explicitly.

Then confirm all are up:
```bash
sleep 6 && curl -s http://localhost:8887/system_stats | head -1 && \
  curl -s -o /dev/null -w "chat: %{http_code}\n" http://localhost:3700 && \
  curl -s -o /dev/null -w "deploy: %{http_code}\n" http://localhost:3001
```

### Restart Server
When you type "restart", run this single command to restart the server in seconds:
```bash
cd $(git rev-parse --show-toplevel) && pkill -f "node.*index.js"; (cd server && NODE_ENV=production nohup node index.js > /dev/null 2>&1 &)
```

## Git, Submodules and Site Repos

Pull, push, submodule and site repo guidance is in the webroot's [AGENTS.md](../AGENTS.md) (or https://github.com/ModelEarth/webroot/blob/main/AGENTS.md when `team` is cloned on its own) under "Git: Pull, Push and Submodules".

## Development Standards

Unless instructed otherwise, create generic processes that are reusable using generic terms. 
Generic term examples in use: geoDataset and jsonList.
Transition away from the term "participants" to use "list" and other generic terms for any type of dataset.
The term "stream" will be used for a wide variety of parameter objects, including the variables from parameters.yaml which define feature datasets and a target dataset.

### Navigation Guidelines
- **Directory Restrictions**: If the user requests `cd ../`, first check if you are already in the root folder. If so, ignore the request so errors do not appear.
- **Root Detection**: Use `git rev-parse --show-toplevel` to determine the root folder
- **Security Boundaries**: Claude Code sessions are restricted to working within the root folder and its subdirectories
- **OUTSIDE WEBROOT**: Before executing any process that writes or modifies files outside the webroot root folder, state "OUTSIDE WEBROOT" and wait for confirmation.

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
   - URLs: `http://localhost:3700/admin/import-data.html`
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
