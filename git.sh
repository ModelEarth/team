#!/bin/bash

# git.sh - Streamlined git operations for webroot repository
# Usage: ./git.sh [command] [options]
# Push commands automatically pull first unless 'nopull' or 'no pull' is specified
#
# IMPORTANT: This script includes safeguards against submodule rollbacks
# - Uses safe_submodule_update() to preserve newer commits in submodules
# - Prevents accidental reversion to older commits during merges/pulls

set -e  # Exit on any error

# Global setting for safe submodule updates (can be overridden with overwrite-local)
SAFE_SUBMODULE_UPDATES=true

# Store the webroot directory at script start
WEBROOT_DIR=""

# Parse command line arguments for global flags
for arg in "$@"; do
    case $arg in
        overwrite-local)
            SAFE_SUBMODULE_UPDATES=false
            echo "⚠️ WARNING: Will overwrite local commits with parent repository state"
            ;;
    esac
done

# CLAUDE_COMMIT_DATA parsing and commit message functions
parse_claude_commit_data() {
    local repo_name="$1"
    if [ -z "$CLAUDE_COMMIT_DATA" ]; then
        return 1
    fi
    
    # Simple YAML parsing for commit data
    # Extract message for the specific repository
    local message=$(echo "$CLAUDE_COMMIT_DATA" | grep -A2 "^${repo_name}:" | grep "message:" | sed "s/.*message: *['\"]*//" | sed "s/['\"]* *$//" | head -1)
    
    if [ -n "$message" ]; then
        echo "$message"
        return 0
    fi
    return 1
}

# Generate enhanced default commit message from modified files
generate_default_commit_message() {
    local repo_name="$1"
    local repo_path="${2:-.}"
    
    # Get list of modified files
    local modified_files=$(cd "$repo_path" && git status --porcelain | grep -E "^(M|A|D|R|C)" | awk '{print $2}' | sort | uniq)
    
    if [ -z "$modified_files" ]; then
        echo "Updated $repo_name"
        return
    fi
    
    # Convert to array and get unique filenames (not full paths)
    local unique_files=()
    local seen_names=()
    
    for file in $modified_files; do
        local filename=$(basename "$file")
        local already_seen=false
        
        for seen in "${seen_names[@]}"; do
            if [ "$seen" = "$filename" ]; then
                already_seen=true
                break
            fi
        done
        
        if [ "$already_seen" = false ]; then
            unique_files+=("$filename")
            seen_names+=("$filename")
            
            # Stop at 3 unique files
            if [ ${#unique_files[@]} -ge 3 ]; then
                break
            fi
        fi
    done
    
    # Build commit message
    if [ ${#unique_files[@]} -eq 1 ]; then
        echo "Updated ${unique_files[0]}"
    elif [ ${#unique_files[@]} -eq 2 ]; then
        echo "Updated ${unique_files[0]}, ${unique_files[1]}"
    elif [ ${#unique_files[@]} -eq 3 ]; then
        local total_files=$(echo "$modified_files" | wc -w)
        if [ "$total_files" -gt 3 ]; then
            echo "Updated ${unique_files[0]}, ${unique_files[1]}, ${unique_files[2]}..."
        else
            echo "Updated ${unique_files[0]}, ${unique_files[1]}, ${unique_files[2]}"
        fi
    else
        echo "Updated $repo_name"
    fi
}

# Get commit message for a repository (Claude or default)
get_commit_message() {
    local repo_name="$1"
    local repo_path="${2:-.}"
    
    # Try Claude commit data first
    local claude_message=$(parse_claude_commit_data "$repo_name")
    if [ $? -eq 0 ] && [ -n "$claude_message" ]; then
        echo "$claude_message"
        return
    fi
    
    # Fall back to enhanced default message
    generate_default_commit_message "$repo_name" "$repo_path"
}

# Validate and fix repository remote URLs to prevent corruption
validate_and_fix_remotes() {
    # Silent validation - only output if corruption is found
    
    # Check webroot repository
    local webroot_remote=""
    if [ -n "$WEBROOT_CONTEXT" ]; then
        webroot_remote=$(git -C "$WEBROOT_CONTEXT" remote get-url origin 2>/dev/null || echo "")
    elif [ -f ".gitmodules" ]; then
        webroot_remote=$(git remote get-url origin 2>/dev/null || echo "")
    fi
    
    if [[ -n "$webroot_remote" ]] && [[ "$webroot_remote" == *"team"* ]]; then
        echo "🚨 CRITICAL: Webroot repository pointing to team URL - fixing..."
        if [ -n "$WEBROOT_CONTEXT" ]; then
            git -C "$WEBROOT_CONTEXT" remote set-url origin "https://github.com/ModelEarth/webroot.git"
            git -C "$WEBROOT_CONTEXT" remote set-url upstream "https://github.com/ModelEarth/webroot.git"
        else
            git remote set-url origin "https://github.com/ModelEarth/webroot.git"
            git remote set-url upstream "https://github.com/ModelEarth/webroot.git"
        fi
        echo "✅ Fixed webroot remote URL"
    fi
    
    # Check team repository - Enhanced detection
    local team_remote=""
    local team_upstream=""
    
    # Multiple ways to check team repository
    if [ -f "../.gitmodules" ] && [ -f ".git" ]; then
        # We're in team submodule directory
        team_remote=$(git remote get-url origin 2>/dev/null || echo "")
        team_upstream=$(git remote get-url upstream 2>/dev/null || echo "")
    elif [ -d "team" ] && [ -f "team/.git" ]; then
        # We're in webroot, checking team submodule
        team_remote=$(git -C "team" remote get-url origin 2>/dev/null || echo "")
        team_upstream=$(git -C "team" remote get-url upstream 2>/dev/null || echo "")
    fi
    
    # Fix team repository if corrupted
    if [[ -n "$team_remote" ]] && [[ "$team_remote" == *"webroot"* ]]; then
        echo "🚨 CRITICAL: Team repository origin pointing to webroot URL - fixing..."
        if [ -f "../.gitmodules" ] && [ -f ".git" ]; then
            git remote set-url origin "https://github.com/ModelEarth/team.git"
        elif [ -d "team" ]; then
            git -C "team" remote set-url origin "https://github.com/ModelEarth/team.git"
        fi
        echo "✅ Fixed team origin remote URL"
    fi
    
    if [[ -n "$team_upstream" ]] && [[ "$team_upstream" == *"webroot"* ]]; then
        echo "🚨 CRITICAL: Team repository upstream pointing to webroot URL - fixing..."
        if [ -f "../.gitmodules" ] && [ -f ".git" ]; then
            git remote set-url upstream "https://github.com/ModelEarth/team.git"
        elif [ -d "team" ]; then
            git -C "team" remote set-url upstream "https://github.com/ModelEarth/team.git"
        fi
        echo "✅ Fixed team upstream remote URL"
    fi
    
    # Validation completed silently
}

# Helper function to check if we're in webroot
check_webroot() {
    # Check for nested webroot directories (prevent confusion) - but only if we're in team subdirectory
    if [ -f "../.gitmodules" ] && [ -d "webroot" ]; then
        echo "⚠️ WARNING: Found nested 'webroot' directory in team submodule!"
        echo "   This can cause confusion. Consider removing: $(pwd)/webroot"
    fi
    
    # Determine context: are we operating on webroot or team?
    local CURRENT_REMOTE=""
    OPERATING_ON_WEBROOT=false
    
    # Check if we were called from webroot's git.sh (WEBROOT_CONTEXT env var set)
    if [ -n "$WEBROOT_CONTEXT" ]; then
        # Called from webroot's git.sh - operate on webroot
        OPERATING_ON_WEBROOT=true
        CURRENT_REMOTE=$(git -C "$WEBROOT_CONTEXT" remote get-url origin 2>/dev/null || echo "")
    elif [ -f ".gitmodules" ] && [ -d ".git" ]; then
        # We're in webroot directory - operate on webroot
        OPERATING_ON_WEBROOT=true
        CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
    elif [ -f "../.gitmodules" ] && [ -d "../.git" ]; then
        # We're in team subdirectory - operate on team
        OPERATING_ON_WEBROOT=false
        CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
    else
        # Try to find webroot by going up directories
        local current_dir=$(pwd)
        while [ "$current_dir" != "/" ]; do
            if [ -f "$current_dir/.gitmodules" ] && [ -d "$current_dir/.git" ]; then
                OPERATING_ON_WEBROOT=true
                CURRENT_REMOTE=$(git -C "$current_dir" remote get-url origin 2>/dev/null || echo "")
                break
            fi
            current_dir=$(dirname "$current_dir")
        done
    fi
    
    # Validate the context matches the expected repository
    if [ "$OPERATING_ON_WEBROOT" = true ]; then
        if [[ "$CURRENT_REMOTE" != *"webroot"* ]]; then
            echo "⚠️ ERROR: Expected to operate on webroot but found remote: $CURRENT_REMOTE"
            echo "   Current directory: $(pwd)"
            echo "   Context: Webroot operation"
            exit 1
        fi
    else
        if [[ "$CURRENT_REMOTE" == *"webroot"* ]]; then
            echo "⚠️ ERROR: Expected to operate on team but found webroot remote: $CURRENT_REMOTE"
            echo "   Current directory: $(pwd)"
            echo "   Context: Team operation"
            echo "   This indicates the team submodule's remote URLs are misconfigured"
            exit 1
        fi
    fi
    
    # Store the webroot directory for later use
    if [ -z "$WEBROOT_DIR" ]; then
        if [ -f ".gitmodules" ] && [ -d ".git" ]; then
            WEBROOT_DIR=$(pwd)
        elif [ -f "../.gitmodules" ] && [ -d "../.git" ]; then
            WEBROOT_DIR=$(cd .. && pwd)
        else
            # Find webroot by going up directories
            local current_dir=$(pwd)
            while [ "$current_dir" != "/" ]; do
                if [ -f "$current_dir/.gitmodules" ] && [ -d "$current_dir/.git" ]; then
                    WEBROOT_DIR="$current_dir"
                    break
                fi
                current_dir=$(dirname "$current_dir")
            done
        fi
    fi
}

# Helper function to return to webroot directory
cd_webroot() {
    if [ -n "$WEBROOT_DIR" ]; then
        cd "$WEBROOT_DIR"
    else
        echo "⚠️ ERROR: Webroot directory not set"
        return 1
    fi
}

# Safe directory management for submodule operations
# Usage: safe_submodule_operation "submodule_name" "operation_function"
safe_submodule_operation() {
    local sub="$1"
    local operation="$2"
    shift 2  # Remove first two arguments, pass rest to operation
    
    # Save current directory
    local original_dir=$(pwd)
    local operation_success=true
    
    # Set up error handling
    set +e  # Don't exit on error, handle it ourselves
    
    if [ -d "$sub" ]; then
        cd "$sub" || {
            echo "⚠️ ERROR: Failed to enter directory: $sub"
            return 1
        }
        
        # Execute the operation with error handling
        if ! eval "$operation" "$@"; then
            operation_success=false
        fi
        
        # Always return to original directory, even if operation failed
        cd "$original_dir" || {
            echo "🚨 CRITICAL: Failed to return to original directory: $original_dir"
            echo "📁 Current directory: $(pwd)"
            echo "🔧 Attempting to return to webroot..."
            cd_webroot
        }
    else
        echo "⚠️ WARNING: Directory does not exist: $sub"
        operation_success=false
    fi
    
    # Restore error handling
    set -e
    
    if [ "$operation_success" = "true" ]; then
        return 0
    else
        return 1
    fi
}

# Safe wrapper for operations that need to iterate through directories
safe_directory_iterator() {
    local dirs=("$@")
    local operation="$1"
    shift 1
    
    local original_dir=$(pwd)
    local failed_operations=()
    
    for dir in "${dirs[@]}"; do
        if [ -d "$dir" ]; then
            echo "🔄 Processing $dir..."
            if ! safe_submodule_operation "$dir" "$operation" "$@"; then
                failed_operations+=("$dir")
            fi
        else
            echo "⚠️ Skipping non-existent directory: $dir"
            failed_operations+=("$dir")
        fi
    done
    
    # Ensure we're back in the original directory
    if [ "$(pwd)" != "$original_dir" ]; then
        echo "🔧 Returning to original directory: $original_dir"
        cd "$original_dir"
    fi
    
    # Report any failures
    if [ ${#failed_operations[@]} -gt 0 ]; then
        echo "⚠️ Operations failed for: ${failed_operations[*]}"
        return 1
    fi
    
    return 0
}

# Helper function to run git commands in webroot context
git_webroot() {
    # If we're in webroot directory (has .gitmodules), run git directly
    if [ -f ".gitmodules" ]; then
        git "$@"
    # If we're in team subdirectory, use git -C ..
    elif [ -f "../.gitmodules" ]; then
        git -C .. "$@"
    else
        echo "⚠️ ERROR: Cannot determine webroot context"
        return 1
    fi
}

# Parse submodules from .gitmodules file in webroot directory
get_submodules() {
    local webroot_dir
    if [ -f ".gitmodules" ]; then
        # We're in webroot directory
        grep "^\[submodule" ".gitmodules" | sed 's/\[submodule "\(.*\)"\]/\1/'
    elif [ -f "../.gitmodules" ]; then
        # We're in team subdirectory
        grep "^\[submodule" "../.gitmodules" | sed 's/\[submodule "\(.*\)"\]/\1/'
    else
        echo "⚠️ ERROR: .gitmodules file not found" >&2
        return 1
    fi
}

# Parse site repos from .siterepos file in webroot directory
get_site_repos() {
    local siterepos_file
    if [ -f ".siterepos" ]; then
        # We're in webroot directory
        siterepos_file=".siterepos"
    elif [ -f "../.siterepos" ]; then
        # We're in team subdirectory
        siterepos_file="../.siterepos"
    else
        return 0  # Not an error, just no site repos
    fi
    
    # Parse .siterepos file (same format as .gitmodules)
    grep "^\[siterepo" "$siterepos_file" | sed 's/\[siterepo "\(.*\)"\]/\1/'
}

# Check if repo has capital M (ModelEarth) based on .gitmodules URL
is_capital_repo() {
    local repo_name="$1"
    local gitmodules_file
    
    if [ -f ".gitmodules" ]; then
        gitmodules_file=".gitmodules"
    elif [ -f "../.gitmodules" ]; then
        gitmodules_file="../.gitmodules"
    else
        # Fallback to hardcoded check
        if [[ "$repo_name" == "localsite" ]] || [[ "$repo_name" == "home" ]] || [[ "$repo_name" == "webroot" ]]; then
            echo "true"
        else
            echo "false"
        fi
        return
    fi
    
    local url=$(grep -A2 "^\[submodule \"$repo_name\"\]" "$gitmodules_file" | grep "url" | head -1)
    if [[ "$url" == *"ModelEarth"* ]]; then
        echo "true"
    else
        echo "false"
    fi
}

# Add upstream remote if it doesn't exist
add_upstream() {
    local repo_name="$1"
    local is_capital="$2"
    
    if [ -z "$(git remote | grep upstream)" ]; then
        if [[ "$is_capital" == "true" ]]; then
            git remote add upstream "https://github.com/ModelEarth/$repo_name.git"
        else
            git remote add upstream "https://github.com/modelearth/$repo_name.git"
        fi
    fi
}

# Merge from upstream with fallback branches
merge_upstream() {
    local repo_name="$1"
    git fetch upstream 2>/dev/null || git fetch upstream
    
    # Try main/master first for all repos
    local merge_output
    merge_output=$(git merge upstream/main --no-edit 2>&1)
    if [[ $? -eq 0 ]]; then
        if [[ "$merge_output" != *"Already up to date"* ]]; then
            echo "$merge_output"
        fi
        return 0
    fi
    
    merge_output=$(git merge upstream/master --no-edit 2>&1)
    if [[ $? -eq 0 ]]; then
        if [[ "$merge_output" != *"Already up to date"* ]]; then
            echo "$merge_output"
        fi
        return 0
    else
        echo "⚠️ Merge conflicts - manual resolution needed"
        return 1
    fi
}

# Detect parent repository account (modelearth or partnertools)
get_parent_account() {
    local repo_name="$1"
    
    # Check if upstream remote exists and points to expected parent
    local upstream_url=$(git remote get-url upstream 2>/dev/null || echo "")
    if [[ "$upstream_url" == *"modelearth/$repo_name"* ]]; then
        echo "modelearth"
    elif [[ "$upstream_url" == *"partnertools/$repo_name"* ]]; then
        echo "partnertools"
    else
        # Fallback: try to determine from typical parent structure
        if [[ "$repo_name" == "localsite" ]] || [[ "$repo_name" == "home" ]] || [[ "$repo_name" == "webroot" ]]; then
            echo "ModelEarth"  # Capital M for these repos
        else
            echo "modelearth"  # lowercase for others
        fi
    fi
}

# Get current GitHub user account
get_current_user() {
    local user=$(gh api user --jq .login 2>/dev/null || echo "")
    if [ -z "$user" ]; then
        # Don't echo error message, just return failure
        return 1
    fi
    echo "$user"
    return 0
}

# Check if current user owns the repository or has write access
is_repo_owner() {
    local repo_name="$1"
    local current_origin=$(git remote get-url origin 2>/dev/null || echo "")
    
    # Extract username from origin URL
    if [[ "$current_origin" =~ github\.com[:/]([^/]+)/$repo_name ]]; then
        local repo_owner="${BASH_REMATCH[1]}"
        
        # Try to get GitHub CLI user first
        local gh_user=$(get_current_user)
        local gh_result=$?
        
        if [ $gh_result -eq 0 ] && [ "$gh_user" = "$repo_owner" ]; then
            return 0  # User owns the repo via GitHub CLI
        fi
        
        # If GitHub CLI fails, check if it's a personal fork (not ModelEarth/modelearth)
        if [[ "$repo_owner" != "ModelEarth" ]] && [[ "$repo_owner" != "modelearth" ]]; then
            return 0  # Likely a fork owned by the user
        fi
        
        # Special case: if pointing to ModelEarth repositories, assume user has access
        # (since they wouldn't have these repos cloned unless they have access)
        if [[ "$repo_owner" == "ModelEarth" ]]; then
            return 0  # Assume user has access to ModelEarth repositories
        fi
    fi
    
    return 1  # Not the owner or couldn't determine
}

# Clear git credentials and setup fresh authentication for current GitHub user
refresh_git_credentials() {
    local current_user="$1"
    
    echo "🔄 Refreshing git credentials for $current_user..."
    
    # Clear cached git credentials
    git credential-manager-core erase 2>/dev/null || true
    git credential erase 2>/dev/null || true
    
    # Clear macOS keychain git credentials
    if command -v security >/dev/null 2>&1; then
        security delete-internet-password -s github.com 2>/dev/null || true
    fi
    
    # Setup git to use GitHub CLI credentials
    gh auth setup-git
    
    echo "✅ Git credentials refreshed for $current_user"
}

# Store last known user in a temporary file for comparison
USER_CACHE_FILE="/tmp/git_sh_last_user"

# Check if current user has changed and update remotes accordingly
check_user_change() {
    local name="$1"
    
    # CRITICAL FIX: When operating on webroot from team context, don't update team repo's remote
    if [[ "$name" == "webroot" ]] && [[ "$OPERATING_ON_WEBROOT" == "true" ]] && [[ -n "$WEBROOT_CONTEXT" ]]; then
        # We're in team directory but operating on webroot - check current directory's actual repo
        local current_remote=$(git remote get-url origin 2>/dev/null || echo "")
        if [[ "$current_remote" == *"team"* ]]; then
            echo "🛡️ Skipping remote update for team repository (operating on webroot context)"
            return 0
        fi
    fi
    
    # If user owns the repo, skip GitHub CLI requirement
    if is_repo_owner "$name"; then
        return 0  # User owns the repo, no need to update remotes
    fi
    
    # Try to get current user via GitHub CLI
    local current_user=$(get_current_user)
    if [ $? -ne 0 ] || [ -z "$current_user" ]; then
        # GitHub CLI not authenticated, but check if we can proceed without it
        local current_origin=$(git remote get-url origin 2>/dev/null || echo "")
        if [[ "$current_origin" =~ github\.com[:/]([^/]+)/$name ]]; then
            local repo_owner="${BASH_REMATCH[1]}"
            if [[ "$repo_owner" != "ModelEarth" ]] && [[ "$repo_owner" != "modelearth" ]]; then
                echo "ℹ️ GitHub CLI not authenticated, but using existing fork remote"
                return 0
            elif [[ "$repo_owner" == "ModelEarth" ]] && [[ "$name" == "webroot" ]]; then
                echo "ℹ️ GitHub CLI not authenticated, but have access to ModelEarth/webroot"
                return 0
            fi
        fi
        echo "⚠️ GitHub CLI not authenticated and repository requires it for operations"
        return 1
    fi
    
    # Check if user has changed since last run
    local last_user=""
    if [ -f "$USER_CACHE_FILE" ]; then
        last_user=$(cat "$USER_CACHE_FILE" 2>/dev/null)
    fi
    
    # If user has changed, refresh git credentials
    if [ -n "$last_user" ] && [ "$last_user" != "$current_user" ]; then
        echo "👤 GitHub user changed from $last_user to $current_user"
        refresh_git_credentials "$current_user"
    fi
    
    # Store current user for next comparison
    echo "$current_user" > "$USER_CACHE_FILE"
    
    # Check current origin remote
    local current_origin=$(git remote get-url origin 2>/dev/null || echo "")
    local expected_origin="https://github.com/$current_user/$name.git"
    
    # ADDITIONAL SAFEGUARD: Verify we're in the correct repository before updating remote
    # Check for context mismatch - if we're trying to update the wrong repository
    if [[ "$name" == "webroot" ]] && [[ "$current_origin" == *"team"* ]]; then
        echo "⚠️ ERROR: Attempted to update team repository remote to webroot URL - skipping"
        echo "   Current remote: $current_origin"
        echo "   Intended remote: $expected_origin"
        return 1
    elif [[ "$name" == "team" ]] && [[ "$current_origin" == *"webroot"* ]]; then
        echo "⚠️ ERROR: Attempted to update webroot repository remote to team URL - skipping"
        echo "   Current remote: $current_origin" 
        echo "   Intended remote: $expected_origin"
        return 1
    fi
    
    # CRITICAL FIX: When called from webroot context but in team directory, 
    # ensure we're operating on the correct repository
    if [[ -n "$WEBROOT_CONTEXT" ]] && [[ "$name" == "webroot" ]] && [[ "$current_origin" == *"webroot"* ]]; then
        # We're correctly operating on webroot - use git -C to ensure we modify the right repo
        current_origin=$(git -C "$WEBROOT_CONTEXT" remote get-url origin 2>/dev/null || echo "")
        if [[ "$current_origin" != "$expected_origin" ]]; then
            echo "🔄 GitHub user changed to $current_user - updating webroot origin remote..."
            git -C "$WEBROOT_CONTEXT" remote set-url origin "$expected_origin" 2>/dev/null || {
                echo "⚠️ Failed to update webroot origin remote for $current_user"
                return 1
            }
            echo "🔧 Updated webroot origin to point to $current_user/webroot"
            return 0
        else
            return 0  # Already correct
        fi
    fi
    
    # If origin doesn't match current user, update it
    if [[ "$current_origin" != "$expected_origin" ]]; then
        echo "🔄 GitHub user changed to $current_user - updating origin remote..."
        git remote set-url origin "$expected_origin" 2>/dev/null || {
            echo "⚠️ Failed to update origin remote for $current_user"
            return 1
        }
        echo "🔧 Updated origin to point to $current_user/$name"
    fi
    return 0
}

# Create fork and update remote to user's fork
setup_fork() {
    local name="$1"
    local parent_account="$2"
    
    # CRITICAL SAFEGUARD: Prevent cross-repository URL corruption
    local current_remote=$(git remote get-url origin 2>/dev/null || echo "")
    if [[ "$name" == "webroot" ]] && [[ "$current_remote" == *"team"* ]]; then
        echo "⚠️ ERROR: Attempted to setup webroot fork while in team repository - aborting"
        return 1
    elif [[ "$name" == "team" ]] && [[ "$current_remote" == *"webroot"* ]]; then
        echo "⚠️ ERROR: Attempted to setup team fork while in webroot repository - aborting"
        return 1
    fi
    
    # If user already owns the repo, no need to fork
    if is_repo_owner "$name"; then
        echo "ℹ️ Already using user's repository, no fork needed"
        return 0
    fi
    
    local current_user=$(get_current_user)
    if [ $? -ne 0 ]; then
        echo "⚠️ Cannot create fork - GitHub CLI not authenticated"
        return 1
    fi
    
    echo "🍴 Creating fork of $parent_account/$name for $current_user..."
    
    # Create fork (gh handles case where fork already exists)
    local fork_url=$(gh repo fork "$parent_account/$name" --clone=false 2>/dev/null || echo "")
    
    if [ -n "$fork_url" ]; then
        echo "✅ Fork created/found: $fork_url"
        
        # Update origin to point to user's fork
        git remote set-url origin "$fork_url.git" 2>/dev/null || \
        git remote set-url origin "https://github.com/$current_user/$name.git"
        
        echo "🔧 Updated origin remote to point to $current_user fork"
        return 0
    else
        echo "⚠️ Failed to create/find fork for $current_user"
        return 1
    fi
}

# Update webroot submodule reference to point to user's fork
update_webroot_submodule_reference() {
    local name="$1"
    local commit_hash="$2"
    
    # Get current user login
    local user_login=$(get_current_user)
    if [ $? -ne 0 ]; then
        echo "⚠️ Could not determine GitHub username"
        return 1
    fi
    
    echo "🔄 Updating webroot submodule reference..."
    cd $(git rev-parse --show-toplevel)
    
    # Update .gitmodules to point to user's fork
    git config -f .gitmodules submodule.$name.url "https://github.com/$user_login/$name.git"
    
    # Sync the submodule URL change
    git submodule sync "$name"
    
    # Update submodule to point to the specific commit
    cd "$name"
    git checkout "$commit_hash" 2>/dev/null
    cd_webroot
    
    # Commit the submodule reference update
    if [ -n "$(git status --porcelain | grep -E "($name|\.gitmodules)")" ]; then
        git add "$name" .gitmodules
        git commit -m "Update $name submodule to point to $user_login fork (commit $commit_hash)"
        
        if git push origin main 2>/dev/null; then
            echo "✅ Updated webroot submodule reference to your fork"
        else
            echo "⚠️ Failed to push webroot submodule reference update"
        fi
    fi
}

# Safely update submodules without reverting to older commits
safe_submodule_update() {
    if [ "$SAFE_SUBMODULE_UPDATES" = "false" ]; then
        echo "⚠️ Using UNSAFE submodule update (may revert to older commits)"
        git submodule update --remote --recursive
        return
    fi
    
    echo "🛡️ Performing safe submodule update (preserving newer commits)..."
    
    # Get all submodules from .gitmodules file
    local submodules=($(get_submodules))
    
    for sub in "${submodules[@]}"; do
        if [ -d "$sub" ] && [ -d "$sub/.git" ]; then
            cd "$sub"
            
            # Always fetch latest from parent repository first
            echo "📥 Fetching latest from parent repository for $sub..."
            git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null || echo "⚠️ Could not fetch from origin"
            
            # Also try to fetch from upstream if it exists
            if git remote | grep -q upstream; then
                git fetch upstream main 2>/dev/null || git fetch upstream master 2>/dev/null || echo "⚠️ Could not fetch from upstream"
            fi
            
            # Get current commit hash and timestamp
            local current_commit=$(git rev-parse HEAD 2>/dev/null || echo "")
            local current_timestamp=""
            if [ -n "$current_commit" ]; then
                current_timestamp=$(git show -s --format=%ct "$current_commit" 2>/dev/null || echo "0")
            fi
            
            # Get latest commit from origin/main (or master)
            local latest_origin_commit=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null || echo "")
            local latest_origin_timestamp=""
            if [ -n "$latest_origin_commit" ]; then
                latest_origin_timestamp=$(git show -s --format=%ct "$latest_origin_commit" 2>/dev/null || echo "0")
            fi
            
            # Get latest commit from upstream if available
            local latest_upstream_commit=""
            local latest_upstream_timestamp=""
            if git remote | grep -q upstream; then
                latest_upstream_commit=$(git rev-parse upstream/main 2>/dev/null || git rev-parse upstream/master 2>/dev/null || echo "")
                if [ -n "$latest_upstream_commit" ]; then
                    latest_upstream_timestamp=$(git show -s --format=%ct "$latest_upstream_commit" 2>/dev/null || echo "0")
                fi
            fi
            
            # Determine the newest available commit
            local newest_commit="$current_commit"
            local newest_timestamp="$current_timestamp"
            local update_source="current"
            
            # Check if origin has newer commits
            if [ -n "$latest_origin_commit" ] && [ "$latest_origin_timestamp" -gt "$newest_timestamp" ]; then
                newest_commit="$latest_origin_commit"
                newest_timestamp="$latest_origin_timestamp"
                update_source="origin"
            fi
            
            # Check if upstream has even newer commits
            if [ -n "$latest_upstream_commit" ] && [ "$latest_upstream_timestamp" -gt "$newest_timestamp" ]; then
                newest_commit="$latest_upstream_commit"
                newest_timestamp="$latest_upstream_timestamp"
                update_source="upstream"
            fi
            
            # Check what commit the parent repository wants
            cd_webroot
            local expected_commit=$(git ls-tree HEAD "$sub" | awk '{print $3}' || echo "")
            
            if [ -n "$expected_commit" ] && [ -n "$current_commit" ]; then
                cd "$sub"
                # Get timestamp of expected commit
                local expected_timestamp=$(git show -s --format=%ct "$expected_commit" 2>/dev/null || echo "0")
                
                # Update to the newest available commit if it's newer than current
                if [ "$newest_timestamp" -gt "$current_timestamp" ] && [ "$newest_commit" != "$current_commit" ]; then
                    echo "⬆️ Updating $sub to newer commit from $update_source: $newest_commit ($(git show -s --format='%ci' "$newest_commit" 2>/dev/null || echo 'unknown date'))"
                    git checkout "$newest_commit" 2>/dev/null || echo "⚠️ Failed to checkout $newest_commit in $sub"
                    
                    # Update parent repo to point to the newest commit
                    cd_webroot
                    git add "$sub"
                    echo "🔵 Updated parent repo to use newer $sub commit from $update_source"
                elif [ "$expected_timestamp" -gt "$current_timestamp" ]; then
                    echo "⬆️ Updating $sub to parent's expected commit: $expected_commit ($(git show -s --format='%ci' "$expected_commit" 2>/dev/null || echo 'unknown date'))"
                    git checkout "$expected_commit" 2>/dev/null || echo "⚠️ Failed to checkout $expected_commit in $sub"
                elif [ "$expected_timestamp" -lt "$current_timestamp" ]; then
                    echo "🛡️ Preserving newer commit in $sub: $current_commit ($(git show -s --format='%ci' "$current_commit" 2>/dev/null || echo 'unknown date'))"
                    echo "   ↳ Parent repo wants older commit: $expected_commit ($(git show -s --format='%ci' "$expected_commit" 2>/dev/null || echo 'unknown date'))"
                    
                    # Update parent repo to point to the newer commit
                    cd_webroot
                    git add "$sub"
                    echo "🔵 Updated parent repo to preserve newer $sub commit"
                else
                    echo "✅ $sub is already at the correct commit"
                fi
                cd_webroot
            else
                echo "⚠️ Could not determine commit information for $sub"
                cd_webroot
            fi
        fi
    done
    
    echo "✅ Safe submodule update completed"
}

# Safely update a single submodule without reverting to older commits
safe_single_submodule_update() {
    local sub="$1"
    echo "🛡️ Safely updating submodule: $sub"
    
    if [ -d "$sub" ] && [ -d "$sub/.git" ]; then
        cd "$sub"
        
        # Always fetch latest from parent repository first
        echo "📥 Fetching latest from parent repository for $sub..."
        git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null || echo "⚠️ Could not fetch from origin"
        
        # Also try to fetch from upstream if it exists
        if git remote | grep -q upstream; then
            git fetch upstream main 2>/dev/null || git fetch upstream master 2>/dev/null || echo "⚠️ Could not fetch from upstream"
        fi
        
        # Get current commit hash and timestamp
        local current_commit=$(git rev-parse HEAD 2>/dev/null || echo "")
        local current_timestamp=""
        if [ -n "$current_commit" ]; then
            current_timestamp=$(git show -s --format=%ct "$current_commit" 2>/dev/null || echo "0")
        fi
        
        # Get latest commit from origin/main (or master)
        local latest_origin_commit=$(git rev-parse origin/main 2>/dev/null || git rev-parse origin/master 2>/dev/null || echo "")
        local latest_origin_timestamp=""
        if [ -n "$latest_origin_commit" ]; then
            latest_origin_timestamp=$(git show -s --format=%ct "$latest_origin_commit" 2>/dev/null || echo "0")
        fi
        
        # Get latest commit from upstream if available
        local latest_upstream_commit=""
        local latest_upstream_timestamp=""
        if git remote | grep -q upstream; then
            latest_upstream_commit=$(git rev-parse upstream/main 2>/dev/null || git rev-parse upstream/master 2>/dev/null || echo "")
            if [ -n "$latest_upstream_commit" ]; then
                latest_upstream_timestamp=$(git show -s --format=%ct "$latest_upstream_commit" 2>/dev/null || echo "0")
            fi
        fi
        
        # Determine the newest available commit
        local newest_commit="$current_commit"
        local newest_timestamp="$current_timestamp"
        local update_source="current"
        
        # Check if origin has newer commits
        if [ -n "$latest_origin_commit" ] && [ "$latest_origin_timestamp" -gt "$newest_timestamp" ]; then
            newest_commit="$latest_origin_commit"
            newest_timestamp="$latest_origin_timestamp"
            update_source="origin"
        fi
        
        # Check if upstream has even newer commits
        if [ -n "$latest_upstream_commit" ] && [ "$latest_upstream_timestamp" -gt "$newest_timestamp" ]; then
            newest_commit="$latest_upstream_commit"
            newest_timestamp="$latest_upstream_timestamp"
            update_source="upstream"
        fi
        
        # Update to the newest available commit if it's newer than current
        if [ "$newest_timestamp" -gt "$current_timestamp" ] && [ "$newest_commit" != "$current_commit" ]; then
            echo "⬆️ Updating $sub to newer commit from $update_source: $newest_commit ($(git show -s --format='%ci' "$newest_commit" 2>/dev/null || echo 'unknown date'))"
            git checkout "$newest_commit" 2>/dev/null || echo "⚠️ Failed to checkout $newest_commit in $sub"
        else
            echo "✅ $sub is already up to date"
        fi
        cd_webroot
    else
        echo "⚠️ Submodule $sub not found or not initialized"
    fi
}

# Fix detached HEAD state by merging into main branch
fix_detached_head() {
    local name="$1"
    
    # Check if we're in detached HEAD state
    local current_branch=$(git symbolic-ref -q HEAD 2>/dev/null || echo "")
    if [ -z "$current_branch" ]; then
        echo "⚠️ $name is in detached HEAD state - fixing..."
        
        # Get the current commit hash
        local detached_commit=$(git rev-parse HEAD)
        
        # Switch to main branch
        git checkout main 2>/dev/null || git checkout master 2>/dev/null || {
            echo "⚠️ No main/master branch found in $name"
            return 1
        }
        
        # Check if we need to merge the detached commit
        if ! git merge-base --is-ancestor "$detached_commit" HEAD; then
            echo "🔄 Merging detached commit $detached_commit into main branch"
            if git merge "$detached_commit" --no-edit 2>/dev/null; then
                echo "✅ Successfully merged detached HEAD in $name"
            else
                echo "⚠️ Merge conflicts in $name - manual resolution needed"
                return 1
            fi
        else
            echo "✅ Detached commit already in $name main branch"
        fi
    fi
    return 0
}

# Ensure all pending commits are pushed to origin
ensure_push_completion() {
    local name="$1"
    local max_retries=3
    local retry_count=0
    
    while [ $retry_count -lt $max_retries ]; do
        # Check if there are unpushed commits
        local unpushed=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo "0")
        if [ "$unpushed" = "0" ]; then
            echo "✅ All commits pushed for $name"
            return 0
        fi
        
        echo "📤 Pushing $unpushed pending commits for $name..."
        
        # Try different push strategies
        if git push 2>/dev/null; then
            echo "✅ Successfully pushed $name"
            return 0
        elif git push origin HEAD:main 2>/dev/null; then
            echo "✅ Successfully pushed $name to main"
            return 0
        elif git push origin HEAD:master 2>/dev/null; then
            echo "✅ Successfully pushed $name to master"
            return 0
        elif git push --force-with-lease 2>/dev/null; then
            echo "✅ Force pushed $name with lease"
            return 0
        else
            ((retry_count++))
            echo "⚠️ Push attempt $retry_count failed for $name"
            if [ $retry_count -lt $max_retries ]; then
                echo "🔄 Retrying in 2 seconds..."
                sleep 2
            fi
        fi
    done
    
    echo "❌ Failed to push $name after $max_retries attempts"
    echo "💡 You may need to manually resolve this in GitHub Desktop"
    return 1
}

# Enhanced commit and push with automatic fork creation
commit_push() {
    local name="$1"
    local skip_pr="$2"
    local original_dir=$(pwd)
    
    # If operating on webroot from team context, change to webroot directory
    if [[ "$name" == "webroot" ]] && [[ "$OPERATING_ON_WEBROOT" == "true" ]] && [[ -n "$WEBROOT_CONTEXT" ]]; then
        cd "$WEBROOT_CONTEXT" || {
            echo "⚠️ ERROR: Cannot change to webroot directory: $WEBROOT_CONTEXT"
            cd "$original_dir"
            return 1
        }
    fi
    
    # Fix detached HEAD before committing
    fix_detached_head "$name"
    
    # Check if there are changes to commit first
    if [ -n "$(git status --porcelain)" ]; then
        # Only check user change and update remotes when there are actual changes
        check_user_change "$name"
        git add .
        local commit_msg=$(get_commit_message "$name" ".")
        git commit -m "$commit_msg"
        local commit_hash=$(git rev-parse HEAD)
        
        # Determine target branch
        local target_branch="main"
        
        # Check if user owns the repository
        if is_repo_owner "$name"; then
            echo "✅ User owns $name repository - attempting direct push"
            # Try multiple push strategies for owned repositories
            local push_error=""
            if git push origin HEAD:$target_branch 2>/dev/null; then
                echo "✅ Successfully pushed $name to $target_branch branch"
                ensure_push_completion "$name"
                cd "$original_dir"
                return 0
            elif git push origin $target_branch 2>/dev/null; then
                echo "✅ Successfully pushed $name to $target_branch"
                ensure_push_completion "$name"
                cd "$original_dir"
                return 0
            elif push_error=$(git push 2>&1); then
                echo "✅ Successfully pushed $name"
                ensure_push_completion "$name"
                cd "$original_dir"
                return 0
            else
                # Check for specific OAuth workflow scope error
                if [[ "$push_error" == *"workflow"* ]] && [[ "$push_error" == *"OAuth"* ]]; then
                    echo "🔒 GitHub OAuth token lacks 'workflow' scope for updating GitHub Actions"
                    echo "💡 To fix this, run: gh auth refresh -h github.com -s workflow"
                    echo "💡 Then retry the commit command"
                    cd "$original_dir"
                    return 1
                else
                    echo "⚠️ Push failed for owned repository $name with error:"
                    echo "$push_error"
                    echo "💡 Trying force push with lease..."
                    if git push --force-with-lease 2>/dev/null; then
                        echo "✅ Force pushed $name"
                        ensure_push_completion "$name"
                        cd "$original_dir"
                        return 0
                    else
                        echo "❌ All push strategies failed for owned repo $name"
                        cd "$original_dir"
                        return 1
                    fi
                fi
            fi
        else
            echo "🔒 User does not own $name repository - trying fork workflow"
            # Try to push directly first in case we have access
            if git push origin HEAD:$target_branch 2>/dev/null; then
                echo "✅ Successfully pushed $name to $target_branch branch"
                ensure_push_completion "$name"
                cd "$original_dir"
                return 0
            fi
            
            # If direct push fails, check if it's a permission issue
            local push_output=$(git push origin HEAD:$target_branch 2>&1)
            if [[ "$push_output" == *"Permission denied"* ]] || [[ "$push_output" == *"403"* ]]; then
                echo "🔒 Permission denied - setting up fork workflow..."
                
                # Detect parent account
                local parent_account=$(get_parent_account "$name")
                echo "📍 Detected parent: $parent_account/$name"
                
                # Setup fork and update remote
                if setup_fork "$name" "$parent_account"; then
                    # Try pushing to fork
                    if git push origin HEAD:$target_branch 2>/dev/null; then
                        echo "✅ Successfully pushed $name to your fork"
                        ensure_push_completion "$name"
                    else
                        # Force push if normal push fails
                        echo "🔄 Normal push failed, trying force push..."
                        if git push --force-with-lease origin HEAD:$target_branch 2>/dev/null; then
                            echo "✅ Force pushed $name to your fork"
                            ensure_push_completion "$name"
                        else
                            echo "⚠️ Failed to push $name to fork"
                            cd "$original_dir"
                            return 1
                        fi
                    fi
                    
                    # Create PR if not skipped
                    if [[ "$skip_pr" != "nopr" ]]; then
                        echo "📝 Creating pull request..."
                        local pr_url=$(gh pr create \
                            --title "$commit_msg" \
                            --body "Automated update from git.sh commit workflow" \
                            --base $target_branch \
                            --head $target_branch \
                            --repo "$parent_account/$name" 2>/dev/null || echo "")
                        
                        if [ -n "$pr_url" ]; then
                            echo "🔄 Created PR: $pr_url"
                        else
                            echo "⚠️ PR creation failed for $name"
                        fi
                    fi
                    
                    # Update webroot submodule reference if this is a submodule
                    if [[ "$name" != "webroot" ]] && [[ "$name" != "exiobase" ]] && [[ "$name" != "profile" ]] && [[ "$name" != "io" ]]; then
                        update_webroot_submodule_reference "$name" "$commit_hash"
                    fi
                else
                    echo "⚠️ Failed to push to fork"
                fi
            elif [[ "$skip_pr" != "nopr" ]]; then
                # Other push failure - try feature branch PR
                git push origin HEAD:feature-$name-updates 2>/dev/null && \
                gh pr create --title "$commit_msg" --body "Automated update" --base $target_branch --head feature-$name-updates 2>/dev/null || \
                echo "🔄 PR creation failed for $name"
            fi
        fi
    fi
    
    # Return to original directory
    cd "$original_dir"
}

# Pull command - streamlined pull workflow  
pull_command() {
    local repo_name="$1"
    
    echo "🔄 Starting pull workflow..."
    check_webroot
    
    # If specific repo name provided, pull only that repo
    if [ -n "$repo_name" ]; then
        pull_specific_repo "$repo_name"
        return
    fi
    
    # Pull webroot with graceful merge handling
    echo "📥 Pulling webroot..."
    
    # First fetch the latest changes
    git_webroot fetch origin main 2>/dev/null || git_webroot fetch origin master 2>/dev/null
    
    # Determine the remote branch
    local remote_branch="origin/main"
    git_webroot rev-parse origin/master >/dev/null 2>&1 && remote_branch="origin/master"
    
    # Try graceful merge strategies
    if git_webroot merge-base --is-ancestor HEAD "$remote_branch" 2>/dev/null; then
        # We're behind, can fast-forward
        output=$(git_webroot merge --ff-only "$remote_branch" 2>&1) || {
            output=$(git_webroot pull origin main 2>&1) || output=$(git_webroot pull origin master 2>&1) || {
                echo "⚠️ Fast-forward merge failed for webroot, trying regular merge"
            }
        }
    elif git_webroot merge-base --is-ancestor "$remote_branch" HEAD 2>/dev/null; then
        # We're ahead, no merge needed
        output="Already up to date"
    else
        # Branches have diverged, try graceful merge
        output=$(git_webroot merge --no-edit "$remote_branch" 2>&1) || {
            # Check if it's a merge conflict
            if git_webroot status --porcelain | grep -q "^UU\|^AA\|^DD"; then
                echo "🔀 Merge conflicts detected in webroot - requires manual resolution"
                echo "💡 Use GitHub Desktop or resolve conflicts manually"
                output="Merge conflicts detected"
            else
                # Other merge failure, try traditional pull as fallback
                output=$(git_webroot pull origin main 2>&1) || output=$(git_webroot pull origin master 2>&1) || {
                    echo "⚠️ All merge strategies failed for webroot"
                    output="Pull failed"
                }
            fi
        }
    fi
    
    # Show output if meaningful
    if [[ "$output" != *"Already up to date"* ]] && [[ "$output" != "" ]]; then
        echo "$output"
    fi
    
    # Update webroot from parent (skip partnertools)
    WEBROOT_REMOTE=$(git_webroot remote get-url origin)
    if [[ "$WEBROOT_REMOTE" != *"partnertools"* ]]; then
        add_upstream "webroot" "true"
        merge_upstream "webroot"
    fi
    
    # Pull submodules
    echo "📥 Pulling submodules..."
    echo
    local submodules=($(get_submodules))
    local failed_submodules=()
    
    for sub in "${submodules[@]}"; do
        if [ ! -d "$sub" ]; then
            echo "⚠️ Submodule directory not found: $sub"
            continue
        fi
        
        echo "🔄 Pulling $sub..."
        cd "$sub" || {
            echo "❌ Failed to enter directory: $sub"
            failed_submodules+=("$sub (directory access)")
            continue
        }
        
        # Try GitHub CLI merge for graceful conflict handling
        local pull_output=""
        local pull_success=true
        
        # First fetch the latest changes
        git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null || {
            echo "⚠️ Failed to fetch updates for $sub"
            pull_success=false
        }
        
        if [ "$pull_success" = "true" ]; then
            # Check if we can do a clean merge
            local current_branch=$(git symbolic-ref --short HEAD 2>/dev/null || echo "HEAD")
            local remote_branch="origin/main"
            git rev-parse origin/master >/dev/null 2>&1 && remote_branch="origin/master"
            
            # Try to merge with GitHub's strategy
            if git merge-base --is-ancestor HEAD "$remote_branch" 2>/dev/null; then
                # We're behind, can fast-forward
                pull_output=$(git merge --ff-only "$remote_branch" 2>&1) || {
                    pull_output=$(git pull origin main 2>&1) || pull_output=$(git pull origin master 2>&1) || {
                        echo "⚠️ Fast-forward merge failed for $sub, trying regular merge"
                        pull_success=false
                    }
                }
            elif git merge-base --is-ancestor "$remote_branch" HEAD 2>/dev/null; then
                # We're ahead, no merge needed
                pull_output="Already up to date"
            else
                # Branches have diverged, try graceful merge
                pull_output=$(git merge --no-edit "$remote_branch" 2>&1) || {
                    # Check if it's a merge conflict
                    if git status --porcelain | grep -q "^UU\|^AA\|^DD"; then
                        echo "🔀 Merge conflicts detected in $sub - requires manual resolution"
                        echo "💡 Use GitHub Desktop or resolve conflicts manually"
                        pull_success=false
                    else
                        # Other merge failure, try traditional pull as fallback
                        pull_output=$(git pull origin main 2>&1) || pull_output=$(git pull origin master 2>&1) || {
                            echo "⚠️ All merge strategies failed for $sub: $pull_output"
                            pull_success=false
                        }
                    fi
                }
            fi
        fi
        
        # Show pull output if it's not "Already up to date"
        if [[ "$pull_output" != *"Already up to date"* ]] && [[ "$pull_success" == "true" ]]; then
            echo "✅ $sub: $pull_output"
        elif [[ "$pull_success" == "false" ]]; then
            echo "❌ $sub pull failed: $pull_output"
            failed_submodules+=("$sub (pull failed)")
        fi
        
        # Try upstream merge if not partnertools
        REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
        if [[ "$REMOTE" != *"partnertools"* ]]; then
            local is_capital=$(is_capital_repo "$sub")
            add_upstream "$sub" "$is_capital"
            if ! merge_upstream "$sub"; then
                echo "⚠️ Upstream merge failed for $sub"
                failed_submodules+=("$sub (upstream merge)")
            fi
        fi
        
        # Always return to webroot
        cd_webroot || {
            echo "🚨 CRITICAL: Failed to return to webroot after processing $sub"
            cd ..
        }
    done
    
    # Report any failures
    if [ ${#failed_submodules[@]} -gt 0 ]; then
        echo "⚠️ Some submodules had issues:"
        for failure in "${failed_submodules[@]}"; do
            echo "   • $failure"
        done
        echo "💡 You may need to resolve these manually in GitHub Desktop"
    fi
    
    # Update submodule references safely (preserve newer commits)
    echo "🔄 Updating submodule references..."
    safe_submodule_update
    if [ -n "$(git status --porcelain)" ]; then
        # Only add actual submodules defined in .gitmodules, not temporary repos
        local submodules=($(get_submodules))
        local has_changes=false
        for sub in "${submodules[@]}"; do
            if [ -n "$(git status --porcelain | grep "^M  $sub")" ]; then
                git add "$sub"
                has_changes=true
                echo "📌 Added submodule reference: $sub"
            fi
        done
        if [ "$has_changes" = true ]; then
            git commit -m "Update submodule references"
            echo "✅ Updated submodule references"
        else
            echo "ℹ️  No submodule reference changes to commit"
        fi
    fi
    
    # Check for and fix any detached HEAD states after pulls
    fix_all_detached_heads
    
    # Pull site repos with graceful merge handling
    echo "📥 Pulling site repos..."
    local site_repos=($(get_site_repos))
    for repo in "${site_repos[@]}"; do
        [ ! -d "$repo" ] && continue
        cd "$repo"
        
        # First fetch the latest changes
        git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null
        
        # Determine the remote branch
        local remote_branch="origin/main"
        git rev-parse origin/master >/dev/null 2>&1 && remote_branch="origin/master"
        
        # Try graceful merge strategies
        if git merge-base --is-ancestor HEAD "$remote_branch" 2>/dev/null; then
            # We're behind, can fast-forward
            output=$(git merge --ff-only "$remote_branch" 2>&1) || {
                output=$(git pull origin main 2>&1) || output=$(git pull origin master 2>&1) || {
                    echo "⚠️ Fast-forward merge failed for $repo, trying regular merge"
                }
            }
        elif git merge-base --is-ancestor "$remote_branch" HEAD 2>/dev/null; then
            # We're ahead, no merge needed
            output="Already up to date"
        else
            # Branches have diverged, try graceful merge
            output=$(git merge --no-edit "$remote_branch" 2>&1) || {
                # Check if it's a merge conflict
                if git status --porcelain | grep -q "^UU\|^AA\|^DD"; then
                    echo "🔀 Merge conflicts detected in $repo - requires manual resolution"
                    echo "💡 Use GitHub Desktop or resolve conflicts manually"
                    output="Merge conflicts detected"
                else
                    # Other merge failure, try traditional pull as fallback
                    output=$(git pull origin main 2>&1) || output=$(git pull origin master 2>&1) || {
                        echo "⚠️ All merge strategies failed for $repo"
                        output="Pull failed"
                    }
                fi
            }
        fi
        
        # Show output if meaningful
        if [[ "$output" != *"Already up to date"* ]] && [[ "$output" != "" ]]; then
            echo "$output"
        fi
        
        REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
        if [[ "$REMOTE" != *"partnertools"* ]]; then
            add_upstream "$repo" "false"
            merge_upstream "$repo"
        fi
        cd_webroot
    done
    
    local submodules=($(get_submodules))
    local site_repos=($(get_site_repos))
    local submodule_count=${#submodules[@]}
    local site_count=${#site_repos[@]}
    local total_count=$((1 + submodule_count + site_count))
    
    echo "✅ Pull completed - 1 webroot + ${submodule_count} submodules + ${site_count} site repos = ${total_count} repositories"
}

# Pull specific repository
pull_specific_repo() {
    local repo_name="$1"
    
    check_webroot
    
    # Check if it's webroot
    if [[ "$repo_name" == "webroot" ]]; then
        echo "📥 Pulling webroot..."
        
        # First fetch the latest changes
        git_webroot fetch origin main 2>/dev/null || git_webroot fetch origin master 2>/dev/null
        
        # Determine the remote branch
        local remote_branch="origin/main"
        git_webroot rev-parse origin/master >/dev/null 2>&1 && remote_branch="origin/master"
        
        # Try graceful merge strategies
        if git_webroot merge-base --is-ancestor HEAD "$remote_branch" 2>/dev/null; then
            # We're behind, can fast-forward
            output=$(git_webroot merge --ff-only "$remote_branch" 2>&1) || {
                output=$(git_webroot pull origin main 2>&1) || output=$(git_webroot pull origin master 2>&1) || {
                    echo "⚠️ Fast-forward merge failed for webroot, trying regular merge"
                }
            }
        elif git_webroot merge-base --is-ancestor "$remote_branch" HEAD 2>/dev/null; then
            # We're ahead, no merge needed
            output="Already up to date"
        else
            # Branches have diverged, try graceful merge
            output=$(git_webroot merge --no-edit "$remote_branch" 2>&1) || {
                # Check if it's a merge conflict
                if git_webroot status --porcelain | grep -q "^UU\|^AA\|^DD"; then
                    echo "🔀 Merge conflicts detected in webroot - requires manual resolution"
                    echo "💡 Use GitHub Desktop or resolve conflicts manually"
                    output="Merge conflicts detected"
                else
                    # Other merge failure, try traditional pull as fallback
                    output=$(git_webroot pull origin main 2>&1) || output=$(git_webroot pull origin master 2>&1) || {
                        echo "⚠️ All merge strategies failed for webroot"
                        output="Pull failed"
                    }
                fi
            }
        fi
        
        # Show output if meaningful
        if [[ "$output" != *"Already up to date"* ]] && [[ "$output" != "" ]]; then
            echo "$output"
        fi
        
        WEBROOT_REMOTE=$(git_webroot remote get-url origin)
        if [[ "$WEBROOT_REMOTE" != *"partnertools"* ]]; then
            add_upstream "webroot" "true"
            merge_upstream "webroot"
        fi
        echo "✅ Webroot pull completed!"
        return
    fi
    
    # Check if it's a submodule
    local submodules=($(get_submodules))
    local submodule_list=" ${submodules[*]} "
    if [[ "$submodule_list" =~ " $repo_name " ]]; then
        if [ -d "$repo_name" ]; then
            echo "📥 Pulling submodule: $repo_name..."
            cd "$repo_name"
            
            # First fetch the latest changes
            git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null
            
            # Determine the remote branch
            local remote_branch="origin/main"
            git rev-parse origin/master >/dev/null 2>&1 && remote_branch="origin/master"
            
            # Try graceful merge strategies
            if git merge-base --is-ancestor HEAD "$remote_branch" 2>/dev/null; then
                # We're behind, can fast-forward
                output=$(git merge --ff-only "$remote_branch" 2>&1) || {
                    output=$(git pull origin main 2>&1) || output=$(git pull origin master 2>&1) || {
                        echo "⚠️ Fast-forward merge failed for $repo_name, trying regular merge"
                    }
                }
            elif git merge-base --is-ancestor "$remote_branch" HEAD 2>/dev/null; then
                # We're ahead, no merge needed
                output="Already up to date"
            else
                # Branches have diverged, try graceful merge
                output=$(git merge --no-edit "$remote_branch" 2>&1) || {
                    # Check if it's a merge conflict
                    if git status --porcelain | grep -q "^UU\|^AA\|^DD"; then
                        echo "🔀 Merge conflicts detected in $repo_name - requires manual resolution"
                        echo "💡 Use GitHub Desktop or resolve conflicts manually"
                        output="Merge conflicts detected"
                    else
                        # Other merge failure, try traditional pull as fallback
                        output=$(git pull origin main 2>&1) || output=$(git pull origin master 2>&1) || {
                            echo "⚠️ All merge strategies failed for $repo_name"
                            output="Pull failed"
                        }
                    fi
                }
            fi
            
            # Show output if meaningful
            if [[ "$output" != *"Already up to date"* ]] && [[ "$output" != "" ]]; then
                echo "$output"
            fi
            
            REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
            if [[ "$REMOTE" != *"partnertools"* ]]; then
                local is_capital=$(is_capital_repo "$repo_name")
                add_upstream "$repo_name" "$is_capital"
                merge_upstream "$repo_name"
            fi
            
            cd_webroot
            safe_single_submodule_update "$repo_name"
            echo "✅ $repo_name submodule pull completed!"
        else
            echo "⚠️ Submodule not found: $repo_name"
        fi
        return
    fi
    
    # Check if it's an site repo
    local site_repos=($(get_site_repos))
    local site_repo_list=" ${site_repos[*]} "
    if [[ "$site_repo_list" =~ " $repo_name " ]]; then
        if [ -d "$repo_name" ]; then
            echo "📥 Pulling site repo: $repo_name..."
            cd "$repo_name"
            
            # First fetch the latest changes
            git fetch origin main 2>/dev/null || git fetch origin master 2>/dev/null
            
            # Determine the remote branch
            local remote_branch="origin/main"
            git rev-parse origin/master >/dev/null 2>&1 && remote_branch="origin/master"
            
            # Try graceful merge strategies
            if git merge-base --is-ancestor HEAD "$remote_branch" 2>/dev/null; then
                # We're behind, can fast-forward
                output=$(git merge --ff-only "$remote_branch" 2>&1) || {
                    output=$(git pull origin main 2>&1) || output=$(git pull origin master 2>&1) || {
                        echo "⚠️ Fast-forward merge failed for $repo_name, trying regular merge"
                    }
                }
            elif git merge-base --is-ancestor "$remote_branch" HEAD 2>/dev/null; then
                # We're ahead, no merge needed
                output="Already up to date"
            else
                # Branches have diverged, try graceful merge
                output=$(git merge --no-edit "$remote_branch" 2>&1) || {
                    # Check if it's a merge conflict
                    if git status --porcelain | grep -q "^UU\|^AA\|^DD"; then
                        echo "🔀 Merge conflicts detected in $repo_name - requires manual resolution"
                        echo "💡 Use GitHub Desktop or resolve conflicts manually"
                        output="Merge conflicts detected"
                    else
                        # Other merge failure, try traditional pull as fallback
                        output=$(git pull origin main 2>&1) || output=$(git pull origin master 2>&1) || {
                            echo "⚠️ All merge strategies failed for $repo_name"
                            output="Pull failed"
                        }
                    fi
                }
            fi
            
            # Show output if meaningful
            if [[ "$output" != *"Already up to date"* ]] && [[ "$output" != "" ]]; then
                echo "$output"
            fi
            
            REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
            if [[ "$REMOTE" != *"partnertools"* ]]; then
                add_upstream "$repo_name" "false"
                merge_upstream "$repo_name"
            fi
            cd_webroot
            echo "✅ $repo_name site repo pull completed!"
        else
            echo "⚠️ Extra repo not found: $repo_name"
        fi
        return
    fi
    
    echo "⚠️ Repository not recognized: $repo_name"
    echo "Supported repositories:"
    echo "  Webroot: webroot"
    local submodules=($(get_submodules))
    echo "  Submodules: ${submodules[*]}"
    local site_repos=($(get_site_repos))
    echo "  Site Repos: ${site_repos[*]}"
}

# Check and fix detached HEAD states in all repositories
fix_all_detached_heads() {
    check_webroot
    
    local fixed_count=0
    
    # Check webroot
    if fix_detached_head "webroot"; then
        ((fixed_count++))
    fi
    
    # Check all submodules with safe directory management
    local submodules=($(get_submodules))
    for sub in "${submodules[@]}"; do
        if [ -d "$sub" ]; then
            if safe_submodule_operation "$sub" "fix_detached_head" "$sub"; then
                ((fixed_count++))
            fi
        fi
    done
    
    # Check site repos
    local site_repos=($(get_site_repos))
    for repo in "${site_repos[@]}"; do
        if [ -d "$repo" ]; then
            cd "$repo"
            if fix_detached_head "$repo"; then
                ((fixed_count++))
            fi
            cd_webroot
        fi
    done
    
    if [ $fixed_count -gt 0 ]; then
        echo "✅ All $fixed_count submodules pointed at main branch"
    else
        echo "✅ All submodules already on main branch"
    fi
}

# Check and update all remotes for current GitHub user
update_all_remotes_for_user() {
    echo "🔄 Updating all remotes for current GitHub user..."
    check_webroot
    
    local current_user=$(get_current_user)
    if [ $? -ne 0 ]; then
        return 1
    fi
    
    echo "👤 Current GitHub user: $current_user"
    local updated_count=0
    
    # Check webroot
    if check_user_change "webroot"; then
        ((updated_count++))
    fi
    
    # Check all submodules
    local submodules=($(get_submodules))
    for sub in "${submodules[@]}"; do
        if [ -d "$sub" ]; then
            # Save current directory
            local original_dir=$(pwd)
            cd "$sub"
            # Temporarily clear WEBROOT_CONTEXT to prevent confusion
            local saved_webroot_context="$WEBROOT_CONTEXT"
            unset WEBROOT_CONTEXT
            if check_user_change "$sub"; then
                ((updated_count++))
            fi
            # Restore WEBROOT_CONTEXT
            export WEBROOT_CONTEXT="$saved_webroot_context"
            cd "$original_dir"
        fi
    done
    
    # Check site repos
    local site_repos=($(get_site_repos))
    for repo in "${site_repos[@]}"; do
        if [ -d "$repo" ]; then
            cd "$repo"
            if check_user_change "$repo"; then
                ((updated_count++))
            fi
            cd_webroot
        fi
    done
    
    if [ $updated_count -gt 0 ]; then
        echo "✅ Updated remotes for $updated_count repositories to $current_user"
    else
        echo "✅ All remotes already point to $current_user"
    fi
}

# Check if GitHub Pages is enabled for a repository
check_github_pages() {
    local user_login="$1"
    local repo_name="$2"
    
    # Check if GitHub Pages is enabled using GitHub API
    local pages_info=$(gh api "repos/$user_login/$repo_name/pages" 2>/dev/null || echo "")
    if [ -n "$pages_info" ]; then
        return 0  # Pages is enabled
    else
        return 1  # Pages is not enabled
    fi
}

# Enable GitHub Pages for a repository
enable_github_pages() {
    local user_login="$1"
    local repo_name="$2"
    
    echo "🌐 Enabling GitHub Pages for $user_login/$repo_name..."
    
    # Try to enable GitHub Pages using main branch
    local result=$(gh api --method POST "repos/$user_login/$repo_name/pages" \
        -f source.branch=main \
        -f source.path=/ 2>/dev/null || echo "")
    
    if [ -n "$result" ]; then
        echo "✅ GitHub Pages enabled for $user_login/$repo_name"
        echo "📋 Site will be available at: https://$user_login.github.io/$repo_name"
        return 0
    else
        echo "⚠️ Could not enable GitHub Pages automatically"
        echo "💡 Please manually enable GitHub Pages in your fork:"
        echo "   1. Go to https://github.com/$user_login/$repo_name/settings/pages"
        echo "   2. Set Source to 'Deploy from a branch'"
        echo "   3. Select branch: main, folder: / (root)"
        echo "   4. Click Save"
        echo "📋 After setup, your site will be at: https://$user_login.github.io/$repo_name"
        echo ""
        echo "Options:"
        echo "  Y - Continue with PR creation (recommended)"
        echo "  N - Skip PR creation and continue with commit only"
        echo "  Q - Quit without creating PR or committing"
        
        read -p "Choose an option [Y/n/q]: " choice
        case "${choice,,}" in
            ""|y|yes)
                echo "✅ Continuing with PR creation..."
                return 0
                ;;
            n|no)
                echo "⚠️ Skipping PR creation as requested"
                return 2  # Special return code for skip PR
                ;;
            q|quit)
                echo "❌ Aborting commit and PR creation"
                return 3  # Special return code for quit
                ;;
            *)
                echo "Invalid choice. Defaulting to continue with PR..."
                return 0
                ;;
        esac
    fi
}

# Create PR for webroot to its parent with GitHub Pages integration
create_webroot_pr() {
    local skip_pr="$1"
    
    if [[ "$skip_pr" == "nopr" ]]; then
        return 0
    fi
    
    # Get webroot remote URLs
    local origin_url=$(git remote get-url origin 2>/dev/null || echo "")
    local upstream_url=$(git remote get-url upstream 2>/dev/null || echo "")
    
    # Extract parent account from upstream or determine from origin
    local parent_account=""
    if [[ "$upstream_url" == *"ModelEarth/webroot"* ]]; then
        parent_account="ModelEarth"
    elif [[ "$upstream_url" == *"partnertools/webroot"* ]]; then
        parent_account="partnertools"
    elif [[ "$origin_url" != *"ModelEarth/webroot"* ]] && [[ "$origin_url" != *"partnertools/webroot"* ]]; then
        # This is likely a fork, default to ModelEarth as parent
        parent_account="ModelEarth"
    else
        # Already pointing to parent, no PR needed
        return 0
    fi
    
    echo "📝 Creating webroot PR to $parent_account/webroot..."
    
    # Get current user login for head specification
    local user_login=$(get_current_user)
    local head_spec="main"
    if [ $? -eq 0 ] && [ -n "$user_login" ]; then
        head_spec="$user_login:main"
    else
        echo "⚠️ Could not determine current user for PR creation"
        return 1
    fi
    
    # Check and setup GitHub Pages for the fork
    local pages_url=""
    local pages_status=""
    local pages_result=0
    
    if check_github_pages "$user_login" "webroot"; then
        pages_url="https://$user_login.github.io/webroot"
        pages_status="✅ GitHub Pages is enabled"
        echo "$pages_status: $pages_url"
    else
        echo "🔍 GitHub Pages not detected, attempting to enable..."
        enable_github_pages "$user_login" "webroot"
        pages_result=$?
        
        case $pages_result in
            0)
                pages_url="https://$user_login.github.io/webroot"
                pages_status="🌐 GitHub Pages enabled (may take a few minutes to be available)"
                ;;
            2)
                echo "🔄 Continuing with commit only (no PR as requested)"
                return 0  # Skip PR creation but continue
                ;;
            3)
                echo "❌ Aborting PR creation as requested"
                return 1  # Abort completely
                ;;
            *)
                pages_url="https://$user_login.github.io/webroot"
                pages_status="⚠️ GitHub Pages setup needed - continuing with PR creation"
                ;;
        esac
    fi
    
    # Create enhanced PR body with review links
    local pr_body="## Webroot Update

Automated webroot update from git.sh commit workflow - includes submodule reference updates and configuration changes.

## Review Links

📋 **Live Preview**: [$pages_url]($pages_url)
🔗 **Fork Repository**: [https://github.com/$user_login/webroot](https://github.com/$user_login/webroot)

## GitHub Pages Status
$pages_status

---
*Generated by git.sh commit workflow*"
    
    local pr_url=$(gh pr create \
        --title "Update webroot with submodule changes" \
        --body "$pr_body" \
        --base main \
        --head "$head_spec" \
        --repo "$parent_account/webroot" 2>/dev/null || echo "")
    
    if [ -n "$pr_url" ]; then
        echo "🔄 Created webroot PR: $pr_url"
        if [ -n "$pages_url" ]; then
            echo "📋 Review at: $pages_url"
        fi
    else
        echo "ℹ️  Direct push of Webroot repo successful"
    fi
}

# Push specific repository
push_specific_repo() {
    local name="$1"
    local skip_pr="$2"
    
    check_webroot
    
    # Auto-pull unless nopull/no pull is specified
    if [[ "$skip_pr" != *"nopull"* ]] && [[ "$skip_pr" != *"no pull"* ]]; then
        echo "🔄 Running pulls for $name before we push..."
        pull_command "$name"
        echo "✅ Pull completed for $name, proceeding with push..."
    fi
    
    # Check if it's webroot
    if [[ "$name" == "webroot" ]]; then
        commit_push "webroot" "$skip_pr"
        
        # Check if webroot needs PR after direct changes
        local webroot_commits_ahead=$(git rev-list --count upstream/main..HEAD 2>/dev/null || echo "0")
        if [[ "$webroot_commits_ahead" -gt "0" ]] && [[ "$skip_pr" != "nopr" ]]; then
            create_webroot_pr "$skip_pr"
        fi
        
        final_push_completion_check
        return
    fi
    
    # Check if it's a submodule
    local submodules=($(get_submodules))
    local submodule_list=" ${submodules[*]} "
    if [[ "$submodule_list" =~ " $name " ]]; then
        if [ -d "$name" ]; then
            cd "$name"
            commit_push "$name" "$skip_pr"
            
            # Update webroot submodule reference
            cd_webroot
            safe_single_submodule_update "$name"
            if [ -n "$(git status --porcelain | grep $name)" ]; then
                git add "$name"
                git commit -m "Update $name submodule reference"
                
                # Try to push webroot changes
                if git push 2>/dev/null; then
                    echo "✅ Updated $name submodule reference"
                else
                    echo "🔄 Webroot push failed for $name - attempting PR workflow"
                    create_webroot_pr "$skip_pr"
                fi
            fi
            
            # Check if we need to create a webroot PR (for when webroot push succeeded but we want PR anyway)
            local webroot_commits_ahead=$(git rev-list --count upstream/main..HEAD 2>/dev/null || echo "0")
            if [[ "$webroot_commits_ahead" -gt "0" ]] && [[ "$skip_pr" != "nopr" ]]; then
                create_webroot_pr "$skip_pr"
            fi
            
            # Final push completion check
                final_push_completion_check
        else
            echo "⚠️ Submodule not found: $name"
        fi
        return
    fi
    
    # Check if it's an site repo
    local site_repos=($(get_site_repos))
    local site_repo_list=" ${site_repos[*]} "
    if [[ "$site_repo_list" =~ " $name " ]]; then
        if [ -d "$name" ]; then
            cd "$name"
            commit_push "$name" "$skip_pr"
            cd_webroot
            
                final_push_completion_check
        else
            echo "⚠️ Extra repo not found: $name"
        fi
        return
    fi
    
    echo "⚠️ Repository not recognized: $name"
    echo "Supported repositories:"
    echo "  Webroot: webroot"
    local submodules=($(get_submodules))
    echo "  Submodules: ${submodules[*]}"
    local site_repos=($(get_site_repos))
    echo "  Site Repos: ${site_repos[*]}"
}

# Push all submodules
push_submodules() {
    local skip_pr="$1"
    
    check_webroot
    
    # Auto-pull unless nopull/no pull is specified
    if [[ "$skip_pr" != *"nopull"* ]] && [[ "$skip_pr" != *"no pull"* ]]; then
        echo "🔄 Running pulls for submodules before we push..."
        pull_command
        echo "✅ Pull completed for submodules, proceeding with push..."
    fi
    
    # Push each submodule with changes - with safe directory management
    local submodules=($(get_submodules))
    local failed_pushes=()
    
    for sub in "${submodules[@]}"; do
        [ ! -d "$sub" ] && continue
        if ! safe_submodule_operation "$sub" "commit_push" "$sub" "$skip_pr"; then
            failed_pushes+=("$sub")
        fi
    done
    
    # Report any failures but continue with webroot update
    if [ ${#failed_pushes[@]} -gt 0 ]; then
        echo "⚠️ Failed to push the following submodules: ${failed_pushes[*]}"
        echo "💡 You may need to resolve these manually"
    fi
    
    # Update webroot submodule references
    safe_submodule_update
    if [ -n "$(git status --porcelain)" ]; then
        # Only add actual submodules defined in .gitmodules, not temporary repos
        local submodules=($(get_submodules))
        local has_changes=false
        for sub in "${submodules[@]}"; do
            if [ -n "$(git status --porcelain | grep "^M  $sub")" ]; then
                git add "$sub"
                has_changes=true
                echo "📌 Added submodule reference: $sub"
            fi
        done
        if [ "$has_changes" = true ]; then
            git commit -m "Update submodule references"
            git push 2>/dev/null || echo "🔄 Webroot push failed"
            echo "✅ Updated submodule references"
        else
            echo "ℹ️  No submodule reference changes to commit"
        fi
    fi
    
    # Final push completion check
    echo "🔍 Checking for remaining unpushed commits..."
    final_push_completion_check
}

# Complete push workflow
push_all() {
    local skip_pr="$1"
    
    check_webroot
    
    # Auto-pull unless nopull/no pull is specified
    if [[ "$skip_pr" != *"nopull"* ]] && [[ "$skip_pr" != *"no pull"* ]]; then
        echo "🔄 Running pulls before we push..."
        pull_command
        echo "✅ Pull completed, proceeding with push..."
    fi
    
    # Push webroot changes
    # When operating in webroot context, check for and stage submodule changes before committing
    if [[ "$OPERATING_ON_WEBROOT" == "true" ]]; then
        # Get list of modified submodules
        local modified_files=($(git status --porcelain | grep -E "^\s*M\s+" | awk '{print $2}'))
        if [[ ${#modified_files[@]} -gt 0 ]]; then
            echo "🔄 Staging modified submodules before webroot commit..."
            # Commit changes within each submodule first (skip regular files)
            for file in "${modified_files[@]}"; do
                if [ -d "$file" ] && [ -f "$file/.git" ]; then
                    echo "🔵 Committing changes in submodule: $file"
                    (cd "$file" && git add -A && local commit_msg=$(get_commit_message "$file" ".") && git commit -m "$commit_msg" 2>/dev/null) || echo "ℹ️  No changes to commit in $file"
                else
                    echo "🔵 Skipping non-submodule file: $file"
                fi
            done
            # Now add the updated submodule references
            for file in "${modified_files[@]}"; do
                echo "🔵 Adding updated submodule reference: $file"
                git add "$file"
            done
        fi
    fi
    commit_push "webroot" "$skip_pr"
    
    # Check if webroot needs PR after direct changes
    local webroot_commits_ahead=$(git rev-list --count upstream/main..HEAD 2>/dev/null || echo "0")
    if [[ "$webroot_commits_ahead" -gt "0" ]] && [[ "$skip_pr" != "nopr" ]]; then
        create_webroot_pr "$skip_pr"
    fi
    
    # Push all submodules
    push_submodules "$skip_pr"
    
    # Push site repos with safe directory management
    local site_repos=($(get_site_repos))
    local failed_site_pushes=()
    
    for repo in "${site_repos[@]}"; do
        [ ! -d "$repo" ] && continue
        if ! safe_submodule_operation "$repo" "commit_push" "$repo" "$skip_pr"; then
            failed_site_pushes+=("$repo")
        fi
    done
    
    # Report any failures
    if [ ${#failed_site_pushes[@]} -gt 0 ]; then
        echo "⚠️ Failed to push the following site repos: ${failed_site_pushes[*]}"
        echo "💡 You may need to resolve these manually"
    fi
    
    # Final push completion check for all repositories
    final_push_completion_check
    
    echo "✅ Complete push finished! - $(date +'%A, %b %-d at %-I:%M %p ET')"
    
    # Check site repos for uncommitted changes
    check_site_repos_for_changes
}

# Check site repos for uncommitted changes and prompt user
check_site_repos_for_changes() {
    cd $(git rev-parse --show-toplevel)
    
    local repos_with_changes=()
    local site_repos=($(get_site_repos))
    local repo_names=("${site_repos[@]}")
    
    # Check each site repo for changes
    for repo in "${repo_names[@]}"; do
        if [ -d "$repo" ]; then
            cd "$repo"
            if [ -n "$(git status --porcelain)" ]; then
                repos_with_changes+=("$repo")
            fi
            cd_webroot
        fi
    done
    
    # If there are changes, prompt the user
    if [ ${#repos_with_changes[@]} -gt 0 ]; then
        echo ""
        echo "📝 Extra repos with uncommitted changes detected:"
        echo ""
        
        local i=1
        for repo in "${repos_with_changes[@]}"; do
            echo "  $i) $repo"
            ((i++))
        done
        echo "  $i) all"
        echo ""
        
        read -p "Which site repo would you like to push? (1-$i or press Enter to skip): " choice
        
        if [ -n "$choice" ]; then
            if [ "$choice" -eq "$i" ] 2>/dev/null; then
                # Push all site repos with changes
                echo "🚀 Pushing all site repos with changes..."
                for repo in "${repos_with_changes[@]}"; do
                    push_site_repo "$repo"
                done
            elif [ "$choice" -ge 1 ] && [ "$choice" -lt "$i" ] 2>/dev/null; then
                # Push specific repo
                local selected_repo="${repos_with_changes[$((choice-1))]}"
                echo "🚀 Pushing $selected_repo..."
                push_site_repo "$selected_repo"
            else
                echo "❌ Invalid choice. Skipping site repo push."
            fi
        else
            echo "⏭️ Skipping site repo push."
        fi
    fi
}

# Push a specific site repo
push_site_repo() {
    local repo_name="$1"
    
    cd $(git rev-parse --show-toplevel)
    
    if [ -d "$repo_name" ]; then
        cd "$repo_name"
        
        if [ -n "$(git status --porcelain)" ]; then
            git add .
            local commit_msg=$(get_commit_message "$repo_name" ".")
            git commit -m "$commit_msg"
            
            if git push origin main 2>/dev/null; then
                echo "✅ Successfully pushed $repo_name repository"
            else
                echo "⚠️ Push failed for $repo_name repository"
                
                # Try to create PR if it's a fork
                local current_user=$(get_current_user)
                if [ $? -eq 0 ] && [ -n "$current_user" ]; then
                    local remote_url=$(git remote get-url origin)
                    if [[ "$remote_url" =~ "$current_user/$repo_name" ]]; then
                        echo "🔄 Creating pull request for $repo_name..."
                        gh pr create --title "Update $repo_name" --body "Automated update from webroot integration" --base main --head main 2>/dev/null || echo "PR creation failed for $repo_name"
                    fi
                fi
            fi
        else
            echo "✅ No changes to push in $repo_name"
        fi
        
        cd_webroot
    else
        echo "⚠️ Extra repo not found: $repo_name"
    fi
}

# Check all repositories for unpushed commits and push them
final_push_completion_check() {
    cd $(git rev-parse --show-toplevel)
    
    # Check webroot
    if [ -n "$(git rev-list --count @{u}..HEAD 2>/dev/null)" ] && [ "$(git rev-list --count @{u}..HEAD 2>/dev/null)" != "0" ]; then
        echo "📤 Found unpushed commits in webroot..."
        ensure_push_completion "webroot"
    fi
    
    # Check all submodules with safe directory management
    local submodules=($(get_submodules))
    for sub in "${submodules[@]}"; do
        if [ -d "$sub" ]; then
            safe_submodule_operation "$sub" 'bash -c "
                if [ -n \"\$(git rev-list --count @{u}..HEAD 2>/dev/null)\" ] && [ \"\$(git rev-list --count @{u}..HEAD 2>/dev/null)\" != \"0\" ]; then
                    echo \"📤 Found unpushed commits in '$sub'...\"
                    # Try to push any remaining commits
                    git push origin main 2>/dev/null || git push 2>/dev/null || echo \"💡 Manual push needed for '$sub'\"
                fi
            "' >/dev/null 2>&1
        fi
    done
    
    # Check site repos
    local site_repos=($(get_site_repos))
    for repo in "${site_repos[@]}"; do
        if [ -d "$repo" ]; then
            cd "$repo"
            if [ -n "$(git rev-list --count @{u}..HEAD 2>/dev/null)" ] && [ "$(git rev-list --count @{u}..HEAD 2>/dev/null)" != "0" ]; then
                echo "📤 Found unpushed commits in $repo..."
                ensure_push_completion "$repo"
            fi
            cd_webroot
        fi
    done
}

# Main command dispatcher
case "$1" in
    "pull"|"pull-all")
        pull_command "$2"
        ;;
    "push"|"push-all")
        if [ "$2" = "submodules" ]; then
            push_submodules "$3"
        elif [ "$2" = "all" ]; then
            push_all "$3"  # push all with optional parameter
        elif [ -z "$2" ]; then
            # SIMPLIFIED FIX: When just "push" with no parameters, use working command
            echo "🚀 Starting push workflow for all repositories..."
            validate_and_fix_remotes  # Single validation for corruption prevention
            push_all "nopull"  # Use the command we know works
        elif [ -n "$2" ]; then
            push_specific_repo "$2" "$3"
        fi
        ;;
    "fix-heads"|"fix")
        fix_all_detached_heads
        ;;
    "update-remotes"|"remotes")
        update_all_remotes_for_user
        ;;
    "refresh-auth"|"auth")
        current_user=$(get_current_user)
        if [ $? -eq 0 ]; then
            refresh_git_credentials "$current_user"
            update_all_remotes_for_user
        fi
        ;;
    # Legacy command support with helpful messages
    "update")
        echo "⚠️ Please use 'pull' or 'pull all' instead of 'update'. Examples:"
        echo "  • pull           - Pull all changes from webroot, submodules, and industry repos"
        echo "  • pull [submodule] - Pull changes for specific submodule only"
        echo "  • pull webroot   - Pull changes for webroot only"
        echo ""
        exit 1
        ;;
    "commit")
        echo "⚠️ Please use 'push' instead of 'commit'. Examples:"
        echo "  • push           - Push all repositories with changes"
        echo "  • push [submodule] - Push changes for specific submodule"
        echo "  • push webroot   - Push changes for webroot only"
        echo "  • push all       - Push all repositories with changes (same as 'push')"
        echo ""
        exit 1
        ;;
    *)
        echo "Usage: ./git.sh [pull|push|fix|remotes|auth] [repo_name|submodules|all] [nopr] [overwrite-local]"
        echo ""
        echo "Commands:"
        echo "  ./git.sh pull                      - Pull all repositories (webroot + submodules + site repos)"
        echo "  ./git.sh pull [repo_name]          - Pull specific repository"
        echo "  ./git.sh push                      - Push all repositories with changes"
        echo "  ./git.sh push all                  - Push all repositories with changes (same as 'push')"
        echo "  ./git.sh push [repo_name]          - Push specific repository"
        echo "  ./git.sh push submodules           - Push all submodules only"
        echo "  ./git.sh fix                       - Check and fix detached HEAD states in all repos"
        echo "  ./git.sh remotes                   - Update all remotes to current GitHub user"
        echo "  ./git.sh auth                      - Refresh git credentials for current GitHub user"
        echo ""
        echo "Supported Repository Names:"
        echo "  Webroot: webroot"
        submodules=($(get_submodules))
        echo "  Submodules: ${submodules[*]}"
        site_repos=($(get_site_repos))
        echo "  Site Repos: ${site_repos[*]}"
        echo ""
        echo "Options:"
        echo "  nopr                               - Skip PR creation on push failures"
        echo "  overwrite-local                    - Overwrite local commits with parent repository state"
        echo ""
        echo "Safety Features:"
        echo "  🛡️ Safe submodule updates enabled by default - preserves newer commits during merges"
        echo "  🔍 Prevents accidental rollback to older submodule commits from merged PRs"
        echo ""
        echo "Legacy Commands (deprecated):"
        echo "  update  -> use 'pull' or 'pull all'"
        echo "  commit  -> use 'push'"
        exit 1
        ;;
esac

# Always return to webroot repository root at the end. Webroot may have different names for each user who forks and clones it.

# Output blank line to help see where command completed
echo
