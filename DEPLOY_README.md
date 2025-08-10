# **MemberCommons API + Postgres Deployment Guide (Fly.io)**

This README is for developers joining the project or redeploying it after downtime.
It covers both **first-time setup** and **daily/occasional restart & deployment steps**.


## **Architecture Overview**

* **Backend API**: Rust / Actix-web, deployed on Fly.io as `membercommons-team-api`.
* **Database**: Postgres 15, deployed on Fly.io as `model-earth-db`.
* **Networking**: API connects to DB via Fly private network using:

  ```
  model-earth-db.flycast:5432
  ```

---

## **Machine Specs Used**

> You can adjust later, but these are the minimum to what we used successfully (any lower will immediately crash the db, even without additional data).
[Requesting project team to update this as your needs scale. I'm sure you'll need more memory]

**API app machine**

```toml
[vm]
cpu_kind = "shared"
cpus = 1
memory = "512mb"
```

**Postgres machine**

```
fly postgres create --name model-earth-db \
  --region sin \
  --vm-size shared-cpu-1x \
  --volume-size 10
```

---

## **1️⃣ First-Time Setup (From Scratch)**

### 1. Install Fly CLI

```sh
curl -L https://fly.io/install.sh | sh
fly auth login
```
Add a credit card to your fly.io account, otherwise you'll have to keep starting the API and DB machines every 5 minutes during the free-trial.

### 2. Create the Postgres DB

```sh
fly postgres create --name model-earth-db \
  --region sin \
  --vm-size shared-cpu-1x \
  --volume-size 10
```

### 3. Allow API app to connect to DB

```sh
fly apps create membercommons-team-api

fly secrets set -a membercommons-team-api \
  COMMONS_PASSWORD='oEvg4gJm9TVYndZ' \
  GEMINI_API_KEY='REDACTED_IF_USED' \
  CLAUDE_API_KEY='REDACTED_IF_USED'
```

⚠ Note: **Never** hardcode DB password — remember to always set it like how we do above, that is:

```sh
fly secrets set COMMONS_PASSWORD='<password>' -a membercommons-team-api
```

The password is in `fly postgres connect` output from step 2.

### 4. Seed the DB schema

First, start the DB machine:

```sh
fly machines start -a model-earth-db <MACHINE_ID>
```
Give it 20-30 seconds atleast (DNS propagation takes place in the backend).
Then upload schema:

```sh
cat admin/sql/suitecrm-postgres.sql \
  | fly ssh console -a model-earth-db -C 'sh -lc "cat > /tmp/schema.sql"'
fly ssh console -a model-earth-db -C \
'psql -U postgres -p 5433 -d ModelEarthDB -f /tmp/schema.sql'

```
Networking explanation :
We're connecting directly to the Postgres machine without going through Fly’s TCP proxy.
That’s because:
- The Postgres machine itself listens on 5433.
- The Fly proxy (what .flycast:5432 points to) forwards 5432 → machine:5433.
So let's not get confused on why we seem to use 5433 and 5432 interchangeably.

### 5. Deploy the API

```sh
fly deploy --strategy immediate
```

---

## **2️⃣ Restarting / Redeploying (Daily / After Idle)**

When returning after a while, both DB and API may be stopped. Start both machines using step 1 & 2 to use. Start DB and give it a few seconds before API is started.

### 1. Start DB machine(s)

```sh
fly machines list -a model-earth-db
fly machines start -a model-earth-db <MACHINE_ID>
```

### 2. Start API machine(s) (You may see 2 apps though you created only one, since fly.io does it for availability/redundancy. start both)

```sh
fly machines list -a membercommons-team-api
fly machines start -a membercommons-team-api <MACHINE_ID>
```

### 3. Verify health

```sh
curl -s https://membercommons-team-api.fly.dev/api/health | jq .
```

Expected:

```json
{"database_connected": true, "status": "healthy"}
```

---

## **3️⃣ Redeploying with Code Changes ('fly deploy' also works, but is slower and only if we treat this app as prod)**

```sh
fly deploy --strategy immediate
```

This rebuilds Docker image, updates machines, and runs health checks.

---

## **4️⃣ Useful Debug Commands**

**Check logs:**

```sh
fly logs -a membercommons-team-api
fly logs -a model-earth-db
```

**SSH into API machine:**

```sh
fly ssh console -a membercommons-team-api
```

**SSH into DB machine:**

```sh
fly ssh console -a model-earth-db
```


## **Some DB Networking Notes (for those working on deployments) **

* **`.flycast:5432`** — stable hostname + stable port via Fly’s TCP proxy.

  * Survives machine restarts/replacements.
  * Works across all regions.
  * **Use this in secrets and config.**
* **`.internal:5432`** — same-region DNS.

  * Fails if API and DB are in different regions.
* **`<MACHINE_ID>.vm.model-earth-db.internal:5433`** — direct-to-machine, raw port.

  * Useful only for SSH debugging.
  * Breaks if machine is replaced.

We **use `model-earth-db.flycast:5432`** for all application traffic.

---

## **5️⃣ Example Health & API Checks**

```sh
# Health
curl -i https://membercommons-team-api.fly.dev/api/health

# Tables overview
curl -i https://membercommons-team-api.fly.dev/api/tables

# Projects list
curl -i https://membercommons-team-api.fly.dev/api/projects

# Recommendations
curl -s -X POST https://membercommons-team-api.fly.dev/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"preferences":["Healthcare Access","Digital Inclusion"]}'

curl -s -X POST https://membercommons-team-api.fly.dev/api/recommendations \
  -H "Content-Type: application/json" \
  -d '{"preferences":["Healthcare Access","Digital Inclusion"]}' | head
```
