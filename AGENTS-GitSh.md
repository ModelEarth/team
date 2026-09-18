# AGENTS-GitSh.md

`git.sh` is an optional scripted approach to committing and pushing changes across this repo's submodules and site repos, with built-in PR fallback and multi-account handling. It is not necessary now that Claude and other agents handle "commit and push" effectively with direct `git` commands — this file is kept for reference and for cases where the script is preferred over direct git.

See [AGENTS.md](AGENTS.md) for the standard (non-git.sh) git workflow.

## Using git.sh

When push or pull requests are received, ask the user:

1. Use our easeful Github git.sh script to handle submodules with error handling. (recommended)
2. Send the request directly to Github

The ./git.sh commands are `./git.sh push` and `./git.sh pull`

**IMPORTANT**: Always navigate to the root folder before running git.sh (see Repository Root Navigation in AGENTS.md).

- In a git.sh push, include commit info
- **Do NOT assume a PR was created** when git.sh reports "fork workflow" — if the current account is a collaborator on the target repo, the push succeeds directly without a PR. Only mention a PR if git.sh explicitly confirms one was created.

### Pull / Pull All
When you type "pull" or "pull all" and choose the git.sh workflow, run this comprehensive pull workflow that pulls from all parent repos, submodules, and site repos:

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

#### Default Commit Messages (Non-Claude):
When git.sh is invoked without Claude, default commit messages follow this format:
- **Single file**: "Updated filename.ext"
- **Multiple files**: "Updated file1.ext, file2.ext, file3.ext..." (first 3 unique filenames)
- **Many files**: "Updated file1.ext, file2.ext, file3.ext..." (shows "..." for 4+ files)

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

### Submodule Version Conflicts (git.sh detection)

`git.sh safe_submodule_update` detects when a submodule's local commit is older than the remote (origin/main) during a git.sh pull. See AGENTS.md's "Submodule Version Conflicts" section for the merge-forward resolution steps to follow when this happens — those steps apply the same way whether the divergence was detected by git.sh or noticed directly.
