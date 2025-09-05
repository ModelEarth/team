# Team API – Rust + Cloud Run

This repository contains the **Partner Tools API** written in Rust and deployed to **Google Cloud Run**.
It connects to **Azure Postgres databases** (Commons + Exiobase), provides REST endpoints, and integrates with **AI services** (Gemini, Claude).

---

IMPORTANT NOTE:
The files here did not pull into the team repo due to a DUMMY_SECRET error in Github Actions.
https://github.com/ModelEarth/team/pull/11/files

The DUMMY_SECRET error is visible here:
https://github.com/ModelEarth/team/actions/runs/17217842776/job/48845757765

Will we even need the GPC botstraps with auth.js?


## 📦 Project Structure

- `Dockerfile` – Multi-stage build (Rust → minimal Debian runtime)
- `docker/start.sh` – Startup wrapper for Cloud Run
- `.env` – Local environment config (ignored in CI/CD; values synced via secrets/variables)
- `.github/workflows/deploy-team-cloudrun.yml` – CI/CD workflow for GitHub Actions
- `scripts/load_env.sh` – Utility to source `.env` locally into your shell
- `scripts/01_gcp_bootstrap.sh` – One-time GCP bootstrap (project, billing, Artifact Registry, SAs, APIs)
- `scripts/02_gcp_github_oidc.sh` – One-time OIDC setup (GitHub ↔︎ GCP Workload Identity Federation)
- `scripts/03_secrets_and_first_deploy.sh` – Upserts secrets, builds, and deploys first Cloud Run revision
- `scripts/04_sync_github_env.sh` – Syncs `.env` values into GitHub Variables + Secrets via `gh`

---

## 🚀 Local Development

### 1. Install prerequisites
- Rust toolchain (`cargo`)
- Docker
- Google Cloud SDK (`gcloud`)
- GitHub CLI (`gh`) → required for script 4

### 2. Setup repo
```bash
git clone https://github.com/AbhinavSivanandhan/team.git
cd team
cp .env.example .env   # edit with real values
```

### 3. Run locally
Directly:
```bash
cargo run
```

With Docker:
```bash
docker build -t partner-tools-api .
docker run --env-file .env -p 8080:8080 partner-tools-api
```

---

## ☁️ First-Time GCP Setup (One-time Only)

### 🔑 File Permissions
Before running any scripts, make them executable:
```bash
chmod +x scripts/load_env.sh
chmod +x scripts/01_gcp_bootstrap.sh
chmod +x scripts/02_gcp_github_oidc.sh
chmod +x scripts/03_secrets_and_first_deploy.sh
chmod +x scripts/04_sync_github_env.sh
```

---

### 📝 Script Execution Order
Always **load the `.env` first**, then run the scripts in order:

1. **Load environment**
   ```bash
   ./scripts/load_env.sh
   ```

2. **Bootstrap GCP project + services**
   ```bash
   ./scripts/01_gcp_bootstrap.sh
   ```

3. **Configure GitHub OIDC provider**
   ```bash
   ./scripts/02_gcp_github_oidc.sh
   ```

4. **Secrets + first deploy**
   ```bash
   ./scripts/03_secrets_and_first_deploy.sh
   ```

   - Pushes secrets from `.env` into Secret Manager
   - Grants access to deploy + runtime service accounts
   - Builds & pushes image with Cloud Build
   - Deploys Cloud Run service `partner-tools-api`

   *(URL is shown in script output and also in GitHub Actions “Show URL” step)*

5. **Sync `.env` → GitHub**
   *(needed for CI/CD)*

   #### 🛠 GitHub CLI Setup (Required for Script 4)
   Script `04_sync_github_env.sh` manages **synchronization of environment variables and secrets** into your GitHub repository.

   Install the GitHub CLI via Homebrew (macOS):
   ```bash
   brew install gh
   gh auth login
   ```

   Run:
   ```bash
   ./scripts/04_sync_github_env.sh
   ```

   Populates GitHub **Variables (non-secrets)** and **Secrets (passwords, API keys, OIDC provider, SA email)**.

#### Note: Scripts load_env.sh, 01_gcp_bootstrap.sh, 02_gcp_github_oidc.sh, and 03_secrets_and_first_deploy.sh are one-time setup. Script 04_sync_github_env.sh should also be run whenever you update your .env to sync GitHub Variables + Secrets for the CI/CD pipeline.

---

## 🔐 Secrets & Config

### User-Set in `.env` (you must provide)
- Database config: `COMMONS_*`, `EXIOBASE_*`
- API keys: `GEMINI_API_KEY`, `CLAUDE_API_KEY`
- Project + billing IDs: `GOOGLE_PROJECT_ID`, `GOOGLE_BILLING_ID`
- GitHub repo identifiers: `GITHUB_OWNER`, `GITHUB_REPO`
- Optional OAuth keys (Google, GitHub, LinkedIn, etc.)
- `DUMMY_SECRET` (for testing/debugging pipeline)

### Script/CI-Managed (auto-filled later)
- `GOOGLE_PROJECT_NUMBER`
- `GOOGLE_SA_EMAIL`
- `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`

---

## 🤖 Continuous Deployment (CI/CD)

- Workflow: [`.github/workflows/deploy-team-cloudrun.yml`](.github/workflows/deploy-team-cloudrun.yml)
- Trigger: push to `main`

### Pipeline Steps
1. Authenticate to GCP with OIDC (no JSON key files)
2. Build Docker image with Cloud Build
3. Push to Artifact Registry
4. Deploy to Cloud Run
5. Inject secrets + env vars

> After bootstrap, you **just push to main → GitHub Actions deploys automatically**.

---

## 📤 Testing a Deployment

After deploy, test with `curl`:

### 1. Health check
```bash
URL="$(gcloud run services describe partner-tools-api --region us-central1 --format='value(status.url)')"
curl -s ${URL}/api/health | jq .
```

Expected:
```json
{
  "database_connected": true,
  "status": "healthy"
}
```

### 2. Tables
```bash
curl -s ${URL}/api/tables
```

### 3. Projects
```bash
curl -s ${URL}/api/projects
```

### 4. Recommendations
```bash
curl -s -X POST ${URL}/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"preferences":["Healthcare Access","Digital Inclusion"]}' | head
```

---

✅ With this setup: **push → GitHub Actions → Cloud Run deploys automatically**.
Scripts (`load_env` → `01` → `02` → `03` → `04`) cover everything from **bootstrap → OIDC → secrets → sync**.
