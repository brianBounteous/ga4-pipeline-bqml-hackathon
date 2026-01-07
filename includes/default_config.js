/**
 * Core event parameters configuration
 * Defines which event parameters to extract and their data types
 * Supported types: string, int, float, double
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
        name: "firebase_conversion",
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
        name: "page_location",
        type: "string"
    },
    {
        name: "page_referrer",
        type: "string"
    },
    {
        name: "page_title",
        type: "string"
    },
    {
        name: "session_engaged",
        type: "string"
    }
   
];

module.exports = { CORE_PARAMS_ARRAY };