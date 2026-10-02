# Team Config Migration Plan

## Goal
Retire legacy `team/config/settings.example.js` + local `settings.js` usage and standardize on the shared `.env` named by `env_file` in `automation/paths.yaml` (template: `automation/.env.example`). The `docker` repo, which held the earlier shared `.env`, is discontinued.

## Why This Change
- `team` runs as a submodule inside each site's webroot.
- The Rust API reads the `.env` named by `automation/paths.yaml` (`team/src/env_paths.rs`).
- A single shared env file avoids duplicate API/database/OAuth settings across submodules.
- This aligns with `team/AGENTS.md` startup and server guidance.

## Scope
- Team frontend and backend config loading
- Team docs and setup UX
- Admin SQL panel fallback behavior
- Error/help messages that still mention `settings.js`

## Current State (Observed)
- Backend env resolution lives in `team/src/env_paths.rs` (CloudRoot `automation/paths.yaml`, then webroot `automation/paths.yaml`).
- Legacy references remain in:
  - `team/config/settings.example.js`
  - `team/admin/sql/panel/db-admin.js`
  - `team/README.md` and panel/docs references
  - `.gitignore` entries for `config/settings.js`

## Implementation Plan

### Phase 1: Documentation and Setup Path
- [x] Update `team/README.md` to position `team` as a webroot submodule.
- [x] Replace `config/settings.js` setup guidance with `.env` setup via `automation/paths.yaml`.
- [ ] Update `team/admin/sql/panel/README.md` to prioritize the `automation/paths.yaml` `.env`.
- [ ] Add a short migration note in `team/config/settings.example.js` pointing to `automation/paths.yaml`.

### Phase 2: Runtime Configuration Source Cleanup
- [ ] Update `team/admin/sql/panel/db-admin.js` UI copy:
  - Prefer `.env` wording over `settings.js`
  - Keep compatibility fallback while migration is active
- [ ] Ensure frontend config loading order is explicit:
  1. Rust API values sourced from the `automation/paths.yaml` `.env`
  2. Optional browser-local overrides
  3. Legacy `settings.js` only as temporary fallback
- [ ] Add console warnings when legacy `settings.js` path is used.

### Phase 3: Deprecation and Removal
- [ ] Remove runtime dependency on `settings.js` after verification.
- [ ] Delete `team/config/settings.example.js` if no active consumers remain.
- [ ] Remove `config/settings.js` ignore lines from relevant `.gitignore` files.
- [ ] Update any start/setup scripts that still reference `settings.js`.

### Phase 4: Validation
- [ ] Verify `cargo run --bin partner_tools -- serve` starts with only the `automation/paths.yaml` `.env`.
- [ ] Verify setup pages correctly detect `.env` values through API endpoints.
- [ ] Verify SQL admin panel reports `.env` source correctly.
- [ ] Smoke-test OAuth and Gemini key detection paths.

## AGENTS-Aligned Operational Notes
- Keep `team` usage documented from webroot context (`cd <site-webroot>/team`).
- Use `localhost` for local URLs where possible.
- For long-running dev server, use background-safe pattern from `team/AGENTS.md`.
- Keep docs consistent with the shared `automation/paths.yaml` `.env` location and naming.

## Follow-up Improvements
- Add a single helper command in docs for first-time setup:
  - `cp automation/paths.example.yaml automation/paths.yaml`, set `env_file`, then copy `automation/.env.example` to that path
- Add a status endpoint response field that confirms effective config source.
- Add CI/doc checks to fail if new docs reintroduce `settings.js` setup guidance.
