# Merging per-year Industry Databases into one multi-year `industrydb`

Plan for consolidating `industrydb_2019`, `industrydb_2021`, and future per-year databases into a
single `industrydb` that holds multiple years. Two mechanisms exist now (see "Mechanism" below):
the original `dblink`-based in-Postgres merge (still blocked on Azure), and a working direct-import
path that bypasses it entirely. Stage 1 (per-year load) is done for 2019 and 2021; Stage 2 (the
shared `industrydb`) is now populated for 2019 via direct import, with 2021 in progress.

## Status (2026-09-20, verified against live databases)

**Stage 2 direct import — working, in progress.** `POST /api/db/insert-trade-data` with
`{"target": "industrydb"}` (implemented in `merge_years.rs`, sharing `insert_trade_rows`/
`insert_trade_factor_rows`/`insert_interstate_*_rows` with the per-year loader via an
`Option<i32>` year parameter and, for the two factor tables, an optional factor_id remap map —
no duplicate parsing code) loads a year's CSVs straight into `industrydb`, adding `year` and
remapping `factor_id` through `industrydb`'s own `factor` table by `(extension, stressor)` inline
in Rust, instead of via `dblink`. **2019 verified complete and correct**: every table's row count
in `industrydb WHERE year=2019` matches `industrydb_2019` exactly (`trade` 358,424, `trade_factor`
1,449,277, `interstate` 171,136, `interstate_factor` 1,711,360), `trade_id` blocks non-colliding
(domestic 1–19,043, imports 1,000,000–1,163,654, exports 2,000,000–2,175,725), and the factor_id
remap produced a clean identity mapping (1–728, zero orphaned `trade_factor` rows) since `factor`
was empty before this, the first year ever merged. **2021 direct import also verified complete
and correct**: `trade`/`trade_factor`/`interstate`/`interstate_factor` all match `industrydb_2021`
exactly, `trade_id` blocks non-colliding (domestic 1–17,135, imports 1,000,000–1,146,555, exports
2,000,000–2,146,193), and — the real test of the remap, now that `factor` was non-empty — `factor`
stayed at 728 rows after merging 2021 (every 2021 stressor matched an existing 2019 one by
`(extension, stressor)`, zero new rows, zero orphaned `trade_factor`/`interstate_factor` rows).
**Both years fully in `industrydb` now — US only.**

## Multi-country loading — 2019 non-US data regenerated, not yet re-checked; 2021 confirmed safe

Other countries' 2019/2021 CSVs were generated separately (not yet loaded into any database).
Loading more than one country risks two distinct issues, checked directly against the actual data
rather than assumed:

- **Bilateral flows appear in two countries' files** — e.g. `region1=CN,region2=US` appears in both
  CN's `exports` file and US's `imports` file. `trade`'s `UNIQUE(region1,region2,industry1,industry2)`
  natural key means the second insert is silently skipped, which is fine **only if both countries
  agree on the amount** — trade.py's extraction is a pure lookup into Exiobase's single global,
  country-independent Z matrix (`trade.py:464-557`), so it should always agree.
- **Checked empirically, and the two years disagree:** 2021's shared CN↔US keys are byte-identical
  between `US/imports` and `CN/exports` (4,702/4,702 exact matches, verified). **2019's are not** —
  ~95% of a 2,000-key sample differ, some 5-10x. Root cause found: every 2019 non-US country file
  (checked AU, BR, CN, DE, JP) carries a stray `year` column trade.py no longer emits — they're from
  an older pipeline run, not the current one, and shouldn't be trusted until regenerated.
  **2021's non-US files have the current (no-`year`-column) schema and verified-matching amounts —
  safe to load.** **2019 was reprocessed with current `trade.py`** to fix this — confirm the new
  files have the current schema (no stray `year` column) and matching amounts, the same way 2021 was
  checked above, before loading 2019 non-US data.
- A second, more severe structural risk, found while designing the fix below and confirmed against
  real data: **`trade_id` was never made unique *across* countries, only within one country's own
  three files.** Every country's `trade.csv` independently restarts its row numbering at 1, so the
  existing flow_type offset alone doesn't stop two different countries' files from computing the
  identical `trade_id`. Checked directly: 2019 `CN/domestic/trade.csv` (rows 1–18,698) and
  `US/domestic/trade.csv` (rows 1–19,043) both get offset 0 and would collide on `trade_id`
  1–18,698 even though every one of those rows is a genuinely different physical flow (CN↔CN vs.
  US↔US, not a duplicate). This isn't the natural-key `ON CONFLICT` case — it's a hard
  `duplicate key value violates unique constraint "trade_pkey"` error on the *primary key itself*,
  which no `ON CONFLICT` target aimed at the natural key would catch, since Postgres still enforces
  every other constraint on the row regardless of which one `ON CONFLICT` names.

### Fix design: per-country `trade_id` blocks + skip-before-insert (implemented, not yet live-verified)

Two independent problems, two independent parts of the fix — both needed, neither one alone is
enough:

**Part 1 — per-country block, fixes the `trade_id` PK collision.** Add one more tier on top of the
existing per-flow_type offset (Stage 1) and per-year column (Stage 2):

```
trade_id = (country_block_index - 1) * 3,000,000 + flow_type_offset(flow_type, country_block_index)
           + csv_row_index
```

- `flow_type_offset`'s base values are unchanged (domestic +0, imports +999,999, exports +1,999,999),
  **plus one new case**: domestic gets an extra `-1` for every block after the first
  (`country_block_index > 1`). Reason: `csv_row_index` (`trade.csv`'s own row number) is 1-based, so
  whatever offset a flow_type uses, its block's first `trade_id` actually lands one *past* the offset,
  not on it. imports/exports's offsets (999,999/1,999,999) are already one less than the round number
  they're meant to start on, so this was never visible for them — block 2's imports still starts
  exactly on `4,000,000` with no special-casing. Domestic's offset is a flat `0`, which is exactly
  right for block 1 (needed there — its `trade_id` must stay byte-identical to what's already in
  production, i.e. `trade_id == csv row`, unshifted), but leaves every later block's domestic starting
  one past its round boundary (block 2: `3,000,001` instead of `3,000,000`) unless it gets the same
  `-1` compensation imports/exports already carry.
- `country_block_index` is a small integer assigned **the first time a country is loaded into that
  specific database** (`industrydb_{year}` and `industrydb` each keep their own — trade_id only
  needs to be unique within a single database, and Stage 2's dblink/direct-import merge carries
  `trade_id` over unchanged, so the two don't need matching indices for the same country).
  **`region.block_index` starts at 1, not 0** — index 0 is reserved and never assigned, so the first
  country loaded into a given database gets `country_block_index = 1`. The `- 1` in the formula above
  is deliberate: it converts that human-friendly 1-based index back to a 0-based contribution before
  multiplying, so the first country still contributes `0` to `trade_id`, not `3,000,000`.
- **Zero migration needed for already-loaded data, restored.** Because of the `- 1`, whichever
  country is loaded first into a given database computes `(1 - 1) * 3,000,000 = 0` — reproducing
  today's exact, unshifted `trade_id` values. US, already loaded everywhere, keeps its current values
  as long as it's the first (or only) row `get_or_assign_country_block` ever creates in that
  database's `region` table — true today, since no other country has been loaded yet.
- **Headroom check, not assumed:** Exiobase has exactly 49 regions total (confirmed earlier in this
  file). The `- 1` also restores the original count: the highest usable `country_block_index` is
  `floor((i32::MAX + 1) / 3,000,000) = 715` (`(715 - 1) * 3,000,000 = 2,142,000,000`, still under
  `i32::MAX`), so **715 countries** are supported (indices 1–715) — ~14.6x the 49 that will ever
  actually be loaded. Worst case, 49 countries fully loaded (indices 1–49): `48 * 3,000,000 +
  1,999,999 + ~999,999` ≈ 150 million — nowhere near `integer`'s ~2.1 billion ceiling. 3,000,000 per
  country also leaves ~17x headroom over today's real max (175,726, 2019 exports) before the
  per-flow_type sub-block itself would need widening (a pre-existing, separately tracked risk — see
  "Open questions" below).
- **New tiny reference table**, one per database (`industrydb_{year}` and `industrydb` each get
  their own), named `region`: `region (country VARCHAR(10) PRIMARY KEY, block_index INT NOT NULL)`.
  Assigned atomically so concurrent/repeated calls for the same country don't race:
  ```sql
  WITH next_idx AS (SELECT COALESCE(MAX(block_index), 0) + 1 AS idx FROM region)
  INSERT INTO region (country, block_index)
  SELECT $1, next_idx.idx FROM next_idx
  ON CONFLICT (country) DO UPDATE SET country = region.country
  RETURNING block_index;
  ```
  (The `COALESCE(..., 0) + 1` is what makes the first-ever row get `1`, not `0`. The
  `DO UPDATE SET country = region.country` is a no-op write purely so `RETURNING` still fires and
  returns the *existing* row's `block_index` when the country was already assigned one.)
- `interstate`/`interstate_factor`/`interstate_estimate` need **no change** — gated to `country ==
  "US"` only, so there's only ever one country's worth of `interstate_id` values, no cross-country
  collision possible.

**Part 2 — skip-before-insert using `trade.country`, fixes the FK-orphan risk *and* is the cheaper
check you asked about.** Rather than let a duplicate physical flow reach Postgres and rely on
`ON CONFLICT` to silently drop it (which is exactly where the FK-orphan risk comes from — the
*losing* country's `trade_factor.csv` rows would still try to reference a `trade_id` that was never
inserted), decide **before** parsing whether a row is redundant, using `trade.country`/`flow_type`
(not `trade_id`) as the lookup key:

1. Before processing a country's files, query `SELECT DISTINCT country, flow_type FROM trade
   [WHERE year = ?]` once and build a `known: HashSet<(country, flow_type)>`.
2. For a candidate `trade.csv` row `(region1, region2)`:
   - if `region1 == region2` (domestic): already known iff `known.contains((region1, "domestic"))`.
   - otherwise: already known iff `known.contains((region1, "exports"))` **or**
     `known.contains((region2, "imports"))` — either side's own run would already have captured this
     exact bilateral flow.
3. If already known, **don't add the row to the insert batch at all** — record its `csv_trade_id` in
   a per-flow_type `skipped: HashSet<i32>`.
4. When parsing the matching `trade_factor.csv` (same flow_type), skip any row whose `trade_id`
   column is in that same flow_type's `skipped` set — its data is redundant with whatever the
   already-loaded country contributed for the same physical flow, so nothing is lost, only the
   duplicate copy.
5. Keep the existing `ON CONFLICT` clauses on `trade`/`trade_factor` as the safety net underneath
   this — the pre-filter is an optimization and a way to sidestep the FK-orphan case cleanly, not a
   replacement for the DB-level guarantee. A country loaded with only a *subset* of flow types (via
   the new `flow_types` parameter) won't be fully "known" yet, so this still resolves correctly if a
   later job fills in the missing flow type for that country.

This directly answers what `trade.country` is for here: it's **not** used to relate or pick the
correct `trade_id` — Part 1's country block keeps `trade_id` globally unique on its own, with no
lookup needed at insert time. `trade.country` (paired with `flow_type`) is only the key for Part 2's
"is this already loaded" check, which exists purely to avoid wasted work and the FK-orphan case, not
to establish uniqueness.

**Implemented and live-verified (2026-09-20)** against a real, brand-new `industrydb_2023` (not a
mock or a single extra country — the full real Exiobase 2023 lineup, `US` plus 13 more:
`AU, BR, CA, CN, DE, FR, GB, IN, IT, JP, KR, RU, WM`, US loaded first as designed; a 15th folder,
`default`, was found in `trade-data`'s `year/2023` and correctly excluded — its own `bea-report.md`
literally says `Country: default`, i.e. leftover output from a run with no `--country` given, not a
real region). Checked directly against the live database after all 14 loads, not assumed:

- `region`: exactly 14 rows, `block_index` 1–14 in load order (`US`→1, `AU`→2, ... `WM`→14).
- `trade`: 3,145,241 rows, **3,145,241 distinct `trade_id` values — zero collisions** across all 14
  countries.
- Every country's domestic range starts exactly on its block boundary (`AU`→3,000,000, `BR`→6,000,000,
  ... `WM`→39,000,000), confirming the domestic `-1` compensation (see `trade_id_base` below) works
  correctly against real data, not just the hand-checked arithmetic from earlier in this file.
- `trade.country` → `region.country`: zero FK violations (see the new FK below).
- `trade_factor.trade_id` → `trade.trade_id`: zero orphaned rows.
- Skip-before-insert worked as designed: each later country's skip counts grew (WM, loaded last
  against 13 already-loaded countries, skipped 71,961/18,698/49,630/16,086 rows across its 4 files) —
  confirms shared bilateral flows are being recognized and skipped, not silently duplicated or
  dropped as orphans.
- `interstate`/`interstate_factor` stayed empty for 2023, as expected — 2023 has no BEA layer
  published yet (`interstate.csv`/`interstate_factor.csv`/`interstate_estimate.csv` all 404 for every
  country), unrelated to this work.

Both parts are in `main.rs`/`merge_years.rs`:

- `region` table added to `init_industry_tables_in_pool` (per-year databases) and
  `ensure_merge_infra` (`industrydb` — one table shared across every year merged in, since
  `block_index` depends only on `country`, never on `year`; `industrydb`'s `trade` PK is
  `(year, trade_id)`, so distinct years never need distinct blocks for the same country). Indices
  start at 1 (0 reserved, never assigned).
- `get_or_assign_country_block(pool, country)` — the atomic UPSERT+RETURNING from the design above,
  unchanged. `pub(crate)` in `main.rs`, used from both `main.rs` and `merge_years.rs`.
- `trade_id_base(country_block_index, flow_type)` — `(country_block_index - 1) * 3,000,000 +
  trade_id_offset(flow_type)`, with one adjustment: subtracts an extra `1` from domestic's offset
  when `country_block_index > 1`, so every block after the first still starts its domestic range on a
  round number (`3,000,000`, `6,000,000`, ...) instead of one past it — imports/exports need no such
  adjustment, since their offsets already carry it. Replaces the old bare `trade_id_offset(flow_type)`
  call in `insert_trade_rows`/`insert_trade_factor_rows`. The base `- 1` converts `region.block_index`'s
  1-based numbering back to a 0-based contribution, so the first country loaded still contributes 0.
- `trade_row_already_known(region1, region2, known)` — Part 2's skip check, exactly as designed
  (domestic checked against `(region1, "domestic")`; cross-region checked against
  `(region1, "exports")` **or** `(region2, "imports")`).
- `insert_trade_rows` now takes `country_block_index: i32` and `known: &HashSet<(String,String)>`,
  and returns `(usize, HashSet<i32>)` instead of a bare `usize` — the second element is the set of
  skipped rows' own `csv_trade_id` values, for `insert_trade_factor_rows` to filter its matching
  `trade_factor.csv` by. `insert_trade_factor_rows` now also takes `country_block_index` and
  `skipped_csv_trade_ids: &HashSet<i32>`.
- Both call sites (`db_insert_trade_data` in `main.rs`, `insert_trade_data_direct` in
  `merge_years.rs`) build `known` once per job (`SELECT DISTINCT country, flow_type FROM trade`,
  scoped by `WHERE year = $1` in the `industrydb` case) and assign `country_block_index` once,
  before the `flow_types` loop — not per flow_type.
- `trade.country` → `region.country`: a real FK, added via a guarded `ALTER TABLE` (not inlined into
  `CREATE TABLE`, since `trade` already existed in every database loaded so far) — gracefully skips
  the first time it runs against a database whose existing `trade.country` values predate `region`
  (e.g. 2019/2021's already-loaded `US` data), then self-heals once that country's `region` row
  exists, same pattern as the historical `trade_id` PK migration elsewhere in this file.
- `cargo build` is clean (same 24 pre-existing warnings as before this change, no new ones).

**UI/backend support added** (not yet live-verified — see below): `POST /api/db/insert-trade-data`
now accepts `flow_types: string[]` (default: all three) so a caller can load e.g. only `imports` for
a country whose other flow types were already covered by a different country's data. The
`team/admin/sql/panel` "Send Trade Data to Azure" card now lists per-year countries (from
`trade-data`'s GitHub directory listing) with domestic/imports/exports checkboxes per country, and
surfaces the 2019 stale-data warning inline before Send is clicked.

**Root cause found and fixed (2026-09-20):** `fetch_github_csv` used the bare `reqwest::get(url)`
convenience call, which builds a client with **no timeout at all** — different from every other
GitHub/HTTP fetch in this codebase, which already builds an explicit client with `.timeout(...)`.
If the TCP connect or TLS handshake to GitHub ever stalls (dropped packets with no RST, not a normal
connection-refused error), that call waits forever with no error — exactly matching the symptom
(hung indefinitely at the very first step, fetching `factor.csv`, across clean restarts, for both
the per-year and `target=industrydb` paths, and for the exact unmodified original request shape —
`fetch_github_csv` predates this session's `flow_types`/`region` changes entirely, so this bug was
already latent, not introduced by them). `curl` to the same URL from the same machine succeeding
instantly is also consistent with this: curl has its own default timeout/retry behavior that
`reqwest::get()` simply doesn't.

**Fix**: `fetch_github_csv` now builds an explicit `reqwest::Client` with a 15s `connect_timeout`
and a 60s overall `timeout`, so a stalled connection now surfaces as a normal, bounded error instead
of hanging the request forever. Verified with a temporary `#[tokio::test]` calling
`fetch_github_csv` directly against the real 2019 `factor.csv` URL — returned in 0.29s, 57,519 bytes
(test removed after confirming; it's network-dependent and doesn't belong in the permanent suite).

**Confirmed working end-to-end (2026-09-20)**: the full 14-country 2023 `insert-trade-data` run
above (see "Fix design" section) ran to completion with no hangs at all, across 14 sequential
requests each fetching 10 files from GitHub — the fix holds under real, repeated use, not just the
single-file smoke test.

**Stage 1 complete for 2019 and 2021.** `trade.csv`/`trade_factor.csv`/`interstate.csv`/
`interstate_factor.csv` fixed via `exiobase/tradeflow/fix_trade_ids.py`, committed and pushed to
`trade-data` (`20216b1`), then reloaded into `industrydb_2019`/`industrydb_2021` via
`db_insert_trade_data`. Row counts confirmed directly against both live databases:

| Table | 2019 | 2021 |
|---|---|---|
| `trade` | 358,424 | 309,885 |
| `trade_factor` | 1,449,277 | 1,279,773 |
| `interstate` | 171,136 | 164,064 |
| `interstate_factor` | 1,711,360 | 1,640,640 |

`trade_id` blocking confirmed non-colliding in both years (checked per `flow_type`: row count ==
distinct `trade_id` count in every block). 2021, for example: `domestic` 1–17,135, `imports`
1,000,000–1,146,555, `exports` 2,000,000–2,146,193.

`src/truncate_year_tables.rs` (written to clear `interstate` before the final reload) was never
actually run — every `TRUNCATE`/`CASCADE` phrasing was blocked by Claude Code's auto-mode "Cloud
Storage Mass Delete" classifier — but the final reload produced correct, non-colliding data
without it. Kept as an unused one-off utility; safe to delete if not wanted for future years.

**Not started: Stage 2** (merging both years into the shared `industrydb` — see below).

## Mechanism: `dblink`, not the app layer — **blocked, not just unverified**

Postgres procedures can't natively query across databases. `dblink` and `postgres_fdw` are both
*known to the server binary* (`pg_available_extensions` lists both — confirmed), but that's not
the same as being installable. **Actually tried `CREATE EXTENSION dblink` and `CREATE EXTENSION
postgres_fdw` directly against `industrydb` (2026-09-20) — both fail identically:**

```
extension "dblink" is not allow-listed for "azure_pg_admin" users in Azure Database for PostgreSQL
extension "postgres_fdw" is not allow-listed for "azure_pg_admin" users in Azure Database for PostgreSQL
```

`azure_pg_admin` (the role the provisioning account has — confirmed via `pg_has_role`) is **not**
sufficient on Azure Database for PostgreSQL; extensions also need to be on the server's
`azure.extensions` allow-list, which is an **Azure infrastructure setting** (Portal, or `az
postgres flexible-server parameter set --name azure.extensions --value dblink,postgres_fdw`),
outside what any Postgres role/login can grant itself. `SHOW azure.extensions` on this server
returns empty — nothing is allow-listed today.

**This blocks the whole "merge lives inside Postgres via dblink" design as written.** Two ways
forward, not decided yet:

1. **Get `dblink` (or `postgres_fdw`) added to `azure.extensions`** via the Azure Portal or CLI —
   needs actual Azure subscription/resource access, not just the Postgres login this app uses.
   Once allow-listed, the schema and two procedures below (already written, unused) work as
   designed with no changes.
2. **Move the merge into the Rust app layer instead** — same source/target tables and the same
   factor-remapping logic, but the row data round-trips through `partner_tools` (reads a page from
   `industrydb_{year}` over one `sqlx` pool, writes it to `industrydb` over another) instead of
   `dblink` doing it server-side. Contradicts this plan's original "never round-tripping through
   the Rust app" preference, but needs no Azure infrastructure change and can run today.

The schema below and the `merge_exiobase_year_inspect`/`merge_exiobase_year` SQL procedures are
implemented in `team/src/merge_years.rs`, wired to `POST /api/db/merge-years/inspect` and
`POST /api/db/merge-years/run` — but **unreachable until dblink is allow-listed**, since
`ensure_merge_infra` fails at `CREATE EXTENSION IF NOT EXISTS dblink` before either procedure can
even be created.

**Azure activation steps for `dblink` now live in
[pipeline/README.md](https://github.com/ModelEarth/pipeline/blob/main/README.md)**, not here —
that's an Azure infrastructure change (Portal/`az` CLI), not something this SQL-focused plan file
should own long-term.

## Schema changes (verified against the live `industrydb_2021` schema, not assumed)

Current constraints, queried directly:

| Table | Current PK | Columns |
|---|---|---|
| `trade` | `(region1, region2, industry1, industry2)` — `trade_id` is not part of it | `trade_id, region1, region2, industry1, industry2, amount, flow_type, country` |
| `trade_factor` | `(trade_id, country, flow_type, factor_id)` — **no FK to `trade` at all**, joins by value only | `trade_id, country, flow_type, factor_id, coefficient, level` |
| `interstate` | `(interstate_id)` alone | `interstate_id, trade_id, state1, state2, sector1, sector2, state_industry_code, amount, commodity_code, industry_code, economic_multiplier` |
| `interstate_factor` | `(interstate_id, factor_id)` | `interstate_id, factor_id, level, flow_type` |

**Superseded design.** An earlier pass at this plan added a `year` column to `trade`/`trade_factor`'s
composite key and prepended year into the `interstate_id` *string*. Both are replaced by the
two-stage integer-ID design below — plain integers throughout, no strings, no composite join keys.

### Two-stage ID design: per-year import, then merge (final — settled 2026-09-20)

**Why not the multiplicative offset (`year * 1_000_000 + id`) from the previous pass:** checked
real growth vectors rather than assuming today's row counts hold. Exiobase currently has exactly
**200 industries and 49 regions** (confirmed directly from `IOT_2021_pxp.zip`, not assumed), and
`main.py`'s own `get_default_countries()` already lists **14 countries** — only `US` has actually
been loaded into `industrydb_2019`/`industrydb_2021` so far. Rolling out to that default list alone
could push `domestic` (disjoint per country, no cross-country overlap) to roughly `14 ×
today's ~19,043` ≈ 266,000 on its own, before `imports`/`exports` (which grow faster, since more
countries means covering more of the 49×48 bilateral matrix) are even considered. Any fixed block
size is a real near-term risk — so `year` is a **real column**, not folded into the id via
arithmetic. This removes all block-size guessing for the merge step itself; Stage 1's block
choices below only ever need to be big enough for *one year*, not coordinated across years.

**Stage 1 — per-year import** (`industrydb_2019`, `industrydb_2021`, and every future
`industrydb_{year}`; no `year` column here — one database per year already makes it redundant):

- **`trade.trade_id`** gets an explicit value computed by the loader from `trade.csv`'s own
  (already 1-based, per-file) row index plus a fixed offset **by flow_type**: `domestic` +0 (stays
  1-based, unchanged), `imports` +999,999 (starts at 1,000,000), `exports` +1,999,999 (starts at
  2,000,000). This is deterministic arithmetic, not a database-assigned surrogate — no `RETURNING`,
  no natural-key lookup, no mapping table needed at all: `insert_trade_factor_rows` computes the
  identical `csv_trade_id + offset[flow_type]` independently, since it already knows which
  flow_type file it's processing. `trade`'s `PRIMARY KEY` is `trade_id` alone (genuinely unique
  within one annual database, given the three blocks don't overlap).
- **`interstate.trade_id`** needs no translation at all — it only ever references the *domestic*
  block, and domestic's offset is 0, so the value is unchanged from `trade.csv`'s original.
- **`interstate_id`** becomes a plain sequential integer **in both the `.csv` file and the
  database** — fixed at the source. `exiobase/tradeflow/bea/main.py`'s
  `_aggregate_interstate_to_sector` (previously building the string
  `{trade_id}-US-{state1}-US-{state2}-{sector1}-{sector2}` at `main.py:702-705`) now assigns a plain
  1-based counter instead (done — see commit). No flow_type blocks needed here: `interstate.csv` is
  generated once, in a single pass, never split across restarting per-file counters the way
  `trade.py`'s domestic/imports/exports are.
- **`interstate` gains a `country VARCHAR(2)` column**, populated at this same initial-migration
  step (`insert_interstate_rows`) — `db_insert_trade_data` already knows the country (interstate
  loading is already gated on `country == "US"`). Matches `trade`/`trade_factor`, which already
  carry `country`.
- **32-bit `integer` throughout** — the 1,000,000-wide blocks mean a single year's combined
  `trade_id` values could in principle approach `integer`'s ~2.1 billion ceiling only if any one
  flow_type's own row count exceeded ~1,000,000 (today's real max is 175,726, 2019 exports) — a
  real but accepted risk given the block choice above, not a 32-bit-vs-64-bit concern.

**Stage 2 — merging a year into the shared multi-year `industrydb`**: `trade_id`/`interstate_id`
carry over **unchanged** (still 32-bit `integer`, same values as Stage 1) — no arithmetic at all.
All 4 tables (`trade`, `trade_factor`, `interstate`, `interstate_factor`) gain a real `year` column
in `industrydb` only (not in the per-year databases), and the join/primary keys become composite:
`trade` PK `(year, trade_id)`, `trade_factor` PK `(year, trade_id, factor_id)`, `interstate` PK
`(year, interstate_id)`, `interstate_factor` PK `(year, interstate_id, factor_id)`. The merge
procedure's `INSERT ... SELECT` just adds the literal year value being merged as a constant column
— `INSERT INTO trade (year, trade_id, region1, ...) SELECT 2021, trade_id, region1, ... FROM
dblink(...)` — no lookup table, no modular math, and no risk of one year's row-count growth ever
affecting another year's values.

This still avoids `country`/`flow_type` in `trade_factor`'s key (Stage 1's blocks already made
`trade_id` unique within one year), it just adds `year` back in as a second column rather than
folding it into the id's value — a deliberate trade of "one join column" for "no block-size risk
propagating across years."

### Known pre-existing wrinkle, not introduced by this merge — root cause found

`trade_id` is **not unique even within a single year** — verified: `industrydb_2021.trade` has
309,885 rows but only 146,556 distinct `trade_id` values. Root cause, confirmed by grouping the
table by `(country, flow_type)`:

| country | flow_type | rows | `trade_id` range |
|---|---|---|---|
| US | domestic | 17,135 | 1–17,135 |
| US | exports | 146,194 | 1–146,194 |
| US | imports | 146,556 | 1–146,556 |

`trade.py:552` assigns `trade_id` as a plain 1-based row index per CSV
(`trade_data['trade_id'] = trade_data.index + 1`), restarting at 1 for every `(country,
flow_type)` file. `domestic`/`exports`/`imports` for the same country all load into one shared
`trade` table per year, so their ranges just overlap — 17,135 + 146,194 + 146,556 = 309,885 rows,
union of the overlapping ranges = 146,556 distinct values, both matching exactly.

**Not a bug.** `trade_id` was never meant to be globally unique — only unique within one
`(country, flow_type)` file. That's exactly why `trade_factor`'s existing PK is `(trade_id,
country, flow_type, factor_id)` rather than `(trade_id, factor_id)` — it already scopes by all
three. `trade` itself doesn't even put `trade_id` in its own PK (it dedupes on the physical-flow
tuple `(region1, region2, industry1, industry2)` instead); `trade_id` there is only a leftover
per-file row number whose real job is letting `trade_factor` point back to a specific source row.
**This is now actually fixed, not just documented-and-tolerated**, by the Stage 1 redesign above:
once each flow_type's block is offset (domestic +0, imports +999,999, exports +1,999,999),
`trade_id` is unique within one year permanently (given the block-width caveat noted in the
signed/unsigned section), and `trade_factor` no longer needs `country`/`flow_type` in its key to
disambiguate it — only `year` (added back as Stage 2's own column, not encoded in the value).

## Fixing historical `trade_id` / `interstate_id` (2019, 2021) — cleanup script, not full regeneration

Since `trade_id`'s new value is pure, deterministic arithmetic on the CSV's own existing value
(`new = old + offset[flow_type]`, offset 0/999,999/1,999,999) — not a database-assigned surrogate —
there's no need to re-run `trade.py` (hours, needs re-downloading/re-processing Exiobase) just to
fix this. A small Python script can transform the existing files in place, much faster:

- **`trade.csv`** (each flow) — add the flow_type's offset to every `trade_id` value.
- **`trade_factor.csv`** (each flow) — same offset, applied to its own `trade_id` column (no
  cross-file lookup needed — it's the same deterministic formula, and both files are for the same
  flow_type).
- **`interstate.csv`** — replace `interstate_id` with a fresh 1-based sequence in existing row
  order; `trade_id` needs no change (only ever references `domestic`, whose offset is 0).
- **`interstate_factor.csv`** — remap `interstate_id` through the same map built while rewriting
  `interstate.csv` (must match exactly — factor rows join on it).
- **Azure**: re-run the loader (`db_insert_trade_data`) against `industrydb_2019`/`industrydb_2021`
  with the cleaned-up CSVs — same-database, per-year re-load, no `dblink`.

This also means `bea/main.py`'s interstate_id fix (already done) and the `team/src/main.rs` loader's
offset logic don't need to touch the *historical* files at all by themselves — only future runs
benefit from the source fix automatically; 2019/2021 get fixed once, directly, by the cleanup
script.

## Signed vs. unsigned 32-bit integer — stick with plain signed

Asked whether making `trade_id`/`interstate_id` *unsigned* would help, since none of this needs
negative values. Checked rather than assumed: **Postgres has no native unsigned integer type at
all** — only signed `smallint`/`integer`/`bigint` (2/4/8 bytes). The only way to approximate
"unsigned" is a `CHECK (id >= 0)` constraint on an ordinary signed `integer` column, and that
constraint **doesn't grant any extra range** — the column is still a real signed 4-byte
two's-complement integer under the hood, so a `CHECK` can only ever restrict you to the *positive
half* of that same signed range (0 to 2,147,483,647), never up to a true unsigned 32-bit's
4,294,967,295. Storage size is identical either way (4 bytes, `CHECK` or not) — no efficiency or
range advantage available here, in either direction.

**Recommendation: plain signed `integer`, no `CHECK`.** This also directly gives the fallback
mentioned earlier — the negative half of the range sits unused and available if a parallel ID space
is ever wanted later.

**Real headroom, computed precisely, against the settled design (fixed 1,000,000-wide blocks per
flow_type, `year` as its own column, no multiplication):** the risk isn't a *year* ceiling anymore
(a real column has no numeric limit) — it's whether any single year's `imports` or `exports` count
ever exceeds 999,999 rows within its own 1,000,000-wide block (`domestic` unaffected — it isn't
offset at all). Current real max is **175,726** (2019 exports) — comfortable today, but see the
growth analysis above (14-country default rollout, or a larger future Exiobase industry count):
this is a real, accepted risk of the chosen block width, not a 32-bit-vs-64-bit question. If a
year's `imports`/`exports` ever approaches 1,000,000 rows, the fix is widening the block (e.g. to
2,000,000 or 5,000,000) — signed `integer` still has room for that (up to ~2.1 billion total), it's
only the *block width choice* that would need revisiting, not the column type.

## `industry` / `sector` / `sector_industry` — insert-missing, no year column

These are Exiobase-classification / BEA-Sector reference tables, not per-flow data —
`industry_id`/`sector_id` are already their own natural keys. Merge logic:
`INSERT ... ON CONFLICT (industry_id) DO NOTHING` (or `DO UPDATE` if a later year's `name`/
`category` should win on drift). No year column needed.

## `factor` table — checked empirically, not assumed

Compared `factor` (`factor_id, extension, stressor, unit`) between `industrydb_2019` and
`industrydb_2021` directly:

- Both have exactly **728 rows**.
- Every `factor_id` present in both years maps to the identical `(extension, stressor, unit)` —
  **zero drift, in either direction**, for these two years.
- Matching by `(extension, stressor)` instead of raw `factor_id` also produces zero drift — the
  same natural-key pairs map to the same `factor_id` in both years.

So for 2019 vs. 2021 specifically, `factor_id` is already safe to merge as-is. But this shouldn't
be trusted to hold forever (Exiobase revises its satellite accounts periodically, per your
"typically every 5 years" note) — **don't hardcode an assumption that `factor_id` is always
stable; verify it every merge.**

On "does the Exiobase source data already have a unique string for this" — yes, effectively:
the `stressor` name (paired with `extension`) *is* that string. Our own `factor_id` integers
aren't an Exiobase concept at all — they're assigned by our own pipeline
(`exiobase_factors.py`) by row position across extensions (`air_emissions`, `employment`,
`energy`, `land`, `material`, `water`), which is exactly the kind of thing that could silently
shift if Exiobase adds or reorders stressors in a future release. `stressor`/`extension` are the
real, Exiobase-sourced identity of each row.

**Recommendation**: add `UNIQUE (extension, stressor)` to the shared `factor` table, and make the
merge match incoming factor rows by `(extension, stressor)`, not by raw `factor_id` equality:
- Match found → reuse `industrydb`'s existing `factor_id` for that stressor, remapping the
  incoming year's `trade_factor`/`interstate_factor` rows to it during the `INSERT` (a no-op
  remap today, since IDs already agree, but this is what makes the merge safe if a future year's
  numbering drifts).
- No match → it's a genuinely new stressor; insert it with the next available `factor_id`.
- The pre-merge inspection (below) surfaces both cases — and specifically calls out any case
  where the *same* `factor_id` maps to a *different* `(extension, stressor)` between the source
  year and `industrydb`, since that's the actual danger case a blind copy would miss.

## Pre-merge inspection (run before every merge, not optional)

A read-only `dblink`-based function/procedure, e.g. `merge_exiobase_year_inspect(year, source_dbname)`,
returning a structured report:

- Row counts per table (`trade`, `trade_factor`, `interstate`, `interstate_factor`) in the source
  year vs. what's already in `industrydb`.
- `factor` diff: rows matching by `(extension, stressor)` with an agreeing `factor_id`, rows
  matching by name with a *disagreeing* `factor_id` (the dangerous case — flagged, not silently
  remapped without surfacing it), and genuinely new stressors.
- `industry`/`sector` diff: which `industry_id`/`sector_id` rows are new vs. already present.
- Any PK-collision risk the query can detect ahead of time (e.g. duplicate `(year, region1,
  region2, industry1, industry2)` already present for that year, meaning a re-run/re-merge).

The actual merge procedure (`merge_exiobase_year(year, source_dbname)`) only runs the real
`INSERT`s — ideally gated on the inspection having been run and passed, or with an explicit
override flag if someone wants to proceed past warnings.

## Rust / panel structure

- New module, kept separate from the existing panel code per your ask:
  `team/src/merge_years.rs` — owns the `dblink`/procedure-calling logic and its own request/response
  types. `main.rs` only wires up the routes.
- Two endpoints: `POST /api/db/merge-years/inspect` and `POST /api/db/merge-years/run`, each just
  invoking the matching SQL procedure and returning its report/result as JSON.
- New frontend: a "Merge Years" panel section in `team/admin/sql/panel/index.html`, with its own
  JS file (e.g. `merge-years.js`), not folded into `db-admin.js`. Shows the inspection report
  first; the actual merge action is gated on inspection having run.

## Open questions / risks to keep visible, not resolve silently

- **The 1,000,000-wide per-flow_type block is an accepted risk, not a proven-safe ceiling** — the
  real 14-country 2023 load (see "Fix design" above) confirms today's actual max is still
  comfortable (`DE` exports, 182,075 rows, the largest single-country/flow_type count seen across
  all 14 countries), but a larger future Exiobase industry count could still push a single year's
  `imports`/`exports` past 999,999 rows for some country. If that happens, the fix is
  widening the block (e.g. to 2,000,000+), not switching column types — `integer` has room, it's
  the block-width choice that would need revisiting.
- 2019 and 2021 need their `trade.csv`/`trade_factor.csv`/`interstate.csv`/`interstate_factor.csv`
  fixed (offset arithmetic / fresh `interstate_id` sequence) and re-loaded before any Stage 2
  merge — a Python cleanup script, not a full `trade.py`/`bea/main.py` re-run (see above).
- Stage 2's `year` column removes the cross-year numeric-overflow risk the earlier
  multiplicative-offset design had — there's no year ceiling to track anymore, since `year` is a
  plain column value with no arithmetic relationship to `trade_id`/`interstate_id`.
- This plan only covers merging existing/future per-year databases into a shared `industrydb`. It
  does not change `tradeflow/main.py`'s own per-year-database pipeline — future years keep landing
  in their own `industrydb_{year}` first, then get merged in on the same terms.
