#FULL SETUP OF THIS FILE IS PENDING, make scripts executable too. Just a draft. Future scope includes integrating the db wait script and making it more robust

# ===============================
# MemberCommons: Fly.io automation
# ===============================
# Usage examples:
#   make help
#   make login
#   make db-create
#   make db-start
#   COMMONS_PASSWORD=... make secrets
#   make db-seed
#   make deploy
#   make health
#   make status
#   make logs
#   make app-restart
#   make destroy CONFIRM=YES
#
# Requires: flyctl, jq

SHELL := /bin/bash

# ---- Parse from fly.toml ----
APP      ?= $(shell awk -F\" '/^app[[:space:]]*=/{print $$2; exit}' fly.toml)
REGION   ?= $(shell awk -F\" '/^primary_region[[:space:]]*=/{print $$2; exit}' fly.toml)

# ---- DB app name (created with `fly pg create`) ----
DB_APP   ?= model-earth-db
DB_REGION?= $(REGION)

# ---- DB defaults (match code) ----
DB_NAME  ?= ModelEarthDB
DB_USER  ?= postgres
# We always connect the app via flycast:5432 ; machine listens internally on 5433
DB_FLYCAST ?= $(DB_APP).flycast
DB_PROXY_PORT ?= 5432
DB_MACHINE_PORT ?= 5433

# ---- Schema file path ----
SCHEMA  ?= admin/sql/suitecrm-postgres.sql

# ---- VM sizes (tweak as needed) ----
DB_VM_SIZE ?= shared-cpu-1x
DB_VOL_GB  ?= 10

# ---- Helpers ----
define need
	@command -v $(1) >/dev/null 2>&1 || { echo "✖ Missing dependency: $(1)"; exit 1; }
endef

.PHONY: help
help:
	@echo ""
	@echo "Targets:"
	@echo "  login           - fly auth login"
	@echo "  whoami          - show fly org/app info"
	@echo "  db-create       - create Fly Postgres machine ($(DB_APP)) in region $(DB_REGION)"
	@echo "  db-start        - start all DB machines"
	@echo "  db-stop         - stop all DB machines"
	@echo "  db-status       - status of DB machines"
	@echo "  db-proxy        - proxy local 54321 -> DB 5432 (flycast)"
	@echo "  db-create-name  - create database $(DB_NAME) (idempotent)"
	@echo "  db-seed         - upload & apply schema to $(DB_NAME)"
	@echo "  app-create      - create API app ($(APP))"
	@echo "  secrets         - set secrets (needs COMMONS_PASSWORD=...)"
	@echo "  deploy          - build & deploy API"
	@echo "  start           - start all API machines"
	@echo "  stop            - stop all API machines"
	@echo "  restart         - restart all API machines"
	@echo "  status          - status of API machines"
	@echo "  logs            - tail API logs"
	@echo "  health          - call /api/health"
	@echo "  config-env      - call /api/config/env"
	@echo "  destroy         - delete both apps (requires CONFIRM=YES)"
	@echo ""

# -----------------------------
# Fly auth / info
# -----------------------------
.PHONY: login
login:
	$(call need,fly)
	fly auth login

.PHONY: whoami
whoami:
	$(call need,fly)
	@echo "App: $(APP)"
	@echo "DB App: $(DB_APP)"
	@echo "Region: $(REGION)"
	fly orgs list || true

# -----------------------------
# Database lifecycle
# -----------------------------
.PHONY: db-create
db-create:
	$(call need,fly)
	fly pg create --name $(DB_APP) --region $(DB_REGION) --vm-size $(DB_VM_SIZE) --volume-size $(DB_VOL_GB)

.PHONY: db-status
db-status:
	$(call need,fly)
	fly machines list -a $(DB_APP)

.PHONY: db-start
db-start:
	$(call need,fly)
	@MIDS=$$(fly machines list -a $(DB_APP) --json | jq -r '.[].id'); \
	if [ -z "$$MIDS" ]; then echo "No machines found for $(DB_APP)"; exit 1; fi; \
	for id in $$MIDS; do echo "Starting $$id ..."; fly machines start -a $(DB_APP) $$id; done

.PHONY: db-stop
db-stop:
	$(call need,fly)
	@MIDS=$$(fly machines list -a $(DB_APP) --json | jq -r '.[].id'); \
	if [ -z "$$MIDS" ]; then echo "No machines found for $(DB_APP)"; exit 1; fi; \
	for id in $$MIDS; do echo "Stopping $$id ..."; fly machines stop -a $(DB_APP) $$id; done

# use this for local psql: psql "postgres://postgres:<pwd>@localhost:54321/ModelEarthDB"
.PHONY: db-proxy
db-proxy:
	$(call need,fly)
	@echo "Proxy on localhost:54321 -> $(DB_APP) (flycast:$(DB_PROXY_PORT))"
	fly proxy 54321:$(DB_PROXY_PORT) -a $(DB_APP)

.PHONY: db-create-name
db-create-name:
	$(call need,fly)
	# create DB if it doesn't exist (connect to postgres catalog on machine port 5433)
	fly ssh console -a $(DB_APP) -C 'psql -U $(DB_USER) -p $(DB_MACHINE_PORT) -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '\''$(DB_NAME)'\''" | grep -q 1 || psql -U $(DB_USER) -p $(DB_MACHINE_PORT) -d postgres -c "CREATE DATABASE \"$(DB_NAME)\";"'

.PHONY: db-seed
db-seed:
	$(call need,fly)
	@test -f $(SCHEMA) || { echo "✖ Schema not found: $(SCHEMA)"; exit 1; }
	# upload schema into the machine
	cat $(SCHEMA) | fly ssh console -a $(DB_APP) -C 'sh -lc "cat > /tmp/schema.sql"'
	# apply schema (inside machine on 5433)
	fly ssh console -a $(DB_APP) -C 'psql -U $(DB_USER) -p $(DB_MACHINE_PORT) -d $(DB_NAME) -f /tmp/schema.sql'

# -----------------------------
# API app lifecycle
# -----------------------------
.PHONY: app-create
app-create:
	$(call need,fly)
	fly apps create $(APP) || true

# NOTE: COMMONS_PASSWORD must be provided in env; other keys optional.
.PHONY: secrets
secrets:
	$(call need,fly)
	@if [ -z "$$COMMONS_PASSWORD" ]; then echo "✖ Set COMMONS_PASSWORD=..."; exit 1; fi; \
	echo "Setting required secrets for $(APP)"; \
	fly secrets set -a $(APP) COMMONS_PASSWORD="$$COMMONS_PASSWORD" ; \
	if [ -n "$$GEMINI_API_KEY" ]; then fly secrets set -a $(APP) GEMINI_API_KEY="$$GEMINI_API_KEY"; fi ; \
	if [ -n "$$CLAUDE_API_KEY" ]; then fly secrets set -a $(APP) CLAUDE_API_KEY="$$CLAUDE_API_KEY"; fi

.PHONY: deploy
deploy:
	$(call need,fly)
	fly deploy --strategy immediate

.PHONY: start
start:
	$(call need,fly)
	@MIDS=$$(fly machines list -a $(APP) --json | jq -r '.[].id'); \
	if [ -z "$$MIDS" ]; then echo "No machines found for $(APP) (deploy first?)"; exit 1; fi; \
	for id in $$MIDS; do echo "Starting $$id ..."; fly machines start -a $(APP) $$id; done

.PHONY: stop
stop:
	$(call need,fly)
	@MIDS=$$(fly machines list -a $(APP) --json | jq -r '.[].id'); \
	if [ -z "$$MIDS" ]; then echo "No machines found for $(APP)"; exit 1; fi; \
	for id in $$MIDS; do echo "Stopping $$id ..."; fly machines stop -a $(APP) $$id; done

.PHONY: restart
restart:
	$(call need,fly)
	@MIDS=$$(fly machines list -a $(APP) --json | jq -r '.[].id'); \
	if [ -z "$$MIDS" ]; then echo "No machines found for $(APP)"; exit 1; fi; \
	for id in $$MIDS; do echo "Restarting $$id ..."; fly machines restart -a $(APP) $$id; done

.PHONY: status
status:
	$(call need,fly)
	fly status -a $(APP)
	fly machines list -a $(APP)

.PHONY: logs
logs:
	$(call need,fly)
	fly logs -a $(APP)

.PHONY: health
health:
	$(call need,fly)
	@curl -s https://$(APP).fly.dev/api/health | jq .

.PHONY: config-env
config-env:
	$(call need,fly)
	@curl -s https://$(APP).fly.dev/api/config/env | jq .

# -----------------------------
# Full first-time flow
# -----------------------------
.PHONY: first-time
first-time: login app-create db-create db-start db-create-name db-seed
	@echo ""
	@echo "Now set secrets (COMMONS_PASSWORD from 'fly pg create' output), then deploy:"
	@echo "  COMMONS_PASSWORD=... make secrets"
	@echo "  make deploy"
	@echo ""

# -----------------------------
# Teardown (danger!)
# -----------------------------
.PHONY: destroy
destroy:
	$(call need,fly)
	@if [ "$(CONFIRM)" != "YES" ]; then \
		echo "✖ This will DELETE apps $(APP) and $(DB_APP). Run: make destroy CONFIRM=YES"; exit 1; \
	fi
	@echo "Deleting API app $(APP) ..."
	-fly apps destroy $(APP) --yes
	@echo "Deleting DB app $(DB_APP) ..."
	-fly apps destroy $(DB_APP) --yes
	@echo "Done."
