var util = require('./util.js');

const severity = util.severity;

/**
 * Helper function to parse float from a string
 * @param data
 * @returns {*} Returns 0 if unable to parse, otherwise the parsed floating value
 */
exports.parseWeatherFloat = function (data){
    var temp = parseFloat(data);
    if (isNaN(temp)) return 0;
    else return temp;
};

/**
 * Helper function to parse int from a string
 * @param data
 * @returns {*} Returns 0 if unable to parse, otherwise the parsed integer value
 */
exports.parseWeatherInt = function (data){
    var temp = parseInt(data);
    if (isNaN(temp)) return 0;
    else return temp;
};

/**
 * Helper function to test weather data
 * @param data Data to test
 * @returns {object} returns the weather object or a empty string the data was null or undefined
 */
exports.testWeatherData = function (data) {
    if (!util.value_exist(data)) {
        util.wuLog('Test weather data: Value was undefined or null, returning empty string', severity.debug);
        return "";
    }
    else return data;
};