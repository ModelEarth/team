⸻

Team API – Rust + Cloud Run

This repository contains the Partner Tools API written in Rust and deployed to Google Cloud Run.
It connects to Azure Postgres databases (Commons + Exiobase), provides REST endpoints, and integrates with AI services (Gemini, Claude).

⸻

📦 Project Structure
	•	Dockerfile – Multi-stage build (Rust → minimal Debian runtime)
	•	docker/start.sh – Startup wrapper for Cloud Run
	•	.env – Local environment config (ignored in CI/CD; values synced via secrets/variables)
	•	.github/workflows/deploy-team-cloudrun.yml – CI/CD workflow for GitHub Actions
	•	scripts/01_gcp_bootstrap.sh – One-time GCP bootstrap (project, billing, Artifact Registry, SAs, APIs)
	•	scripts/02_gcp_github_oidc.sh – One-time OIDC setup (GitHub ↔︎ GCP Workload Identity Federation)
	•	scripts/03_secrets_and_first_deploy.sh – Upserts secrets, builds, and deploys first Cloud Run revision
	•	scripts/04_sync_github_env.sh – Syncs .env values into GitHub Variables + Secrets via gh
	•	scripts/load_env.sh – Utility to source .env locally into your shell

⸻

🚀 Local Development
	1.	Install prerequisites
	•	Rust toolchain (cargo)
	•	Docker
	•	Google Cloud SDK (gcloud)
	•	GitHub CLI (gh) if you want to sync .env
	2.	Setup repo

git clone https://github.com/AbhinavSivanandhan/team.git
cd team
cp .env.example .env   # edit with real values


	3.	Run locally
Directly:

cargo run

With Docker:

docker build -t partner-tools-api .
docker run --env-file .env -p 8080:8080 partner-tools-api


⸻

☁️ First-Time GCP Setup (One-time Only)

⸻

🔑 File Permissions

Before running any scripts, make them executable:

chmod +x scripts/01_gcp_bootstrap.sh
chmod +x scripts/02_gcp_github_oidc.sh
chmod +x scripts/03_secrets_and_first_deploy.sh
chmod +x scripts/04_sync_github_env.sh
chmod +x scripts/load_env.sh


⸻

All scripts assume .env exists. Always load first:

./scripts/load_env.sh

Then run:
	1.	Bootstrap GCP project + services

./scripts/01_gcp_bootstrap.sh

Creates project (if missing), links billing, enables APIs, creates deploy SA, sets up Artifact Registry.

	2.	Configure GitHub OIDC provider

./scripts/02_gcp_github_oidc.sh

Creates Workload Identity Pool & OIDC provider, grants workloadIdentityUser binding for your repo.

	3.	Secrets + first deploy

./scripts/03_secrets_and_first_deploy.sh

	•	Pushes secrets from .env into Secret Manager
	•	Grants access to deploy + runtime service accounts
	•	Builds & pushes image with Cloud Build
	•	Deploys Cloud Run service partner-tools-api
URL can be identified here. It is also available under Show URL in the GitHub Action.

⸻

	4.	Sync .env → GitHub

🛠 GitHub CLI Setup (Required for Script 4)

Script 04_sync_github_env.sh manages synchronization of environment variables and secrets into your GitHub repository. It is what keeps your .env file in sync with GitHub Variables + Secrets (used by the CI/CD workflow).

Install the GitHub CLI via Homebrew (macOS):

brew install gh
gh auth login

Then run:

./scripts/04_sync_github_env.sh

Populates GitHub Variables (non-secrets) and Secrets (secrets, OIDC provider, SA email).

⸻

🔐 Secrets & Config
	•	Non-secret values (ports, hosts, service names) → GitHub Variables
	•	Secrets (DB passwords, API keys) → Google Secret Manager

Example Mapping

Key	Location
COMMONS_HOST	GitHub Variable
COMMONS_PASSWORD	Secret Manager
EXIOBASE_PASSWORD	Secret Manager
GEMINI_API_KEY	Secret Manager
CLAUDE_API_KEY	Secret Manager
SERVER_PORT	GitHub Variable


⸻

🤖 Continuous Deployment (CI/CD)

Ongoing deployments are automated through GitHub Actions:
	•	Workflow: .github/workflows/deploy-team-cloudrun.yml
	•	Trigger: Push to main

Steps
	1.	Authenticate to GCP with OIDC (no JSON key files)
	2.	Build Docker image with Cloud Build
	3.	Push to Artifact Registry
	4.	Deploy to Cloud Run
	5.	Inject secrets + env vars

Manual scripts (01–03) are only for bootstrap.
Once configured, contributors just push → CI/CD deploys automatically.

⸻

📤 Testing a Deployment

After a successful deploy, verify the service with curl:
	1.	Health check

URL="$(gcloud run services describe partner-tools-api --region us-central1 --format='value(status.url)')"
curl -s ${URL}/api/health | jq .

Expected:

{
  "database_connected": true,
  "status": "healthy"
}

	2.	Tables endpoint

curl -s ${URL}/api/tables

Returns available database tables and row counts.
	3.	Projects endpoint

curl -s ${URL}/api/projects

Lists active projects from the Commons database.
	4.	Recommendations endpoint

curl -s -X POST ${URL}/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"preferences":["Healthcare Access","Digital Inclusion"]}' | head

Returns recommendation results filtered by preferences.

⸻

✅ With this setup: push → GitHub Actions → Cloud Run deploys automatically.
The scripts (01–04) cover everything from bootstrap → OIDC → secrets → sync.

⸻
