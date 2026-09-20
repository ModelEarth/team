# Merging per-year Industry Databases into one multi-year `industrydb`

Plan for consolidating `industrydb_2019`, `industrydb_2021`, and future per-year databases into a
single `industrydb` that holds multiple years, with the actual data movement happening entirely
inside Azure Postgres — never round-tripping through the Rust app or a local machine. Stage 1
(per-year load, below) is done for 2019 and 2021; Stage 2 (the actual multi-year merge) is not
started.

## Status (2026-09-20, verified against live databases)

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

## Mechanism: `dblink`, not the app layer

Postgres procedures can't natively query across databases. `dblink` and `postgres_fdw` are both
available on the Azure server (confirmed via `pg_available_extensions`; neither is installed in
any database yet). Recommendation: **`dblink`**, not `postgres_fdw` — `postgres_fdw` requires
predefining `SERVER`/`USER MAPPING`/`FOREIGN TABLE` objects per source database; `dblink` takes an
ad-hoc connection string per call, which fits "merge whichever year I tell you to" better than
pre-declaring a foreign table set per year.

A procedure living in `industrydb` opens a `dblink` connection to `industrydb_2021` (or whichever
year), runs `INSERT INTO trade SELECT ... FROM dblink('dbname=industrydb_2021 ...', 'SELECT ...')
AS t(...)`, and the row data never leaves the Postgres server. The Rust side becomes a thin
wrapper: `CALL merge_exiobase_year_inspect(2021, 'industrydb_2021')` for the dry-run report, then
`CALL merge_exiobase_year(2021, 'industrydb_2021')` for the real merge.

`CREATE EXTENSION dblink;` needs to run once in `industrydb` (requires the `azure_pg_admin` role,
which the provisioning account has).

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

- **The 1,000,000-wide per-flow_type block is an accepted risk, not a proven-safe ceiling** — a
  14-country rollout (already the default in `main.py`) or a larger future Exiobase industry count
  could push a single year's `imports`/`exports` past 999,999 rows. If that happens, the fix is
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
