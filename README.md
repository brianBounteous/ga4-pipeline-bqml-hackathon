# GA4 Dataform Pipeline - Bounteous

A production-ready Dataform data pipeline for processing Google Analytics 4 (GA4) event data in BigQuery. This repository provides configurable data processing, automatic handling of late-arriving events, and analytics-ready dimensional models.

## Table of Contents
- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Configuration](#configuration)
- [Data Models](#data-models)
- [Running the Pipeline](#running-the-pipeline)
- [Backfill Operations](#backfill-operations)
- [Monitoring](#monitoring)
- [File Structure](#file-structure)
- [Troubleshooting](#troubleshooting)

---

## Overview

This pipeline transforms raw GA4 event data from BigQuery export tables into clean, analytics-ready tables optimized for reporting and analysis.

### Key Features

- ✅ **3-Day Rolling Refresh** - Automatically captures late-arriving events
- ✅ **Flexible Data Stream Support** - Web, app, or combined data sources
- ✅ **Configurable Parameter Extraction** - Easily customize which GA4 parameters to extract
- ✅ **Custom Traffic Source Logic** - Define custom attribution rules per client
- ✅ **Dimensional Modeling** - Star schema with fact and dimension tables
- ✅ **Page/Screen Tracking** - Unified handling of web pages and app screens
- ✅ **Session Analytics** - Pre-aggregated session metrics with landing/exit tracking
- ✅ **Audit Logging** - Track which dates have been processed
- ✅ **Smart Table Selection** - Uses `events_fresh_daily_*` for faster processing when available

### Data Flow
```
GA4 Export (events_*, events_fresh_daily_*)
           ↓
    [base_events] - Event-level data with 3-day refresh
           ↓
    [base_events_log] - Audit log of processed dates
           ↓
    ┌──────────────────────────────────┐
    ↓                                  ↓
[ga4_sessions]                   [dim_pages + fct_page_views]
Session aggregations             Page-level analytics
```

---

## Architecture

### Design Principles

1. **Consolidated Over Fragmented** - Single wide tables preferred over many narrow tables
2. **Practical Over Theoretical** - Optimized for real-world analytics needs
3. **Type 1 SCD for Dimensions** - Current snapshot approach for maintainability
4. **Pre-calculated Keys** - Compound keys for efficient BI tool consumption
5. **Config-Driven** - Flexible parameter extraction via configuration files
6. **Client Customization Ready** - Easy to extend for client-specific requirements

### Processing Strategy

**Daily Incremental Loads:**
- Deletes last 3 days from `base_events`
- Loads last 3 days fresh:
  - Days 1-2: From `events_fresh_daily_*` (if enabled)
  - Day 3: From `events_*` (finalized)
- Naturally captures late-arriving events without complex reconciliation

**Initial Load:**
- Loads last 7 days by default
- Uses mixed source strategy (fresh_daily for recent, events_* for older)

**Manual Backfill:**
- Can load full historical data via compilation variable override
- Date range configurable
- **Important:** Never commit `FORCE_FULL_BACKFILL = true` to main branch

---

## Prerequisites

- **BigQuery Project** with GA4 export data
- **Dataform Workspace** connected to this Git repository
- **Service Account** with BigQuery permissions:
  - `bigquery.datasets.create`
  - `bigquery.tables.create`
  - `bigquery.tables.updateData`
  - `bigquery.jobs.create`

### BigQuery Resources

**Source Dataset:**
- Project: Your GA4 export project
- Dataset: `analytics_XXXXXXXXX` (your GA4 property ID)
- Tables: `events_*`, optionally `events_fresh_daily_*`

**Destination Dataset:**
- Project: Same or different project
- Dataset: `ga4_reporting` (configurable via compilation variables)

---

## Setup

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/bnts_ga4_staging.git
cd bnts_ga4_staging
```

### 2. Connect to Dataform

1. In Dataform UI, create new workspace or use existing
2. Go to **Workspace Settings** → **Repository**
3. Connect to this GitHub repository
4. Select `main` branch

### 3. Configure Workflow Settings

Update `workflow_settings.yaml`:
```yaml
defaultProject: your-project-id
defaultDataset: ga4_reporting
defaultLocation: US

vars:
  SOURCE_PROJECT: your-ga4-export-project
  SOURCE_DATASET: analytics_XXXXXXXXX
  DESTINATION_DATASET: ga4_reporting
  ENVIRONMENT: prod
```

### 4. Configure Data Processing

Update `includes/core_config.js`:
```javascript
// Set your data stream type
const DATA_STREAM_TYPE = 'web'; // Options: 'web', 'app', 'both'

// Parameter consolidation (only applies when DATA_STREAM_TYPE = 'both')
// IMPORTANT: This flag is ignored when DATA_STREAM_TYPE is 'web' or 'app'
const CONSOLIDATE_WEB_APP_PARAMS = false;

// Enable fresh_daily if available
const USE_FRESH_DAILY = false; // Set true if you have events_fresh_daily_*

// Custom traffic source logic
const USE_CUSTOM_TRAFFIC_SOURCE_LOGIC = false; // Set true to use custom attribution
```

**Important Configuration Notes:**
- `CONSOLIDATE_WEB_APP_PARAMS` only matters when `DATA_STREAM_TYPE = 'both'`
- If using `'web'` or `'app'`, consolidation flag is automatically ignored
- Custom traffic source logic is defined in `helper.js` `getCustomTrafficSourceFields()` function

### 5. Add Custom Parameters (Optional)

In `core_config.js`, add your implementation-specific parameters:
```javascript
const CUSTOM_PARAMS_ARRAY = [
  { name: "your_custom_param", type: "string" },
  { name: "custom_user_type", type: "string" },
  { name: "custom_value", type: "int" }
];
```

### 6. Customize Traffic Source Logic (Optional)

For clients requiring custom attribution:

1. Set `USE_CUSTOM_TRAFFIC_SOURCE_LOGIC = true` in `core_config.js`
2. Edit `getCustomTrafficSourceFields()` function in `includes/helper.js`
3. Define custom source/medium/campaign logic and add new fields as needed

**Example:**
```javascript
function getCustomTrafficSourceFields() {
  return {
    session_source: `CASE 
      WHEN session_traffic_source_last_click.cross_channel_campaign.source = 'google' 
        THEN 'google_search'
      ELSE session_traffic_source_last_click.cross_channel_campaign.source
    END`,
    // Add custom fields
    session_partner_category: `CASE 
      WHEN session_traffic_source_last_click.cross_channel_campaign.source IN ('partner1', 'partner2')
        THEN 'tier_1_partner'
      ELSE 'other'
    END`
  };
}
```

### 7. Update Source Declarations

Update `definitions/declaration.js` with your source project/dataset:
```javascript
declare({
    database: dataform.projectConfig.vars.SOURCE_PROJECT,
    schema: dataform.projectConfig.vars.SOURCE_DATASET,
    name: 'events_*',
});

declare({
    database: dataform.projectConfig.vars.SOURCE_PROJECT,
    schema: dataform.projectConfig.vars.SOURCE_DATASET,
    name: 'events_fresh_daily_*',
});
```

### 8. Initial Deployment

**Test in Dev First:**
1. Create dev release with compilation variables:
```
   DESTINATION_DATASET: ga4_reporting_dev
   ENVIRONMENT: dev
```
2. Run manually to test
3. Verify data in `ga4_reporting_dev` dataset

**Deploy to Production:**
1. Create prod release with compilation variables:
```
   DESTINATION_DATASET: ga4_reporting
   ENVIRONMENT: prod
```
2. Run manually for initial 7-day load
3. Set up schedule (daily at appropriate time after GA4 data finalizes)

---

## Configuration

### Core Settings (`includes/core_config.js`)

#### Data Stream Configuration
```javascript
// What type of data streams do you have?
const DATA_STREAM_TYPE = 'web'; // Options: 'web', 'app', 'both'

// For 'both': should parameters be consolidated?
// This setting is IGNORED when DATA_STREAM_TYPE is 'web' or 'app'
const CONSOLIDATE_WEB_APP_PARAMS = false;
// true:  page_location + firebase_screen → screen_location
// false: Keeps page_location and firebase_screen separate
```

**Important:** The consolidation logic only applies when `DATA_STREAM_TYPE = 'both'`. If you set `DATA_STREAM_TYPE` to `'web'` or `'app'`, the consolidation flag is automatically ignored, preventing configuration errors.

#### Traffic Source Configuration
```javascript
// Use custom traffic source attribution logic?
const USE_CUSTOM_TRAFFIC_SOURCE_LOGIC = false;
```

When `true`, the pipeline uses custom logic defined in `helper.js` `getCustomTrafficSourceFields()` instead of default GA4 traffic source fields. This allows per-client customization of:
- Source/medium/campaign remapping
- Custom channel groupings
- Additional attribution fields
- Partner-specific categorization

#### Load Strategy
```javascript
// Use faster fresh_daily tables for recent data?
const USE_FRESH_DAILY = false;

// Days to load on first run (when table doesn't exist)
const INITIAL_LOAD_DAYS = 7;
```

#### Backfill Configuration

**⚠️ CRITICAL: Never commit these as `true` in main branch!**
```javascript
// Backfill mode (use compilation variable override, NOT code changes)
const FORCE_FULL_BACKFILL = false;

// Date range for backfills (leave null for defaults)
const BACKFILL_START_DATE = null;  // Defaults to 13 months ago
const BACKFILL_END_DATE = null;     // Defaults to yesterday
```

**Always use compilation variable overrides for backfills:**
```
FORCE_FULL_BACKFILL: true
BACKFILL_START_DATE: 20240101
BACKFILL_END_DATE: 20241231
```

#### Parameter Extraction

Define which GA4 parameters to extract:
```javascript
// Core parameters (always extracted)
const CORE_PARAMS_ARRAY = [
  { name: "ga_session_id", type: "int" },
  { name: "engagement_time_msec", type: "int" },
  { name: "session_engaged", type: "string" },
  { name: "percent_scrolled", type: "int" }
];

// Web-specific parameters (only when DATA_STREAM_TYPE includes 'web')
const WEB_PARAMS_ARRAY = [
  { name: "page_location", type: "string", consolidated_name: "screen_location" },
  { name: "page_title", type: "string", consolidated_name: "screen_title" },
  { name: "page_referrer", type: "string", consolidated_name: "screen_referrer" }
];

// App-specific parameters (only when DATA_STREAM_TYPE includes 'app')
const APP_PARAMS_ARRAY = [
  { name: "firebase_screen", type: "string", consolidated_name: "screen_location" },
  { name: "firebase_screen_class", type: "string", consolidated_name: "screen_title" },
  { name: "firebase_previous_screen", type: "string", consolidated_name: "screen_referrer" }
];

// Custom parameters (client-specific, always extracted)
const CUSTOM_PARAMS_ARRAY = [
  // Add client-specific parameters here
  // { name: "user_role", type: "string" },
  // { name: "content_category", type: "string" },
];
```

**Supported Types:** `string`, `int`, `float`, `double`

**Consolidated Names:** Used when `CONSOLIDATE_WEB_APP_PARAMS = true` to merge web/app parameters

---

## Data Models

### Core Tables

#### `base_events`
**Type:** Incremental table  
**Partition:** `event_date`  
**Cluster:** `event_name`, `session_key`  
**Location:** `definitions/outputs/base_events.sqlx`

Event-level data with extracted parameters, deduplication, and nested page/app structs.

**Key Fields:**
- `event_key` - Unique event identifier (MD5 hash)
- `session_key` - Session identifier
- `page_session_key` / `screen_session_key` - Compound keys for unique page views
- `page` struct (web) - Page location, title, referrer, path, key
- `app` struct (app) - Firebase screen, class, ID, key
- All extracted event parameters, user properties, traffic source

**Refresh Strategy:** 3-day rolling refresh (deletes and reloads last 3 days)

**Dependencies:**
- `base_events_preops` (cleanup operation)
- Source: `events_*` and optionally `events_fresh_daily_*`

#### `base_events_log`
**Type:** Incremental table (assertion)  
**Partition:** `load_date`  
**Cluster:** `event_date`  
**Location:** `definitions/assertions/base_events_log.sqlx`

Audit log tracking which event dates have been processed.

**Schema:**
- `load_timestamp` - When data was loaded
- `load_date` - Date of the load operation
- `event_date` - The date of events processed
- `row_count` - Number of events for that date
- `min_event_timestamp` / `max_event_timestamp` - Time bounds

**Use Cases:**
- Monitoring data freshness
- Detecting gaps in processing
- Audit trail for data loads

#### `base_events_preops`
**Type:** Operations (runs before base_events)  
**Location:** `definitions/outputs/base_events_preops.sqlx`

Cleanup operation that deletes the last 3 days from `base_events` before reloading.

**Purpose:** Ensures clean slate for rolling refresh without duplicates

### Session Tables

#### `ga4_sessions`
**Type:** Table (full rebuild from base_events)  
**Partition:** `session_date`  
**Cluster:** `user_id`, `session_key`  
**Location:** `definitions/outputs/ga4_sessions.sqlx`

Session-level aggregations with landing/exit screens and engagement metrics.

**Key Metrics:**
- `event_count` - Total events in session
- `total_engagement_time_msec` - Sum of engagement time
- `unique_screens_viewed` - Distinct screens/pages
- `page_view_count` - Page/screen view events
- `session_duration_seconds` - Time from first to last event
- `is_engaged_session` - Boolean engagement flag

**Key Dimensions:**
- Landing/exit screens (location, path, title, key)
- Device (category, OS, browser)
- Geography (metro, region, country)
- **Traffic source (dynamic fields based on configuration)**
  - Default: session_source, session_medium, session_campaign, session_channel_group
  - Custom: Configured in `helper.js` `getCustomTrafficSourceFields()`

**Traffic Source Customization:**
The traffic source fields in this table are dynamically generated based on the `USE_CUSTOM_TRAFFIC_SOURCE_LOGIC` flag. When enabled, you can define custom attribution logic and add additional fields without modifying the main query.

### Page Tables

#### `dim_pages`
**Type:** Table (Type 1 SCD - current snapshot)  
**Cluster:** `page_key`  
**Location:** `definitions/outputs/dim_pages.sqlx`

Page/screen dimension with current attributes.

**Schema:**
- `page_key` (PK) - Unique page identifier (MD5 hash)
- `page_location` - Full URL or screen name
- `page_path` - Path component
- `page_title` - Page or screen title
- `page_hostname` - Hostname (web only, NULL for app)
- `first_seen_date` / `last_seen_date` - Date range tracking

**Type 1 SCD:** Overwrites existing values, keeps most recent snapshot only

#### `fct_page_views`
**Type:** Table (full rebuild from base_events)  
**Partition:** `session_date`  
**Cluster:** `page_key`, `session_key`  
**Grain:** Page-session (one row per unique page per session)  
**Location:** `definitions/outputs/fct_page_views.sqlx`

Page view facts with engagement metrics at page-session granularity.

**Key Metrics:**
- `page_view_number` - Sequence within session (1, 2, 3...)
- `time_on_page_seconds` - Calculated from next event timestamp
- `total_engagement_time_msec` - Sum of engagement for this page in session
- `total_engagement_time_seconds` - Converted to seconds for convenience
- `max_scroll_depth` - Deepest scroll percentage reached
- `page_view_event_count` - Number of page_view events (typically 1)

**Flags:**
- `is_entry_page` - TRUE if landing page for session
- `is_exit_page` - TRUE if exit page for session

**Grain Rationale:** Page-session grain (vs. event grain) provides clean analytics:
- One row per page per session
- Aggregates multiple views of same page in session
- Balances detail with performance
- Ideal for BI tool consumption

---

## Running the Pipeline

### Daily Scheduled Run (Recommended)

Set up a daily schedule to run after GA4 data is finalized (typically after 12pm PT):

1. **Create a Release:**
   - Name: `prod-daily` or similar
   - Git reference: `main` (or specific tag)
   - Compilation variables:
```
     DESTINATION_DATASET: ga4_reporting
     ENVIRONMENT: prod
```
   - Tags: `["daily", "ga4"]` or select all actions
   - Schedule: Daily at 1:00 PM PT (or later)

2. **What Runs (in order):**
   - `base_events_preops` - Deletes last 3 days
   - `base_events` - Loads fresh 3 days
   - `base_events_log` - Logs processed dates
   - `ga4_sessions` - Rebuilds session aggregations
   - `dim_pages` - Updates page dimension
   - `fct_page_views` - Rebuilds page view facts

### Manual Runs

**From Workspace (Development):**
1. Open your Dataform workspace
2. Click "Start execution" button
3. Select:
   - **All actions** (for full pipeline), OR
   - **Specific actions** (for testing single tables), OR
   - **Tags** (e.g., "daily", "ga4")
4. Monitor execution in logs

**From Release (Production):**
1. Go to Releases tab
2. Select your release (e.g., `prod-daily`)
3. Click "Start execution"
4. Monitor in execution history

### Testing New Changes

1. **Work in dev dataset:**
   - Use dev release: `DESTINATION_DATASET: ga4_reporting_dev`
   - Test changes with small date ranges
   - Verify output tables and data quality

2. **Promote to prod:**
   - Commit changes to main branch
   - Create or update prod release
   - Run prod release manually first
   - Monitor for issues before enabling schedule

---

## Backfill Operations

Backfills are one-time operations to load historical data beyond the default 7-day initial load.

### ⚠️ Critical Safety Rules

1. **NEVER commit code with `FORCE_FULL_BACKFILL = true`** to main branch
2. **ALWAYS use compilation variable override** in releases
3. **Test in dev dataset first** with small date range
4. **Run during off-hours** to minimize impact on query slots
5. **Delete backfill release after completion** to prevent accidental re-runs

### Backfill Method: Temporary Release

This is the recommended and safest approach.

**Step 1: Create Temporary Backfill Release**

1. In Dataform UI, go to **Releases**
2. Click **Create Release**
3. Configure:
   - **Name:** `backfill-YYYYMMDD-YYYYMMDD` (e.g., `backfill-20240101-20241231`)
   - **Git reference:** `main` (current production code)
   - **Compilation variables:**
```
     FORCE_FULL_BACKFILL: true
     BACKFILL_START_DATE: "20240101"
     BACKFILL_END_DATE: "20241231"
     DESTINATION_DATASET: ga4_reporting
     ENVIRONMENT: prod
```
   - **Tags:** `["core", "ga4"]`
   - **Schedule:** None (manual execution only)
   - **Description:** "Backfill 2024 data - DELETE AFTER COMPLETION"

**Step 2: Test in Dev (Highly Recommended)**

Before running full production backfill:
```
FORCE_FULL_BACKFILL: true
BACKFILL_START_DATE: "20240101"
BACKFILL_END_DATE: "20240107"  # Just 1 week
DESTINATION_DATASET: ga4_reporting_dev
ENVIRONMENT: dev
```

Verify:
- Data loads correctly
- No errors in execution logs
- Row counts match expectations

**Step 3: Execute Production Backfill**

1. Click **Start execution** on backfill release
2. Monitor progress:
   - Watch execution logs in real-time
   - Check for errors or warnings
   - Monitor BigQuery job history for slot usage

**Step 4: Verify Data Quality**
```sql
-- Check date range
SELECT 
  MIN(event_date) as first_date,
  MAX(event_date) as last_date,
  COUNT(DISTINCT event_date) as distinct_dates,
  COUNT(*) as total_events
FROM `project.ga4_reporting.base_events`;

-- Check daily row counts
SELECT 
  event_date,
  COUNT(*) as row_count
FROM `project.ga4_reporting.base_events`
WHERE event_date BETWEEN '2024-01-01' AND '2024-12-31'
GROUP BY event_date
ORDER BY event_date;

-- Compare to source
WITH source_counts AS (
  SELECT 
    PARSE_DATE('%Y%m%d', event_date) as event_date,
    COUNT(*) as source_count
  FROM `project.source_dataset.events_*`
  WHERE _TABLE_SUFFIX BETWEEN '20240101' AND '20241231'
    AND _TABLE_SUFFIX NOT LIKE 'intraday%'
  GROUP BY event_date
),
dest_counts AS (
  SELECT 
    event_date,
    COUNT(*) as dest_count
  FROM `project.ga4_reporting.base_events`
  WHERE event_date BETWEEN '2024-01-01' AND '2024-12-31'
  GROUP BY event_date
)
SELECT 
  s.event_date,
  s.source_count,
  d.dest_count,
  s.source_count - d.dest_count as difference
FROM source_counts s
LEFT JOIN dest_counts d ON s.event_date = d.event_date
ORDER BY s.event_date;
```

**Step 5: Clean Up**

1. Go to **Releases** tab
2. Find the backfill release
3. Click **Delete** or **Archive**
4. **Important:** This prevents accidental re-runs that could waste resources

### Backfill Strategies

**Full Historical (from GA4 start):**
```
BACKFILL_START_DATE: "20230101"  # Your GA4 start date
BACKFILL_END_DATE: null  # Defaults to yesterday
```

**Specific Date Range:**
```
BACKFILL_START_DATE: "20240601"
BACKFILL_END_DATE: "20240630"
```

**Recent Months:**
```
BACKFILL_START_DATE: null  # Defaults to 13 months ago
BACKFILL_END_DATE: null  # Defaults to yesterday
```

**Monthly Chunks (for very large backfills):**
Create multiple releases, one per month:
```
# Release 1: backfill-202401
BACKFILL_START_DATE: "20240101"
BACKFILL_END_DATE: "20240131"

# Release 2: backfill-202402
BACKFILL_START_DATE: "20240201"
BACKFILL_END_DATE: "20240229"
```

### Troubleshooting Backfills

**Issue: Backfill Running Slowly**

Causes:
- BigQuery slot contention
- Large date range
- Complex transformations

Solutions:
- Run during off-hours (nights/weekends)
- Split into smaller date ranges (monthly chunks)
- Check BigQuery job history for slot usage
- Consider upgrading BigQuery edition temporarily

**Issue: Out of Memory Errors**

Solutions:
- Reduce date range significantly
- Split into weekly or monthly chunks
- Check for Cartesian joins in queries
- Increase BigQuery query timeout

**Issue: Duplicate Data After Backfill**

Causes:
- Backfill release ran multiple times
- `base_events_preops` didn't run correctly

Solutions:
```sql
-- Check for duplicates
SELECT 
  event_key, 
  COUNT(*) as cnt
FROM `project.ga4_reporting.base_events`
GROUP BY event_key
HAVING cnt > 1
LIMIT 100;

-- Delete affected date range and rerun
DELETE FROM `project.ga4_reporting.base_events`
WHERE event_date BETWEEN '2024-01-01' AND '2024-12-31';

-- Then rerun backfill release
```

---

## Monitoring

### Daily Health Checks

**Check Processing Status:**
```sql
-- See what dates have been processed recently
SELECT 
  event_date,
  load_date,
  load_timestamp,
  row_count,
  min_event_timestamp,
  max_event_timestamp
FROM `project.ga4_reporting.base_events_log`
ORDER BY event_date DESC
LIMIT 30;
```

**Detect Gaps:**
```sql
-- Find missing dates in last 30 days
WITH expected_dates AS (
  SELECT date_value
  FROM UNNEST(GENERATE_DATE_ARRAY(
    DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY),
    DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
  )) AS date_value
),
loaded_dates AS (
  SELECT DISTINCT event_date
  FROM `project.ga4_reporting.base_events_log`
  WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
)
SELECT 
  ed.date_value AS missing_date,
  'Missing from base_events_log' as issue
FROM expected_dates ed
LEFT JOIN loaded_dates ld ON ed.date_value = ld.event_date
WHERE ld.event_date IS NULL
ORDER BY ed.date_value;
```

### Data Quality Checks

**Check for Nulls in Key Fields:**
```sql
SELECT
  event_date,
  COUNT(*) as total_events,
  COUNTIF(session_key IS NULL) as null_session_keys,
  COUNTIF(user_id IS NULL) as null_user_ids,
  COUNTIF(event_name IS NULL) as null_event_names,
  ROUND(100.0 * COUNTIF(session_key IS NULL) / COUNT(*), 2) as pct_null_sessions
FROM `project.ga4_reporting.base_events`
WHERE event_date = CURRENT_DATE() - 1
GROUP BY event_date;
```

**Session Metrics Trending:**
```sql
SELECT
  session_date,
  COUNT(*) as session_count,
  ROUND(AVG(event_count), 2) as avg_events_per_session,
  ROUND(AVG(total_engagement_time_seconds), 2) as avg_engagement_seconds,
  ROUND(AVG(unique_screens_viewed), 2) as avg_screens_per_session,
  ROUND(100.0 * COUNTIF(is_engaged_session) / COUNT(*), 2) as pct_engaged_sessions
FROM `project.ga4_reporting.ga4_sessions`
WHERE session_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY session_date
ORDER BY session_date DESC;
```

**Page View Metrics:**
```sql
SELECT
  session_date,
  COUNT(*) as unique_page_sessions,
  SUM(page_view_event_count) as total_page_views,
  ROUND(AVG(time_on_page_seconds), 2) as avg_time_on_page,
  ROUND(AVG(max_scroll_depth), 2) as avg_scroll_depth,
  COUNTIF(is_entry_page) as entry_pages,
  COUNTIF(is_exit_page) as exit_pages
FROM `project.ga4_reporting.fct_page_views`
WHERE session_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY session_date
ORDER BY session_date DESC;
```

### Performance Monitoring

**In BigQuery UI:**
1. Go to **Job History**
2. Filter by your project
3. Look for:
   - Long-running queries (> 5 minutes for daily runs)
   - Failed queries (red status)
   - High slot usage (indicates resource contention)

**In Dataform:**
1. Go to **Workflow Runs** or **Execution History**
2. Click on recent run
3. Review:
   - Total execution time
   - Time per action/table
   - Identify bottlenecks
   - Check for errors or warnings

**Create Monitoring Dashboard:**

Consider setting up a dashboard in your BI tool with:
- Daily row counts by table
- Processing lag (time between event_date and load_date)
- Data quality metrics (null rates, outliers)
- Execution duration trends

---

## File Structure
```
bnts_ga4_staging/
├── definitions/
│   ├── assertions/
│   │   └── base_events_log.sqlx         # Audit log table
│   ├── outputs/
│   │   ├── base_events_preops.sqlx      # Cleanup operation
│   │   ├── base_events.sqlx             # Core event table
│   │   ├── ga4_sessions.sqlx            # Session aggregations
│   │   ├── dim_pages.sqlx               # Page dimension
│   │   └── fct_page_views.sqlx          # Page view facts
│   └── declaration.js                   # Source table declarations
├── includes/
│   ├── core_config.js                   # Configuration settings
│   └── helper.js                        # SQL generation helpers
├── .gitignore                           # Git ignore rules
├── workflow_settings.yaml               # Dataform project settings
├── package.json                         # Node dependencies
├── package-lock.json                    # Locked dependency versions
└── README.md                            # This file
```

### Key Files

**`includes/core_config.js`** - Central configuration
- Data stream settings (web/app/both)
- Consolidation flags
- Traffic source configuration
- Parameter definitions (core, web, app, custom)
- Backfill configuration (controlled via compilation variables)
- Load strategy settings
- **Modify this file for client-specific configuration**

**`includes/helper.js`** - Helper functions
- Parameter extraction logic (`EXTRACT_EVENT_PARAMS`, etc.)
- Dynamic field references (`getScreenFieldRefs`)
- Traffic source field generation (`getTrafficSourceFields`)
- Config-driven SQL generation
- Consolidation logic
- **Modify `getCustomTrafficSourceFields()` for custom attribution**
- **Don't modify other functions unless extending core functionality**

**`definitions/outputs/base_events.sqlx`** - Event processing
- Main event-level table
- Incremental with 3-day refresh
- Calls helper functions for parameter extraction
- Creates page/app structs based on config
- **Don't modify unless changing core event structure**

**`definitions/outputs/ga4_sessions.sqlx`** - Session aggregations
- Session-level metrics and dimensions
- Uses dynamic traffic source fields
- Landing/exit page tracking
- **Extend by modifying helper functions, not this file**

**`definitions/outputs/dim_pages.sqlx`** - Page dimension
- Type 1 SCD approach
- Current snapshot of page attributes
- Works with both web and app data

**`definitions/outputs/fct_page_views.sqlx`** - Page facts
- Page-session grain
- Engagement metrics
- Entry/exit flags
- Uses dynamic field references

**`definitions/declaration.js`** - Source tables
- Declares external BigQuery tables
- **Update with your source project/dataset**

**`workflow_settings.yaml`** - Dataform settings
- Project, dataset, location defaults
- Global variables (use compilation overrides)
- **Update for your environment**

---

## Troubleshooting

### Common Issues

#### Issue: "Table Not Found" Errors

**Symptoms:** 
```
Not found: Table project.dataset.table_name
```

**Solutions:**
1. Check dataset name in compilation variables
2. Verify `workflow_settings.yaml` has correct project/dataset
3. Check that source tables exist in `declaration.js`
4. Run dependencies first (e.g., `base_events_preops` before `base_events`)
5. Verify service account has permissions

#### Issue: Compilation Errors

**Symptoms:** Red errors in Dataform compilation output, syntax errors

**Common Causes:**
```javascript
// Missing comma in array
{ name: "param1", type: "string" }
{ name: "param2", type: "string" }  // ❌ Missing comma above

// Unbalanced when() blocks
${ when(condition, `SQL code`) }  // ✅ Correct
${ when(condition, `SQL code` }   // ❌ Missing closing parenthesis

// Incorrect string concatenation
`SELECT * FROM ` + tableName + ` WHERE ...`  // ❌ Don't mix quotes
`SELECT * FROM ${tableName} WHERE ...`       // ✅ Use template literals
```

**Solutions:**
1. Check JavaScript syntax in `config {}` and `js {}` blocks
2. Verify all `${ when() }` blocks are balanced
3. Check for missing commas in configuration arrays
4. Review helper function calls for correct parameters
5. Use JavaScript linter in your editor

#### Issue: Duplicate Data

**Symptoms:** Row counts higher than expected, duplicate event_key values

**Diagnosis:**
```sql
-- Check for duplicates
SELECT 
  event_key, 
  COUNT(*) as cnt
FROM `project.ga4_reporting.base_events`
WHERE event_date = '2024-01-15'
GROUP BY event_key
HAVING cnt > 1
LIMIT 100;
```

**Solutions:**
1. Verify `base_events_preops` ran successfully before `base_events`
2. Check Dataform execution logs for errors
3. Manually delete duplicates:
```sql
   -- Delete specific date and reload
   DELETE FROM `project.ga4_reporting.base_events`
   WHERE event_date = '2024-01-15';
   
   -- Then rerun pipeline for that date
```

#### Issue: Missing Parameters / NULL Columns

**Symptoms:** Columns you expect to have data are NULL

**Diagnosis:**
```sql
-- Check if parameter exists in source
SELECT 
  event_date,
  event_name,
  (SELECT value.string_value 
   FROM UNNEST(event_params) 
   WHERE key = 'your_param_name') as param_value
FROM `project.source_dataset.events_20240115`
LIMIT 100;
```

**Solutions:**
1. Verify parameter name matches exactly (case-sensitive!)
2. Check parameter exists in source GA4 data
3. Add parameter to correct array in `core_config.js`:
   - `CORE_PARAMS_ARRAY` - Always extracted
   - `WEB_PARAMS_ARRAY` - Web stream only
   - `APP_PARAMS_ARRAY` - App stream only
   - `CUSTOM_PARAMS_ARRAY` - Your custom params
4. Verify parameter type is correct (`string`, `int`, `float`, `double`)
5. Recompile and redeploy
6. Reprocess affected dates

#### Issue: `constants is not defined` Error

**Symptoms:**
```
ReferenceError: constants is not defined
```

**Cause:** Helper function trying to access config incorrectly

**Solution:** Check that helper functions use `getConfig()`:
```javascript
// ❌ Wrong
function someFunction() {
  return constants.SOME_VALUE;
}

// ✅ Correct
function someFunction() {
  const cfg = getConfig();
  return cfg.SOME_VALUE;
}
```

#### Issue: Field Name Mismatch in dim_pages / fct_page_views

**Symptoms:**
```
Field name page_location does not exist in STRUCT<screen_location STRING...>
```

**Cause:** Hardcoded field reference doesn't match actual struct field names

**Solution:** Use helper variables instead:
```javascript
// ❌ Wrong
REGEXP_EXTRACT(page.page_location, ...)

// ✅ Correct
REGEXP_EXTRACT(${screenFields.location}, ...)
```

#### Issue: Slow Query Performance

**Symptoms:** Queries taking > 5 minutes, timeouts

**Diagnosis:**
```sql
-- Check partitioning is working
SELECT 
  table_name,
  partition_id,
  total_rows
FROM `project.ga4_reporting.INFORMATION_SCHEMA.PARTITIONS`
WHERE table_name = 'base_events'
ORDER BY partition_id DESC
LIMIT 10;

-- Check clustering
SELECT 
  table_name,
  clustering_ordinal_position,
  column_name
FROM `project.ga4_reporting.INFORMATION_SCHEMA.COLUMNS`
WHERE table_name = 'base_events'
  AND clustering_ordinal_position IS NOT NULL
ORDER BY clustering_ordinal_position;
```

**Solutions:**
1. Verify partitioning and clustering are applied
2. Check queries use WHERE clause on partition key (`event_date`)
3. For backfills, reduce date range
4. Check for Cartesian joins or missing WHERE clauses
5. Monitor BigQuery slot usage and schedule during off-hours
6. Consider upgrading BigQuery edition for on-demand slots

### Getting Help

**Debugging Process:**
1. **Compile first** - Check for syntax/configuration errors
2. **Run single action** - Isolate the problem table
3. **Check execution logs** - Look for specific error messages
4. **Query BigQuery directly** - Verify data at each step
5. **Check source data** - Ensure GA4 export is working

**Useful Log Locations:**
- Dataform execution logs (most detailed)
- BigQuery job history (query performance)
- Browser console (F12 for UI issues)

**Resources:**
- [Dataform Documentation](https://cloud.google.com/dataform/docs)
- [BigQuery Documentation](https://cloud.google.com/bigquery/docs)
- [GA4 Export Schema](https://support.google.com/analytics/answer/7029846)
- [GA4 BigQuery Export](https://support.google.com/analytics/answer/9358801)

---

## Development Workflow

### For Bounteous Engineers

This pipeline is designed for the Bounteous agency model:
- **Base implementation** done by experienced data engineers
- **Client-specific customization** through config files
- **Maintenance** can be handled by clients with guidance
- **Version updates** pushed by Bounteous team

### Making Changes

**1. Feature Development:**
```bash
# Create feature branch
git checkout -b feature/client-custom-attribution

# Make changes
# - Update core_config.js
# - Modify getCustomTrafficSourceFields() in helper.js

# Test in dev
# - Create dev release
# - Run with small date range
# - Verify output

# Commit
git add .
git commit -m "Add custom attribution logic for Client X"
git push origin feature/client-custom-attribution
```

**2. Testing:**
- Always test in dev dataset first
- Use small date ranges for initial tests
- Verify data quality and performance
- Check that existing functionality still works

**3. Deployment:**
```bash
# Merge to main
git checkout main
git merge feature/client-custom-attribution
git push origin main

# Update prod release
# - Point to latest main commit
# - Run manually first
# - Monitor for issues
# - Enable schedule if all looks good
```

### Client Customization Points

**Easy (Config-Only):**
- Data stream type (web/app/both)
- Parameter extraction (add to CUSTOM_PARAMS_ARRAY)
- Load strategy (USE_FRESH_DAILY, INITIAL_LOAD_DAYS)

**Medium (Helper Functions):**
- Custom traffic source attribution (`getCustomTrafficSourceFields()`)
- Additional field references

**Advanced (Model Changes):**
- New tables/models
- Change grain of existing tables
- Complex business logic

### Code Standards

**JavaScript:**
- Use consistent formatting (2-space indent)
- Clear, descriptive variable names
- Comment complex logic with "why" not "what"

**SQL:**
- Use CTEs for readability
- Comment complex transformations
- Use meaningful CTE names
- Consistent formatting

**Configuration:**
- Document all config options with comments
- Provide examples for common scenarios
- Note dependencies between settings

---

## License

Proprietary - Bounteous

---

## Contact

For questions or support:
- **Bounteous Data Engineering Team**
- **Client Support:** Via your Bounteous account team

---

## Changelog

### Version 1.1.0 (2025-02-03)
- Added dynamic traffic source field logic
- Improved configuration handling for web/app consolidation
- Fixed field reference issues in dim_pages and fct_page_views
- Enhanced helper.js with traffic source functions
- Updated documentation for client customization
- Added comprehensive troubleshooting section

### Version 1.0.0 (2025-01-30)
- Initial release
- Core event processing with 3-day rolling refresh
- Session aggregations
- Page dimension and facts
- Configurable parameter extraction
- Multi-stream support (web/app/both)
- Audit logging
