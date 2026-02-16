// ============================================================================
// SOURCE TABLE DECLARATIONS
// Owned by upstream repository
// ============================================================================

const helpers = require('../includes/helper.js');
const config = helpers.getConfig();

if (helpers.isAdvancedMode()) {
  // Advanced mode: Declare source tables for each property
  // Note: We declare each property's tables from their respective datasets
  // Tables are referenced in SQL using property-specific naming
  console.log('[DECLARATIONS] Advanced mode: declaring sources for multiple properties');

  Object.keys(config.PROPERTIES_CONFIG).forEach(propertyName => {
    const property = config.PROPERTIES_CONFIG[propertyName];

    console.log(`[DECLARATIONS] Property: ${propertyName}, Dataset: ${property.source_dataset}`);

    // We'll reference these in SQL using the construct:
    // `${dataform.projectConfig.vars.SOURCE_PROJECT}.${property.source_dataset}.events_*`
    // So we just need to declare them for dependency tracking
    declare({
      database: dataform.projectConfig.vars.SOURCE_PROJECT,
      schema: property.source_dataset,
      name: 'events_*',
    });

    declare({
      database: dataform.projectConfig.vars.SOURCE_PROJECT,
      schema: property.source_dataset,
      name: 'events_fresh_daily_*',
    });
  });

} else {
  // Simple mode: Single source from workflow settings (unchanged behavior)
  console.log('[DECLARATIONS] Simple mode: declaring single source from SOURCE_DATASET');

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
}
