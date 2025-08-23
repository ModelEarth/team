#!/usr/bin/env bash
# Sync selected keys from .env into GitHub repo Variables & Secrets (via gh CLI)
# - Parses .env directly (ignores comments/blank lines)
# - Works on macOS bash 3.2 (no associative arrays)
# - Idempotent, supports --repo owner/name and --prune
#
# Usage:
#   ./scripts/04_sync_github_env.sh
#   ./scripts/04_sync_github_env.sh --repo owner/name
#   ./scripts/04_sync_github_env.sh --env path/to/.env --prune
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

REPO_OVERRIDE=""
ENV_PATH_OVERRIDE=""
PRUNE=0
VERBOSE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_OVERRIDE="${2:-}"; shift 2;;
    --env) ENV_PATH_OVERRIDE="${2:-}"; shift 2;;
    --prune) PRUNE=1; shift;;
    --verbose|-v) VERBOSE=1; shift;;
    *) die "Unknown arg: $1";;
  esac
done

# --- Preconditions ----------------------------------------------------------
command -v gh >/dev/null 2>&1 || die "Install GitHub CLI: https://cli.github.com/"
gh auth status >/dev/null 2>&1 || die "Run 'gh auth login' first"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_PATH="${ENV_PATH_OVERRIDE:-${REPO_ROOT}/.env}"
[[ -f "$ENV_PATH" ]] || die "No .env at $ENV_PATH"

# Detect repo owner/name
if [[ -n "$REPO_OVERRIDE" ]]; then
  GH_REPO="$REPO_OVERRIDE"
elif [[ -n "${GITHUB_OWNER:-}" && -n "${GITHUB_REPO:-}" ]]; then
  GH_REPO="${GITHUB_OWNER}/${GITHUB_REPO}"
else
  ORIGIN_URL="$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)"
  if [[ "$ORIGIN_URL" =~ github\.com[:/]{1}([^/]+)/([^/]+)(\.git)?$ ]]; then
    GH_REPO="${BASH_REMATCH[1]}/${BASH_REMATCH[2]%.git}"
  else
    GH_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
  fi
fi
[[ -n "$GH_REPO" ]] || die "Could not determine repo; pass --repo owner/name"

echo "==> Syncing .env → GitHub for repo: $GH_REPO"
echo "    .env: $ENV_PATH"
[[ $PRUNE -eq 1 ]] && echo "    prune: enabled"

# --- Parse .env into two simple lists we can look up ------------------------
ENV_KEYS=()
ENV_VALS=()

# read .env; supports KEY=VALUE (quoted/unquoted), trims, strips inline comments after '#'
while IFS= read -r line || [ -n "$line" ]; do
  # remove leading/trailing spaces
  line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  # skip blank or comments
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  # split at first "="
  key="${line%%=*}"
  value="${line#*=}"
  # trim key/value
  key="$(echo "$key" | sed -e 's/[[:space:]]*$//')"
  value="$(echo "$value" | sed -e 's/^[[:space:]]*//')"
  # drop inline comments (KEY=val # comment)
  case "$value" in
    \'*\'|\"*\") : ;;   # quoted -> keep as-is
    *) value="${value%%#*}";;
  esac
  # strip surrounding quotes
  if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:-1}"
  fi
  # skip if key empty
  [[ -z "$key" ]] && continue
  # store
  ENV_KEYS+=("$key")
  ENV_VALS+=("$value")
done < "$ENV_PATH"

# helper to fetch from parsed arrays
get_from_env_file () {
  local search="$1"
  local i=0
  local n="${#ENV_KEYS[@]}"
  while [[ $i -lt $n ]]; do
    if [[ "${ENV_KEYS[$i]}" == "$search" ]]; then
      printf '%s' "${ENV_VALS[$i]}"
      return 0
    fi
    i=$((i+1))
  done
  printf ''
}

# --- Define which keys to manage -------------------------------------------
# Secrets (GitHub Secrets)
SECRET_KEYS=(
  COMMONS_PASSWORD
  EXIOBASE_PASSWORD
  GEMINI_API_KEY
  CLAUDE_API_KEY
)
# Optional OIDC secrets if present (we’ll compute values shortly)
# We'll append GCP_WORKLOAD_IDENTITY_PROVIDER / GCP_SERVICE_ACCOUNT if non-empty.

# Variables (GitHub Variables)
VAR_KEYS=(
  GCP_PROJECT_ID
  GCP_REGION
  GCP_AR_REPO
  CLOUD_RUN_SERVICE
  SERVER_HOST
  SERVER_PORT
  COMMONS_HOST
  COMMONS_PORT
  COMMONS_NAME
  COMMONS_USER
  COMMONS_SSL_MODE
  PROJECTS_FILE_PATH
  EXIOBASE_HOST
  EXIOBASE_PORT
  EXIOBASE_NAME
  EXIOBASE_USER
  EXIOBASE_SSL_MODE
)

# Build values for variables (map GOOGLE_* → GCP_*)
GCP_PROJECT_ID="$(get_from_env_file GOOGLE_PROJECT_ID)"
GCP_REGION="$(get_from_env_file GOOGLE_REGION)"
GCP_AR_REPO="$(get_from_env_file GOOGLE_AR_REPO)"
CLOUD_RUN_SERVICE="$(get_from_env_file CLOUD_RUN_SERVICE)"
[[ -z "$CLOUD_RUN_SERVICE" ]] && CLOUD_RUN_SERVICE="partner-tools-api"

SERVER_HOST="$(get_from_env_file SERVER_HOST)"; [[ -z "$SERVER_HOST" ]] && SERVER_HOST="0.0.0.0"
SERVER_PORT="$(get_from_env_file SERVER_PORT)"; [[ -z "$SERVER_PORT" ]] && SERVER_PORT="8080"

COMMONS_HOST="$(get_from_env_file COMMONS_HOST)"
COMMONS_PORT="$(get_from_env_file COMMONS_PORT)"
COMMONS_NAME="$(get_from_env_file COMMONS_NAME)"
COMMONS_USER="$(get_from_env_file COMMONS_USER)"
COMMONS_SSL_MODE="$(get_from_env_file COMMONS_SSL_MODE)"
PROJECTS_FILE_PATH="$(get_from_env_file PROJECTS_FILE_PATH)"

EXIOBASE_HOST="$(get_from_env_file EXIOBASE_HOST)"
EXIOBASE_PORT="$(get_from_env_file EXIOBASE_PORT)"
EXIOBASE_NAME="$(get_from_env_file EXIOBASE_NAME)"
EXIOBASE_USER="$(get_from_env_file EXIOBASE_USER)"
EXIOBASE_SSL_MODE="$(get_from_env_file EXIOBASE_SSL_MODE)"

# Optional runtime SA variable
GCP_RUNTIME_SA="$(get_from_env_file GCP_RUNTIME_SA)"
if [[ -n "$GCP_RUNTIME_SA" ]]; then
  VAR_KEYS+=( GCP_RUNTIME_SA )
fi

# Secrets values
COMMONS_PASSWORD="$(get_from_env_file COMMONS_PASSWORD)"
EXIOBASE_PASSWORD="$(get_from_env_file EXIOBASE_PASSWORD)"
GEMINI_API_KEY="$(get_from_env_file GEMINI_API_KEY)"
CLAUDE_API_KEY="$(get_from_env_file CLAUDE_API_KEY)"

# --- OIDC provider normalization (THE IMPORTANT CHANGE) --------------------
# Normalize GOOGLE_WORKLOAD_IDENTITY_PROVIDER into canonical format if needed,
# then expose it to GitHub as the secret GCP_WORKLOAD_IDENTITY_PROVIDER.
GOOGLE_WORKLOAD_IDENTITY_PROVIDER="$(get_from_env_file GOOGLE_WORKLOAD_IDENTITY_PROVIDER)"
if [[ -n "$GOOGLE_WORKLOAD_IDENTITY_PROVIDER" && ! "$GOOGLE_WORKLOAD_IDENTITY_PROVIDER" =~ ^projects/.*/locations/global/workloadIdentityPools/.*/providers/.*$ ]]; then
  PN="$(get_from_env_file GOOGLE_PROJECT_NUMBER)"
  WIF_POOL_ID="$(get_from_env_file GOOGLE_WIF_POOL_ID)"
  WIF_PROVIDER_ID="$(get_from_env_file GOOGLE_WIF_PROVIDER_ID)"
  if [[ -n "$PN" && -n "$WIF_POOL_ID" && -n "$WIF_PROVIDER_ID" ]]; then
    GOOGLE_WORKLOAD_IDENTITY_PROVIDER="projects/${PN}/locations/global/workloadIdentityPools/${WIF_POOL_ID}/providers/${WIF_PROVIDER_ID}"
    echo "   normalized GOOGLE_WORKLOAD_IDENTITY_PROVIDER → $GOOGLE_WORKLOAD_IDENTITY_PROVIDER"
  else
    die "GOOGLE_WORKLOAD_IDENTITY_PROVIDER is non-canonical and cannot be normalized (need GOOGLE_PROJECT_NUMBER, GOOGLE_WIF_POOL_ID, GOOGLE_WIF_PROVIDER_ID)."
  fi
fi
GCP_WORKLOAD_IDENTITY_PROVIDER="$GOOGLE_WORKLOAD_IDENTITY_PROVIDER"

# Also pass the deploy SA email as the secret GCP_SERVICE_ACCOUNT if present
GCP_SERVICE_ACCOUNT="$(get_from_env_file GOOGLE_SA_EMAIL)"

# Append optional OIDC secrets if non-empty
[[ -n "$GCP_WORKLOAD_IDENTITY_PROVIDER" ]] && SECRET_KEYS+=( GCP_WORKLOAD_IDENTITY_PROVIDER )
[[ -n "$GCP_SERVICE_ACCOUNT" ]] && SECRET_KEYS+=( GCP_SERVICE_ACCOUNT )

[[ $VERBOSE -eq 1 ]] && echo "Parsed keys: ${#ENV_KEYS[@]}"

# --- Helpers to set GH vars/secrets ----------------------------------------
set_var () {
  local key="$1" val="$2"
  if [[ -z "$val" ]]; then
    echo "  [var] skip empty: $key"
    return 0
  fi
  gh variable set "$key" --repo "$GH_REPO" --body "$val" >/dev/null
  echo "  [var] set: $key"
}

set_secret () {
  local key="$1" val="$2"
  if [[ -z "$val" ]]; then
    echo "  [sec] skip empty: $key"
    return 0
  fi
  printf "%s" "$val" | gh secret set "$key" --repo "$GH_REPO" --body - >/dev/null
  echo "  [sec] set: $key"
}

# Access by indirection (simple: echo value of a named var above)
get_val () {
  eval "printf '%s' \"\${$1:-}\""
}

# --- Apply Variables --------------------------------------------------------
echo "==> Setting GitHub Variables..."
for key in "${VAR_KEYS[@]}"; do
  val="$(get_val "$key")"
  set_var "$key" "$val"
done

# --- Apply Secrets ----------------------------------------------------------
echo "==> Setting GitHub Secrets..."
for key in "${SECRET_KEYS[@]}"; do
  val="$(get_val "$key")"
  set_secret "$key" "$val"
done

# --- Optional prune ---------------------------------------------------------
if [[ $PRUNE -eq 1 ]]; then
  echo "==> Pruning managed GitHub Variables not present in .env (only our known keys)..."
  existing_vars="$(gh variable list --repo "$GH_REPO" --json name -q '.[].name' || true)"
  for key in "${VAR_KEYS[@]}"; do
    # If the value we computed is empty, and it currently exists, delete it.
    val="$(get_val "$key")"
    if [[ -z "$val" ]] && echo "$existing_vars" | grep -qx "$key"; then
      gh variable delete "$key" --repo "$GH_REPO" -y >/dev/null || true
      echo "  [var] deleted: $key"
    fi
  done

  echo "==> Pruning managed GitHub Secrets not present in .env (only our known keys)..."
  existing_secs="$(gh secret list --repo "$GH_REPO" --json name -q '.[].name' || true)"
  for key in "${SECRET_KEYS[@]}"; do
    val="$(get_val "$key")"
    if [[ -z "$val" ]] && echo "$existing_secs" | grep -qx "$key"; then
      gh secret delete "$key" --repo "$GH_REPO" -y >/dev/null || true
      echo "  [sec] deleted: $key"
    fi
  done
fi

echo "✅ Sync complete."
