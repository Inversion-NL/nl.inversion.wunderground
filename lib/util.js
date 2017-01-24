const Log = require('homey-log').Log;

const severity = {
    debug: 1,
    info: 2,
    warning: 3,
    error: 4,
    critical: 5
};
exports.severity = severity;

/**
 * Helper function to check if the variable is not undefined and null
 * @param string Variable to check
 * @returns {boolean} true when not undefined or null
 */
exports.value_exist = function (string) {
    //noinspection RedundantIfStatementJS
    if (typeof string != 'undefined' && string != null) return true;
    else return false;
};

/**
 * Logs the message to console.
 * When the severity is error or above the message will also be logged to Athom online logging (Sentry atm).
 * @param {string} message Message to log
 * @param {int} level Message priority level
 */
exports.wuLog = function (message, level) {
    if (!this.value_exist(level)) level = severity.debug;

    if (level >= severity.error) Log.captureMessage(message);
    this.debugLog(message);
};

/**
 * Helper function to generate unique ID
 * @returns {string} Returns unique ID
 */
exports.generateUniqueId = function () {
    var uuid = require('node-uuid');
    return uuid.v4();
};

/**
 * Helper function to have Homey read the full word instead of the abbreviation
 * @param text Abbreviation
 * @returns {string} Returns long word
 */
exports.parseAbbreviations = function (text) {
    // map with replace function parameters

    if (Homey.manager('i18n').getLanguage() == 'nl') {
        //noinspection SpellCheckingInspection,JSDuplicatedDeclaration
        var replaceMap = [
            ['km/u', ' kilometer per uur'],
            [' Z ', ' zuiden '],
            [' ZW ', ' zuidwesten '],
            [' WZW ', ' westzuidwesten '],
            [' W ', ' westen '],
            [' NW ', ' noordwesten '],
            [' N ', ' noorden '],
            [' NO ', ' noordoosten '],
            [' O ', ' oosten '],
            [' ZO ', ' zuidoosten '],
            [/(.*?\d+)(C)\b/gi, function(match, g1) { return g1 + ' graden celcius'} ]
        ]
    } else {
        //noinspection JSDuplicatedDeclaration
        var replaceMap = [
            ['mph', ' miles per hour'],
            [' S ', ' south '],
            [' SW ', ' south west '],
            [' WSW ', ' west south west '],
            [' W ', ' west '],
            [' NW ', ' north west '],
            [' N ', ' north '],
            [' NE ', ' north east '],
            [' E ', ' east '],
            [' ZO ', ' south east '],
            [/(.*?\d+)(C)\b/gi, function(match, g1) { return g1 + ' degrees celcius'} ]
        ]
    }

    var result = text;
    Object.keys(replaceMap).forEach(function (key) {
        result = result.replace(replaceMap[key][0], replaceMap[key][1])
    });

    return result;
};

/**
 * Helper function to convert epoch time to a date variable
 * @param epoch Epoch time (in milli seconds)
 * @returns {Date} Returns the date
 */
exports.epochToString = function (epoch) {
    var date = new Date(0);
    date.setUTCSeconds(epoch);
    return date;
};

/**
 * Helper function to calculates the difference between two values
 * @param a Value 1
 * @param b Value 2
 * @returns {number} Returns the difference, 0 if something went wrong
 */
exports.diff = function (a,b) {
    try {
        return Math.abs(a-b);
    } catch(err) {
        util.wuLog('Error while calculating the difference between ' + JSON.stringify(a) + ' and ' + JSON.stringify(b), severity.debug);
        return 0;
    }
};

/**
 * Helper function to check if a value is a integer
 * @param value Value to check
 * @returns {boolean} Returns true if integer
 */
exports.isInt = function (value) {
    return !isNaN(value) &&
        parseInt(Number(value)) == value &&
        !isNaN(parseInt(value, 10));
};

/**
 * Logs to Homey's log and exporting it to the app Homey Logger (if installed)
 * @param message Message to log
 */
exports.debugLog = function (message) {
    // Do not log empty lines to the Homey Logger app
    if (message != '') Homey.manager('api').realtime('WU Log', message);

    Homey.log('[' + this.epochToTimeFormatter() + ']', message)
};

exports.epochToTimeFormatter = function (epoch) {
    if (epoch == null) epoch = new Date().getTime();
    return (new Date(epoch)).toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, '$1')
};