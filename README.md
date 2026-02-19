# GA4 Dataform Pipeline — Bounteous

A Dataform pipeline for processing GA4 event data in BigQuery. Designed as an agency framework: a single upstream repository that gets forked per client, with clear boundaries between framework code and client configuration.

## Architecture

### Data Flow
```
GA4 Export (events_*, events_fresh_*)
           ↓
    [base_events] ─── Event-level data with 3-day rolling refresh
           ↓
    ┌──────────┬──────────────────┬─────────────────────┐
    ↓          ↓                  ↓                     ↓
[sessions]  [dim_pages]     [transactions]      [user_identity_map]
            [fct_page_views] [ecommerce_items]   [users]
                              (if HAS_ECOMMERCE)
           ↓
    [model_execution_log] ─── Audit log (runs last)
```

### Design Principles

- **Consolidated over fragmented** — wide tables over many narrow joins
- **Config-driven** — parameter extraction, stream types, and traffic source logic all controlled through configuration files
- **Fork-friendly** — clear separation between framework code (upstream) and client customization (fork-owned)
- **3-day rolling refresh** — captures late-arriving GA4 events without complex MERGE reconciliation

### Processing Strategy

Daily runs delete and reload the last 3 days of `base_events`, then rebuild downstream tables. When `USE_FRESH_DAILY = true`, days 1–2 come from `events_fresh_*` and day 3 from finalized `events_*`.

## Quick Start

1. Update `workflow_settings.yaml` with your project, source dataset, and destination dataset
2. Update `definitions/declaration.js` with your source project/dataset
3. Configure `includes/client_config.js` — set `DATA_STREAM_TYPE`, add custom parameters, configure ecommerce events
4. If using custom attribution, set `USE_CUSTOM_TRAFFIC_SOURCE_LOGIC = true` and edit `includes/traffic_source.js`
5. Create a release pointing to `main`, run manually to verify
6. Schedule daily runs after GA4 data finalizes (~12pm+ PT)

## File Structure

```
├── includes/
│   ├── core_config.js          ← Framework flags (backfill, ecommerce, initial load)
│   ├── client_config.js         ← Client settings (streams, params, events)   [fork-owned]
│   ├── helper.js               ← Stream resolution, field refs, utilities
│   ├── sql_generators.js        ← Parameter extraction, key generation, items array
│   └── traffic_source.js        ← Attribution logic (default + custom)         [fork-owned]
├── definitions/
│   ├── outputs/
│   │   ├── base_events_preops.sqlx   ← Cleanup operation (deletes 3-day window)
│   │   ├── base_events.sqlx          ← Core event table (incremental)
│   │   ├── sessions.sqlx             ← Session aggregations
│   │   ├── dim_pages.sqlx            ← Page/screen dimension (Type 1 SCD)
│   │   ├── fct_page_views.sqlx       ← Page view facts (page-session grain)
│   │   ├── transactions.sqlx         ← Transaction events (ecommerce)
│   │   ├── ecommerce_items.sqlx      ← Item-level ecommerce (ecommerce)
│   │   ├── user_identity_map.sqlx    ← Pseudo-ID to user-ID resolution
│   │   ├── users.sqlx                ← User-level lifetime aggregations
│   │   └── model_execution_log.sqlx  ← Pipeline audit log
│   ├── custom/                       ← Client-specific models              [fork-owned]
│   └── declaration.js                ← Source table declarations            [fork-owned]
├── workflow_settings.yaml             ← Project settings & compilation vars [fork-owned]
├── .gitattributes                    ← Merge protection for fork-owned files
└── README.md
```

## Configuration

Configuration lives in the files themselves with inline documentation. Here's what to edit and why.

**`workflow_settings.yaml`** — Project, dataset, location. Feature flags as compilation variables (`HAS_ECOMMERCE`).

**`includes/client_config.js`** — The main customization file:
- `DATA_STREAM_TYPE` — `'web'`, `'app'`, or `'both'`
- `CONSOLIDATE_WEB_APP_PARAMS` — only applies when `'both'`; merges page_location/firebase_screen into unified fields
- `PROPERTIES_CONFIG` — leave `null` for single-property, or define multi-property/stream configuration (see examples in file)
- `CORE_PARAMS_ARRAY`, `WEB_PARAMS_ARRAY`, `APP_PARAMS_ARRAY`, `CUSTOM_PARAMS_ARRAY` — which GA4 event parameters to extract (supported types: `string`, `int`, `float`, `double`)
- `CUSTOM_ITEMS_PARAMS` — custom item-level parameters from the items array
- `TRANSACTION_EVENTS`, `ECOMMERCE_ITEM_EVENTS` — which events populate ecommerce tables

**`includes/traffic_source.js`** — Edit `getCustomTrafficSourceFields()` to remap sources, add fields, or define custom channel groupings. All returned fields flow automatically through sessions, users, and any model using the traffic source helpers.

## Operations

### Daily Runs

Create a release pointing to `main`. Set a daily schedule after GA4 data finalizes. No compilation variables needed unless overriding defaults. The pipeline handles the 3-day rolling refresh automatically.

### Backfill Operations

Backfills load historical data beyond the default 7-day initial load. The process uses temporary release configurations with compilation variable overrides — no code changes required.

**Always create a new release for each backfill. Do not edit an existing release's compilation variables and re-run it** — Dataform caches compilation results, and edited variables may not take effect without manually triggering a recompilation. Creating a fresh release avoids this entirely.

**Process:**

1. Create a new release named `backfill-YYYYMMDD-YYYYMMDD`
2. Point it at `main`
3. Set compilation variables (only what differs from defaults):
   ```
   FORCE_FULL_BACKFILL: true
   BACKFILL_START_DATE: 20240101
   BACKFILL_END_DATE: 20240131
   ```
   Add `DESTINATION_DATASET: ga4_reporting_dev` if testing in dev.
4. Execute manually (select `base_events` tag for backfill — downstream tables rebuild from it)
5. Verify data in BigQuery
6. Delete the release when done

For very large backfills, split into monthly chunks with separate releases.

**Safety notes:**
- Never add `FORCE_FULL_BACKFILL: 'true'` to `workflow_settings.yaml` — this would make every scheduled run attempt a full historical reload
- Backfill releases should never have a schedule
- Delete completed backfill releases to prevent accidental re-runs

## Fork Strategy

This repository serves as the upstream framework. Each client gets a fork with its own customizations.

### Ownership Boundaries

| File | Owner | Description |
|------|-------|-------------|
| `client_config.js` | Client fork | Parameters, stream config, events |
| `traffic_source.js` | Client fork | Attribution logic |
| `declaration.js` | Client fork | Source table declarations |
| `workflow_settings.yaml` | Client fork | Project/dataset settings |
| `definitions/custom/*` | Client fork | Client-specific models |
| Everything else | Upstream | Framework code |

### Pulling Upstream Updates

Each client fork protects its owned files using `.gitattributes`:

```
includes/client_config.js merge=ours
includes/traffic_source.js merge=ours
definitions/declaration.js merge=ours
definitions/custom/** merge=ours
workflow_settings.yaml merge=ours
```

Configure the merge driver once per clone:
```bash
git config merge.ours.driver true
```

Then pull upstream updates:
```bash
git remote add upstream <upstream-repo-url>
git fetch upstream
git merge upstream/main --no-commit  # Review before finalizing
git commit -m "Pull upstream framework updates"
```

Client-owned files are automatically preserved. Framework files update cleanly. If a client needs to modify a framework file, that's a signal to extract the customization point into configuration.