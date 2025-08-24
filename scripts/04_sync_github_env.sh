#!/usr/bin/env bash
# Sync selected keys from .env into GitHub repo Variables & Secrets (via gh CLI)
# - Parses .env directly (ignores comments/blank lines)
# - Works on macOS bash 3.2 (no associative arrays)
# - Idempotent, supports --repo owner/name and --prune
#
# Usage:
#   ./scripts/04_sync_github_env.sh
#   ./scripts/04_sync_github_env.sh --repo owner/name
#   ./scripts/04_sync_github_env.sh --env path/to/.env
#   ./scripts/04_sync_github_env.sh --prune
#   ./scripts/04_sync_github_env.sh --show-wip --verify-gcp
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }

REPO_OVERRIDE=""
ENV_PATH_OVERRIDE=""
PRUNE=0
VERBOSE=0
SHOW_WIP=0
VERIFY_GCP=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) REPO_OVERRIDE="${2:-}"; shift 2;;
    --env) ENV_PATH_OVERRIDE="${2:-}"; shift 2;;
    --prune) PRUNE=1; shift;;
    --verbose|-v) VERBOSE=1; shift;;
    --show-wip) SHOW_WIP=1; shift;;
    --verify-gcp) VERIFY_GCP=1; shift;;
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

# --- Parse .env into arrays -------------------------------------------------
ENV_KEYS=()
ENV_VALS=()

# Read .env: supports KEY=VALUE (quoted/unquoted), strips inline comments and CRLF, trims whitespace
while IFS= read -r line || [ -n "$line" ]; do
  line="$(printf '%s' "$line" | tr -d '\r')"
  line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"   # trim
  [[ -z "$line" || "$line" =~ ^# ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  key="$(echo "$key" | sed -e 's/[[:space:]]*$//')"
  value="$(echo "$value" | sed -e 's/^[[:space:]]*//')"
  case "$value" in
    \'*\'|\"*\") : ;;     # keep quoted as-is for now
    *) value="${value%%#*}";;
  esac
  # strip surrounding quotes if any
  if [[ "$value" =~ ^\".*\"$ || "$value" =~ ^\'.*\'$ ]]; then
    value="${value:1:-1}"
  fi
  # normalize CRLF (again) and outer whitespace
  value="$(printf "%s" "$value" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  [[ -z "$key" ]] && continue
  ENV_KEYS+=("$key")
  ENV_VALS+=("$value")
done < "$ENV_PATH"

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

# --- Managed keys -----------------------------------------------------------
# Variables (GitHub Variables) - non-secret
VAR_KEYS=(
  GCP_PROJECT_ID
  GCP_PROJECT_NUMBER
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
  GOOGLE_WIF_POOL_ID
  GOOGLE_WIF_PROVIDER_ID
)

# Secrets (GitHub Secrets) - secret
SECRET_KEYS_BASE=(
  COMMONS_PASSWORD
  EXIOBASE_PASSWORD
  GEMINI_API_KEY
  CLAUDE_API_KEY
)

# --- Build values for Variables --------------------------------------------
GCP_PROJECT_ID="$(get_from_env_file GOOGLE_PROJECT_ID)"
GCP_PROJECT_NUMBER="$(get_from_env_file GOOGLE_PROJECT_NUMBER)"
GCP_REGION="$(get_from_env_file GOOGLE_REGION)"
GCP_AR_REPO="$(get_from_env_file GOOGLE_AR_REPO)"
CLOUD_RUN_SERVICE="$(get_from_env_file CLOUD_RUN_SERVICE)"; [[ -z "$CLOUD_RUN_SERVICE" ]] && CLOUD_RUN_SERVICE="partner-tools-api"

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

GOOGLE_WIF_POOL_ID="$(get_from_env_file GOOGLE_WIF_POOL_ID)"
GOOGLE_WIF_PROVIDER_ID="$(get_from_env_file GOOGLE_WIF_PROVIDER_ID)"

# --- OIDC provider & SA from .env (GOOGLE_* names) -------------------------
RAW_WIP="$(get_from_env_file GOOGLE_WORKLOAD_IDENTITY_PROVIDER)"
RAW_SA="$(get_from_env_file GOOGLE_SA_EMAIL)"

# Normalize/trim both
GCP_WORKLOAD_IDENTITY_PROVIDER="$(printf "%s" "$RAW_WIP" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
GCP_SERVICE_ACCOUNT="$(printf "%s" "$RAW_SA" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"

# If WIP not present but components exist, build canonical from components
if [[ -z "$GCP_WORKLOAD_IDENTITY_PROVIDER" && -n "$GCP_PROJECT_NUMBER" && -n "$GOOGLE_WIF_POOL_ID" && -n "$GOOGLE_WIF_PROVIDER_ID" ]]; then
  GCP_WORKLOAD_IDENTITY_PROVIDER="projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GOOGLE_WIF_POOL_ID}/providers/${GOOGLE_WIF_PROVIDER_ID}"
fi

# Local-only peek (if you want to confirm the value you're about to upload)
if [[ $SHOW_WIP -eq 1 && -n "$GCP_WORKLOAD_IDENTITY_PROVIDER" ]]; then
  echo "WIP (normalized): $GCP_WORKLOAD_IDENTITY_PROVIDER"
fi

# Optional: verify with gcloud
if [[ $VERIFY_GCP -eq 1 && -n "$GCP_WORKLOAD_IDENTITY_PROVIDER" ]]; then
  if command -v gcloud >/dev/null 2>&1; then
    PROJ_NUM="$(echo "$GCP_WORKLOAD_IDENTITY_PROVIDER" | sed -n 's#^projects/\([0-9]\+\)/.*#\1#p')"
    POOL_ID="$(echo "$GCP_WORKLOAD_IDENTITY_PROVIDER" | sed -n 's#^.*/workloadIdentityPools/\([^/]\+\)/providers/[^/]\+$#\1#p')"
    PROV_ID="$(echo "$GCP_WORKLOAD_IDENTITY_PROVIDER" | sed -n 's#^.*/providers/\([^/]\+\)$#\1#p')"
    if [[ -n "$PROJ_NUM" && -n "$POOL_ID" && -n "$PROV_ID" ]]; then
      echo "Verifying provider exists in GCP: project=$PROJ_NUM pool=$POOL_ID provider=$PROV_ID"
      gcloud iam workload-identity-pools providers describe "$PROV_ID" \
        --location=global \
        --workload-identity-pool="$POOL_ID" \
        --project="$PROJ_NUM" >/dev/null
      echo "  ✓ Verified."
    else
      echo "⚠️  Could not parse WIP for verification; skipping."
    fi
  else
    echo "⚠️  gcloud not installed; skipping --verify-gcp."
  fi
fi

# --- Secrets values ---------------------------------------------------------
COMMONS_PASSWORD="$(get_from_env_file COMMONS_PASSWORD)"
EXIOBASE_PASSWORD="$(get_from_env_file EXIOBASE_PASSWORD)"
GEMINI_API_KEY="$(get_from_env_file GEMINI_API_KEY)"
CLAUDE_API_KEY="$(get_from_env_file CLAUDE_API_KEY)"

# --- Helpers to set GH vars/secrets ----------------------------------------
set_var () {
  local key="$1" val="$2"
  val="$(printf "%s" "$val" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ -z "$val" ]]; then
    echo "  [var] skip empty: $key"
    return 0
  fi
  gh variable set "$key" --repo "$GH_REPO" --body "$val" >/dev/null
  echo "  [var] set: $key"
}

set_secret () {
  local key="$1" val="$2"
  val="$(printf "%s" "$val" | tr -d '\r' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
  if [[ -z "$val" ]]; then
    echo "  [sec] skip empty: $key"
    return 0
  fi
  printf "%s" "$val" | gh secret set "$key" --repo "$GH_REPO" --body - >/dev/null
  echo "  [sec] set: $key"
}

get_val () {
  eval "printf '%s' \"\${$1:-}\""
}

[[ $VERBOSE -eq 1 ]] && echo "Parsed keys: ${#ENV_KEYS[@]}"

# --- Apply Variables --------------------------------------------------------
echo "==> Setting GitHub Variables..."
for key in "${VAR_KEYS[@]}"; do
  val="$(get_val "$key")"
  set_var "$key" "$val"
done

# --- Apply Secrets ----------------------------------------------------------
echo "==> Setting GitHub Secrets..."
for key in "${SECRET_KEYS_BASE[@]}"; do
  val="$(get_val "$key")"
  set_secret "$key" "$val"
done
# OIDC provider and SA email as secrets (no variable mirrors)
set_secret GCP_WORKLOAD_IDENTITY_PROVIDER "$GCP_WORKLOAD_IDENTITY_PROVIDER"
set_secret GCP_SERVICE_ACCOUNT "$GCP_SERVICE_ACCOUNT"

# --- Optional prune ---------------------------------------------------------
if [[ $PRUNE -eq 1 ]]; then
  echo "==> Pruning managed GitHub Variables not present in .env (only our known keys)..."
  existing_vars="$(gh variable list --repo "$GH_REPO" --json name -q '.[].name' || true)"
  for key in "${VAR_KEYS[@]}"; do
    val="$(get_val "$key")"
    if [[ -z "$val" ]] && echo "$existing_vars" | grep -qx "$key"; then
      gh variable delete "$key" --repo "$GH_REPO" -y >/dev/null || true
      echo "  [var] deleted: $key"
    fi
  done

  echo "==> Pruning managed GitHub Secrets not present in .env (only our known keys)..."
  existing_secs="$(gh secret list --repo "$GH_REPO" --json name -q '.[].name' || true)"
  for key in "${SECRET_KEYS_BASE[@]}" GCP_WORKLOAD_IDENTITY_PROVIDER GCP_SERVICE_ACCOUNT; do
    val="$(get_val "$key")"
    if [[ -z "$val" ]] && echo "$existing_secs" | grep -qx "$key"; then
      gh secret delete "$key" --repo "$GH_REPO" -y >/dev/null || true
      echo "  [sec] deleted: $key"
    fi
  done
fi

echo "✅ Sync complete."
