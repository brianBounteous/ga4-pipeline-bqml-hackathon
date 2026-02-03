/**
 * Get merged configuration from core and custom configs
 */
const getConfig = () => {
  const { coreConfig } = require("./core_config");
  return { ...coreConfig };
};

const config = getConfig();

// ============================================================================
// PROPERTY & STREAM CONFIGURATION HELPERS
// ============================================================================

/**
 * Determines if using simple or advanced property configuration
 * @returns {boolean} True if using PROPERTIES_CONFIG, false if using simple mode
 */
function isAdvancedMode() {
  return config.PROPERTIES_CONFIG !== null && config.PROPERTIES_CONFIG !== undefined;
}

/**
 * Gets all included streams across all properties
 * @returns {Array} Array of stream objects with property and stream metadata
 */
function getIncludedStreams() {
  if (!isAdvancedMode()) {
    return [{
      simple_mode: true,
      stream_type: config.DATA_STREAM_TYPE,
      use_fresh_daily: config.USE_FRESH_DAILY
    }];
  }
  
  const streams = [];
  Object.keys(config.PROPERTIES_CONFIG).forEach(propertyName => {
    const property = config.PROPERTIES_CONFIG[propertyName];
    Object.keys(property.streams).forEach(streamId => {
      const stream = property.streams[streamId];
      if (stream.include !== false) {
        streams.push({
          property_name: propertyName,
          stream_id: streamId,
          stream_type: stream.stream_type,
          source_dataset: property.source_dataset,
          use_fresh_daily: stream.use_fresh_daily !== undefined ? stream.use_fresh_daily : config.USE_FRESH_DAILY
        });
      }
    });
  });
  
  return streams;
}

/**
 * Gets the effective data stream type based on included streams
 * @returns {string} 'web', 'app', or 'both'
 */
function getEffectiveDataStreamType() {
  if (!isAdvancedMode()) {
    return config.DATA_STREAM_TYPE;
  }
  
  const streams = getIncludedStreams();
  const hasWeb = streams.some(s => s.stream_type === 'web');
  const hasApp = streams.some(s => s.stream_type === 'app');
  
  if (hasWeb && hasApp) return 'both';
  if (hasWeb) return 'web';
  if (hasApp) return 'app';
  
  return 'both';
}

/**
 * Determines if parameter consolidation should occur
 * @returns {boolean}
 */
function shouldConsolidateParams() {
  const effectiveType = getEffectiveDataStreamType();
  return effectiveType === 'both' && config.CONSOLIDATE_WEB_APP_PARAMS;
}

/**
 * Gets the consolidated field name for a given parameter
 * @param {string} paramName - Original parameter name (e.g., 'page_location')
 * @returns {string|null} Consolidated name or null if not consolidated
 */
function getConsolidatedFieldName(paramName) {
  // Check web params
  const webParam = config.WEB_PARAMS_ARRAY.find(p => p.name === paramName);
  if (webParam && webParam.consolidated_name) {
    return webParam.consolidated_name;
  }
  
  // Check app params
  const appParam = config.APP_PARAMS_ARRAY.find(p => p.name === paramName);
  if (appParam && appParam.consolidated_name) {
    return appParam.consolidated_name;
  }
  
  return null;
}

/**
 * Generates SQL filter for stream_id (used in advanced mode)
 * @param {string} propertyName - Property name from PROPERTIES_CONFIG
 * @returns {string} SQL WHERE clause fragment for stream filtering
 */
function generateStreamFilter(propertyName) {
  if (!isAdvancedMode()) {
    return '1=1';
  }
  
  const property = config.PROPERTIES_CONFIG[propertyName];
  if (!property) {
    throw new Error(`Property ${propertyName} not found in PROPERTIES_CONFIG`);
  }
  
  const includedStreamIds = Object.keys(property.streams)
    .filter(streamId => property.streams[streamId].include !== false)
    .map(streamId => `'${streamId}'`);
  
  if (includedStreamIds.length === 0) {
    return '1=0';
  }
  
  if (includedStreamIds.length === 1) {
    return `stream_id = ${includedStreamIds[0]}`;
  }
  
  return `stream_id IN (${includedStreamIds.join(', ')})`;
}

/**
 * Gets screen field references for session aggregations
 * Returns appropriate field paths based on web/app/both configuration
 * @returns {object} Object with field references for location, path, referrer, key
 */
function getScreenFieldRefs() {
  const effectiveType = getEffectiveDataStreamType();
  const consolidate = shouldConsolidateParams();
  
  // For web-only or app-only, ignore consolidation flag (it's not applicable)
  if (effectiveType === 'web') {
    return {
      location: 'page.page_location',
      path: 'page.page_path',
      referrer: 'page.page_referrer',
      key: 'page.page_key',
      title: 'page.page_title'
    };
  }
  
  if (effectiveType === 'app') {
    return {
      location: 'app.firebase_screen',
      path: 'app.firebase_screen',
      referrer: 'CAST(NULL AS STRING)',
      key: 'app.screen_key',
      title: 'app.firebase_screen_class'
    };
  }
  
  // For 'both', check consolidation flag
  if (consolidate) {
    return {
      location: 'page.screen_location',
      path: 'page.page_path',
      referrer: 'page.screen_referrer',
      key: 'page.screen_key',
      title: 'page.screen_title'
    };
  } else {
    return {
      location: 'COALESCE(page.page_location, app.firebase_screen)',
      path: 'COALESCE(page.page_path, app.firebase_screen)',
      referrer: 'page.page_referrer',
      key: 'COALESCE(page.page_key, app.screen_key)',
      title: 'COALESCE(page.page_title, app.firebase_screen_class)'
    };
  }
}

/**
 * Gets the appropriate page/screen session key field reference
 * Returns the correct field name based on data stream configuration
 * @returns {string} Field reference for page/screen session key
 */
function getPageSessionKeyRef() {
  const effectiveType = getEffectiveDataStreamType();
  const consolidate = shouldConsolidateParams();
  
  if (effectiveType === 'web') {
    return 'page_session_key';
  }
  
  if (effectiveType === 'app') {
    return 'screen_session_key';
  }
  
  // both
  if (consolidate) {
    return 'screen_session_key';
  } else {
    return 'COALESCE(page_session_key, screen_session_key)';
  }
}

// ============================================================================
// STRING MANIPULATION HELPERS
// ============================================================================

/**
 * Replaces null values and empty strings with '(not set)'
 * Used for standardizing GA4 string fields across reports
 * @param {string} fieldName - The field name or expression to check
 * @returns {string} SQL expression with null and empty string handling
 */
function REPLACE_NULL_STRING(fieldName) {
  return `IF(${fieldName} IS NULL OR ${fieldName} = '', '(not set)', ${fieldName})`;
}

// ============================================================================
// PARAMETER EXTRACTION HELPERS
// ============================================================================

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
 * Only called when effective stream type includes web
 */
function EXTRACT_WEB_PARAMS(sourceArray = 'event_params') {
  if (config.WEB_PARAMS_ARRAY.length === 0) {
    return '';
  }
  return extractParamsSQL(config.WEB_PARAMS_ARRAY, sourceArray);
}

/**
 * Extracts app-specific parameters
 * Only called when effective stream type includes app
 */
function EXTRACT_APP_PARAMS(sourceArray = 'event_params') {
  if (config.APP_PARAMS_ARRAY.length === 0) {
    return '';
  }
  return extractParamsSQL(config.APP_PARAMS_ARRAY, sourceArray);
}

/**
 * Extracts custom event parameters
 * Always extracted regardless of stream type
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
 */
function CONSOLIDATE_PARAMS() {
  const effectiveType = getEffectiveDataStreamType();
  
  if (effectiveType !== 'both' || !config.CONSOLIDATE_WEB_APP_PARAMS) {
    return '';
  }
  
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
  const effectiveType = getEffectiveDataStreamType();
  
  const fields = [
    "COALESCE(user_id, '')",
    "COALESCE(CAST(ga_session_id AS STRING), '')",
    "CAST(event_timestamp AS STRING)",
    "event_name"
  ];
  
  config.CORE_PARAMS_ARRAY.forEach(param => {
    fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
  });
  
  if (effectiveType === 'both' && config.CONSOLIDATE_WEB_APP_PARAMS) {
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
        fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
      }
    });
    
    consolidatedNames.forEach(name => {
      fields.push(`COALESCE(${name}, '')`);
    });
    
  } else {
    if (effectiveType === 'web' || effectiveType === 'both') {
      config.WEB_PARAMS_ARRAY.forEach(param => {
        fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
      });
    }
    
    if (effectiveType === 'app' || effectiveType === 'both') {
      config.APP_PARAMS_ARRAY.forEach(param => {
        fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
      });
    }
  }
  
  config.CUSTOM_PARAMS_ARRAY.forEach(param => {
    fields.push(`COALESCE(CAST(${param.name} AS STRING), '')`);
  });
  
  return fields.join(", '-', ");
}

/**
 * Generates SQL for extracting user properties
 */
function EXTRACT_USER_PROPS(sourceArray = 'user_properties') {
  if (config.CORE_USER_PROPS_ARRAY.length === 0) {
    return '';
  }
  
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

// ============================================================================
// ITEMS ARRAY HELPERS
// ============================================================================

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

// ============================================================================
// TRAFFIC SOURCE HELPERS
// ============================================================================

/**
 * Check if custom traffic source logic should be used
 * @returns {boolean}
 */
function shouldUseCustomTrafficSource() {
  return config.USE_CUSTOM_TRAFFIC_SOURCE_LOGIC === true;
}

/**
 * Get default GA4 traffic source field references
 * @returns {object} Object with traffic source field SQL
 */
function getDefaultTrafficSourceFields() {
  return {
    session_source: `session_traffic_source_last_click.cross_channel_campaign.source`,
    session_medium: `session_traffic_source_last_click.cross_channel_campaign.medium`,
    session_campaign: `session_traffic_source_last_click.cross_channel_campaign.campaign_name`,
    session_channel_group: `session_traffic_source_last_click.cross_channel_campaign.default_channel_group`
  };
}

/**
 * Get custom traffic source field references
 * EDIT THIS FUNCTION to implement client-specific traffic source logic
 * @returns {object} Object with custom traffic source field SQL
 */
function getCustomTrafficSourceFields() {
  // Example: Custom source logic that remaps certain sources
  return {
    session_source: `CASE 
      WHEN session_traffic_source_last_click.cross_channel_campaign.source = 'google' 
        AND session_traffic_source_last_click.cross_channel_campaign.medium = 'organic' 
        THEN 'google_organic'
      WHEN session_traffic_source_last_click.cross_channel_campaign.source LIKE '%facebook%' 
        THEN 'facebook'
      ELSE session_traffic_source_last_click.cross_channel_campaign.source
    END`,
    
    // Example: Custom medium logic
    session_medium: `CASE
      WHEN session_traffic_source_last_click.cross_channel_campaign.medium IN ('cpc', 'ppc', 'paidsearch') 
        THEN 'paid_search'
      WHEN session_traffic_source_last_click.cross_channel_campaign.medium = 'social' 
        THEN 'organic_social'
      ELSE session_traffic_source_last_click.cross_channel_campaign.medium
    END`,
    
    // Default pass-through for other fields (customize as needed)
    session_campaign: `session_traffic_source_last_click.cross_channel_campaign.campaign_name`,
    session_channel_group: `session_traffic_source_last_click.cross_channel_campaign.default_channel_group`,
    
    // Example: Add custom fields
    session_campaign_id: `session_traffic_source_last_click.cross_channel_campaign.campaign_id`,
    session_term: `session_traffic_source_last_click.manual_campaign.term`,
    session_content: `session_traffic_source_last_click.manual_campaign.content`,
    session_source_platform: `session_traffic_source_last_click.cross_channel_campaign.source_platform`
  };
}

/**
 * Get traffic source field references (default or custom)
 * @returns {object} Object with traffic source field SQL
 */
function getTrafficSourceFields() {
  if (shouldUseCustomTrafficSource()) {
    return getCustomTrafficSourceFields();
  }
  return getDefaultTrafficSourceFields();
}

/**
 * Generate SQL for selecting traffic source fields
 * Returns comma-separated SELECT statements
 * @returns {string} SQL for selecting traffic source fields
 */
function getTrafficSourceSelectSQL() {
  const fields = getTrafficSourceFields();
  return Object.entries(fields)
    .map(([alias, expr]) => `${expr} AS ${alias}`)
    .join(',\n    ');
}

/**
 * Generate column list for traffic source fields
 * Returns comma-separated column names for final SELECT
 * @returns {string} Column names for traffic source fields
 */
function getTrafficSourceColumnList() {
  const fields = getTrafficSourceFields();
  return Object.keys(fields).join(',\n  ');
}

/**
 * Generate ANY_VALUE aggregations for traffic source fields
 * Returns comma-separated ANY_VALUE statements for aggregation
 * @returns {string} SQL for aggregating traffic source fields
 */
function getTrafficSourceAggregateSQL() {
  const fields = getTrafficSourceFields();
  return Object.keys(fields)
    .map(alias => `ANY_VALUE(${alias}) AS ${alias}`)
    .join(',\n    ');
}

// ============================================================================
// DATE & BACKFILL HELPERS
// ============================================================================

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

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = { 
  // Config
  getConfig,
  
  // Property & Stream Helpers
  isAdvancedMode,
  getIncludedStreams,
  getEffectiveDataStreamType,
  shouldConsolidateParams,
  getConsolidatedFieldName,
  generateStreamFilter,
  getScreenFieldRefs,
  getPageSessionKeyRef,
  
  // String Helpers
  REPLACE_NULL_STRING,
  
  // Parameter Extraction
  EXTRACT_EVENT_PARAMS,
  EXTRACT_WEB_PARAMS,
  EXTRACT_APP_PARAMS,
  EXTRACT_CUSTOM_PARAMS,
  CONSOLIDATE_PARAMS,
  GENERATE_EVENT_KEY_CONCAT,
  EXTRACT_USER_PROPS,
  
  // Items Array
  EXTRACT_ITEMS_ARRAY,
  
  // Traffic Source Helpers
  shouldUseCustomTrafficSource,
  getTrafficSourceFields,
  getTrafficSourceSelectSQL,
  getTrafficSourceColumnList,
  getTrafficSourceAggregateSQL,
  
  // Date & Backfill Helpers
  EXCLUDE_INTRADAY_TABLES,
  GET_BACKFILL_START_DATE,
  GET_BACKFILL_END_DATE
};