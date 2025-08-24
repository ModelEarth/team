#!/usr/bin/env bash
# Sets up Workload Identity Federation for GitHub Actions → GCP (OIDC)
# - Ensures a Workload Identity Pool + GitHub OIDC Provider
# - Provider has NO allowed-audiences restriction
# - Adds attribute mapping + repo-scoped attribute condition
# - Grants roles/iam.workloadIdentityUser to your deploy SA (repo-scoped)
# Idempotent; resilient to eventual consistency on delete/create.
#
# Usage:
#   ./scripts/02_gcp_github_oidc.sh
#   RECREATE_PROVIDER=1 ./scripts/02_gcp_github_oidc.sh
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

[[ -n "$PROJECT_ID" ]] || die "GOOGLE_PROJECT_ID must be set in .env"
[[ -n "$GITHUB_OWNER" ]] || die "GITHUB_OWNER must be set in .env"
[[ -n "$GITHUB_REPO"  ]] || die "GITHUB_REPO must be set in .env"

echo "==> Using:
    PROJECT_ID=${PROJECT_ID}
    REGION=${REGION}
    SA_EMAIL=${SA_EMAIL}
    POOL_ID=${POOL_ID}
    PROVIDER_ID=${PROVIDER_ID}
    GITHUB_OWNER=${GITHUB_OWNER}
    GITHUB_REPO=${GITHUB_REPO}
    gcloud account=${ACTIVE_ACCT}
"

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

PROVIDER_PATH="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

ATTR_MAPPING="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner,attribute.ref=assertion.ref,attribute.actor=assertion.actor,attribute.aud=assertion.aud"
ATTR_CONDITION="attribute.repository=='${GITHUB_OWNER}/${GITHUB_REPO}'"

provider_exists() {
  gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_ID" >/dev/null 2>&1
}

wait_until_deleted() {
  local tries=30  # ~150s total
  local i=0
  while (( i < tries )); do
    if provider_exists; then
      sleep 5
      ((i++))
    else
      return 0
    fi
  done
  return 1
}

create_provider() {
  # Create without allowed-audiences; apply mapping & condition.
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub OIDC" \
    --issuer-uri="$ISSUER_URI" \
    --attribute-mapping="$ATTR_MAPPING" \
    --attribute-condition="$ATTR_CONDITION" >/dev/null
}

recreate_provider() {
  echo "==> Recreating provider without allowed-audiences..."
  # Best-effort delete; ignore not found
  gcloud iam workload-identity-pools providers delete "$PROVIDER_ID" \
    --location="global" \
    --workload-identity-pool="$POOL_ID" \
    --quiet >/dev/null 2>&1 || true

  echo "    Waiting for provider to disappear..."
  if ! wait_until_deleted; then
    echo "    Timed out waiting for deletion to finalize; will still attempt create."
  fi

  # Create with retries to tolerate eventual consistency
  local tries=10
  local i=0
  while (( i < tries )); do
    if create_provider 2>/tmp/create_err.$$; then
      echo "    Provider created."
      rm -f /tmp/create_err.$$
      return 0
    fi
    if grep -q "ALREADY_EXISTS" /tmp/create_err.$$ 2>/dev/null; then
      echo "    Provider still reported as existing; retrying in 5s..."
      sleep 5
      ((i++))
      continue
    fi
    echo "    Create failed:"
    cat /tmp/create_err.$$ >&2 || true
    rm -f /tmp/create_err.$$
    die "Failed to create provider."
  done
  rm -f /tmp/create_err.$$ || true
  echo "    Gave up retrying create; provider likely exists."
}

echo "==> Ensuring provider exists and has no allowed-audiences..."
if provider_exists; then
  echo "    Provider exists."
  if [[ "${RECREATE_PROVIDER:-0}" == "1" ]]; then
    recreate_provider
  else
    # Try update path (newer gclouds). If unsupported, fall back to recreate.
    set +e
    gcloud iam workload-identity-pools providers update-oidc "$PROVIDER_ID" \
      --location="global" \
      --workload-identity-pool="$POOL_ID" \
      --clear-allowed-audiences \
      --attribute-mapping="$ATTR_MAPPING" \
      --attribute-condition="$ATTR_CONDITION" >/dev/null 2>&1
    rc=$?
    set -e
    if [[ $rc -eq 0 ]]; then
      echo "    Cleared allowed-audiences (if any) and ensured mapping/condition."
    else
      echo "    update-oidc not supported; recreating provider..."
      recreate_provider
    fi
  fi
else
  recreate_provider
fi

echo "==> Granting the SA 'workloadIdentityUser' for this repo only (idempotent)..."
PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/${GITHUB_OWNER}/${GITHUB_REPO}"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$PRINCIPAL_SET" >/dev/null || true
echo "    Binding ensured."

# Persist results into .env
ENV_PATH="${REPO_ROOT}/.env"
WORKLOAD_IDENTITY_PROVIDER="${PROVIDER_PATH}"

echo "==> Updating $ENV_PATH with OIDC values..."
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

echo
echo "✅ OIDC setup complete."
echo "   Provider: ${WORKLOAD_IDENTITY_PROVIDER}"
echo "   Principal member:"
echo "     ${PRINCIPAL_SET}"
