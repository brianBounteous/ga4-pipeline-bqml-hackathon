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

    declare({
      database: dataform.projectConfig.vars.SOURCE_PROJECT,
      schema: property.source_dataset,
      name: 'events_*',
    });

    // Only declare fresh_daily if at least one stream in this property uses it
    const propertyUsesFreshDaily = Object.values(property.streams).some(stream => {
      return stream.use_fresh_daily !== undefined ? stream.use_fresh_daily : config.USE_FRESH_DAILY;
    });

    if (propertyUsesFreshDaily) {
      declare({
        database: dataform.projectConfig.vars.SOURCE_PROJECT,
        schema: property.source_dataset,
        name: 'events_fresh_*',
      });
    }
  });

} else {
  // Simple mode: Single source from workflow settings (unchanged behavior)
  console.log('[DECLARATIONS] Simple mode: declaring single source from SOURCE_DATASET');

  declare({
    database: dataform.projectConfig.vars.SOURCE_PROJECT,
    schema: dataform.projectConfig.vars.SOURCE_DATASET,
    name: 'events_*',
  });

  if (config.USE_FRESH_DAILY) {
    declare({
      database: dataform.projectConfig.vars.SOURCE_PROJECT,
      schema: dataform.projectConfig.vars.SOURCE_DATASET,
      name: 'events_fresh_*',
    });
  }
}
