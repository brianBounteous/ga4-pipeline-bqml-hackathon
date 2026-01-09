const config = require('./default_config.js');

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
 * Generates SQL for extracting event parameters from GA4's event_params array
 * Uses the CORE_PARAMS_ARRAY config to determine which parameters to extract
 * Supports types: string, int, float, double
 * @param {string} sourceArray - Name of the array field (default: 'event_params')
 * @returns {string} SQL expressions for all configured event parameters
 */
function EXTRACT_EVENT_PARAMS(sourceArray = 'event_params') {
  return config.CORE_PARAMS_ARRAY.map(param => {
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
 * Generates SQL for extracting user properties from GA4's user_properties array
 * Uses the CORE_USER_PROPS_ARRAY config to determine which properties to extract
 * Supports types: string, int, float, double
 * @param {string} sourceArray - Name of the array field (default: 'user_properties')
 * @returns {string} SQL expressions for all configured user properties
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
 * Generates SQL for extracting custom item parameters
 * Internal helper function used by EXTRACT_ITEMS_ARRAY
 * @param {Array} paramsConfig - Array of parameter configurations
 * @param {string} sourceArray - Name of the array field (e.g., 'items.item_params')
 * @returns {string} SQL expressions for extracting parameters
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

/**
 * Wraps extracted parameters in a STRUCT
 * Internal helper function used by EXTRACT_ITEMS_ARRAY
 * @param {string} paramsSQL - SQL string of parameter extractions
 * @returns {string} STRUCT wrapper around parameters
 */
function generateStructSQL(paramsSQL) {
  return `STRUCT(
                ${paramsSQL}
            )`;
}

/**
 * Generates SQL for extracting items array with optional custom item parameters
 * Uses CUSTOM_ITEMS_PARAMS config to determine which custom parameters to extract
 * @returns {string} Complete ARRAY/STRUCT SQL for items
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

module.exports = { 
  REPLACE_NULL_STRING,
  EXTRACT_EVENT_PARAMS,
  EXTRACT_USER_PROPS,
  EXTRACT_ITEMS_ARRAY
};