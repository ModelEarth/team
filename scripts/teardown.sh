#!/bin/bash

set -euo pipefail

# ─── CONFIG ──────────────────────────────────────────────────────────────────────
PROJECT_ID="your-gcp-project-id"      # TODO: Replace or extract from .env
SERVICE_NAME="gemini-crm-api"
REGION="us-central1"
ENV_FILE="$(dirname "$0")/../.env"

# ─── DELETE CLOUD RUN SERVICE ────────────────────────────────────────────────────
echo "🧨 Deleting Cloud Run service: $SERVICE_NAME"
gcloud run services delete "$SERVICE_NAME" \
  --region "$REGION" \
  --platform managed \
  --project "$PROJECT_ID" \
  --quiet

# ─── DELETE GCP SECRETS ──────────────────────────────────────────────────────────
echo "🧼 Deleting GCP secrets from Secret Manager..."

while IFS='=' read -r key value || [[ -n "$key" ]]; do
  key=$(echo "$key" | xargs)
  [[ -z "$key" || "$key" == \#* ]] && continue

  secret_name="${SERVICE_NAME}-${key}"
  echo "🔐 Deleting secret: $secret_name"

  if gcloud secrets describe "$secret_name" --project "$PROJECT_ID" &>/dev/null; then
    gcloud secrets delete "$secret_name" \
      --project "$PROJECT_ID" \
      --quiet
  fi
done < "$ENV_FILE"

# ─── OPTIONAL: DELETE IMAGE FROM GCR ─────────────────────────────────────────────
echo "🗑️ (Optional) Delete Docker image from GCR manually if needed:"
echo "    gcloud container images list-tags gcr.io/$PROJECT_ID/gemini-crm"
echo "    gcloud container images delete gcr.io/$PROJECT_ID/gemini-crm --quiet"

echo "✅ Teardown complete."
