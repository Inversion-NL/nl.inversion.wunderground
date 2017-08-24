const Log = require('homey-log').Log;
var tokens = [];
var tokensForecast = [];

const severity = {
    debug: 1,
    info: 2,
    warning: 3,
    error: 4,
    critical: 5
};
exports.severity = severity;

exports.updateGlobalTokens = function (weatherData) {
    if (tokens && tokens.length < 1) _registerGlobalTokens(weatherData);
    else _updateGlobalTokens(weatherData);
};

exports.updateGlobalForecastTokens = function (forecastData) {
    if (tokensForecast && tokensForecast.length < 1) _registerGlobalTokens(forecastData);
    else _updateGlobalTokens(weatherData);
};

function _updateGlobalTokens(weatherData) {
    Homey.log('Update tokens');

    for (i = tokens.length - 1; i >= 0; i--) {
        var token = tokens[i];
        token.setValue(weatherData[token.id], function(err) {
            if (err) return Homey.log('update token error: ' + JSON.stringify(err));
        });
    }
}

function _updateGlobalForecastTokens(forecastData) {
    Homey.log('Update forecast tokens');

    for (i = tokensForecast.length - 1; i >= 0; i--) {
        var token = tokensForecast[i];
        token.setValue(forecastData[token.id], function(err) {
            if (err) return Homey.log('update forecast token error: ' + JSON.stringify(err));
        });
    }
}


function _registerGlobalTokens(weatherData) {
    Homey.log('Register tokens');
    Homey.manager('flow').registerToken("weather_descr", {
        type: 'string',
        title: __("weather.weather_descr")
    }, function(err, token) {
        if (err) return Homey.log('weather_descr registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.weather_descr, function(err) {
            if (err) return Homey.log('weather_descr setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("relative_humidity", {
        type: 'number',
        title: __("weather.relative_humidity")
    }, function(err, token) {
        if (err) return Homey.log('relative_humidity registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.relative_humidity, function(err) {
            if (err) return Homey.log('relative_humidity setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("wind_dir", {
        type: 'string',
        title: __("weather.wind_dir")
    }, function(err, token) {
        if (err) return Homey.log('wind_dir registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.wind_dir, function(err) {
            if (err) return Homey.log('wind_dir setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("uv", {
        type: 'number',
        title: __("weather.uv")
    }, function(err, token) {
        if (err) return Homey.log('uv registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.uv, function(err) {
            if (err) return Homey.log('uv setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("temp", {
        type: 'number',
        title: __("weather.temp")
    }, function(err, token) {
        if (err) return Homey.log('temp registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.temp, function(err) {
            if (err) return Homey.log('temp setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("dewpoint", {
        type: 'number',
        title: __("weather.dewpoint")
    }, function(err, token) {
        if (err) return Homey.log('dewpoint registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.dewpoint, function(err) {
            if (err) return Homey.log('dewpoint setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("wind", {
        type: 'number',
        title: __("weather.wind")
    }, function(err, token) {
        if (err) return Homey.log('wind registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.wind, function(err) {
            if (err) return Homey.log('wind setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("visibility", {
        type: 'number',
        title: __("weather.visibility")
    }, function(err, token) {
        if (err) return Homey.log('visibility registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.visibility, function(err) {
            if (err) return Homey.log('visibility setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("precip_1hr", {
        type: 'number',
        title: __("weather.precip_1hr")
    }, function(err, token) {
        if (err) return Homey.log('precip_1hr registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.precip_1hr, function(err) {
            if (err) return Homey.log('precip_1hr setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });

    Homey.manager('flow').registerToken("precip_today", {
        type: 'number',
        title: __("weather.precip_today")
    }, function(err, token) {
        if (err) return Homey.log('precip_today registerToken error:' + JSON.stringify(err));

        token.setValue(weatherData.precip_today, function(err) {
            if (err) return Homey.log('precip_today setValue error:' + JSON.stringify(err));
        });
        tokens.push(token);

    });
}

function _registerGlobalForecastTokens(forecastData) {

}

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
 * Logs to Homey's log and exporting it to the app Homey Logger (if installed)
 * @param message Message to log
 */
exports.debugLog = function (message) {
    // Do not log empty lines to the Homey Logger app
    if (message != '') Homey.manager('api').realtime('WU Log', message);

    Homey.log('[' + this.epochToTimeFormatter() + ']', message)
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
