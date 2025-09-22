# SQL Team - Rust API CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI CLI processes.
It applies to both this "team" submodule and its parent webroot and the webroot's other child repos and submodules.

## Development Commands

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

### Start HTTP Server
When you type "start server", first check if server is already running, then start only if needed:

```bash
# Check if HTTP server is already running on port 8887
if lsof -ti:8887 > /dev/null 2>&1; then
  echo "HTTP server already running on port 8887"
else
  nohup python -m http.server 8887 > /dev/null 2>&1 &
  echo "Started HTTP server on port 8887"
fi
```

Note: Uses nohup to run server in background and redirect output to avoid timeout.

### Start Rust API Server
When you type "start rust", first check if server is already running, then start only if needed:

```bash
# Check if Rust API server is already running on port 8081
if lsof -ti:8081 > /dev/null 2>&1; then
  echo "Rust API server already running on port 8081"
else
  cd team
  # Ensure Rust is installed and cargo is in PATH
  source ~/.cargo/env 2>/dev/null || echo "Install Rust first: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  # Copy .env.example to .env only if .env doesn't exist
  [ ! -f .env ] && cp .env.example .env
  # Start the server with correct binary name
  nohup cargo run --bin partner_tools -- serve > server.log 2>&1 &
  echo "Started Rust API server on port 8081"
fi
```

Note: The team repository is a submodule located in the repository root directory. The Rust API server runs on port 8081. Requires Rust/Cargo to be installed on the system. The .env file is created from .env.example only if it doesn't already exist.

### Restart Server
When you type "restart", run this single command to restart the server in seconds:
```bash
cd $(git rev-parse --show-toplevel) && pkill -f "node.*index.js"; (cd server && NODE_ENV=production nohup node index.js > /dev/null 2>&1 &)
```

## Git Workflow

### IMPORTANT: Git Commit Policy
**NEVER commit changes without an explicit user request starting with push or sync.** 

- Only run git commands (add, commit, push) when the user specifically says "push" or directly requests it
- After making code changes, STOP and wait for user instruction
- Build and test changes as needed, but do not commit automatically
- The user controls when changes are committed to the repository

### Git Command Guidelines
- **Always Use git.sh**: When receiving "push" and "pull" requests, always use `./git.sh push` and `./git.sh pull` to avoid approval prompts
- **Avoid Direct Git Commands**: Do not use individual git commands like `git add`, `git commit`, `git push` for these operations
- **Automatic Workflow**: The git.sh script handles the complete workflow including submodules, remotes, and error handling automatically

### Git Commit Guidelines
- **NEVER add Claude Code attribution or co-authored-by lines to commits**
- **NEVER add "🤖 Generated with [Claude Code]" or similar footers**
- Keep commit messages clean and focused on the actual changes
- Include a brief summary of changes in the commit text

### Push Reporting Guidelines
- **ONLY report what was pushed in the current push operation**
- Do NOT describe or reference previous commits or earlier implementations
- Focus on the specific files and changes that were just committed
- Keep push summaries factual and limited to the immediate operation

### Pull / Pull All
When you type "pull" or "pull all", run this comprehensive pull workflow that pulls from all parent repos, submodules and industry repos:

```bash
./git.sh pull
```

**Legacy Support**: If the user types "update", inform them to use "pull" or "pull all" instead:

*"Please use 'pull' or 'pull all' instead of 'update'. Examples:*
- *pull - Pull all changes from webroot, submodules, and industry repos*
- *pull localsite - Pull changes for localsite submodule only*
- *pull webroot - Pull changes for webroot only"*

### Push Commands
When a user says "push [name]", use the git.sh script:

```bash
./git.sh push [name] [nopr]
```

**Legacy Support**: If the user says "commit [name]", inform them to use "push [name]" instead:

*"Please use 'push [name]' instead of 'commit [name]'. Examples:*
- *push localsite - Push changes for localsite submodule*
- *push webroot - Push changes for webroot only*
- *push all - Push all repositories with changes"*

### Quick Commands for Repositories
- **"push [name] [nopr]"**: Intelligent push with PR fallback - tries submodule → standalone repo → webroot fallback
- **"pull [name]"**: Pull changes for specific repository (webroot, submodule, or extra repo)
- **"PR [submodule name]"**: Create pull request workflow
- **"push submodules [nopr]"**: Push all submodules with PR fallback when push fails
- **"push forks [nopr]"**: Push all extra repo forks and create PRs to parent repos
- **"push [nopr]"** or **"push all [nopr]"**: Complete push workflow with PR fallback - pushes webroot, all submodules, and all forks

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

This repository contains the following git submodules configured in `.gitmodules`:
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

- **Webroot and Submodules**: Upstream should point to `modelearth` or `ModelEarth` repositories only
- **Industry Repositories**: Upstream should point to `modelearth` repositories only  
- **Repository Hierarchy**: `user-fork` → `modelearth` (STOP - do not go higher)

### Repository Root Navigation
**CRITICAL**: Always ensure you're in the webroot repository before executing any commands. The CLI session is pointed to the webroot directory, and all operations must start from there:

```bash
# ALWAYS navigate to webroot repository root first (required for all operations)
cd $(git rev-parse --show-toplevel)

# Verify you're in the correct webroot repository
git remote -v
# Should show: origin https://github.com/ModelEarth/webroot.git
```

**IMPORTANT FILE PATH POLICY**: 
- **NEVER hardcode specific file paths** from any user's computer in code or documentation
- **NEVER include paths like `/Users/username/` or `C:\Users\`** in any commands or examples
- Always use relative paths, environment variables, or git commands to determine paths dynamically

### Supported Repository Names
- **Webroot**: webroot
- **Submodules**: cloud, comparison, feed, home, localsite, products, projects, realitystream, swiper, team, trade, codechat, exiobase, io, profile, reports, community-forecasting
- **Extra Repos**: community, nisar, data-pipeline

## Extra Repositories

### Extra Repo List
The following extra repositories are used for specialized functionality and are cloned to the webroot root directory (not submodules):
- **community** - https://github.com/modelearth/community
- **nisar** - https://github.com/modelearth/nisar
- **data-pipeline** - https://github.com/modelearth/data-pipeline

**IMPORTANT**: These extra repos are cloned to the webroot root directory and are NOT submodules. They provide specialized functionality that is not needed for typical site deployments.

## Development Standards

### HTML File Standards
**UTF-8 Character Encoding**: Always include `<meta charset="UTF-8">` in the `<head>` section of new HTML pages to ensure proper character rendering and prevent display issues with special characters.

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <!-- other meta tags and content -->
</head>
```

**Exceptions**: Do not add charset declarations to redirect pages or template fragments that are included in other pages, as they inherit encoding from their parent documents.

### DOM Element Waiting
- **NEVER use setTimeout() for waiting for DOM elements**
- **ALWAYS use waitForElm(selector)** from localsite/js/localsite.js instead
- Check if localsite/js/localsite.js is included in the page before using waitForElm
- If not included, ask user if localsite/js/localsite.js should be added to the page
- Example: `waitForElm('#element-id').then(() => { /* code */ });`
- waitForElm does not use timeouts and waits indefinitely until element appears

### Navigation Guidelines
- **Directory Restrictions**: If the user requests `cd ../`, first check if you are already in the webroot. If so, ignore the request so errors do not appear.
- **Webroot Detection**: Use `git rev-parse --show-toplevel` or check current working directory against webroot patterns
- **Security Boundaries**: Claude Code sessions are restricted to working within the webroot and its subdirectories

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

2. **Webroot Container**: Repository is placed inside a webroot folder
   - URLs: `http://localhost:8887/team/admin/import-data.html`
   - File paths: `team/preferences/projects/DFC-ActiveProjects.xlsx`
   - Browser relative paths: `../preferences/projects/DFC-ActiveProjects.xlsx`

Webroot Container (port 8887) is preferred since other repos can then reside in the same webroot.

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