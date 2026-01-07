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
    
    // Map data types to GA4's value field structure
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
    
    // Generate the SQL extraction logic with exact parameter name as column alias
    return `(SELECT value.${valueField} FROM UNNEST(${sourceArray}) WHERE key = '${param.name}') AS ${param.name}`;
  }).join(',\n        ');
}

module.exports = { 
  REPLACE_NULL_STRING,
  EXTRACT_EVENT_PARAMS 
};