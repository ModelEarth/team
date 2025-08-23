#!/usr/bin/env bash
# Creates/updates GCP secrets, pushes image, and deploys Cloud Run service.
# Also normalizes GOOGLE_WORKLOAD_IDENTITY_PROVIDER into canonical form in .env.
# Idempotent: safe to re-run.
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

# --- helper to upsert key=value in .env ------------------------------------
set_env_var() {
  local key="$1" value="$2"
  [[ -z "$key" ]] && return 0
  if grep -q "^${key}=" "$ENV_PATH"; then
    # portable in-place sed (creates .bak)
    sed -i.bak "s#^${key}=.*#${key}=${value}#" "$ENV_PATH"
  else
    echo "${key}=${value}" >> "$ENV_PATH"
  fi
}

# ---- Required from .env ----------------------------------------------------
PROJECT_ID="${GOOGLE_PROJECT_ID:?GOOGLE_PROJECT_ID missing in .env}"
REGION="${GOOGLE_REGION:-us-central1}"
AR_REPO="${GOOGLE_AR_REPO:-containers}"
SERVICE="${CLOUD_RUN_SERVICE:-partner-tools-api}"

# Build SA emails / numbers
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
[[ -n "$PROJECT_NUMBER" ]] || die "Could not resolve project number for $PROJECT_ID"

DEPLOY_SA_EMAIL="${GOOGLE_SA_EMAIL:-gha-deployer@${PROJECT_ID}.iam.gserviceaccount.com}"
RUNTIME_SA_EMAIL="${GOOGLE_RUNTIME_SA_EMAIL:-${PROJECT_NUMBER}-compute@developer.gserviceaccount.com}"

# --- Normalize OIDC provider into canonical resource -----------------------
# If we have pool/provider IDs in .env, stamp the canonical string back into .env.
POOL_ID="${GOOGLE_WIF_POOL_ID:-github-pool}"
PROVIDER_ID="${GOOGLE_WIF_PROVIDER_ID:-github-oidc}"
CANON_WIP="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

GOOGLE_WORKLOAD_IDENTITY_PROVIDER="${GOOGLE_WORKLOAD_IDENTITY_PROVIDER:-}"
if [[ ! "$GOOGLE_WORKLOAD_IDENTITY_PROVIDER" =~ ^projects/.*/locations/global/workloadIdentityPools/.*/providers/.*$ ]]; then
  echo "==> Normalizing GOOGLE_WORKLOAD_IDENTITY_PROVIDER in .env → ${CANON_WIP}"
  set_env_var "GOOGLE_WORKLOAD_IDENTITY_PROVIDER" "$CANON_WIP"
  GOOGLE_WORKLOAD_IDENTITY_PROVIDER="$CANON_WIP"
fi

# App non-secret env (from .env)
SERVER_HOST="${SERVER_HOST:-0.0.0.0}"
COMMONS_HOST="${COMMONS_HOST:-db}"
COMMONS_PORT="${COMMONS_PORT:-5432}"
COMMONS_NAME="${COMMONS_NAME:-ModelEarthDB}"
COMMONS_USER="${COMMONS_USER:-postgres}"
COMMONS_SSL_MODE="${COMMONS_SSL_MODE:-disable}"

EXIOBASE_HOST="${EXIOBASE_HOST:-}"
EXIOBASE_PORT="${EXIOBASE_PORT:-}"
EXIOBASE_NAME="${EXIOBASE_NAME:-}"
EXIOBASE_USER="${EXIOBASE_USER:-}"
EXIOBASE_SSL_MODE="${EXIOBASE_SSL_MODE:-}"

PROJECTS_FILE_PATH="${PROJECTS_FILE_PATH:-preferences/projects/DFC-ActiveProjects.xlsx}"

# Secret values pulled from .env (optional). If present, we upload/update them.
S_COMMONS_PASSWORD="${COMMONS_PASSWORD:-}"
S_EXIOBASE_PASSWORD="${EXIOBASE_PASSWORD:-}"
S_GEMINI_API_KEY="${GEMINI_API_KEY:-}"
S_CLAUDE_API_KEY="${CLAUDE_API_KEY:-}"

echo "==> Using:"
echo "    PROJECT_ID=${PROJECT_ID}"
echo "    REGION=${REGION}"
echo "    AR_REPO=${AR_REPO}"
echo "    SERVICE=${SERVICE}"
echo "    DEPLOY_SA_EMAIL=${DEPLOY_SA_EMAIL}"
echo "    RUNTIME_SA_EMAIL=${RUNTIME_SA_EMAIL}"
echo "    OIDC_PROVIDER=${GOOGLE_WORKLOAD_IDENTITY_PROVIDER}"
echo "    gcloud account=${ACTIVE_ACCT}"
echo

# Ensure gcloud is pointed at project
gcloud config set project "$PROJECT_ID" >/dev/null

# Enable APIs (idempotent)
echo "==> Enabling required services (idempotent)..."
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com >/dev/null

# Ensure Artifact Registry repo (idempotent)
echo "==> Ensuring Artifact Registry repo '${AR_REPO}' exists in ${REGION}..."
if ! gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" \
    --repository-format=docker \
    --location="$REGION"
else
  echo "    Artifact Registry repo already exists."
fi

# ---- Safety checks for Cloud Run ------------------------------------------
if [[ "${COMMONS_HOST}" == "db" ]]; then
  die "COMMONS_HOST is 'db'. Set your Azure hostname in .env before deploying to Cloud Run."
fi
if [[ -z "${COMMONS_SSL_MODE:-}" || "${COMMONS_SSL_MODE}" == "disable" ]]; then
  echo "⚠ COMMONS_SSL_MODE was '${COMMONS_SSL_MODE:-unset}', forcing 'require' for Azure."
  COMMONS_SSL_MODE="require"
fi

# ---- Secret helpers --------------------------------------------------------
upsert_secret() {
  local name="$1" value="$2"
  [[ -z "$value" ]] && { echo "    (skip) $name: value empty in .env"; return 0; }
  if ! gcloud secrets describe "$name" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy="automatic" >/dev/null
    echo "    Secret created: $name"
  else
    echo "    Secret exists: $name"
  fi
  printf "%s" "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  echo "    Added new version for $name"
}

grant_secret_access() {
  local name="$1" member="$2"
  gcloud secrets add-iam-policy-binding "$name" \
    --member="$member" \
    --role="roles/secretmanager.secretAccessor" >/dev/null || true
}

echo "==> Creating/updating secrets (if values present in .env)..."
for s_name in COMMONS_PASSWORD EXIOBASE_PASSWORD GEMINI_API_KEY CLAUDE_API_KEY; do
  s_val="${s_name}"
  s_val="${!s_val:-}"
  upsert_secret "$s_name" "$s_val"
done

echo "==> Granting Secret Manager access..."
# Access for the deploy SA (GH Actions)
[[ -n "$DEPLOY_SA_EMAIL" ]] && for s in COMMONS_PASSWORD EXIOBASE_PASSWORD GEMINI_API_KEY CLAUDE_API_KEY; do
  grant_secret_access "$s" "serviceAccount:${DEPLOY_SA_EMAIL}"
done
# Access for the Cloud Run runtime SA
[[ -n "$RUNTIME_SA_EMAIL" ]] && for s in COMMONS_PASSWORD EXIOBASE_PASSWORD GEMINI_API_KEY CLAUDE_API_KEY; do
  grant_secret_access "$s" "serviceAccount:${RUNTIME_SA_EMAIL}"
done

# ---- Build & Push Image ----------------------------------------------------
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}/${SERVICE}"
TAG="${IMAGE_URI}:$(git rev-parse --short HEAD 2>/dev/null || date +%s)"

echo "==> Building & pushing image with Cloud Build..."
gcloud builds submit --tag "$TAG" .

# ---- Deploy to Cloud Run ---------------------------------------------------
echo "==> Deploying Cloud Run service: ${SERVICE}"

# Assemble non-secret env vars
ENV_KV=(
  "SERVER_HOST=${SERVER_HOST}"
  "COMMONS_HOST=${COMMONS_HOST}"
  "COMMONS_PORT=${COMMONS_PORT}"
  "COMMONS_NAME=${COMMONS_NAME}"
  "COMMONS_USER=${COMMONS_USER}"
  "COMMONS_SSL_MODE=${COMMONS_SSL_MODE}"
  "PROJECTS_FILE_PATH=${PROJECTS_FILE_PATH}"
  "EXIOBASE_HOST=${EXIOBASE_HOST}"
  "EXIOBASE_PORT=${EXIOBASE_PORT}"
  "EXIOBASE_NAME=${EXIOBASE_NAME}"
  "EXIOBASE_USER=${EXIOBASE_USER}"
  "EXIOBASE_SSL_MODE=${EXIOBASE_SSL_MODE}"
)

SET_ENV=""
for kv in "${ENV_KV[@]}"; do
  if [[ "$kv" == *=* ]] && [[ -n "${kv#*=}" ]]; then
    [[ -n "$SET_ENV" ]] && SET_ENV+=","
    SET_ENV+="$kv"
  fi
done

# Secrets: prefer Secret Manager -> env. If missing, fallback to plaintext env.
SET_SECRETS_LIST=()
PLAINTEXT_FALLBACKS=()

maybe_add_secret() {
  local var="$1"
  if gcloud secrets describe "$var" >/dev/null 2>&1; then
    SET_SECRETS_LIST+=( "${var}=${var}:latest" )
  else
    local v="${!var:-}"
    if [[ -n "$v" ]]; then
      PLAINTEXT_FALLBACKS+=( "${var}=${v}" )
    fi
  fi
}

maybe_add_secret COMMONS_PASSWORD
maybe_add_secret EXIOBASE_PASSWORD
maybe_add_secret GEMINI_API_KEY
maybe_add_secret CLAUDE_API_KEY

if [[ ${#PLAINTEXT_FALLBACKS[@]} -gt 0 ]]; then
  for kv in "${PLAINTEXT_FALLBACKS[@]}"; do
    [[ -n "$SET_ENV" ]] && SET_ENV+=","
    SET_ENV+="$kv"
  done
fi

# Deploy
if [[ ${#SET_SECRETS_LIST[@]} -gt 0 ]]; then
  gcloud run deploy "$SERVICE" \
    --image "$TAG" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --service-account "$RUNTIME_SA_EMAIL" \
    --min-instances "0" \
    --max-instances "3" \
    --cpu "1" \
    --memory "512Mi" \
    --concurrency "80" \
    --timeout "60" \
    --set-env-vars "$SET_ENV" \
    --set-secrets "$(IFS=, ; echo "${SET_SECRETS_LIST[*]}")"
else
  gcloud run deploy "$SERVICE" \
    --image "$TAG" \
    --region "$REGION" \
    --platform managed \
    --allow-unauthenticated \
    --service-account "$RUNTIME_SA_EMAIL" \
    --min-instances "0" \
    --max-instances "3" \
    --cpu "1" \
    --memory "512Mi" \
    --concurrency "80" \
    --timeout "60" \
    --set-env-vars "$SET_ENV"
fi

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
echo
echo "✅ Deployed: $URL"
echo "   Health:  curl -s ${URL}/api/health | jq ."
