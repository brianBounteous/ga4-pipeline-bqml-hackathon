/**
 * Fresh daily table configuration
 * If true, uses events_fresh_daily_* tables for yesterday's data (faster availability)
 * If false or fresh_daily tables don't exist, falls back to events_* tables
 */
const USE_FRESH_DAILY = true;

/**
 * Late arrival reconciliation configuration
 * Number of days to look back for reconciling late-arriving events
 * Recommended: 4 (covers GA4's typical 72-hour late arrival window)
 * Set to 0 to disable reconciliation
 */
const RECONCILIATION_LOOKBACK_DAYS = 4;

/**
 * Data stream configuration
 * Defines what type of data is in your GA4 property
 * Options: 'web', 'app', or 'both'
 */
const DATA_STREAM_TYPE = 'both'; // 'web', 'app', or 'both'

/**
 * Parameter consolidation setting
 * Only applies when DATA_STREAM_TYPE = 'both'
 * If true: web and app parameters are consolidated (e.g., page_location + firebase_screen → screen_location)
 * If false: web and app parameters are kept separate (page_location and firebase_screen as distinct columns)
 */
const CONSOLIDATE_WEB_APP_PARAMS = true;

/**
 * Backfill configuration
 * Used for initial table creation. Determines how far back to load historical data.
 * Format: YYYYMMDD
 * If null, defaults to 13 months ago for start, yesterday for end
 */
const BACKFILL_START_DATE = '20251201'; // e.g., '20240101' or null for auto
const BACKFILL_END_DATE = null;   // e.g., '20241231' or null for auto

/**
 * Destination schema for output tables
 */
const DESTINATION_SCHEMA = 'ga4_reporting';

/**
 * Core event parameters configuration
 * Parameters that apply to all stream types (web, app, or both)
 * These are always extracted regardless of DATA_STREAM_TYPE setting
 */
const CORE_PARAMS_ARRAY = [
    {
        name: "engagement_time_msec",
        type: "int"
    },
    {
        name: "engaged_session_event",
        type: "int"
    },
    {
        name: "entrances",
        type: "int"
    },
    {
        name: "form_name",
        type: "string"
    },
    {
        name: "ga_session_id",
        type: "int"
    },
    {
        name: "ga_session_number",
        type: "int"
    },
    {
        name: "ignore_referrer",
        type: "string"
    },
    {
        name: "percent_scrolled",
        type: "int"
    },
    {
        name: "session_engaged",
        type: "string"
    }
];

/**
 * Web-specific event parameters
 * Only extracted when DATA_STREAM_TYPE = 'web' or 'both'
 * consolidated_name: Used when CONSOLIDATE_WEB_APP_PARAMS = true (maps to unified field name)
 */
const WEB_PARAMS_ARRAY = [
    {
        name: "link_classes",
        type: "string"
    },
    {
        name: "link_text",
        type: "string"
    },
    {
        name: "link_url",
        type: "string"
    },
    {
        name: "page_location",
        type: "string",
        consolidated_name: "screen_location"
    },
    {
        name: "page_referrer",
        type: "string",
        consolidated_name: "screen_referrer"
    },
    {
        name: "page_title",
        type: "string",
        consolidated_name: "screen_title"
    },
    {
        name: "video_current_time",
        type: "int"
    },
    {
        name: "video_duration",
        type: "int"
    },
    {
        name: "video_percent",
        type: "int"
    },
    {
        name: "video_provider",
        type: "string"
    },
    {
        name: "video_title",
        type: "string"
    },
    {
        name: "video_url",
        type: "string"
    },
    {
        name: "visible",
        type: "string"
    }
];

/**
 * App-specific event parameters
 * Only extracted when DATA_STREAM_TYPE = 'app' or 'both'
 * consolidated_name: Used when CONSOLIDATE_WEB_APP_PARAMS = true (maps to unified field name)
 */
const APP_PARAMS_ARRAY = [
    {
        name: "firebase_conversion",
        type: "int"
    },
    {
        name: "firebase_previous_class",
        type: "string"
    },
    {
        name: "firebase_previous_id",
        type: "string"
    },
    {
        name: "firebase_previous_screen",
        type: "string",
        consolidated_name: "screen_referrer"
    },
    {
        name: "firebase_screen",
        type: "string",
        consolidated_name: "screen_location"
    },
    {
        name: "firebase_screen_class",
        type: "string",
        consolidated_name: "screen_title"
    },
    {
        name: "firebase_screen_id",
        type: "string"
    }
];

/**
 * Custom event parameters configuration
 * Add any implementation-specific event parameters here
 * These are always extracted regardless of DATA_STREAM_TYPE setting
 * Use this for parameters unique to your GA4 implementation
 * Supported types: string, int, float, double
 */
const CUSTOM_PARAMS_ARRAY = [
    // Example:
    // {
    //     name: "user_role",
    //     type: "string"
    // },
    // {
    //     name: "purchase_value",
    //     type: "double"
    // },
    // {
    //     name: "item_count",
    //     type: "int"
    // }
];

/**
 * Core user properties configuration
 * Defines which user properties to extract and their data types
 */
const CORE_USER_PROPS_ARRAY = [
    {
        name: "user_type",
        type: "string"
    }
];

/**
 * Custom item parameters configuration
 * Defines which custom item parameters to extract from item_params array
 * Leave empty if no custom item parameters needed
 * Supported types: string, int, float, double
 */
const CUSTOM_ITEMS_PARAMS = [
    // Example:
    // {
    //     name: "custom_size",
    //     type: "string"
    // },
    // {
    //     name: "custom_color",
    //     type: "string"
    // },
    // {
    //     name: "custom_discount_rate",
    //     type: "double"
    // }
];

/**
 * Core configuration object
 * Export all config values as a single object
 */
const coreConfig = {
    USE_FRESH_DAILY,
    RECONCILIATION_LOOKBACK_DAYS,
    DATA_STREAM_TYPE,
    CONSOLIDATE_WEB_APP_PARAMS,
    BACKFILL_START_DATE,
    BACKFILL_END_DATE,
    DESTINATION_SCHEMA,
    CORE_PARAMS_ARRAY,
    WEB_PARAMS_ARRAY,
    APP_PARAMS_ARRAY,
    CUSTOM_PARAMS_ARRAY,
    CORE_USER_PROPS_ARRAY,
    CUSTOM_ITEMS_PARAMS
};

module.exports = {
    coreConfig
};