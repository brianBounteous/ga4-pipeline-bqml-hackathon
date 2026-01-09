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

/**
 * Core user properties configuration
 * Defines which user properties to extract and their data types
 * Supported types: string, int, float, double
 */
const CORE_USER_PROPS_ARRAY = [
    {
        type: "string",
        name: "user_type"
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
    //     type: "string",
    //     name: "custom_size"
    // },
    // {
    //     type: "string",
    //     name: "custom_color"
    // },
    // {
    //     type: "double",
    //     name: "custom_discount_rate"
    // }
];

module.exports = { 
    CORE_PARAMS_ARRAY,
    CORE_USER_PROPS_ARRAY,
    CUSTOM_ITEMS_PARAMS
};
