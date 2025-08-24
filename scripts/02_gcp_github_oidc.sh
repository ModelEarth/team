#!/usr/bin/env bash
# Sets up Workload Identity Federation for GitHub Actions → GCP (OIDC)
# - Enables APIs
# - Ensures a Workload Identity Pool + GitHub OIDC Provider
# - Creates provider WITHOUT --allowed-audiences (lets Actions set audience dynamically)
# - Grants roles/iam.workloadIdentityUser to your deploy SA, restricted to repo
#
# Usage:
#   ./scripts/02_gcp_github_oidc.sh
#   (If a provider name was previously deleted/soft-deleted, set a NEW provider ID in .env:
#      GOOGLE_WIF_PROVIDER_ID=github-oidc2
#    and re-run.)
set -euo pipefail

die() { echo "ERROR: $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_PATH="${1:-${REPO_ROOT}/.env}"

[[ -f "$ENV_PATH" ]] || die "No .env found at $ENV_PATH"
set -o allexport; source "$ENV_PATH"; set +o allexport

have gcloud || die "gcloud not found. Install: https://cloud.google.com/sdk/docs/install"
ACTIVE_ACCT="$(gcloud config get-value account 2>/dev/null || true)"
[[ -n "$ACTIVE_ACCT" ]] || die "You are not logged in. Run: gcloud auth login"

PROJECT_ID="${GOOGLE_PROJECT_ID:-}"
REGION="${GOOGLE_REGION:-us-central1}"
SA_NAME="${GOOGLE_SA_NAME:-gha-deployer}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# GitHub repo coordinates
GITHUB_OWNER="${GITHUB_OWNER:-${GITHUB_REPO_OWNER:-AbhinavSivanandhan}}"
GITHUB_REPO="${GITHUB_REPO:-team}"

POOL_ID="${GOOGLE_WIF_POOL_ID:-github-pool}"
# IMPORTANT: choose a provider id that is not soft-deleted. If you previously deleted "github-oidc",
# set GOOGLE_WIF_PROVIDER_ID=github-oidc2 in .env and re-run.
PROVIDER_ID="${GOOGLE_WIF_PROVIDER_ID:-github-oidc2}"

ISSUER_URI="https://token.actions.githubusercontent.com"

[[ -n "$PROJECT_ID" ]]   || die "GOOGLE_PROJECT_ID must be set in .env"
[[ -n "$GITHUB_OWNER" ]] || die "GITHUB_OWNER must be set in .env"
[[ -n "$GITHUB_REPO"  ]] || die "GITHUB_REPO must be set in .env"

echo "==> Using:"
echo "    PROJECT_ID=${PROJECT_ID}"
echo "    REGION=${REGION}"
echo "    SA_EMAIL=${SA_EMAIL}"
echo "    POOL_ID=${POOL_ID}"
echo "    PROVIDER_ID=${PROVIDER_ID}"
echo "    GITHUB_OWNER=${GITHUB_OWNER}"
echo "    GITHUB_REPO=${GITHUB_REPO}"
echo "    gcloud account=${ACTIVE_ACCT}"
echo

echo "==> Setting active project..."
gcloud config set project "$PROJECT_ID" >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
[[ -n "$PROJECT_NUMBER" ]] || die "Could not resolve project number for $PROJECT_ID"

echo "==> Enabling IAM/OIDC APIs (idempotent)..."
gcloud services enable iam.googleapis.com iamcredentials.googleapis.com >/dev/null

# Ensure pool (idempotent)
if gcloud iam workload-identity-pools describe "$POOL_ID" --location="global" >/dev/null 2>&1; then
  echo "    Pool exists."
else
  echo "==> Creating Workload Identity Pool..."
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --location="global" \
    --display-name="GitHub Actions Pool"
fi

# Inspect provider state (if any)
PROVIDER_STATE="$( gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location="global" --workload-identity-pool="$POOL_ID" \
  --format='value(state)' 2>/dev/null || true )"

if [[ -n "$PROVIDER_STATE" ]]; then
  echo "    Provider '${PROVIDER_ID}' found (state=${PROVIDER_STATE})."
  if [[ "$PROVIDER_STATE" == "DELETED" ]]; then
    cat >&2 <<EOF
ERROR: Provider '${PROVIDER_ID}' is in DELETED (soft-deleted) state.
       You cannot recreate a provider with the same ID for ~30 days.
       Choose a NEW provider id (e.g., 'github-oidc2'):

         1) Edit your .env:
              GOOGLE_WIF_PROVIDER_ID=github-oidc2
            (and optionally clear GOOGLE_WORKLOAD_IDENTITY_PROVIDER)
         2) Re-run this script.

EOF
    exit 1
  fi
else
  echo "==> Creating GitHub OIDC Provider (no allowed-audiences)..."
  # NOTE: No --allowed-audiences. This avoids audience mismatch; Actions sets it per request.
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub OIDC" \
    --issuer-uri="$ISSUER_URI" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref,attribute.actor=assertion.actor,attribute.aud=assertion.aud" \
    --attribute-condition="attribute.repository=='${GITHUB_OWNER}/${GITHUB_REPO}'"

  echo "    Provider created."
fi

# Re-fetch state to confirm ACTIVE
PROVIDER_STATE="$( gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --location="global" --workload-identity-pool="$POOL_ID" \
  --format='value(state)' 2>/dev/null || true )"

[[ "$PROVIDER_STATE" == "ACTIVE" ]] || die "Provider '${PROVIDER_ID}' not ACTIVE (state=${PROVIDER_STATE:-unknown}). Try a new provider id."

echo "==> Granting the SA 'workloadIdentityUser' for this repo only..."
PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$PRINCIPAL_SET" >/dev/null || true
echo "    Binding ensured."

# Compose canonical provider resource name
WORKLOAD_IDENTITY_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo
echo "✅ OIDC setup complete."
echo "   Use these in your GitHub Actions workflow:"
echo "     - workload_identity_provider: ${WORKLOAD_IDENTITY_PROVIDER}"
echo "     - service_account:            ${SA_EMAIL}"
echo "   Principal member bound:"
echo "     ${PRINCIPAL_SET}"
echo

# --- Persist results into .env so downstream scripts can read ----------------
echo "==> Updating $ENV_PATH with OIDC values..."

set_env_var() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_PATH"; then
    # macOS/BSD sed needs -i '' while GNU sed uses -i; use a backup for portability
    sed -i.bak "s#^${key}=.*#${key}=${value}#" "$ENV_PATH"
  else
    echo "${key}=${value}" >> "$ENV_PATH"
  fi
}

set_env_var "GOOGLE_PROJECT_ID" "$PROJECT_ID"
set_env_var "GOOGLE_REGION" "$REGION"
set_env_var "GOOGLE_SA_EMAIL" "$SA_EMAIL"
set_env_var "GOOGLE_PROJECT_NUMBER" "$PROJECT_NUMBER"
set_env_var "GOOGLE_WIF_POOL_ID" "$POOL_ID"
set_env_var "GOOGLE_WIF_PROVIDER_ID" "$PROVIDER_ID"
set_env_var "GOOGLE_WORKLOAD_IDENTITY_PROVIDER" "$WORKLOAD_IDENTITY_PROVIDER"

echo "✅ Updated .env with OIDC values."
