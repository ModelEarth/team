Here’s a **`markdown file`** that documents what you’ve built, how to set it up, and how deployments work now with both scripts and CI/CD.

---

# Team API – Rust + Cloud Run

This repository contains the **Partner Tools API** written in Rust and deployed to **Google Cloud Run**.
It connects to Azure Postgres databases (Commons + Exiobase), provides REST endpoints, and integrates with AI services (Gemini, Claude).

---

## 📦 Project Structure

* `Dockerfile` – Multi-stage build for Rust → minimal Debian runtime
* `docker/start.sh` – Startup wrapper
* `.env` – Local environment config (ignored in CI/CD; values synced to GCP Secret Manager or GitHub Variables)
* `.github/workflows/deploy-team-cloudrun.yml` – CI/CD workflow for GitHub Actions
* `cloudbuild.yaml` – Cloud Build pipeline for building/pushing images and deploying
* `scripts/01_gcp_bootstrap.sh` – One-time GCP bootstrap (project, billing, Artifact Registry, service accounts)
* `scripts/02_gcp_github_oidc.sh` – One-time OIDC setup for GitHub → GCP Workload Identity
* `scripts/03_secrets_and_first_deploy.sh` – Push secrets to Secret Manager, build + deploy first Cloud Run revision
* `scripts/load_env.sh` – Utility to source `.env` locally into your shell

---

## 🚀 Getting Started (Local Dev)

1. **Install prerequisites**:

   * Rust toolchain (`cargo`)
   * Docker
   * Google Cloud SDK (`gcloud`)

2. **Clone and setup**:

   ```bash
   git clone https://github.com/AbhinavSivanandhan/team.git
   cd team
   cp .env.example .env   # then edit with your real values
   ```

3. **Run locally**:

   ```bash
   cargo run
   ```

   or via Docker:

   ```bash
   docker build -t partner-tools-api .
   docker run --env-file .env -p 8080:8080 partner-tools-api
   ```

---

## ☁️ First-Time Setup (Manual, one-time)
   ./scripts/load_env.sh

1. **Bootstrap GCP project**:

   ```bash
   ./scripts/01_gcp_bootstrap.sh
   ```

2. **Configure GitHub OIDC → GCP**:

   ```bash
   ./scripts/02_gcp_github_oidc.sh
   ```

3. **Push secrets + first deploy**:

   ```bash
   ./scripts/03_secrets_and_first_deploy.sh
   ```

   This step:

   * Creates/updates secrets in Secret Manager
   * Builds and pushes the Docker image
   * Deploys Cloud Run service (`partner-tools-api`)

---
After deploy, for ci/cd:
brew install gh
script 4 for updating secrets if they change

---
## 🔐 Secrets & Config

* Non-secret environment values → stored as **GitHub Repository Variables**
* Secrets (DB passwords, API keys) → stored in **Google Secret Manager**

### Example Mapping

| Key                 | Location        |
| ------------------- | --------------- |
| `COMMONS_HOST`      | GitHub Variable |
| `COMMONS_PASSWORD`  | Secret Manager  |
| `EXIOBASE_PASSWORD` | Secret Manager  |
| `GEMINI_API_KEY`    | Secret Manager  |
| `CLAUDE_API_KEY`    | Secret Manager  |
| `SERVER_PORT`       | GitHub Variable |

---

## 🤖 Continuous Deployment

Deployment is automated with GitHub Actions:

* Workflow: [`.github/workflows/deploy-team-cloudrun.yml`](.github/workflows/deploy-team-cloudrun.yml)
* Trigger: push to `main` branch
* Steps:

  1. Authenticate to GCP using OIDC (no JSON keys required)
  2. Build Docker image via Cloud Build
  3. Push to Artifact Registry
  4. Deploy to Cloud Run
  5. Inject environment + secrets

Manual scripts (`01–03`) are **only for bootstrap**.
Ongoing deployments happen automatically.

---

## 🔎 Testing Deployment

After deploy:

```bash
URL="https://partner-tools-api-<hash>-uc.a.run.app"
curl -s ${URL}/api/health | jq .
```

Example output:

```json
{
  "database_connected": true,
  "status": "healthy"
}
```

---

## 📝 Next Steps

* [ ] Configure GitHub repo → Settings → Secrets and Variables → Actions:

  * Add **Variables**: non-secrets from `.env`
  * Add **Secrets**: `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_SERVICE_ACCOUNT`
* [ ] Commit & push to `main` → verify GitHub Actions workflow runs
* [ ] Expand endpoints + tests as needed

---

✅ With this setup, **contributors push code → GitHub builds + deploys → Cloud Run updates automatically**.
The three bootstrap scripts should rarely need re-running.

---
