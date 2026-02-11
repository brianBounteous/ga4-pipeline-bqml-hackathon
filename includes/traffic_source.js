// ============================================================================
// TRAFFIC_SOURCE.JS — Traffic Source Attribution Logic
// Owned by client fork — protected from upstream merges via .gitattributes
// 
// Customize getCustomTrafficSourceFields() for per-client attribution rules.
// Add/remove fields, remap sources, define custom channel groupings, etc.
// ============================================================================

const helpers = require('./helper');
const config = helpers.getConfig();

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if custom traffic source logic should be used
 */
function shouldUseCustomTrafficSource() {
  return config.USE_CUSTOM_TRAFFIC_SOURCE_LOGIC === true;
}

/**
 * Default GA4 traffic source field references
 * Used when USE_CUSTOM_TRAFFIC_SOURCE_LOGIC = false
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
 * Custom traffic source field references
 * EDIT THIS FUNCTION to implement client-specific traffic source logic
 * 
 * You can:
 *   - Remap source/medium values
 *   - Add new fields (e.g. session_campaign_id, session_term)
 *   - Define custom channel groupings
 *   - Implement partner-specific categorization
 * 
 * All fields returned here flow automatically through sessions, users,
 * and any other model that uses the traffic source helpers.
 */
function getCustomTrafficSourceFields() {
  return {
    session_source: `CASE 
      WHEN session_traffic_source_last_click.cross_channel_campaign.source = 'google' 
        AND session_traffic_source_last_click.cross_channel_campaign.medium = 'organic' 
        THEN 'google_organic'
      WHEN session_traffic_source_last_click.cross_channel_campaign.source LIKE '%facebook%' 
        THEN 'facebook'
      ELSE session_traffic_source_last_click.cross_channel_campaign.source
    END`,
    
    session_medium: `CASE
      WHEN session_traffic_source_last_click.cross_channel_campaign.medium IN ('cpc', 'ppc', 'paidsearch') 
        THEN 'paid_search'
      WHEN session_traffic_source_last_click.cross_channel_campaign.medium = 'social' 
        THEN 'organic_social'
      ELSE session_traffic_source_last_click.cross_channel_campaign.medium
    END`,
    
    session_campaign: `session_traffic_source_last_click.cross_channel_campaign.campaign_name`,
    session_channel_group: `session_traffic_source_last_click.cross_channel_campaign.default_channel_group`,
    
    // Additional custom fields
    session_campaign_id: `session_traffic_source_last_click.cross_channel_campaign.campaign_id`,
    session_term: `session_traffic_source_last_click.manual_campaign.term`,
    session_content: `session_traffic_source_last_click.manual_campaign.content`,
    session_source_platform: `session_traffic_source_last_click.cross_channel_campaign.source_platform`
  };
}

// ============================================================================
// SQL GENERATION HELPERS
// ============================================================================

/**
 * Get traffic source field references (routes to default or custom)
 */
function getTrafficSourceFields() {
  if (shouldUseCustomTrafficSource()) {
    return getCustomTrafficSourceFields();
  }
  return getDefaultTrafficSourceFields();
}

/**
 * Generate SQL for selecting traffic source fields
 * Returns comma-separated SELECT statements with aliases
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
 */
function getTrafficSourceColumnList() {
  const fields = getTrafficSourceFields();
  return Object.keys(fields).join(',\n  ');
}

/**
 * Generate ANY_VALUE aggregations for traffic source fields
 * Returns comma-separated ANY_VALUE statements for aggregation
 */
function getTrafficSourceAggregateSQL() {
  const fields = getTrafficSourceFields();
  return Object.keys(fields)
    .map(alias => `ANY_VALUE(${alias}) AS ${alias}`)
    .join(',\n    ');
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  shouldUseCustomTrafficSource,
  getDefaultTrafficSourceFields,
  getCustomTrafficSourceFields,
  getTrafficSourceFields,
  getTrafficSourceSelectSQL,
  getTrafficSourceColumnList,
  getTrafficSourceAggregateSQL
};