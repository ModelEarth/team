#!/usr/bin/env bash
# Sets up Workload Identity Federation for GitHub Actions → GCP (OIDC)
# - Enables APIs
# - Ensures a Workload Identity Pool + GitHub OIDC Provider
# - Provider includes a minimal attribute-condition required by some org policies
# - Grants roles/iam.workloadIdentityUser to your deploy SA, restricted to repo
# Usage:
#   ./scripts/02_gcp_github_oidc.sh
#   RECREATE_PROVIDER=1 ./scripts/02_gcp_github_oidc.sh   # force delete & recreate provider
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
PROVIDER_ID="${GOOGLE_WIF_PROVIDER_ID:-github-oidc}"
ISSUER_URI="https://token.actions.githubusercontent.com"
ALLOWED_AUD="https://github.com/actions/gateway"

[[ -n "$PROJECT_ID" ]] || die "GOOGLE_PROJECT_ID must be set in .env"
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

# Ensure pool
if gcloud iam workload-identity-pools describe "$POOL_ID" --location="global" >/dev/null 2>&1; then
  echo "    Pool exists."
else
  echo "==> Creating Workload Identity Pool..."
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --location="global" \
    --display-name="GitHub Actions Pool"
fi

# Provider handling
PROVIDER_PATH="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

if [[ "${RECREATE_PROVIDER:-0}" == "1" ]]; then
  echo "==> Forcing provider recreation..."
  if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
      --location="global" --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
    gcloud iam workload-identity-pools providers delete "$PROVIDER_ID" \
      --location="global" --workload-identity-pool="$POOL_ID" --quiet
    echo "    Provider deleted."
  fi
fi

if gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --location="global" --workload-identity-pool="$POOL_ID" >/dev/null 2>&1; then
  echo "    Provider exists."
else
  echo "==> Creating GitHub OIDC Provider with minimal attribute condition..."
  # NOTE: some orgs require a provider-level condition; we reference a mapped claim.
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub OIDC" \
    --issuer-uri="$ISSUER_URI" \
    --allowed-audiences="$ALLOWED_AUD" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref,attribute.actor=assertion.actor,attribute.aud=assertion.aud" \
    --attribute-condition="attribute.repository=='${GITHUB_OWNER}/${GITHUB_REPO}'"
  echo "    Provider created."
fi

echo "==> Granting the SA 'workloadIdentityUser' for this repo only..."
PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$PRINCIPAL_SET" >/dev/null || true
echo "    Binding ensured."

echo
echo "✅ OIDC setup complete."
echo "   Use these in your GitHub Actions workflow (should be auto-filled in .env file):"
echo "     PROJECT_ID: ${PROJECT_ID}"
echo "     PROJECT_NUMBER: ${PROJECT_NUMBER}"
echo "     REGION: ${REGION}"
echo "     SA_EMAIL: ${SA_EMAIL}"
echo "   Principal member:"
echo "     ${PRINCIPAL_SET}"

# --- Persist results into .env so downstream scripts can read ----------------
ENV_PATH="${REPO_ROOT}/.env"

# Build the full provider resource name for GitHub Actions OIDC

WORKLOAD_IDENTITY_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo "==> Updating $ENV_PATH with OIDC values..."

# Write/update variables in .env
set_env_var() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$ENV_PATH"; then
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
