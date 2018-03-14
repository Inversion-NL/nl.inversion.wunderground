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
            ['km/u', ' kilometer per hour'],
            ['mph', ' miles per hour'],
            [' Z ', ' south '],
            [' S ', ' south '],
            [' ZW ', ' south west '],
            [' SW ', ' south west '],
            [' WZW ', ' west south west '],
            [' WSW ', ' west south west '],
            [' W ', ' west '],
            [' NW ', ' north west '],
            [' N ', ' north '],
            [' NO ', ' north east '],
            [' NE ', ' north east '],
            [' O ', ' east '],
            [' E ', ' east '],
            [' ZO ', ' south east '],
            [' SE ', ' south east '],
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
        Homey.log('Error while calculating the difference between ' + JSON.stringify(a) + ' and ' + JSON.stringify(b));
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

exports.epochToTimeFormatter = function (epoch) {
    if (epoch == null) epoch = new Date().getTime();
    return (new Date(epoch)).toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, '$1')
};
