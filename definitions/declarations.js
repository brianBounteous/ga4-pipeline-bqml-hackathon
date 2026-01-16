// Declare GA4 source tables
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