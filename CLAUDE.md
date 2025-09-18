# SQL Team - Rust API CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Github
- "commit [submodule name]" pushes updates to both the submodule on GitHub and the upstream parent on GitHub. If the user does not have collaborator privileges to update the upstream parent, submit a PR instead.
- Avoid auto-adding claude info to commits
- Include a brief summary of changes in the commit text
- Allow up to 12 minutes to pull repos

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


Moved here from root claude.md

## Start server or Restart server

### Start Server
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

### Pull submodules:
When you type "pull submodules", run
```bash
# Navigate to webroot first
cd $(git rev-parse --show-toplevel)
git submodule update --remote --recursive
```

### Push submodules:
When you type "push submodules", run
```bash
./git.sh push submodules [nopr]
```
**Note**: This pushes all submodules with changes AND updates the webroot parent repository with new submodule references. Includes automatic PR creation on push failures.

### PR [submodule name]:
Create a pull request for a submodule when you lack collaborator privileges:
```bash
cd [submodule name]
git add . && git commit -m "Description of changes"
git push origin feature-branch-name
gh pr create --title "Update [submodule name]" --body "Description of changes"
cd ..
```

## IMPORTANT: Git Commit Policy

**NEVER commit changes without an explicit user request starting with push or sync.** 

- Only run git commands (add, commit, push) when the user specifically says "push" or directly requests it
- After making code changes, STOP and wait for user instruction
- Build and test changes as needed, but do not commit automatically
- The user controls when changes are committed to the repository

## HTML File Standards

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

## Comprehensive Pull Command

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

All complex git operations are now handled by the git.sh script to avoid shell parsing issues.

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

**Automatic Credential Management:**
- Detects when GitHub user has changed since last run
- Clears cached credentials from credential manager and macOS keychain
- Runs `gh auth setup-git` to sync git with GitHub CLI
- Prevents permission denied errors from stale credentials

**Pull Command Features:**
- **Pull from Parents**: Pulls webroot, submodules, and industry repos from their respective ModelEarth parent repositories
- **Fork-Aware**: Automatically adds upstream remotes for parent repos when working with forks
- **Partnertools Exclusion**: Completely skips any repositories associated with partnertools GitHub account
- **Merge Strategy**: Uses automatic merge with no-edit to incorporate upstream changes
- **Conflict Handling**: Reports merge conflicts for manual resolution when they occur  
- **Status Reporting**: Provides clear feedback on what was pulled and any issues encountered
- **Push Guidance**: Prompts user with specific commands for pushing changes back to forks and parent repos
- **Comprehensive Workflow**: Handles webroot, all submodules, and all industry repositories in one command

**Post-Pull Recommendations:**
After running "./git.sh pull", review changes and use these commands as needed:
- `./git.sh push` - Push all changes (webroot + submodules + forks) with PR creation
- `./git.sh push submodules` - Push only submodule changes  
- `./git.sh push [specific-name]` - Push changes for a specific repository

**Git.sh Usage:**
```bash
./git.sh pull                      # Full pull workflow  
./git.sh push                      # Complete push: webroot, all submodules, and industry repos
./git.sh push [name]               # Push specific submodule
./git.sh push submodules           # Push all submodules only
./git.sh push [name] nopr          # Skip PR creation on push failures
```

**Individual Repository Commands:**
```bash
./git.sh pull [repo_name]          # Pull specific repository (webroot, submodule, or industry repo)
./git.sh push [repo_name]          # Push specific repository (webroot, submodule, or industry repo)
```

**Supported Repository Names:**
- **Webroot**: webroot
- **Submodules**: cloud, comparison, feed, home, localsite, products, projects, realitystream, swiper, team, trade
- **Industry Repos**: exiobase, profile, io


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

**Example Correct Upstream Configuration:**
```bash
# Correct upstream configuration
git remote add upstream https://github.com/modelearth/trade.git
git remote add upstream https://github.com/ModelEarth/webroot.git
```

**Pull Workflow Impact:**
- The `./git.sh pull` command respects this policy and only pulls from modelearth-level repositories
- If any upstream is incorrectly configured to point above modelearth level, it must be corrected
- This prevents conflicts from pulling changes from repositories outside the modelearth ecosystem

**GitHub Pages Integration:**
- When creating webroot PRs, the system automatically checks for GitHub Pages on the user's fork
- If GitHub Pages is not enabled, it attempts to enable it automatically using the GitHub CLI
- PRs include live preview links to `[username].github.io/webroot` for easy review
- If automatic setup fails, users receive manual setup instructions and interactive options:
  - **Y** - Continue with PR creation (recommended)
  - **N** - Skip PR creation and continue with commit only
  - **Q** - Quit without creating PR or committing

### Repository Root Navigation
**CRITICAL**: Always ensure you're in the webroot repository before executing any commands. The CLI session is pointed to the webroot directory, and all operations must start from there:

```bash
# ALWAYS navigate to webroot repository root first (required for all operations)
cd $(git rev-parse --show-toplevel)

# Verify you're in the correct webroot repository
git remote -v
# Should show: origin https://github.com/ModelEarth/webroot.git

# If git rev-parse returns the wrong repository (submodule/trade repo), manually navigate to webroot
# Use your system's webroot path, never hardcode paths in documentation
```

**IMPORTANT FILE PATH POLICY**: 
- **NEVER hardcode specific file paths** from any user's computer in code or documentation
- **NEVER include paths like `/Users/username/` or `C:\Users\`** in any commands or examples
- Always use relative paths, environment variables, or git commands to determine paths dynamically
- Use `$(git rev-parse --show-toplevel)` when already in the correct repository context
- If `git rev-parse --show-toplevel` returns incorrect paths (submodule/trade repo instead of webroot), navigate up to webroot directory. Some users may give their webroot a different folder name than "webroot"

**IMPORTANT**: The `git rev-parse --show-toplevel` command returns the top-level directory of whatever git repository you're currently in. If you're inside a submodule or trade repo, it will return that repository's root instead of the webroot. In such cases, you must manually navigate to your actual webroot directory location on your system.

**Common Issue**: If submodule commands fail or you get "pathspec did not match" errors, you're likely in a submodule directory instead of the webroot. Navigate back to your webroot directory using your system's actual webroot path before running any commands.

### IMPORTANT: "push [name]" Command Requirements
When a user says "push [name]", use the git.sh script:

```bash
./git.sh push [name] [nopr]
```

**Legacy Support**: If the user says "commit [name]", inform them to use "push [name]" instead:

*"Please use 'push [name]' instead of 'commit [name]'. Examples:*
- *push localsite - Push changes for localsite submodule*
- *push webroot - Push changes for webroot only*
- *push all - Push all repositories with changes"*

The git.sh script handles all the complex logic including:
- Submodule detection and pushing
- Automatic PR creation on push failures  
- Webroot submodule reference updates
- Support for 'nopr' flag to skip PR creation

**Direct Commit Method (if foreach strategy fails):**

Used when the `git submodule foreach` strategy fails, such as:
- **Detached HEAD state**: Submodule is not on a proper branch
- **Corrupted submodule**: `.git` folder or configuration is damaged
- **Branch conflicts**: Submodule is on a different branch than expected
- **Nested submodules**: Complex submodule hierarchies that confuse foreach
- **Permission issues**: File system permissions prevent git operations within submodules

**⚠️ IMPORTANT**: Do not initialize new submodules unless explicitly requested by the user. If a directory exists but is not properly initialized as a submodule, treat it as a standalone repository or ignore it rather than converting it to a submodule.

```bash
# Step 0: ALWAYS start from webroot
cd $(git rev-parse --show-toplevel)

# Direct submodule commit (when foreach method doesn't work)
cd [submodule name]
git checkout main  # Ensure on main branch (fixes detached HEAD)
git add . && git commit -m "Description of changes"
if git push origin main; then
  echo "✅ Successfully pushed [submodule name] submodule"
elif [ "$SKIP_PR" != "true" ]; then
  git push origin HEAD:feature-[submodule name]-direct && gh pr create --title "Update [submodule name] submodule" --body "Direct update of [submodule name] submodule" --base main --head feature-[submodule name]-direct || echo "PR creation failed"
  echo "🔄 Created PR for [submodule name] submodule due to permission restrictions"
fi

# Return to webroot and update submodule reference
cd $(git rev-parse --show-toplevel)
git submodule update --remote [submodule name]
git add [submodule name]
git commit -m "Update [submodule name] submodule" 
if git push; then
  echo "✅ Successfully updated [submodule name] submodule reference"
elif [ "$SKIP_PR" != "true" ]; then
  git push origin HEAD:feature-webroot-[submodule name]-ref && gh pr create --title "Update [submodule name] submodule reference" --body "Update submodule reference for [submodule name]" --base main --head feature-webroot-[submodule name]-ref || echo "Webroot PR creation failed"
  echo "🔄 Created PR for webroot [submodule name] submodule reference"
fi
```

**⚠️ CRITICAL**: 
- Automatic PR creation when push permissions are denied
- 'nopr' or 'No PR' (case insensitive) flag to skip PR creation
- All commit commands include PR fallback for permission failures
- Intelligent fallback strategy handles unrecognized names gracefully
- Three-tier approach: submodule → standalone repo → webroot fallback
- Always checks for actual changes before committing
- Provides clear success/failure feedback with ✅ and 🔄 indicators
- **NEVER initialize new submodules unless explicitly requested by user**
- **NEVER convert existing directories to submodules automatically**
- Method 1 handles detached HEAD states automatically
- Both methods require updating the parent repository
- If git submodule foreach fails, the submodule may not exist or be corrupted
- Always check status first to see which submodules actually have changes
- Use conditional `if [ "$name" = "submodule" ]` to target specific submodule and avoid "nothing to commit" errors from clean submodules
- The `--recursive` flag ensures nested submodules are handled properly
- Requires GitHub CLI (gh) for PR creation functionality

### Quick Commands for Repositories
- **"push [name] [nopr]"**: Intelligent push with PR fallback - tries submodule → standalone repo → webroot fallback
- **"pull [name]"**: Pull changes for specific repository (webroot, submodule, or extra repo)
- **"PR [submodule name]"**: Create pull request workflow
- **"push submodules [nopr]"**: Push all submodules with PR fallback when push fails
- **"push forks [nopr]"**: Push all extra repo forks and create PRs to parent repos
- **"push [nopr]"** or **"push all [nopr]"**: Complete push workflow with PR fallback - pushes webroot, all submodules, and all forks

**PR Fallback Behavior**: All push commands automatically create pull requests when direct push fails due to permission restrictions. Add 'nopr' or 'No PR' (case insensitive) at the end of any push command to skip PR creation.

**Legacy Command Support**: If users type "commit" or "update", inform them of the new commands:
- "commit" → "push" 
- "update" → "pull" or "pull all"

When displaying "Issue Resolved" use the same checkbox icon as "Successfully Updated"

### Additional Notes
- Allow up to 12 minutes to pull repos (large repositories)
- Always verify both submodule AND parent repository are updated

## Git Commit Guidelines
- **NEVER add Claude Code attribution or co-authored-by lines to commits**
- **NEVER add "🤖 Generated with [Claude Code]" or similar footers**
- Keep commit messages clean and focused on the actual changes
- Include a brief summary of changes in the commit text

## DOM Element Waiting
- **NEVER use setTimeout() for waiting for DOM elements**
- **ALWAYS use waitForElm(selector)** from localsite/js/localsite.js instead
- Check if localsite/js/localsite.js is included in the page before using waitForElm
- If not included, ask user if localsite/js/localsite.js should be added to the page
- Example: `waitForElm('#element-id').then(() => { /* code */ });`
- waitForElm does not use timeouts and waits indefinitely until element appears

## Navigation Guidelines
- **Directory Restrictions**: If the user requests `cd ../`, first check if you are already in the webroot. If so, ignore the request so errors do not appear.
- **Webroot Detection**: Use `git rev-parse --show-toplevel` or check current working directory against `/Users/helix/Library/Data/webroot` pattern
- **Security Boundaries**: Claude Code sessions are restricted to working within the webroot and its subdirectories

## Git Command Guidelines
- **Always Use git.sh**: When receiving "push" and "pull" requests, always use `./git.sh push` and `./git.sh pull` to avoid approval prompts
- **Avoid Direct Git Commands**: Do not use individual git commands like `git add`, `git commit`, `git push` for these operations
- **Automatic Workflow**: The git.sh script handles the complete workflow including submodules, remotes, and error handling automatically

## Quick Commands

When you type "restart", run this single command to restart the server in seconds:
```bash
cd $(git rev-parse --show-toplevel) && pkill -f "node.*index.js"; (cd server && NODE_ENV=production nohup node index.js > /dev/null 2>&1 &)
```

When you type "quick", add the following permissions block to setting.local.json under allow. "
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

## Extra Repositories

### Extra Repo List
The following extra repositories are used for specialized functionality and are cloned to the webroot root directory (not submodules):
- **community** - https://github.com/modelearth/community
- **nisar** - https://github.com/modelearth/nisar
- **data-pipeline** - https://github.com/modelearth/data-pipeline

**IMPORTANT**: These extra repos are cloned to the webroot root directory and are NOT submodules. They provide specialized functionality that is not needed for typical site deployments.

### Fork Extra Repos

```bash
fork extra repos to [your github account]
```

The above runs these commands:
```bash
# Fork repositories using GitHub CLI (requires 'gh' to be installed and authenticated)
gh repo fork modelearth/community --clone=false
gh repo fork modelearth/nisar --clone=false
gh repo fork modelearth/data-pipeline --clone=false
```

### Clone Extra Repos

```bash
clone extra repos from [your github account]
```

The above runs these commands:
```bash
# Navigate to webroot repository root first
cd $(git rev-parse --show-toplevel)

# Clone extra repos to webroot root
git clone https://github.com/[your github account]/community community
git clone https://github.com/[your github account]/nisar nisar
git clone https://github.com/[your github account]/data-pipeline data-pipeline
```

End of moved here from root claude.md


**Note for Development**: The server gracefully handles database connection failures and will start successfully even without a database connection. These environment variable exports are only needed if you want to override blank or invalid .env database settings. When no database is available, OAuth and non-database features work normally, while database-dependent features will return appropriate error messages.

### Alternative Commands (NOT RECOMMENDED)
- `cargo run serve` - Blocks terminal, stops when you exit (DO NOT USE)
- `cargo run -- serve` - Same issue, blocks terminal (DO NOT USE)

## Project Vision & Requirements

This is a **project posting, assignment and to-do tracking system** - an all-in-one partner tool for managing public-facing listings with searchable directories. The system enables collaboration between teams, organizations and clients to share opportunities, handle proposals, assign projects, track progress, and manage invoices.

### Target Audience
Technical coders and programmers who deploy AI to streamline government processes while providing real-time mentoring at local projects funded by Innovation Bonds.

### Core Features Required
1. **Project Management**: Post activities, join projects, track progress
2. **Team Collaboration**: Account-based teams and organizations  
3. **Directory System**: Searchable public listings with pagination
4. **Survey System**: Policy preferences and interests with 5-star ratings
5. **Auth Integration**: Google, GitHub, LinkedIn, email login + Admin Demo bypass
6. **Gemini AI Integration**: Smart insights and natural language search

## Architecture Overview

### Backend (Rust)
- **REST API Server**: Actix-web based HTTP server at `src/main.rs`
- **Database Layer**: PostgreSQL using SQLx with async connection pooling
- **CLI Interface**: Clap-based command structure with `serve` and `init-db` subcommands
- **AI Integration**: Uses `gemini_client_rust` for Google Gemini API

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

### HashRouter Implementation
The application implements a sophisticated HashRouter system that enables:
- **Deep Linking**: Direct navigation to any section/tab via URL hash
- **Parameter Preservation**: URL parameters persist across navigation changes
- **State Management**: Automatic UI updates based on URL changes
- **Filter Integration**: Search terms, city filters, and project filters are reflected in URL

#### URL Structure
```
#section/tab?param1=value1&param2=value2
```

#### Examples
- `#home/welcome` - Home section, Welcome tab
- `#projects/opportunities?city=atlanta&filter=innovation_bonds` - Projects with filters
- `#people/teams?search=react` - People section with search term
- `#account/preferences` - Account preferences

#### Navigation Methods
- Click navigation elements to update URL automatically
- Use `router.navigate(section, tab, params)` programmatically
- Use `router.setParam(key, value)` to update individual parameters
- Parameters automatically applied to filters and search inputs

#### HashRouter Features
1. **Automatic Validation**: Invalid sections/tabs default to valid alternatives
2. **Parameter Persistence**: Moving from `#home/dashboard?city=Atlanta` to `#people` becomes `#people/people?city=Atlanta`
3. **Filter Synchronization**: URL parameters automatically populate form filters
4. **Browser Integration**: Full browser back/forward button support
5. **Bookmarkable URLs**: Any application state can be bookmarked and shared

#### Supported URL Parameters
- `city`: Filter by location (atlanta, portland, detroit, remote)
- `search`: Search term for projects or people
- `filter`: Project filter (all, opportunities, job_openings, innovation_bonds, high_priority)
- `skill`: Filter by technical skill
- `experience`: Filter by experience level

#### Implementation Notes
- HashRouter is initialized on DOM load and handles all navigation automatically
- Existing navigation event handlers updated to use `router.navigate()` instead of direct DOM manipulation
- Filter changes trigger URL updates with 500ms debounce for search inputs
- All application state syncs with URL parameters for consistent user experience

### Database Schema
Complete CRM schema based on SuiteCRM/Salesforce structure:
- Core entities: users, accounts, contacts, leads, opportunities, projects
- Support entities: campaigns, documents, events, products, roles, calls
- Survey system: surveys, surveyquestionoptions, surveyquestionresponses
- Relationship tables for many-to-many associations
- All tables use UUID primary keys and include audit fields

## Setup Process Improvements

### Environment Configuration
1. **Primary Database**: PostgreSQL (Azure/Google compatible)

COMMONS_HOST in .env file

2. **Trade Flow Database**: PostgreSQL (Azure/Google compatible)

EXIOBASE_HOST in .env file

3. **Fallback Handling**: When database connection fails, populate with informative placeholders rather than errors

4. **Security**: Store auth keys in separate config file excluded by `.gitignore`

### Frontend Setup Requirements
```javascript
const API_BASE = 'http://localhost:8081/api'; // Backend URL
```

### Web Server Configuration
The frontend can be served in two different configurations:

1. **Direct Repo Serving**: Web server points directly to the PartnerTools repository root
   - URLs: `http://localhost:8888/admin/import-data.html`
   - File paths: `preferences/projects/DFC-ActiveProjects.xlsx`

2. **Webroot Container**: Repository is placed inside a webroot folder
   - URLs: `http://localhost:8887/team/admin/import-data.html`
   - File paths: `team/preferences/projects/DFC-ActiveProjects.xlsx`
   - Browser relative paths: `../preferences/projects/DFC-ActiveProjects.xlsx`

Webroot Container (port 8887) is prefered since other repos can then reside in the same webroot.

The Rust backend (port 8081) always expects paths relative to the repository root, regardless of web server configuration. Frontend code should convert browser-relative paths (with `../`) to repo-relative paths when making API calls.

### Navigation Structure
```
Home
├── Welcome
├── Documentation
└── Dashboard
Projects
├── Opportunities
├── Assigned Tasks
└── Timelines
People and Teams
├── People
├── Teams
└── Organizations
My Account
├── Preferences
├── Skills
└── Interests
```

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

### Account Management
- **accounts** table serves dual purpose for teams AND organizations
- Account creators become managers automatically
- Managers can promote users to manager/editor roles
- No separate members/managers tables needed

### AI Integration Points
1. **Smart Insights**: Analyze account/contact relationships, suggest next steps
2. **Natural Language Search**: Conversational contact queries
3. **Data Analysis**: Generate summaries and recommendations

### Survey System
- Policy preferences: 20 "hot topics" with 5-point Likert scale
- Interest ratings: 20 categories with 5-star ratings (Agriculture, Climate Resilience, etc.)
- Sankey charts showing response correlations (green=positive, mauve=negative)
- Location, age, and demographic data collection

## Submodules and Sample Code

### Submodules (Do Not Document Unless Specifically Referenced)
- **localhost/**: Submodule containing occasional sample code for local development
- **planet/**: Submodule containing occasional sample code and examples

**Important**: These submodules are not part of the main PartnerTools application and should not be documented or investigated by the CLI unless specific processes and files within them are explicitly referenced in the prompt. They contain sample code that may be used for reference but are not part of the core application functionality.