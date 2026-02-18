// ============================================================================
// FRAMEWORK CONFIGURATION
// Owned by upstream repository — do not modify in client forks
// ============================================================================

/**
 * Manual full backfill mode
 * IMPORTANT: This should ALWAYS be false in repository code
 * Override via release compilation variables for one-time backfill operations
 */
const FORCE_FULL_BACKFILL = dataform.projectConfig.vars.FORCE_FULL_BACKFILL === 'true' || false;

/**
 * Backfill date range (YYYYMMDD format, only used when FORCE_FULL_BACKFILL = true)
 * null = auto-calculate (13 months ago to yesterday)
 */
const BACKFILL_START_DATE = dataform.projectConfig.vars.BACKFILL_START_DATE || null;
const BACKFILL_END_DATE = dataform.projectConfig.vars.BACKFILL_END_DATE || null;

/**
 * Ecommerce feature flag
 * Controlled via workflow_settings.yaml or release compilation variables
 */
const HAS_ECOMMERCE = dataform.projectConfig.vars.HAS_ECOMMERCE === 'true';

/**
 * Initial load size (days) - Used when base_events table doesn't exist
 */
const INITIAL_LOAD_DAYS = 7;

/**
 * Rolling refresh window (days) - How many days back incremental runs reprocess
 * Used by base_events incremental date filter and model_execution_log audit window
 */
const ROLLING_REFRESH_DAYS = 3;

// ============================================================================
// EXPORT
// ============================================================================

const coreConfig = {
  FORCE_FULL_BACKFILL,
  BACKFILL_START_DATE,
  BACKFILL_END_DATE,
  HAS_ECOMMERCE,
  INITIAL_LOAD_DAYS,
  ROLLING_REFRESH_DAYS
};

module.exports = { coreConfig };