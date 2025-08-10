#FULL SETUP OF THIS FILE IS PENDING, make scripts executable too
# ---------------------------------
# Configurable variables
# ---------------------------------
PROJECT_ID        ?= your-gcp-project-id
REGION            ?= us-central1
SERVICE_NAME      ?= gemini-crm-api
REPO_NAME         ?= team-app
SQL_INSTANCE      ?= team-db
SQL_REGION        ?= $(REGION)

ENV_FILE          ?= .env
DEPLOY_SCRIPT     := scripts/deploy.sh
TEARDOWN_SCRIPT   := scripts/teardown.sh

# Flags for teardown
TEARDOWN_FLAGS    ?=

# GCP Build args (for remote build)
TAG               ?= latest
IMAGE_PATH        := $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPO_NAME)/$(SERVICE_NAME):$(TAG)

# ---------------------------------
# Default target
# ---------------------------------
.DEFAULT_GOAL := help

# ---------------------------------
# Targets
# ---------------------------------
help:
	@echo "Available make targets:"
	@echo "  make deploy              -> Deploy app to GCP using $(DEPLOY_SCRIPT)"
	@echo "  make teardown            -> Tear down deployment (Cloud Run, etc.)"
	@echo "  make teardown-full       -> Tear down EVERYTHING (incl. Cloud SQL, secrets, repo)"
	@echo "  make status              -> Show deployed resources"
	@echo "  make build-local         -> Build Docker image locally"
	@echo "  make run-local           -> Run Docker Compose locally"
	@echo "  make push-remote         -> Build and push Docker image to Artifact Registry (remote build)"
	@echo "  make clean-volumes       -> Remove local Docker volumes"

# Deploy to GCP
deploy:
	@echo "🚀 Deploying $(SERVICE_NAME) to $(PROJECT_ID) in $(REGION)..."
	PROJECT_ID=$(PROJECT_ID) REGION=$(REGION) SERVICE_NAME=$(SERVICE_NAME) \
		$(DEPLOY_SCRIPT) $(DEPLOY_ARGS)

# Teardown basic
teardown:
	@echo "🧨 Tearing down $(SERVICE_NAME) in $(PROJECT_ID)..."
	PROJECT_ID=$(PROJECT_ID) REGION=$(REGION) SERVICE_NAME=$(SERVICE_NAME) \
		$(TEARDOWN_SCRIPT) $(TEARDOWN_FLAGS)

# Teardown everything (dangerous)
teardown-full:
	@echo "💣 FULL teardown (service, secrets, images, repo, SQL, disable APIs)..."
	PROJECT_ID=$(PROJECT_ID) REGION=$(REGION) SERVICE_NAME=$(SERVICE_NAME) \
		$(TEARDOWN_SCRIPT) \
		--delete-secrets \
		--delete-images \
		--delete-repo \
		--delete-sql --sql-instance $(SQL_INSTANCE) --sql-region $(SQL_REGION) \
		--disable-apis -y

# Show status of resources
status:
	@echo "📋 Checking GCP resources for $(PROJECT_ID)..."
	@gcloud run services list --project $(PROJECT_ID) --region $(REGION) --format="table(NAME,URL)"
	@echo ""
	@echo "Artifact Registry images:"
	@gcloud artifacts docker images list $(REGION)-docker.pkg.dev/$(PROJECT_ID)/$(REPO_NAME) --format="table(IMAGE,UPDATE_TIME)" || true
	@echo ""
	@echo "Cloud SQL instances:"
	@gcloud sql instances list --project $(PROJECT_ID) --format="table(NAME,REGION,STATUS)" || true
	@echo ""
	@echo "Secrets:"
	@gcloud secrets list --project $(PROJECT_ID) --format="table(NAME,CREATE_TIME)" || true

# Build locally
build-local:
	@echo "🔨 Building Docker image locally..."
	docker build -t $(SERVICE_NAME):$(TAG) .

# Run locally
run-local:
	@echo "🏃 Running locally with Docker Compose..."
	docker compose up --build

# Remote build & push
push-remote:
	@echo "📦 Remote building & pushing to Artifact Registry..."
	gcloud builds submit --tag $(IMAGE_PATH) .

# Clean local volumes
clean-volumes:
	@echo "🧹 Removing local Docker volumes..."
	docker compose down -v
