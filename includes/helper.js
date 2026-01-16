/**
 * Get merged configuration from core and custom configs
 */
const getConfig = () => {
  const { coreConfig } = require("./default_config");
  return { ...coreConfig };
};

const config = getConfig();

/**
 * Replaces null values and empty strings with '(not set)'
 * Used for standardizing GA4 string fields across reports
 * @param {string} fieldName - The field name or expression to check
 * @returns {string} SQL expression with null and empty string handling
 */
function REPLACE_NULL_STRING(fieldName) {
  return `IF(${fieldName} IS NULL OR ${fieldName} = '', '(not set)', ${fieldName})`;
}

/**
 * Generates SQL for extracting event parameters from an array
 * Generic function used by EXTRACT_EVENT_PARAMS, EXTRACT_WEB_PARAMS, EXTRACT_APP_PARAMS, EXTRACT_CUSTOM_PARAMS
 */
function extractParamsSQL(paramsArray, sourceArray = 'event_params') {
  return paramsArray.map(param => {
    let valueField;
    
    switch(param.type.toLowerCase()) {
      case 'string':
        valueField = 'string_value';
        break;
      case 'int':
      case 'integer':
        valueField = 'int_value';
        break;
      case 'float':
      case 'double':
        valueField = 'double_value';
        break;
      default:
        throw new Error(`Unsupported parameter type: ${param.type} for parameter: ${param.name}`);
    }
    
    return `(SELECT value.${valueField} FROM UNNEST(${sourceArray}) WHERE key = '${param.name}') AS ${param.name}`;
  }).join(',\n        ');
}

/**
 * Extracts core event parameters (always included)
 */
function EXTRACT_EVENT_PARAMS(sourceArray = 'event_params') {
  if (config.CORE_PARAMS_ARRAY.length === 0) {
    return '';
  }
  return extractParamsSQL(config.CORE_PARAMS_ARRAY, sourceArray);
}

/**
 * Extracts web-specific parameters
 * Only called when DATA_STREAM_TYPE = 'web' or 'both'
 */
function EXTRACT_WEB_PARAMS(sourceArray = 'event_params') {
  if (config.WEB_PARAMS_ARRAY.length === 0) {
    return '';
  }
  return extractParamsSQL(config.WEB_PARAMS_ARRAY, sourceArray);
}

/**
 * Extracts app-specific parameters
 * Only called when DATA_STREAM_TYPE = 'app' or 'both'
 */
function EXTRACT_APP_PARAMS(sourceArray = 'event_params') {
  if (config.APP_PARAMS_ARRAY.length === 0) {
    return '';
  }
  return extractParamsSQL(config.APP_PARAMS_ARRAY, sourceArray);
}

/**
 * Extracts custom event parameters
 * Always extracted regardless of DATA_STREAM_TYPE
 * Use this for implementation-specific parameters
 */
function EXTRACT_CUSTOM_PARAMS(sourceArray = 'event_params') {
  if (config.CUSTOM_PARAMS_ARRAY.length === 0) {
    return '';
  }
  return extractParamsSQL(config.CUSTOM_PARAMS_ARRAY, sourceArray);
}

/**
 * Generates consolidation SQL for web/app parameters
 * Creates unified fields when CONSOLIDATE_WEB_APP_PARAMS = true
 * Returns empty string if consolidation is disabled or not applicable
 */
function CONSOLIDATE_PARAMS() {
  if (config.DATA_STREAM_TYPE !== 'both' || !config.CONSOLIDATE_WEB_APP_PARAMS) {
    return '';
  }
  
  // Build a map of consolidated names to their source fields
  const consolidationMap = {};
  
  config.WEB_PARAMS_ARRAY.forEach(param => {
    if (param.consolidated_name) {
      if (!consolidationMap[param.consolidated_name]) {
        consolidationMap[param.consolidated_name] = { web: null, app: null };
      }
      consolidationMap[param.consolidated_name].web = param.name;
    }
  });
  
  config.APP_PARAMS_ARRAY.forEach(param => {
    if (param.consolidated_name) {
      if (!consolidationMap[param.consolidated_name]) {
        consolidationMap[param.consolidated_name] = { web: null, app: null };
      }
      consolidationMap[param.consolidated_name].app = param.name;
    }
  });
  
  // Generate COALESCE statements for each consolidated field
  const consolidations = Object.keys(consolidationMap).map(consolidatedName => {
    const sources = consolidationMap[consolidatedName];
    const fields = [];
    
    if (sources.web) fields.push(sources.web);
    if (sources.app) fields.push(sources.app);
    
    return `COALESCE(${fields.join(', ')}) AS ${consolidatedName}`;
  });
  
  return consolidations.join(',\n        ');
}

/**
 * Generates event key concatenation including all extracted parameters
 * Dynamically builds the hash based on what parameters are actually extracted
 */
function GENERATE_EVENT_KEY_CONCAT() {
  const fields = [
    "COALESCE(user_id, '')",
    "COALESCE(CAST(ga_session_id AS STRING), '')",
    "CAST(event_timestamp AS STRING)",
    "event_name"
  ];
  
  // Add core params
  config.CORE_PARAMS_ARRAY.forEach(param => {
    fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
  });
  
  // Handle web/app params based on consolidation
  if (config.DATA_STREAM_TYPE === 'both' && config.CONSOLIDATE_WEB_APP_PARAMS) {
    // Use consolidated field names
    const consolidatedNames = new Set();
    
    config.WEB_PARAMS_ARRAY.forEach(param => {
      if (param.consolidated_name) {
        consolidatedNames.add(param.consolidated_name);
      }
    });
    
    config.APP_PARAMS_ARRAY.forEach(param => {
      if (param.consolidated_name) {
        consolidatedNames.add(param.consolidated_name);
      } else {
        // App-only params that don't consolidate
        fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
      }
    });
    
    // Add consolidated fields
    consolidatedNames.forEach(name => {
      fields.push(`COALESCE(${name}, '')`);
    });
    
  } else {
    // Not consolidating - add web and app params separately
    if (config.DATA_STREAM_TYPE === 'web' || config.DATA_STREAM_TYPE === 'both') {
      config.WEB_PARAMS_ARRAY.forEach(param => {
        fields.push(`COALESCE(${param.name}, '')`);
      });
    }
    
    if (config.DATA_STREAM_TYPE === 'app' || config.DATA_STREAM_TYPE === 'both') {
      config.APP_PARAMS_ARRAY.forEach(param => {
        fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
      });
    }
  }
  
  // Add custom params (always included)
  config.CUSTOM_PARAMS_ARRAY.forEach(param => {
    fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
  });
  
  return fields.join(", '-', ");
}

/**
 * Generates SQL for extracting user properties
 */
function EXTRACT_USER_PROPS(sourceArray = 'user_properties') {
  return config.CORE_USER_PROPS_ARRAY.map(prop => {
    let valueField;
    
    switch(prop.type.toLowerCase()) {
      case 'string':
        valueField = 'string_value';
        break;
      case 'int':
      case 'integer':
        valueField = 'int_value';
        break;
      case 'float':
      case 'double':
        valueField = 'double_value';
        break;
      default:
        throw new Error(`Unsupported property type: ${prop.type} for property: ${prop.name}`);
    }
    
    return `(SELECT value.${valueField} FROM UNNEST(${sourceArray}) WHERE key = '${prop.name}') AS ${prop.name}`;
  }).join(',\n        ');
}

/**
 * Internal helper for item params extraction
 */
function generateItemParamsSQL(paramsConfig, sourceArray) {
  return paramsConfig.map(param => {
    let valueField;
    
    switch(param.type.toLowerCase()) {
      case 'string':
        valueField = 'string_value';
        break;
      case 'int':
      case 'integer':
        valueField = 'int_value';
        break;
      case 'float':
      case 'double':
        valueField = 'double_value';
        break;
      default:
        throw new Error(`Unsupported item parameter type: ${param.type} for parameter: ${param.name}`);
    }
    
    return `(SELECT value.${valueField} FROM UNNEST(${sourceArray}) WHERE key = '${param.name}') AS ${param.name}`;
  }).join(',\n                ');
}

function generateStructSQL(paramsSQL) {
  return `STRUCT(
                ${paramsSQL}
            )`;
}

/**
 * Generates items array extraction
 */
function EXTRACT_ITEMS_ARRAY() {
  const hasCustomParams = config.CUSTOM_ITEMS_PARAMS && config.CUSTOM_ITEMS_PARAMS.length > 0;
  
  let customParamsSQL = '';
  if (hasCustomParams) {
    const paramsSQL = generateItemParamsSQL(config.CUSTOM_ITEMS_PARAMS, 'items.item_params');
    customParamsSQL = `,
                ${generateStructSQL(paramsSQL)} AS item_params_custom`;
  }
  
  return `ARRAY(
        (
            SELECT
                STRUCT(
                    items.item_id,
                    items.item_name,
                    items.item_brand,
                    items.item_variant,
                    items.item_category,
                    items.item_category2,
                    items.item_category3,
                    items.item_category4,
                    items.item_category5,
                    items.price_in_usd,
                    items.price,
                    items.quantity,
                    items.item_revenue_in_usd,
                    items.item_revenue,
                    items.item_refund_in_usd,
                    items.item_refund,
                    items.coupon,
                    items.affiliation,
                    items.location_id,
                    items.item_list_id,
                    items.item_list_name,
                    items.item_list_index,
                    items.promotion_id,
                    items.promotion_name,
                    items.creative_name,
                    items.creative_slot${customParamsSQL}
                )
            FROM UNNEST(items) AS items
        )
    ) AS items`;
}

/**
 * Gets the appropriate source table for fresh data loads
 * Now accepts project, dataset, and prefix as parameters from workflow vars
 */
function GET_FRESH_SOURCE_TABLE(useFreshDaily = config.USE_FRESH_DAILY) {
  // This will be called from SQLX with workflow vars injected
  return useFreshDaily 
    ? "events_fresh_daily_*"  // Return table suffix only
    : "events_*";
}

/**
 * Gets the finalized events_* table (for reconciliation and backfill)
 */
function GET_FINALIZED_SOURCE_TABLE() {
  return "events_*";  // Return table suffix only
}

/**
 * Generates WHERE clause for fresh daily load (yesterday)
 */
function GET_FRESH_LOAD_DATE_FILTER(useFreshDaily = config.USE_FRESH_DAILY) {
  const yesterdayFilter = "_TABLE_SUFFIX = FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))";
  
  if (useFreshDaily) {
    return yesterdayFilter;
  }
  
  return `${EXCLUDE_INTRADAY_TABLES()} AND ${yesterdayFilter}`;
}

/**
 * Generates WHERE clause for reconciliation load (N days ago)
 */
function GET_RECONCILIATION_DATE_FILTER() {
  const lookbackDays = config.RECONCILIATION_LOOKBACK_DAYS;
  const excludeIntraday = EXCLUDE_INTRADAY_TABLES();
  const reconciliationFilter = `_TABLE_SUFFIX = FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL ${lookbackDays} DAY))`;
  
  return `${excludeIntraday} AND ${reconciliationFilter}`;
}

function EXCLUDE_INTRADAY_TABLES() {
  return `_TABLE_SUFFIX NOT LIKE 'intraday%'`;
}

function GET_BACKFILL_START_DATE() {
  if (config.BACKFILL_START_DATE) {
    return config.BACKFILL_START_DATE;
  }
  return `FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 13 MONTH))`;
}

function GET_BACKFILL_END_DATE() {
  if (config.BACKFILL_END_DATE) {
    return config.BACKFILL_END_DATE;
  }
  return `FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY))`;
}

module.exports = { 
  getConfig,
  REPLACE_NULL_STRING,
  EXTRACT_EVENT_PARAMS,
  EXTRACT_WEB_PARAMS,
  EXTRACT_APP_PARAMS,
  EXTRACT_CUSTOM_PARAMS,
  CONSOLIDATE_PARAMS,
  GENERATE_EVENT_KEY_CONCAT,
  EXTRACT_USER_PROPS,
  EXTRACT_ITEMS_ARRAY,
  GET_FRESH_SOURCE_TABLE,
  GET_FINALIZED_SOURCE_TABLE,
  GET_FRESH_LOAD_DATE_FILTER,
  GET_RECONCILIATION_DATE_FILTER,
  EXCLUDE_INTRADAY_TABLES,
  GET_BACKFILL_START_DATE,
  GET_BACKFILL_END_DATE
};