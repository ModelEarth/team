#!/usr/bin/env bash
# Bootstrap GCP for Cloud Run + Cloud Build + Artifact Registry using values from .env
# - Creates project if missing
# - Links billing
# - Enables required APIs
# - Creates deploy SA and grants roles
# - Grants AR admin to current user (for repo create)
# - Creates Artifact Registry repo
set -euo pipefail

# ---- Helpers ---------------------------------------------------------------
die() { echo "ERROR: $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
msg() { echo -e "$*"; }

# ---- Resolve repo root and load .env --------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_PATH="${1:-${REPO_ROOT}/.env}"

[[ -f "$ENV_PATH" ]] || die "No .env found at $ENV_PATH"
# shellcheck disable=SC1090
set -o allexport; source "$ENV_PATH"; set +o allexport

# ---- Required ENV (from .env) ---------------------------------------------
PROJECT_ID="${GOOGLE_PROJECT_ID:-}"
REGION="${GOOGLE_REGION:-us-central1}"
AR_REPO="${GOOGLE_AR_REPO:-containers}"
SA_NAME="${GOOGLE_SA_NAME:-gha-deployer}"
BILLING_ID="${GOOGLE_BILLING_ID:-}"
ORG_ID="${GOOGLE_ORG_ID:-}"   # optional; leave empty if you’re not in an org

[[ -n "$PROJECT_ID" ]] || die "GOOGLE_PROJECT_ID is not set in $ENV_PATH"
[[ -n "$REGION"     ]] || die "GOOGLE_REGION is not set in $ENV_PATH"
[[ -n "$AR_REPO"    ]] || die "GOOGLE_AR_REPO is not set in $ENV_PATH"
[[ -n "$SA_NAME"    ]] || die "GOOGLE_SA_NAME is not set in $ENV_PATH"

SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# ---- Preconditions ---------------------------------------------------------
have gcloud || die "gcloud not found. Install Cloud SDK: https://cloud.google.com/sdk/docs/install"
ACTIVE_ACCT="$(gcloud config get-value account 2>/dev/null || true)"
[[ -n "$ACTIVE_ACCT" ]] || die "You are not logged in. Run: gcloud auth login"

msg "==> Using:
    PROJECT_ID=$PROJECT_ID
    REGION=$REGION
    SA_NAME=$SA_NAME
    SA_EMAIL=$SA_EMAIL
    AR_REPO=$AR_REPO
    BILLING_ID=${BILLING_ID:-<none>}
    ORG_ID=${ORG_ID:-<none>}
    gcloud account=$ACTIVE_ACCT
"

# ---- Create project if missing --------------------------------------------
msg "==> Checking if project '$PROJECT_ID' exists..."
if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  msg "    Project not found. Creating..."
  if [[ -n "$ORG_ID" ]]; then
    gcloud projects create "$PROJECT_ID" --organization="$ORG_ID"
  else
    gcloud projects create "$PROJECT_ID"
  fi
  msg "    Project created."
else
  msg "    Project exists."
fi

# ---- Link billing (required for enabling most services) -------------------
if [[ -n "$BILLING_ID" ]]; then
  msg "==> Ensuring billing is linked..."
  if ! gcloud beta billing projects describe "$PROJECT_ID" \
        --format="value(billingEnabled)" 2>/dev/null | grep -qi true; then
    gcloud beta billing projects link "$PROJECT_ID" \
      --billing-account="$BILLING_ID"
    msg "    Billing linked."
  else
    msg "    Billing already linked."
  fi
else
  msg "⚠️  GOOGLE_BILLING_ID not set. Some steps may fail until billing is linked."
fi

# ---- Point gcloud at the project -----------------------------------------
msg "==> Setting active project..."
gcloud config set project "$PROJECT_ID" >/dev/null

# ---- Enable required services (idempotent) --------------------------------
msg "==> Enabling required services..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com

# Give the services a moment to propagate (AR can be slow)
sleep 5

# ---- Create deploy service account (idempotent) ---------------------------
msg "==> Creating deploy service account if missing..."
if ! gcloud iam service-accounts describe "$SA_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SA_NAME" \
    --project "$PROJECT_ID" \
    --display-name "GitHub Actions deployer"
  msg "    Service account created."
else
  msg "    Service account already exists."
fi

# ---- Grant roles to the SA (idempotent) -----------------------------------
msg "==> Granting roles to $SA_EMAIL (idempotent)..."
# Build / submit
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudbuild.builds.editor" >/dev/null || true

# Push to Artifact Registry
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/artifactregistry.writer" >/dev/null || true

# Deploy Cloud Run
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/run.admin" >/dev/null || true

# Use enabled services (fixes 'forbidden to use service')
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/serviceusage.serviceUsageConsumer" >/dev/null || true

# Write to Cloud Build staging bucket (_cloudbuild)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin" >/dev/null || true

# Allow bucket creation (needed first time Cloud Build runs)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.admin" >/dev/null || true

# Manage Secret Manager (create/describe/add versions during CI)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.admin" >/dev/null || true

# View Cloud Build jobs (required for gcloud to stream/poll logs)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudbuild.builds.viewer" >/dev/null || true

# Read objects in the default Cloud Build logs bucket
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectViewer" >/dev/null || true

# Impersonate other SAs if needed (keep)
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" >/dev/null || true

# Allow gha-deployer to ACT AS any service account in the project (covers numeric SA IDs)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" >/dev/null || true

# And allow token creation across the project (some orgs/pipelines require this)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" >/dev/null || true

# Allow gha-deployer to ACT AS the Cloud Build SA (required by gcloud builds submit)

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

gcloud iam service-accounts add-iam-policy-binding "$CB_SA" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountUser" >/dev/null || true

# (Optional but harmless) also allow token creation if your org policy expects it
gcloud iam service-accounts add-iam-policy-binding "$CB_SA" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" >/dev/null || true

# Allow gha-deployer to ACT AS Cloud Build SA (only if it already exists)
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
if gcloud iam service-accounts describe "$CB_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts add-iam-policy-binding "$CB_SA" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/iam.serviceAccountUser" >/dev/null || true
  gcloud iam service-accounts add-iam-policy-binding "$CB_SA" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/iam.serviceAccountTokenCreator" >/dev/null || true
else
  echo "    (info) Cloud Build SA not provisioned yet; it will be created on first build."
fi

msg "    Roles granted."

# ---- Ensure Cloud Build SA has exec-time permissions (idempotent) ---------
# During builds, Cloud Build uses its own SA for steps:
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
CB_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

msg "==> Ensuring Cloud Build SA has required writer permissions (idempotent)..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/artifactregistry.writer" >/dev/null || true

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CB_SA}" \
  --role="roles/storage.objectAdmin" >/dev/null || true

# ---- Ensure current user can create AR repos ------------------------------
msg "==> Ensuring current user can create Artifact Registry repos..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="user:${ACTIVE_ACCT}" \
  --role="roles/artifactregistry.admin" >/dev/null || true
# (Owner usually suffices, but this makes it explicit and idempotent.)

# Project read-only (lets gcloud stream build logs without GCS quirks)
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/viewer" >/dev/null || true

# ---- Create Artifact Registry repo (idempotent) ---------------------------
msg "==> Ensuring Artifact Registry repo '${AR_REPO}' exists in ${REGION}..."
if ! gcloud artifacts repositories describe "$AR_REPO" --location "${REGION}" >/dev/null 2>&1; then
  if ! gcloud artifacts repositories create "$AR_REPO" \
        --repository-format=docker \
        --location="${REGION}"; then
    msg "⚠️  Could not create Artifact Registry repo.
    Troubleshooting:
      • Verify your account '${ACTIVE_ACCT}' now has role 'roles/artifactregistry.admin'
        in project '${PROJECT_ID}' (it was just granted; it may take ~1–2 minutes).
      • Ensure the Artifact Registry API is enabled (this script enabled it).
      • If your org enforces location policies, confirm region '${REGION}' is allowed.
    You can also try re-running this script in ~60 seconds."
    exit 1
  fi
  msg "    Artifact Registry repo created."
else
  msg "    Artifact Registry repo already exists."
fi

# ---- Done -----------------------------------------------------------------
cat <<EOF

✅ Bootstrap complete.
   Reference values (already implied by .env):
   - SA_EMAIL=${SA_EMAIL}
   - PROJECT_ID=${PROJECT_ID}
   - REGION=${REGION}
   - AR_REPO=${AR_REPO}
   - CLOUD_BUILD_SA=${CB_SA}

Next:
  • Create a key for the deploy SA (for GitHub Actions) OR configure OIDC.
    Example (JSON key file — store in GitHub secret GCP_SA_KEY):
      gcloud iam service-accounts keys create sa-key.json --iam-account ${SA_EMAIL}
  • Or follow the OIDC path in your README to avoid JSON keys.

Note:
If your CI preflight still complains about missing roles for ${SA_EMAIL},
re-run this script or grant them explicitly, e.g.:
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member=serviceAccount:${SA_EMAIL} --role=roles/serviceusage.serviceUsageConsumer
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member=serviceAccount:${SA_EMAIL} --role=roles/storage.objectAdmin
  gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member=serviceAccount:${SA_EMAIL} --role=roles/secretmanager.admin

EOF
