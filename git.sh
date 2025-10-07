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

# Parse command line arguments for global flags
for arg in "$@"; do
    case $arg in
        overwrite-local)
            SAFE_SUBMODULE_UPDATES=false
            echo "⚠️ WARNING: Will overwrite local commits with parent repository state"
            ;;
    esac
done

# Helper function to check if we're in webroot
check_webroot() {
    # Check if we're in the parent webroot directory
    if [ -f "../.gitmodules" ] && [ -d "../.git" ]; then
        CURRENT_REMOTE=$(git -C .. remote get-url origin 2>/dev/null || echo "")
    else
        CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
    fi
    if [[ "$CURRENT_REMOTE" != *"webroot"* ]]; then
        echo "⚠️ ERROR: Not in webroot repository."
        exit 1
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

# Parse extra repos from extra-repos.txt file in webroot directory
get_extra_repos() {
    local extra_file
    if [ -f "extra-repos.txt" ]; then
        # We're in webroot directory
        extra_file="extra-repos.txt"
    elif [ -f "../extra-repos.txt" ]; then
        # We're in team subdirectory
        extra_file="../extra-repos.txt"
    else
        echo "⚠️ WARNING: extra-repos.txt file not found" >&2
        return 0  # Not an error, just no extra repos
    fi
    
    # Skip header line and parse CSV format (Repo,Path)
    tail -n +2 "$extra_file" | cut -d',' -f1
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
    cd ..
    
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
            cd ..
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
                    cd ..
                    git add "$sub"
                    echo "📌 Updated parent repo to use newer $sub commit from $update_source"
                elif [ "$expected_timestamp" -gt "$current_timestamp" ]; then
                    echo "⬆️ Updating $sub to parent's expected commit: $expected_commit ($(git show -s --format='%ci' "$expected_commit" 2>/dev/null || echo 'unknown date'))"
                    git checkout "$expected_commit" 2>/dev/null || echo "⚠️ Failed to checkout $expected_commit in $sub"
                elif [ "$expected_timestamp" -lt "$current_timestamp" ]; then
                    echo "🛡️ Preserving newer commit in $sub: $current_commit ($(git show -s --format='%ci' "$current_commit" 2>/dev/null || echo 'unknown date'))"
                    echo "   ↳ Parent repo wants older commit: $expected_commit ($(git show -s --format='%ci' "$expected_commit" 2>/dev/null || echo 'unknown date'))"
                    
                    # Update parent repo to point to the newer commit
                    cd ..
                    git add "$sub"
                    echo "📌 Updated parent repo to preserve newer $sub commit"
                else
                    echo "✅ $sub is already at the correct commit"
                fi
                cd ..
            else
                echo "⚠️ Could not determine commit information for $sub"
                cd ..
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
        cd ..
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
    
    # Fix detached HEAD before committing
    fix_detached_head "$name"
    
    # Check if there are changes to commit first
    if [ -n "$(git status --porcelain)" ]; then
        # Only check user change and update remotes when there are actual changes
        check_user_change "$name"
        git add .
        git commit -m "Update $name"
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
                return 0
            elif git push origin $target_branch 2>/dev/null; then
                echo "✅ Successfully pushed $name to $target_branch"
                ensure_push_completion "$name"
                return 0
            elif push_error=$(git push 2>&1); then
                echo "✅ Successfully pushed $name"
                ensure_push_completion "$name"
                return 0
            else
                # Check for specific OAuth workflow scope error
                if [[ "$push_error" == *"workflow"* ]] && [[ "$push_error" == *"OAuth"* ]]; then
                    echo "🔒 GitHub OAuth token lacks 'workflow' scope for updating GitHub Actions"
                    echo "💡 To fix this, run: gh auth refresh -h github.com -s workflow"
                    echo "💡 Then retry the commit command"
                    return 1
                else
                    echo "⚠️ Push failed for owned repository $name with error:"
                    echo "$push_error"
                    echo "💡 Trying force push with lease..."
                    if git push --force-with-lease 2>/dev/null; then
                        echo "✅ Force pushed $name"
                        ensure_push_completion "$name"
                        return 0
                    else
                        echo "❌ All push strategies failed for owned repo $name"
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
                            return 1
                        fi
                    fi
                    
                    # Create PR if not skipped
                    if [[ "$skip_pr" != "nopr" ]]; then
                        echo "📝 Creating pull request..."
                        local pr_url=$(gh pr create \
                            --title "Update $name" \
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
                gh pr create --title "Update $name" --body "Automated update" --base $target_branch --head feature-$name-updates 2>/dev/null || \
                echo "🔄 PR creation failed for $name"
            fi
        fi
    fi
}

# Pull command - streamlined pull workflow  
pull_command() {
    local repo_name="$1"
    
    echo "🔄 Starting pull workflow..."
    cd $(git rev-parse --show-toplevel)
    check_webroot
    
    # If specific repo name provided, pull only that repo
    if [ -n "$repo_name" ]; then
        pull_specific_repo "$repo_name"
        return
    fi
    
    # Pull webroot
    echo "📥 Pulling webroot..."
    output=$(git -C .. pull origin main 2>&1)
    if [[ $? -ne 0 ]]; then
        echo "⚠️ Checking for conflicts in webroot"
    elif [[ "$output" != *"Already up to date"* ]]; then
        echo "$output"
    fi
    
    # Update webroot from parent (skip partnertools)
    WEBROOT_REMOTE=$(git -C .. remote get-url origin)
    if [[ "$WEBROOT_REMOTE" != *"partnertools"* ]]; then
        add_upstream "webroot" "true"
        merge_upstream "webroot"
    fi
    
    # Pull submodules
    echo "📥 Pulling submodules..."
    local submodules=($(get_submodules))
    for sub in "${submodules[@]}"; do
        [ ! -d "$sub" ] && continue
        cd "$sub"
        
        REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
        if [[ "$REMOTE" != *"partnertools"* ]]; then
            local is_capital=$(is_capital_repo "$sub")
            add_upstream "$sub" "$is_capital"
            merge_upstream "$sub"
        fi
        cd ..
    done
    
    # Update submodule references safely (preserve newer commits)
    echo "🔄 Updating submodule references..."
    safe_submodule_update
    
    # Check for and fix any detached HEAD states after pulls
    fix_all_detached_heads
    
    # Pull extra repos
    echo "📥 Pulling extra repos..."
    local extra_repos=($(get_extra_repos))
    for repo in "${extra_repos[@]}"; do
        [ ! -d "$repo" ] && continue
        cd "$repo"
        output=$(git pull origin main 2>&1)
        if [[ $? -ne 0 ]]; then
            echo "⚠️ Checking for conflicts in $repo"
        elif [[ "$output" != *"Already up to date"* ]]; then
            echo "$output"
        fi
        
        REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
        if [[ "$REMOTE" != *"partnertools"* ]]; then
            add_upstream "$repo" "false"
            merge_upstream "$repo"
        fi
        cd ..
    done
    
    local submodules=($(get_submodules))
    local extra_repos=($(get_extra_repos))
    local submodule_count=${#submodules[@]}
    local extra_count=${#extra_repos[@]}
    local total_count=$((1 + submodule_count + extra_count))
    
    echo "✅ Pull completed - 1 webroot + ${submodule_count} submodules + ${extra_count} extra repos = ${total_count} repositories"
}

# Pull specific repository
pull_specific_repo() {
    local repo_name="$1"
    
    cd $(git rev-parse --show-toplevel)
    check_webroot
    
    # Check if it's webroot
    if [[ "$repo_name" == "webroot" ]]; then
        echo "📥 Pulling webroot..."
        output=$(git -C .. pull origin main 2>&1)
        if [[ $? -ne 0 ]]; then
            echo "⚠️ Checking for conflicts in webroot"
        elif [[ "$output" != *"Already up to date"* ]]; then
            echo "$output"
        fi
        
        WEBROOT_REMOTE=$(git -C .. remote get-url origin)
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
            
            REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
            if [[ "$REMOTE" != *"partnertools"* ]]; then
                local is_capital=$(is_capital_repo "$repo_name")
                add_upstream "$repo_name" "$is_capital"
                merge_upstream "$repo_name"
            fi
            
            cd ..
            safe_single_submodule_update "$repo_name"
            echo "✅ $repo_name submodule pull completed!"
        else
            echo "⚠️ Submodule not found: $repo_name"
        fi
        return
    fi
    
    # Check if it's an extra repo
    local extra_repos=($(get_extra_repos))
    local extra_repo_list=" ${extra_repos[*]} "
    if [[ "$extra_repo_list" =~ " $repo_name " ]]; then
        if [ -d "$repo_name" ]; then
            echo "📥 Pulling extra repo: $repo_name..."
            cd "$repo_name"
            output=$(git pull origin main 2>&1)
            if [[ $? -ne 0 ]]; then
                echo "⚠️ Checking for conflicts in $repo_name"
            elif [[ "$output" != *"Already up to date"* ]]; then
                echo "$output"
            fi
            
            REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
            if [[ "$REMOTE" != *"partnertools"* ]]; then
                add_upstream "$repo_name" "false"
                merge_upstream "$repo_name"
            fi
            cd ..
            echo "✅ $repo_name extra repo pull completed!"
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
    local extra_repos=($(get_extra_repos))
    echo "  Extra Repos: ${extra_repos[*]}"
}

# Check and fix detached HEAD states in all repositories
fix_all_detached_heads() {
    cd $(git rev-parse --show-toplevel)
    check_webroot
    
    local fixed_count=0
    
    # Check webroot
    if fix_detached_head "webroot"; then
        ((fixed_count++))
    fi
    
    # Check all submodules
    local submodules=($(get_submodules))
    for sub in "${submodules[@]}"; do
        if [ -d "$sub" ]; then
            cd "$sub"
            if fix_detached_head "$sub"; then
                ((fixed_count++))
            fi
            cd ..
        fi
    done
    
    # Check extra repos
    local extra_repos=($(get_extra_repos))
    for repo in "${extra_repos[@]}"; do
        if [ -d "$repo" ]; then
            cd "$repo"
            if fix_detached_head "$repo"; then
                ((fixed_count++))
            fi
            cd ..
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
    cd $(git rev-parse --show-toplevel)
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
            cd "$sub"
            if check_user_change "$sub"; then
                ((updated_count++))
            fi
            cd ..
        fi
    done
    
    # Check extra repos
    local extra_repos=($(get_extra_repos))
    for repo in "${extra_repos[@]}"; do
        if [ -d "$repo" ]; then
            cd "$repo"
            if check_user_change "$repo"; then
                ((updated_count++))
            fi
            cd ..
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
        echo "⚠️ Webroot PR creation failed or not needed"
    fi
}

# Push specific repository
push_specific_repo() {
    local name="$1"
    local skip_pr="$2"
    
    cd $(git rev-parse --show-toplevel)
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
            cd ..
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
    
    # Check if it's an extra repo
    local extra_repos=($(get_extra_repos))
    local extra_repo_list=" ${extra_repos[*]} "
    if [[ "$extra_repo_list" =~ " $name " ]]; then
        if [ -d "$name" ]; then
            cd "$name"
            commit_push "$name" "$skip_pr"
            cd ..
            
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
    local extra_repos=($(get_extra_repos))
    echo "  Extra Repos: ${extra_repos[*]}"
}

# Push all submodules
push_submodules() {
    local skip_pr="$1"
    
    cd $(git rev-parse --show-toplevel)
    check_webroot
    
    # Auto-pull unless nopull/no pull is specified
    if [[ "$skip_pr" != *"nopull"* ]] && [[ "$skip_pr" != *"no pull"* ]]; then
        echo "🔄 Running pulls for submodules before we push..."
        pull_command
        echo "✅ Pull completed for submodules, proceeding with push..."
    fi
    
    # Push each submodule with changes
    local submodules=($(get_submodules))
    for sub in "${submodules[@]}"; do
        [ ! -d "$sub" ] && continue
        cd "$sub"
        commit_push "$sub" "$skip_pr"
        cd ..
    done
    
    # Update webroot submodule references
    safe_submodule_update
    if [ -n "$(git status --porcelain)" ]; then
        git add .
        git commit -m "Update submodule references"
        git push 2>/dev/null || echo "🔄 Webroot push failed"
        echo "✅ Updated submodule references"
    fi
    
    # Final push completion check
    echo "🔍 Checking for remaining unpushed commits..."
    final_push_completion_check
}

# Complete push workflow
push_all() {
    local skip_pr="$1"
    
    cd $(git rev-parse --show-toplevel)
    check_webroot
    
    # Auto-pull unless nopull/no pull is specified
    if [[ "$skip_pr" != *"nopull"* ]] && [[ "$skip_pr" != *"no pull"* ]]; then
        echo "🔄 Running pulls before we push..."
        pull_command
        echo "✅ Pull completed, proceeding with push..."
    fi
    
    # Push webroot changes
    commit_push "webroot" "$skip_pr"
    
    # Check if webroot needs PR after direct changes
    local webroot_commits_ahead=$(git rev-list --count upstream/main..HEAD 2>/dev/null || echo "0")
    if [[ "$webroot_commits_ahead" -gt "0" ]] && [[ "$skip_pr" != "nopr" ]]; then
        create_webroot_pr "$skip_pr"
    fi
    
    # Push all submodules
    push_submodules "$skip_pr"
    
    # Push extra repos
    local extra_repos=($(get_extra_repos))
    for repo in "${extra_repos[@]}"; do
        [ ! -d "$repo" ] && continue
        cd "$repo"
        commit_push "$repo" "$skip_pr"
        cd ..
    done
    
    # Final push completion check for all repositories
    final_push_completion_check
    
    echo "✅ Complete push finished!"
    
    # Check extra repos for uncommitted changes
    check_extra_repos_for_changes
}

# Check extra repos for uncommitted changes and prompt user
check_extra_repos_for_changes() {
    cd $(git rev-parse --show-toplevel)
    
    local repos_with_changes=()
    local extra_repos=($(get_extra_repos))
    local repo_names=("${extra_repos[@]}")
    
    # Check each extra repo for changes
    for repo in "${repo_names[@]}"; do
        if [ -d "$repo" ]; then
            cd "$repo"
            if [ -n "$(git status --porcelain)" ]; then
                repos_with_changes+=("$repo")
            fi
            cd ..
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
        
        read -p "Which extra repo would you like to push? (1-$i or press Enter to skip): " choice
        
        if [ -n "$choice" ]; then
            if [ "$choice" -eq "$i" ] 2>/dev/null; then
                # Push all extra repos with changes
                echo "🚀 Pushing all extra repos with changes..."
                for repo in "${repos_with_changes[@]}"; do
                    push_extra_repo "$repo"
                done
            elif [ "$choice" -ge 1 ] && [ "$choice" -lt "$i" ] 2>/dev/null; then
                # Push specific repo
                local selected_repo="${repos_with_changes[$((choice-1))]}"
                echo "🚀 Pushing $selected_repo..."
                push_extra_repo "$selected_repo"
            else
                echo "❌ Invalid choice. Skipping extra repo push."
            fi
        else
            echo "⏭️ Skipping extra repo push."
        fi
    fi
}

# Push a specific extra repo
push_extra_repo() {
    local repo_name="$1"
    
    cd $(git rev-parse --show-toplevel)
    
    if [ -d "$repo_name" ]; then
        cd "$repo_name"
        
        if [ -n "$(git status --porcelain)" ]; then
            git add .
            git commit -m "Update $repo_name repository"
            
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
        
        cd ..
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
    
    # Check all submodules
    local submodules=($(get_submodules))
    for sub in "${submodules[@]}"; do
        if [ -d "$sub" ]; then
            cd "$sub"
            if [ -n "$(git rev-list --count @{u}..HEAD 2>/dev/null)" ] && [ "$(git rev-list --count @{u}..HEAD 2>/dev/null)" != "0" ]; then
                echo "📤 Found unpushed commits in $sub..."
                ensure_push_completion "$sub"
            fi
            cd ..
        fi
    done
    
    # Check extra repos
    local extra_repos=($(get_extra_repos))
    for repo in "${extra_repos[@]}"; do
        if [ -d "$repo" ]; then
            cd "$repo"
            if [ -n "$(git rev-list --count @{u}..HEAD 2>/dev/null)" ] && [ "$(git rev-list --count @{u}..HEAD 2>/dev/null)" != "0" ]; then
                echo "📤 Found unpushed commits in $repo..."
                ensure_push_completion "$repo"
            fi
            cd ..
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
        elif [ "$2" = "all" ] || [ -z "$2" ]; then
            push_all "$2$3"  # Handle both 'push' and 'push all [nopr]'
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
        echo "  ./git.sh pull                      - Pull all repositories (webroot + submodules + extra repos)"
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
        extra_repos=($(get_extra_repos))
        echo "  Extra Repos: ${extra_repos[*]}"
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
cd $(git rev-parse --show-toplevel)