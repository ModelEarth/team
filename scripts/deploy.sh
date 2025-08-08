#!/bin/bash

set -euo pipefail

# ─── CONFIGURATION ───────────────────────────────────────────────────────────────
PROJECT_ID="your-gcp-project-id"     # TODO: Replace or pull from .env
SERVICE_NAME="gemini-crm-api"        # Name for Cloud Run service
REGION="us-central1"                 # Or your preferred GCP region
IMAGE_NAME="gcr.io/$PROJECT_ID/gemini-crm"  # Docker image path

ENV_FILE="$(dirname "$0")/../.env"

# ─── HELPER: Create or update GCP secret ─────────────────────────────────────────
create_or_update_secret() {
  local key=$1
  local value=$2
  local secret_name="${SERVICE_NAME}-${key}"

  echo "🔐 Syncing secret: $secret_name"

  # Create if not exists
  if ! gcloud secrets describe "$secret_name" --project "$PROJECT_ID" &>/dev/null; then
    echo "$value" | gcloud secrets create "$secret_name" \
      --data-file=- \
      --replication-policy="automatic" \
      --project="$PROJECT_ID"
  else
    echo "$value" | gcloud secrets versions add "$secret_name" \
      --data-file=- \
      --project="$PROJECT_ID"
  fi
}

# ─── 1. Read .env and sync all keys to Secret Manager ────────────────────────────
echo "📄 Loading secrets from .env..."

while IFS='=' read -r key value || [[ -n "$key" ]]; do
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)

  # Skip comments and empty lines
  if [[ -z "$key" || "$key" == \#* ]]; then
    continue
  fi

  create_or_update_secret "$key" "$value"
done < "$ENV_FILE"

# ─── 2. Build and push Docker image ──────────────────────────────────────────────
echo "🐳 Building Docker image..."
docker build -t "$IMAGE_NAME" .

echo "📤 Pushing image to GCR..."
docker push "$IMAGE_NAME"

# ─── 3. Prepare --set-secrets flag for deployment ────────────────────────────────
echo "🔗 Preparing environment secrets for Cloud Run..."

SECRETS_FLAGS=""
while IFS='=' read -r key value || [[ -n "$key" ]]; do
  key=$(echo "$key" | xargs)

  if [[ -z "$key" || "$key" == \#* ]]; then
    continue
  fi

  secret_name="${SERVICE_NAME}-${key}"
  SECRETS_FLAGS+="--set-secrets $key=${secret_name}:latest "
done < "$ENV_FILE"

# ─── 4. Deploy to Cloud Run ───────────────────────────────────────────────────────
echo "🚀 Deploying to Cloud Run..."

gcloud run deploy "$SERVICE_NAME" \
  --image "$IMAGE_NAME" \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --project "$PROJECT_ID" \
  --memory 1Gi \
  --cpu 1 \
  --port 8081 \
  --timeout 600 \
  $SECRETS_FLAGS

echo "✅ Deployment complete!"
