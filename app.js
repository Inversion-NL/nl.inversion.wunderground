"use strict";

const Wunderground = require('wundergroundnode');
const Log = require('homey-log').Log;
var wunderground;

// Enable full logging for more info
const fullLogging = false;

const defaultUpdateTime = 90;
const maxLocationGetTries = 3;
const insightsLogs = [
        "temp",
        "hum",
        "feelslike",
        "pressure",
        "wind",
        "wind_gust",
        "wind_degrees",
        "dewpoint",
        "precip_today",
        "precip_1hr",
        "uv",
        "visibility"
    ];
const severity = {
    debug: 1,
    info: 2,
    warning: 3,
    error: 4,
    critical: 5
};

var units_metric;
var weatherInterval;
var forecastInterval;
var update_frequency = defaultUpdateTime;
var locationGetCounter = 1;
var lat = null;
var lon = null;
var address;
var unitData = {};
var weatherData = {};
var forecastData = {};
var useErrorNotifications;

// Variables for when value has changed
var oldTemp;
var oldHum;

/**
 * Helper function to check if the variable is not undefined and null
 * @param string Variable to check
 * @returns {boolean} true when not undefined or null
 */
function value_exist(string) {
    //noinspection RedundantIfStatementJS
    if (typeof string != 'undefined' && string != null) return true;
    else return false;
}

/**
 * Helper function to test weather data
 * @param data Data to test
 * @returns {object} returns the weather object or a empty string the data was null or undefined
 */
function testWeatherData(data) {
    if (!value_exist(data)) {
        wuLog('Test weather data: Value was undefined or null, returning empty string', severity.debug);
        return "";
    }
    else return data;
}

/**
 * Helper function to test the Weather Underground response
 * @param err
 * @param result
 * @returns {boolean} True is everything is fine
 */
function testResponse(err, result){

    if (err) return true;

    var err_msg;
    try {
        // If error is in the response, something must have gone wrong
        err_msg = result.response.error.description;
        wuLog('test response error: ' + JSON.stringify(err_msg), severity.error);
        return true;
    } catch(err) {
        // If it catches the error it means that there is no result.response.error.description
        // so all is good
        if (fullLogging) wuLog('No error message found in weather request', severity.debug);
        return false;
    }
}

/**
 * Helper function to parse float from a string
 * @param data
 * @returns {*} Returns 0 if unable to parse, otherwise the parsed floating value
 */
function parseWeatherFloat(data) {
    var temp = parseFloat(data);
    if (isNaN(temp)) {
        if (fullLogging) wuLog('parseWeatherFloat', severity.debug);
        if (fullLogging) wuLog('Value was NaN, returning 0', severity.debug);
        return 0;
    }
    else return temp;
}

/**
 * Helper function to convert epoch time to a date variable
 * @param epoch Epoch time (in milli seconds)
 * @returns {Date} Returns the date
 */
function epochToString(epoch) {
    var date = new Date(0);
    date.setUTCSeconds(epoch);
    return date;
}

/**
 * Helper function to calculates the difference between two values
 * @param a Value 1
 * @param b Value 2
 * @returns {number} Returns the difference, 0 if something went wrong
 */
function diff(a,b) {
    try {
        return Math.abs(a-b);
    } catch(err) {
        wuLog('Error while calculating the difference between ' + JSON.stringify(a) + ' and ' + JSON.stringify(b), severity.debug);
        return 0;
    }
}

/**
 * Helper function to check if a value is a integer
 * @param value Value to check
 * @returns {boolean} Returns true if integer
 */
function isInt(value) {
  return !isNaN(value) &&
         parseInt(Number(value)) == value &&
         !isNaN(parseInt(value, 10));
}

var self = {
    // this `init` function will be run when Homey is done loading
    init: function() {

        wuLog("Initializing Weather Underground", severity.debug);
        wuLog("", severity.debug);

        self.checkInsightsLogs();

        // Listen for triggers and conditions
        registerTriggerAndConditionListeners();

        // Listen for speech input
        Homey.manager('speech-input').on('speech', parseSpeech);

        // Listen for changes in settings
        wuLog("Registering settings listener", severity.debug);
        Homey.manager('settings').on('set', self.settingsChanged);

        // Listen for Homey app warnings and performance triggers
        registerWarningAndPerformanceListeners();

        // Check settings and start updating weather
        self.checkSettings();

        // Print current date and time
        wuLog("Current time: " + new Date(), severity.debug);
    },

    scheduleWeather: function(update_frequency) {
        wuLog("", severity.debug);
        wuLog("Schedule weather", severity.debug);

        if (weatherInterval) {
            wuLog("Clearing current weatherInterval", severity.debug);
            clearInterval(weatherInterval);
        }

        if (update_frequency == null || update_frequency == 0 || isNaN(update_frequency)) {
            wuLog("Update_frequency out of bounds, reset to default: " + update_frequency, severity.debug);
            update_frequency = defaultUpdateTime;
        }

        var updateTime = update_frequency * 60 * 1000;  // From minutes to milliseconds
        weatherInterval = setInterval(trigger_update.bind(this), updateTime);
        function trigger_update() {
            wuLog("Triggering update", severity.debug);
            self.updateWeather();
        }
    },

    scheduleForecast: function(update_frequency) {
        wuLog("", severity.debug);
        wuLog("Schedule forecast", severity.debug);

        if (forecastInterval) {
            wuLog("Clearing current forecastInterval", severity.debug);
            clearInterval(forecastInterval);
        }

        if (update_frequency == null || update_frequency == 0 || isNaN(update_frequency)) {
            wuLog("Update_frequency out of bounds, reset to default: " + update_frequency, severity.debug);
            update_frequency = defaultUpdateTime;
        }

        var updateTime = update_frequency * 60 * 1000;  // From minutes to milliseconds
        forecastInterval = setInterval(trigger_update.bind(this), updateTime);
        function trigger_update() {
            self.updateForecast();
        }
    },

    setUnits: function() {
        if (fullLogging) wuLog('', severity.debug);
        if (fullLogging) wuLog('setUnits', severity.debug);

        units_metric = Homey.manager('settings').get('units_metric');
        var units_imperial = Homey.manager('settings').get('units_imperial');
        var units_auto = Homey.manager('settings').get('units_auto');
        var homey_units = Homey.manager('i18n').getUnits();

        if (units_auto && value_exist(homey_units) && homey_units != "") {
            Homey.manager('settings').set('currentSettingUnits', 'auto');
            if (homey_units == 'metric') {
                if (fullLogging) wuLog('Autodetect metric units', severity.debug);
                units_metric = true;
            } else {
                if (fullLogging) wuLog('Autodetect imperial units', severity.debug);
                units_metric = false;
            }
        } else if (!value_exist(units_auto) && !value_exist(units_metric) && !value_exist(units_imperial)) {
            // Something is wrong here, none of the radio buttons are checked!
            wuLog('No unit value existed, resetting to auto', severity.debug);
            Homey.manager('settings').set('units_auto', 'true');

            // Let check the units again
            self.setUnits();
            return;
        }

        if (units_metric) {
            //noinspection SpellCheckingInspection
            unitData = {
                temp_unit : "&degC",
                distance_unit : 'km',
                speed_unit : 'kmh',
                pressure_unit : 'mbar',
                distance_small_unit : 'mm'
            }
        } else {
            unitData = {
                temp_unit : "&degF",
                distance_unit : 'mi',
                speed_unit : 'mph',
                pressure_unit : 'inch',
                distance_small_unit : 'in'
            }
        }
    },

    checkSettings: function() {
        wuLog("", severity.debug);
        wuLog("Check settings", severity.debug);

        // Check units to use in app
        self.setUnits();

        // Check if user provided a key in settings
        const myKey = Homey.manager('settings').get('wundergroundKey');

        // Get user preference setting for notifications on errors
        useErrorNotifications = Homey.manager('settings').get('useErrorNotifications');
        if(!value_exist(useErrorNotifications)) useErrorNotifications = true;
        wuLog('Use error notifications: ' + useErrorNotifications, severity.debug);
        if (!value_exist(useErrorNotifications)) useErrorNotifications = true;

        // Check if there is a unique ID in settings, otherwise create one.
        // Used by Sentry logging without invading users privacy
        var uniqueUserId = Homey.manager('settings').get('uniqueUserId');
        if (!value_exist(uniqueUserId)) uniqueUserId = generateUniqueId();
        wuLog('Unique user ID: ' + JSON.stringify(uniqueUserId), severity.debug);
        Log.setUser(uniqueUserId);
        Homey.manager('settings').set('uniqueUserId', uniqueUserId);

        var usePersonalKey = false;
        if (!value_exist(myKey) || myKey == "") {
            wuLog("Using Weather Underground Inversion key", severity.debug);
            var inversionKey = Homey.env.WUNDERGROUND_KEY;
            if (value_exist(inversionKey)) self.initWunderground(inversionKey);
            else {
                wulog('Unable to get environment variable for WU key', severity.error);
                triggerError(__("app.messages.error_unable_getEnvironmentKey"));
            }
        } else {
            wuLog("Personal key defined by user", severity.debug);
            usePersonalKey = true;
            self.initWunderground(myKey);
            wuLog("Using Weather Underground personal key", severity.debug);
        }

        // Get user settings for update frequency
        update_frequency = Homey.manager('settings').get('updateFrequency');
        wuLog("Update every (user setting): " + update_frequency, severity.debug);

        if (!usePersonalKey) {
            // Using Inversion key, max update frequency is 60 minutes
            if (update_frequency < defaultUpdateTime || update_frequency > 1439 || !value_exist(update_frequency)) {
                if (fullLogging) wuLog("Update value out of bounds, resetting to default", severity.debug);
                update_frequency = defaultUpdateTime;                 // in minutes
                wuLog("Update value: " + update_frequency + " minutes", severity.debug);
            }
        } else {
            // Using user personal key
            if (update_frequency < 1 || update_frequency > 1439 || !value_exist(update_frequency)) {
                // Defaulting back to 60 minutes
                if (fullLogging) wuLog("Update value out of bounds: " + update_frequency + " minutes", severity.debug);
                update_frequency = defaultUpdateTime;                 // in minutes
                wuLog("Update value: " + update_frequency + " minutes", severity.debug);
            }
        }

        // Get user settings
        var country = Homey.manager('settings').get('country');
        var city = Homey.manager('settings').get('city');
        var autolocation = Homey.manager('settings').get('autolocation');

        if (!value_exist(autolocation) && !value_exist(city) && !value_exist(country)) {
            if (fullLogging) wuLog('One of the location information is invalid, falling back to auto location', severity.debug);
            autolocation = true;
            Homey.manager('settings').set('autolocation', true);
        }

        // Check user settings
        if (autolocation) {
            wuLog("Use Homey's location", severity.debug);
            if (value_exist(lat) && value_exist(lon) && lat != 0 && lon != 0 && lat != null && lon != null) {
                wuLog("Using lat lon for location", severity.debug);
                address = lat + ',' + lon;
                self.scheduleWeather(update_frequency);
                self.scheduleForecast(update_frequency);
            } else {
                wuLog("Lat lon data invalid", severity.debug);

                if (locationGetCounter <= maxLocationGetTries) {
                    wuLog("Fetching location, try " + locationGetCounter + " of " + maxLocationGetTries, severity.debug);
                    locationGetCounter++;
                    self.getLocation(function(err, location) {

                        if (!err && value_exist(location)) {
                            wuLog("Location found", severity.debug);
                            lat = location.latitude;
                            lon = location.longitude;
                            address = lat + ',' + lon;
                            self.scheduleWeather(update_frequency);
                            self.scheduleForecast(update_frequency);
                            // Found location, reset counter
                            locationGetCounter = 0;
                        } else {
                            if (fullLogging) wuLog("Location callback error " + JSON.stringify(err), severity.debug);
                            wuLog("Location not found, trying again", severity.debug);
                            self.checkSettings();
                        }
                    });
                } else if (value_exist(country) && value_exist(city) && country != "" && city != "") {
                    wuLog("Max location detection attempts reached, using country and city for location", severity.debug);
                    address = country + '/' + city;
                    self.scheduleWeather(update_frequency);
                    self.scheduleForecast(update_frequency);
                } else {
                    wuLog('Max location get attempts and no valid city and country, stopped updating weather', severity.error);
                    triggerError(__("app.messages.error_stop_updating"));
                }
            }
        } else if (value_exist(country) && value_exist(city) && country != "" && city != "") {
            address = "Netherlands/Amsterdam";
            wuLog("Using country and city for location", severity.debug);
            address = country + '/' + city;
            self.scheduleWeather(update_frequency);
            self.scheduleForecast(update_frequency);
        } else {
            wuLog("One of the country/city fields is empty, setting to autolocation which will trigger checkSettings() again", severity.debug);
            Homey.manager('settings').set('autolocation', true);
            self.scheduleWeather(update_frequency);
            self.scheduleForecast(update_frequency);
        }
    },

    initWunderground: function(key) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("initWunderground", severity.debug);
        if (wunderground != null) {
            if (fullLogging) wuLog("wunderground != null", severity.debug);
            //wunderground = null;
        }

        var language = Homey.manager('i18n').getLanguage();
        if (!value_exist(language)) language = 'EN';
        wuLog('Setting language to ' + JSON.stringify(language), severity.debug);
        wunderground = new Wunderground(key, language);
    },

    settingsChanged: function(settingName) {
        wuLog("", severity.debug);
        // Not interested in currentSettingUnits changes
        //noinspection SpellCheckingInspection
        if (settingName != "currentSettingUnits" || settingName != "currentsettingunits") {
            wuLog("Setting has changed " + JSON.stringify(settingName), severity.debug);
        }

        // Homey v 0.8.35 has a bug where all variables are lower case
        if (settingName == "currentSettingUnits" || settingName == "currentSettingUnits") {
            // Don't do anything when this setting has changed or it will cause a loop
        } else if (settingName == 'updateFrequency' || settingName == 'updateFrequency') {
            // If the frequency is changed we have to cancel the current interval and schedule a new
            self.checkSettings();
            wuLog("Scheduling weather update every:" + update_frequency, severity.debug);
            self.scheduleWeather(update_frequency);
        } else if (settingName == 'units_auto' || settingName == 'units_imperial' || settingName == 'units_metric') {
            // Let's check if the units have changed
            var units_metric = Homey.manager('settings').get('units_metric');
            if (fullLogging) wuLog('units_metric:' + units_metric, severity.debug);
            var units_imperial = Homey.manager('settings').get('units_imperial');
            if (fullLogging) wuLog('units_imperial:' + units_imperial, severity.debug);
            var units_auto = Homey.manager('settings').get('units_auto');
            if (fullLogging) wuLog('units_auto:' + units_auto, severity.debug);
            var currentSettingUnits = Homey.manager('settings').get('currentSettingUnits');
            if (fullLogging) wuLog('currentSettingUnits:' + currentSettingUnits, severity.debug);

            if (units_metric && value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'metric') {
                    // Setting has changed, delete all Insights logs!
                    wuLog('Units setting has changed, going to delete all Insights logs!', severity.debug);
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'metric');
                }
            } else if (units_imperial && value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'imperial') {
                    // Setting has changed, delete all Insights logs!
                    wuLog('Units setting has changed, going to delete all Insights logs!', severity.debug);
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'imperial');
                }
            } else if (units_auto && value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'auto') {
                    // Setting has changed, delete all Insights logs!
                    wuLog('Units setting has changed, going to delete all Insights logs!', severity.debug);
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'auto');
                }
            } else {
                // Something is wrong here, reset to auto units
                wuLog('No unit radio button was checked, setting to auto units', severity.debug);
                Homey.manager('settings').set('units_metric', false);
                Homey.manager('settings').set('units_imperial', false);
                Homey.manager('settings').set('units_auto', true);
                Homey.manager('settings').set('currentSettingUnits', 'auto');
            }
        } else {
            self.checkSettings();
        }
    },

    unload: function() {
        if (fullLogging) wuLog('', severity.debug);
        if (fullLogging) wuLog('unload', severity.debug);
        if (wunderground != null) {
            if (fullLogging) wuLog("wunderground != null, closing wunderground", severity.debug);
            wunderground = null;
        }
    },

    //get location
    getLocation: function(callback) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("getLocation", severity.debug);

        Homey.manager('geolocation').getLocation(function(err, location) {
            if (value_exist(location)) {
                if (!value_exist(location.latitude) || location.latitude == 0) {
                    if (fullLogging) wuLog("Location " + JSON.stringify(location), severity.debug);
                    if (fullLogging) wuLog("Location is undefined", severity.debug);
                    callback(true, null);
                } else {
                    if (fullLogging) wuLog("location found: " + JSON.stringify(location), severity.debug);
                    callback(false, location);
                }
            } else callback(true, null);
        });
    },

    // update the forecast
    updateForecast: function() {
        wuLog("", severity.debug);
        wuLog("Update forecast", severity.debug);
        wuLog('Requesting for location ' + JSON.stringify(address), severity.debug);

        if (!value_exist(address)) {
            wuLog('No valid address data, not fetching forecast', severity.debug);
            return;
        }

        // Get forecast data
        wunderground.forecast().request(address, function(err, response) {
            wuLog("", severity.debug);
            wuLog("updateForecast response", severity.debug);

            var error = testResponse(err, response);

            if (response && !error && response.forecast && response.forecast.txt_forecast) {
                forecastData = response.forecast.txt_forecast.forecastday;
            } else {
                wuLog('Error while receiving weather forecast: ' + JSON.stringify(err), severity.error);
                triggerError("Error while receiving weather forecast " + JSON.stringify(err));
            }
        });
    },

    // update the weather
    updateWeather: function() {
        wuLog("", severity.debug);
        wuLog("Update Weather", severity.debug);
        wuLog('Requesting for location ' + JSON.stringify(address), severity.debug);
        if (!value_exist(address)) {
            wuLog('No valid address data, not updating weather', severity.error);
            return;
        }

        // Get weather data
        wunderground.conditions().request(address, function(err, response) {

            var error = testResponse(err, response);

            if (response && !error && value_exist(response.current_observation)) {

                var hum = testWeatherData(response.current_observation.relative_humidity);
                var hum_float = 0;
                try {
                    // Cut % sign and convert to float
                    hum_float = parseWeatherFloat(hum.substr(0, (hum.length -1)));
                } catch(err) {
                    wuLog("Error while parsing relative_humidity to float, setting to 0", severity.error);
                }

                var temp, feelslike, dewpoint, pressure, wind, wind_gust, visibility, precip_1hr, precip_today;

                // Use correct user units
                if (units_metric) {
                    if (fullLogging) wuLog('Using metric units', severity.debug);
                    temp = parseWeatherFloat(testWeatherData(response.current_observation.temp_c));
                    feelslike = parseWeatherFloat(testWeatherData(response.current_observation.feelslike_c));
                    dewpoint = parseWeatherFloat(testWeatherData(response.current_observation.dewpoint_c));
                    pressure = parseWeatherFloat(testWeatherData(response.current_observation.pressure_mb));
                    wind = parseWeatherFloat(testWeatherData(response.current_observation.wind_kph));
                    wind_gust = parseWeatherFloat(testWeatherData(response.current_observation.wind_gust_kph));
                    visibility = parseWeatherFloat(testWeatherData(response.current_observation.visibility_km));
                    precip_1hr = parseWeatherFloat(testWeatherData(response.current_observation.precip_1hr_metric));
                    precip_today = parseWeatherFloat(testWeatherData(response.current_observation.precip_today_metric));
                } else {
                    if (fullLogging) wuLog('Using imperial units', severity.debug);
                    temp = parseWeatherFloat(testWeatherData(response.current_observation.temp_f));
                    feelslike = parseWeatherFloat(testWeatherData(response.current_observation.feelslike_f));
                    dewpoint = parseWeatherFloat(testWeatherData(response.current_observation.dewpoint_f));
                    pressure = parseWeatherFloat(testWeatherData(response.current_observation.pressure_in));
                    wind = parseWeatherFloat(testWeatherData(response.current_observation.wind_mph));
                    wind_gust = parseWeatherFloat(testWeatherData(response.current_observation.wind_gust_mph));
                    visibility = parseWeatherFloat(testWeatherData(response.current_observation.visibility_mi));
                    precip_1hr = parseWeatherFloat(testWeatherData(response.current_observation.precip_1hr_in));
                    precip_today = parseWeatherFloat(testWeatherData(response.current_observation.precip_today_in));
                }

                // Reset values they are below zero
                var uv = parseWeatherFloat(testWeatherData(response.current_observation.UV));
                if (uv < 0) uv = 0;

                weatherData = {
                    city: testWeatherData(response.current_observation.display_location.city),
                    country: testWeatherData(response.current_observation.display_location.country),
                    weather_descr: testWeatherData(response.current_observation.weather),
                    relative_humidity: hum_float,
                    observation_epoch: testWeatherData(response.current_observation.observation_epoch),
                    wind_degrees: parseWeatherFloat((testWeatherData(response.current_observation.wind_degrees))),
                    wind_dir: testWeatherData(response.current_observation.wind_dir),
                    uv: uv,
                    temp: temp,
                    feelslike: feelslike,
                    dewpoint: dewpoint,
                    pressure: pressure,
                    wind: wind,
                    wind_gust: wind_gust,
                    visibility: visibility,
                    precip_1hr: precip_1hr,
                    precip_today: precip_today
                };

                wuLog("Current time: " + new Date(), severity.debug);
                wuLog("Observation time: " + epochToString(weatherData.observation_epoch), severity.debug);
                if (fullLogging) wuLog("Weather data: " + JSON.stringify(weatherData), severity.debug);

                // Temperature triggers and conditions
                if (value_exist(weatherData.temp)) {

                    if (fullLogging) wuLog("Temp: " + JSON.stringify(weatherData.temp), severity.debug);
                    if (fullLogging) wuLog("Old temp: " + JSON.stringify(oldTemp), severity.debug);

                    // Determine if the temp has changed
                    if (!value_exist(oldTemp)){
                        if (fullLogging) wuLog("No oldTemp value exists, maybe it's the first start of app", severity.debug);
                        // First time update after reboot/install
                        oldTemp = weatherData.temp;
                    } else if (diff(oldTemp, weatherData.temp) >= 1) {
                        // Only trigger when difference is equal or more then 1 degree
                        if (fullLogging) wuLog("oldTemp: " + oldTemp + " temp: " + weatherData.temp, severity.debug);
                        oldTemp = weatherData.temp;
                        self.tempChanged(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                    }

                    // Start trigger
                    self.tempAboveBelow(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                } else {
                    // No temperature data available!
                    wuLog("Temperature is undefined!", severity.debug)
                }

                // Humidity triggers and conditions
                if (value_exist(weatherData.relative_humidity)) {
                    // Determine if the hum has changed
                    if (!value_exist(oldHum)){
                        // First time update after reboot/install
                        oldHum = weatherData.relative_humidity;
                    } else if (diff(oldHum, weatherData.relative_humidity) >= 1) {
                        // Only trigger when difference is equal or more then 1 percent
                        if (fullLogging) wuLog("oldHum: " + oldHum + " hum: " + weatherData.relative_humidity, severity.debug);
                        oldHum = weatherData.relative_humidity;
                        self.humChanged(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                    }

                    // Start trigger
                    self.humAboveBelow(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                } else {
                    // No humidity data available!
                    wuLog("Humidity is undefined!", severity.debug)
                }

                // UV triggers and conditions
                if (value_exist(weatherData.uv)) {
                    // Start trigger
                    self.uvAboveBelow(weatherData.uv);
                } else {
                    // No UV data available!
                    wuLog("UV is undefined!", severity.debug)
                }

                // Wind triggers and conditions
                if (value_exist(weatherData.wind)) {
                    // Start trigger
                    self.windAboveBelow(weatherData.wind);
                } else {
                    // No wind data available!
                    wuLog("Wind is undefined!", severity.debug)
                }

                // Wind gust triggers and conditions
                if (value_exist(weatherData.wind_gust)) {
                    // Start trigger
                    self.windgustAboveBelow(weatherData.wind_gust);
                } else {
                    // No wind_gust data available!
                    wuLog("Wind_gust is undefined!", severity.debug)
                }

                // Add data to insights
                self.addInsightsEntry("temp", weatherData.temp);
                self.addInsightsEntry("hum", hum_float);
                self.addInsightsEntry("feelslike", weatherData.feelslike);
                self.addInsightsEntry("pressure", weatherData.pressure);
                self.addInsightsEntry("wind", weatherData.wind);
                self.addInsightsEntry("wind_gust", weatherData.wind_gust);
                self.addInsightsEntry("wind_degrees", weatherData.wind_degrees);
                self.addInsightsEntry("dewpoint", weatherData.dewpoint);
                self.addInsightsEntry("precip_today", weatherData.precip_today);
                self.addInsightsEntry("precip_1hr", weatherData.precip_1hr);
                self.addInsightsEntry("uv", weatherData.uv);
                self.addInsightsEntry("visibility", weatherData.visibility);

            } else {
                wuLog('Wunderground request error: ' + JSON.stringify(response), severity.error);
                triggerError("Wunderground request error: " + JSON.stringify(response));
            }
        }
      )
    },

    // Handler for temp status changes
    tempChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        if (fullLogging) wuLog("Sending trigger temp_changed with tokens: " + JSON.stringify(tokens), severity.debug);
        Homey.manager('flow').trigger('temp_changed', tokens);
    },

    // Handler for temp status changes
    humChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        if (fullLogging) wuLog("Sending trigger hum_changed with tokens: " + JSON.stringify(tokens), severity.debug);
        Homey.manager('flow').trigger('hum_changed', tokens);
    },

    // Handler for temp above and below triggers
    tempAboveBelow: function(temp, hum, weather_descr) {
        if (fullLogging) wuLog('', severity.debug);
        if (fullLogging) wuLog('tempAboveBelow', severity.debug);
        if (fullLogging) wuLog('temp ' + JSON.stringify(temp), severity.debug);
        if (fullLogging) wuLog('hum ' + JSON.stringify(hum), severity.debug);
        if (fullLogging) wuLog('weather_descr ' + JSON.stringify(weather_descr), severity.debug);
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        Homey.manager('flow').trigger('temp_above', tokens);
        Homey.manager('flow').trigger('temp_below', tokens);
    },

    // Handler for humidity triggers and conditions
    humAboveBelow: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        Homey.manager('flow').trigger('hum_above', tokens);
        Homey.manager('flow').trigger('hum_below', tokens);
    },

    // Handler for UV triggers and conditions
    uvAboveBelow: function(uv) {
        var tokens = {'uv': uv};
        Homey.manager('flow').trigger('uv_above', tokens);
        Homey.manager('flow').trigger('uv_below', tokens);
    },

    // Handler for wind triggers and conditions
    windAboveBelow: function(wind) {
        var tokens = {'wind': wind};
        Homey.manager('flow').trigger('wind_above', tokens);
        Homey.manager('flow').trigger('wind_below', tokens);
    },

    // Handler for wind triggers and conditions
    windgustAboveBelow: function(windgust) {
        var tokens = {'wind_gust': windgust};
        Homey.manager('flow').trigger('windgust_above', tokens);
        Homey.manager('flow').trigger('windgust_below', tokens);
    },

    deleteInsightsLog: function(log) {
        wuLog("Deleting log " + log, severity.debug);

        Homey.manager('insights').deleteLog(log, function callback(err){
            if (err) {
                triggerError(__("app.messages.error_deletingInsightsLog") + JSON.stringify(err));
                wuLog('Error while deleting Insights log: ' + JSON.stringify(err), severity.error);
                return Homey.error(err);
            }
            else wuLog("Log " + log + " deleted", severity.debug);
        });
    },

    deleteAllInsightsLogs: function() {
        wuLog("", severity.debug);
        wuLog("deleteAllInsightsLogs", severity.debug);

        Homey.manager('insights').getLogs(function callback(err, logs) {
            if (err) {
                triggerError(__("app.messages.error_deletingInsightsLog") + JSON.stringify(err));
                wuLog('Error while deleting all Insights log: ' + JSON.stringify(err), severity.error);
                return Homey.error(err);
            }
            else {
                for (var l in logs) {
                    //noinspection JSUnfilteredForInLoop
                    self.deleteInsightsLog(logs[l]);
                }
            }
        });
    },

    checkInsightsLogs: function() {
        wuLog("", severity.debug);
        wuLog("checkInsightsLogs", severity.debug);

        // self.deleteInsightsLog("precip_today");

        Homey.manager('insights').getLogs(function callback(err, logs) {
            if (err) {
                // Error, let's create them all
                wuLog("Error getting the Insights logs, (re)create all Insights logs", severity.error);
                //noinspection JSDuplicatedDeclaration
                for (var l in insightsLogs) {
                    //noinspection JSUnfilteredForInLoop
                    self.createInsightsLogs(insightsLogs[l]);
                }
                return Homey.error(err);
            } else {
                var currentInsightLogs = [];
                // Let's check if the logs on Homey should be there
                //noinspection JSDuplicatedDeclaration
                for (var l in logs) {
                    // Add current Homey log names to array
                    //noinspection JSUnfilteredForInLoop
                    currentInsightLogs.push(logs[l].name);

                    //noinspection JSUnfilteredForInLoop
                    if (insightsLogs.indexOf(logs[l].name) < 0) {
                        //noinspection JSUnfilteredForInLoop
                        wuLog("Log " + logs[l].name + " is old and will be deleted", severity.debug);
                        //noinspection JSUnfilteredForInLoop
                        self.deleteInsightsLog(logs[l].name);
                    }
                }
                // Let's check all required logs are there on Homey
                //noinspection JSDuplicatedDeclaration
                for (var l in insightsLogs) {
                    //noinspection JSUnfilteredForInLoop
                    if (currentInsightLogs.indexOf(insightsLogs[l]) < 0) {
                        //noinspection JSUnfilteredForInLoop
                        wuLog("Log " + insightsLogs[l] + " is not on Homey", severity.debug);
                        //noinspection JSUnfilteredForInLoop
                        self.createInsightsLogs(insightsLogs[l]);
                    }
                }
            }
        });
    },

    createInsightsLogs: function(log) {
        wuLog("", severity.debug);
        wuLog("Create Insights log: " + log, severity.debug);
        if (fullLogging) wuLog("Metric units" + units_metric, severity.debug);

        var temp_unit = unitData.temp_unit;
        var distance_unit = unitData.distance_unit;
        var speed_unit = unitData.speed_unit;
        var pressure_unit = unitData.pressure_unit;
        var distance_small_unit = unitData.distance_small_unit;

        switch(log) {
            case 'temp':
                Homey.manager('insights').createLog('temp', {
                label: {
                    en: 'Temperature',
                    nl: 'Temperatuur'
                },
                type: 'number',
                units: {
                    en: temp_unit,
                    nl: temp_unit
                },
                decimals: 2
                },
                function callback(err){
                    if (err) {
                        wuLog('createLog temp error', severity.error);
                        return Homey.error(err);
                    }
                });
                break;

            case 'hum':
                Homey.manager('insights').createLog('hum', {
                label: {
                    en: 'Humidity (relative)',
                    nl: 'Vochtigheid (relatieve)'
                },
                type: 'number',
                units: {
                    en: '%',
                    nl: '%'
                },
                decimals: 0
                },
                function callback(err){
                    if (err) {
                        wuLog('createLog hum error', severity.error);
                        return Homey.error(err);
                    }
                });
                break;

            case 'feelslike':
                Homey.manager('insights').createLog('feelslike', {
                    label: {
                        en: 'Feels like',
                        nl: 'Gevoelstemperatuur'
                    },
                    type: 'number',
                    units: {
                        en: temp_unit,
                        nl: temp_unit
                    },
                    decimals: 2
                    },
                    function callback(err){
                        if (err) {
                            wuLog('createLog feelslike error', severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case 'pressure':
                Homey.manager('insights').createLog('pressure', {
                    label: {
                        en: 'Pressure',
                        nl: 'Luchtdruk'
                    },
                    type: 'number',
                    units: {
                        en: pressure_unit,
                        nl: pressure_unit
                    },
                    decimals: 2
                    },
                    function callback(err){
                        if (err) {
                            wuLog('createLog pressure error', severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case 'wind':
                Homey.manager('insights').createLog('wind', {
                    label: {
                        en: 'Wind speed',
                        nl: 'Windsnelheid'
                    },
                    type: 'number',
                    units: {
                        en: speed_unit,
                        nl: speed_unit
                    },
                    decimals: 2
                    },
                    function callback(err){
                        if (err) {
                            wuLog('createLog wind error', severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case 'wind_gust':
                Homey.manager('insights').createLog('wind_gust', {
                    label: {
                        en: 'Wind gust',
                        nl: 'Windstoten'
                    },
                    type: 'number',
                    units: {
                        en: speed_unit,
                        nl: speed_unit
                    },
                    decimals: 2
                    },
                    function callback(err){
                        if (err) {
                            wuLog('createLog wind_gust error', severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case 'wind_degrees':
                Homey.manager('insights').createLog('wind_degrees', {
                    label: {
                        en: 'Wind direction',
                        nl: 'Windrichting'
                    },
                    type: 'number',
                    units: {
                        en: 'degrees',
                        nl: 'graden'
                    },
                    decimals: 0
                    },
                    function callback(err){
                        if (err) {
                            wuLog('createLog wind_degrees error', severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case 'dewpoint':
                Homey.manager('insights').createLog('dewpoint', {
                    label: {
                        en: 'Dew point',
                        nl: 'Dauwpunt'
                    },
                    type: 'number',
                    units: {
                        en: temp_unit,
                        nl: temp_unit
                    },
                    decimals: 0
                    },
                    function callback(err){
                        if (err) {
                            wuLog('createLog dewpoint error', severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case "precip_today":
                Homey.manager('insights').createLog('precip_today', {
                    label: {
                        en: 'Precipitation (today)',
                        nl: 'Neerslag (vandaag)'
                    },
                    type: 'number',
                    units: {
                        en: distance_small_unit,
                        nl: distance_small_unit
                    },
                    decimals: 2
                    },
                    function callback(err){
                        if (err) {
                            wuLog("createLog precip_today error", severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case "precip_1hr":
                Homey.manager('insights').createLog('precip_1hr', {
                    label: {
                        en: 'Precipitation (1hr)',
                        nl: 'Neerslag (1uur)'
                    },
                    type: 'number',
                    units: {
                        en: distance_small_unit,
                        nl: distance_small_unit
                    },
                    decimals: 2
                    },
                    function callback(err){
                        if (err) {
                            wuLog("createLog precip_1hr error", severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case "uv":
                Homey.manager('insights').createLog('uv', {
                    label: {
                        en: 'UV',
                        nl: 'UV'
                    },
                    type: 'number',
                    decimals: 0
                    },
                    function callback(err){
                        if (err) {
                            wuLog("createLog uv error", severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            case "visibility":
                Homey.manager('insights').createLog('visibility', {
                    label: {
                        en: 'Visibility',
                        nl: 'Zicht'
                    },
                    type: 'number',
                    units: {
                        en: distance_unit,
                        nl: distance_unit
                    },
                    decimals: 2
                    },
                    function callback(err){
                        if (err) {
                            wuLog("createLog visibility error", severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            default:
                wuLog("Create Insights log default switch-case was hit which means one log wasn't created!", severity.error);
                break;
        }
    },

    addInsightsEntry: function(logName, value) {
        Homey.manager('insights').createEntry(logName, value, new Date(), function(err){
            if (err) wuLog('Error creating Insights entry: ' + JSON.stringify(err), severity.debug);
        })
    }
};

function registerTriggerAndConditionListeners() {
    wuLog("Registering trigger and condition listeners", severity.debug);

    Homey.manager('flow').on('trigger.temp_above', tempAbove);
    Homey.manager('flow').on('condition.temp_above', tempAbove);
    Homey.manager('flow').on('trigger.temp_below', tempBelow);
    Homey.manager('flow').on('condition.temp_below', tempBelow);

    Homey.manager('flow').on('trigger.hum_above', humAbove);
    Homey.manager('flow').on('condition.hum_above', humAbove);
    Homey.manager('flow').on('trigger.hum_below', humBelow);
    Homey.manager('flow').on('condition.hum_below', humBelow);

    Homey.manager('flow').on('trigger.uv_above', uvAbove);
    Homey.manager('flow').on('condition.uv_above', uvAbove);
    Homey.manager('flow').on('trigger.uv_below', uvBelow);
    Homey.manager('flow').on('condition.uv_below', uvBelow);

    Homey.manager('flow').on('trigger.wind_above', windAbove);
    Homey.manager('flow').on('condition.wind_above', windAbove);
    Homey.manager('flow').on('trigger.wind_below', windBelow);
    Homey.manager('flow').on('condition.wind_below', windBelow);

    Homey.manager('flow').on('trigger.windgust_above', windgustAbove);
    Homey.manager('flow').on('condition.windgust_above', windgustAbove);
    Homey.manager('flow').on('trigger.windgust_below', windgustBelow);
    Homey.manager('flow').on('condition.windgust_below', windgustBelow);

    Homey.manager('flow').on('action.readForecast_today', readForecast_today);
    Homey.manager('flow').on('action.readForecast_tonight', readForecast_tonight);
    Homey.manager('flow').on('action.readForecast_tomorrow', readForecast_tomorrow);
    Homey.manager('flow').on('action.readForecast_tomorrowNight', readForecast_tomorrowNight);
    Homey.manager('flow').on('action.readForecast_dayAfterTomorrow', readForecast_dayAfterTomorrow);
    Homey.manager('flow').on('action.readRain_hour', readRain_hour);
    Homey.manager('flow').on('action.readRain_today', readRain_today);

    function tempAbove(callback, args) {
            if (weatherData.temp > args.variable) callback(null, true);
            else callback(null, false);
    }

    function tempBelow(callback, args) {
        if (weatherData.temp < args.variable) callback(null, true);
        else callback(null, false);
    }

    function humAbove(callback, args) {
        if (weatherData.relative_humidity > args.variable) callback(null, true);
        else callback(null, false);
    }

    function humBelow(callback, args) {
        if (weatherData.relative_humidity < args.variable) callback(null, true);
        else callback(null, false);
    }

    function uvAbove(callback, args) {
        if (weatherData.uv > args.variable) callback(null, true);
        else callback(null, false);
    }

    function uvBelow(callback, args) {
        if (weatherData.uv < args.variable) callback(null, true);
        else callback(null, false);
    }

    function windAbove(callback, args) {
        if (weatherData.wind > args.variable) callback(null, true);
        else callback(null, false);
    }

    function windBelow(callback, args) {
        if (weatherData.wind < args.variable) callback(null, true);
        else callback(null, false);
    }

    function windgustAbove(callback, args) {
        if (weatherData.wind_gust > args.variable) callback(null, true);
        else callback(null, false);
    }

    function windgustBelow(callback, args) {
        if (weatherData.wind_gust < args.variable) callback(null, true);
        else callback(null, false);
    }

    function readForecast_today(callback, args) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("function readForecast_today", severity.debug);
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(0);
            callback(null, true);
        } else {
            wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tonight(callback, args) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("function readForecast_tonight", severity.debug);
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(1);
            callback(null, true);
        } else {
            wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tomorrow(callback, args) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("function readForecast_tomorrow", severity.debug);
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(2);
            callback(null, true);
        } else {
            wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tomorrowNight(callback, args) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("function readForecast_tomorrowNight", severity.debug);
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(3);
            callback(null, true);
        } else {
            wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_dayAfterTomorrow(callback, args) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("function readForecast_tomorrowNight", severity.debug);
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(5);
            callback(null, true);
        } else {
            wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readRain_hour(callback, args) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("function readForecast_tomorrow", severity.debug);
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(2);
            callback(null, true);
        } else {
            wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readRain_today(callback, args) {
        if (fullLogging) wuLog("", severity.debug);
        if (fullLogging) wuLog("function readForecast_tomorrowNight", severity.debug);
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(3);
            callback(null, true);
        } else {
            wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    /**
     * Helper function to read the forecast for a specific day in the correct units
     * @param day Number of the day to read the forecast for
     */
    function readForecast(day) {
        var forecastText;
        if (isInt(day)) {
            if (units_metric)
                forecastText = forecastData[day].fcttext_metric;
            else
                forecastText = forecastData[day].fcttext;

            wuLog('forecast text ' + JSON.stringify(forecastText), severity.debug);

            if (value_exist(forecastText)) Homey.manager('speech-output').say(forecastText);
            else {
                wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
                Homey.manager('speech-output').say(__("app.speech.somethingWrong"));
            }
        } else wuLog("Read forecast day is not a integer", severity.error);
    }
}

/**
 * Helper function to register the unload of the app
 */
function registerWarningAndPerformanceListeners() {
    try {
        wuLog("Registering app unload listener", severity.debug);
        Homey.on('unload', self.unload);
    } catch (err) {
        wuLog('Registration for one of the app warning and performance listeners failed!', severity.error);
    }
}

function parseSpeech(speech, callback) {
    wuLog("", severity.debug);
    wuLog("parseSpeech", severity.debug);

    // On very first start units aren't always there yet
    if (!value_exist(units_metric)) {
        units_metric = Homey.manager('settings').get('units_metric');
        var units_imperial = Homey.manager('settings').get('units_imperial');
        var units_auto = Homey.manager('settings').get('units_auto');
        var homey_units = Homey.manager('i18n').getUnits();

        if (units_auto && value_exist(homey_units) && homey_units != "") {
            Homey.manager('settings').set('currentSettingUnits', 'auto');
            if (homey_units == 'metric') {
                if (fullLogging) wuLog('Autodetect metric units', severity.debug);
                units_metric = true;
            } else {
                if (fullLogging) wuLog('Autodetect imperial units', severity.debug);
                units_metric = false;
            }
        }
    }

    self.updateForecast();
    self.updateWeather();

    if (value_exist(forecastData) && forecastData.length > 0 && value_exist(weatherData) && Object.keys(weatherData).length > 0) {
        wuLog("Weather and forecast data available", severity.debug);

        /* Units available:
         var temp_unit = unitData.temp_unit;
         var distance_unit = unitData.distance_unit;
         var speed_unit = unitData.speed_unit;
         var pressure_unit = unitData.pressure_unit;
         var distance_small_unit = unitData.distance_small_unit;
         */

        speech.triggers.some(function (trigger) {

            var text;

            switch (trigger.id) {
                case 'weather_tomorrow' :
                    wuLog("weather_tomorrow", severity.debug);

                    if (units_metric)
                        text = forecastData[2].fcttext_metric;
                    else
                        text = forecastData[2].fcttext;

                    speech.say(parseAbbreviations(text));
                    callback(null, true);
                    return true;

                case 'weather_dayAfterTomorrow' :
                    wuLog("weather_dayAfterTomorrow", severity.debug);

                    if (units_metric)
                        text = forecastData[4].fcttext_metric;
                    else
                        text = forecastData[4].fcttext;

                    speech.say(parseAbbreviations(text));
                    callback(null, true);
                    return true;

                case 'weather_today' :
                    wuLog("weather_today", severity.debug);

                    if (units_metric)
                        text = forecastData[0].fcttext_metric;
                    else
                        text = forecastData[0].fcttext;

                    speech.say(parseAbbreviations(text));
                    callback(null, true);
                    return true;

                case 'rain_today' :
                    wuLog("rain_today", severity.debug);
                    text = __("app.speech.rainToday") + " " + weatherData.precip_today + unitData.distance_small_unit;
                    speech.say(parseAbbreviations(text));
                    text = "";
                    callback(null, true);
                    return true;

                case 'rain_hour' :
                    wuLog("rain_hour", severity.debug);
                    text = __("app.speech.rainToday") + " " + weatherData.precip_1hr + unitData.distance_small_unit;
                    speech.say(parseAbbreviations(text));
                    text = "";
                    callback(null, true);
                    return true;

                default:
                    // Guess it wasn't meant for this app, return that in the callback
                    callback(true, null);
            }
        });
    } else {
        if (fullLogging) wuLog("!! Weather and forecast not available", severity.debug);
        speech.say(__("app.speech.weatherDataNotAvailableYet"));
        callback(null, true);
    }
}

/**
 * Helper function to test Weather Underground settings
 * @param callback Callback to call back to with the result
 * @param args Arguments, like key, address etc
 */
function testWU(callback, args) {
    wuLog("", severity.debug);
    wuLog("TestWU API call", severity.debug);

    var Wunderground = require('wundergroundnode');
    var wundergroundKey = args.body.wundergroundkey;
    var address = args.body.address;
    var language = Homey.manager('i18n').getLanguage();

    wuLog('Testing for location: ' + JSON.stringify(address), severity.debug);

    if (!value_exist(wundergroundKey) || wundergroundKey == "" || wundergroundKey == null) {
        if (fullLogging) wuLog("Weather underground key is empty, using Inversion key", severity.debug);
        wundergroundKey = Homey.env.WUNDERGROUND_KEY;
    } else wuLog('Using user defined Weather Underground key', severity.debug);

    var wunderground = new Wunderground(wundergroundKey, language);

    if (address && value_exist(address)) {
        // Get weather data
        try {
            wunderground.conditions().request(address, function(err, response) {

                var error = false;
                var err_msg = '';

                try {
                    // If error is in the response, something must have gone wrong
                    //noinspection JSUnusedAssignment
                    err_msg = response.response.error.description;
                    error = true;
                } catch(err) {
                    // No error message found so this looks good
                    error = false;
                }

                if (!error) {
                    // If still okay, let's test something else
                    try {
                        // Let's test for another possible error
                        //noinspection JSDuplicatedDeclaration
                        var temp = response.current_observation.temp_c;
                        error = false;
                    } catch(err) {
                        // That's gone wrong, let's create our own error message
                        response = { response:
                        { error:
                        { description: 'Undefined error, please try city and country without spaces' } } };
                        error = true;
                    }
                }

                if (!err && !error) {
                    if (fullLogging) wuLog("Weather response received", severity.debug);

                    // Return specific data
                    //noinspection JSDuplicatedDeclaration
                    var temp = response.current_observation.temp_c;
                    var city = response.current_observation.display_location.city;
                    var country = response.current_observation.display_location.country;
                    var data = {'temp' : temp, 'city' : city, 'country' : country};
                    callback(null, data);

                } else {
                    // Catch error
                    wuLog("Wunderground request error", severity.error);
                    callback(null, response);
                }
            });
        } catch(err) {
            callback(false, null);
        }
    } else {
        callback(false, null);
    }
}

function triggerError(errorMsg) {
    if (useErrorNotifications) sendNotification(errorMsg);

    var tokens = {'error': errorMsg};
    Homey.manager('flow').trigger('error', tokens);
}

/**
 * Sends a notification to Homey's notification center
 * @param text Text to send
 */
function sendNotification(text) {
    Homey.manager('notifications').createNotification({
        excerpt: text
    }, function (err, notification) {
        if (err && fullLogging) wuLog('Sent notification error: ' + JSON.stringify(err), severity.debug);
        if (fullLogging) wuLog('Sent notification: ' + JSON.stringify(notification), severity.debug);
    });
}

/**
 * Logs the message to console.
 * When the severity is error or above the message will also be logged to Athom online logging (Sentry atm).
 * @param {string} message Message to log
 * @param {int} level Message priority level
 */
function wuLog(message, level) {
    if (!value_exist(level)) level = severity.debug;

    if (level >= severity.error) Log.captureMessage(message);
    else Homey.log(message);
}

/**
 * Helper function to generate unique ID
 * @returns {string} Returns unique ID
 */
function generateUniqueId() {
    var uuid = require('node-uuid');
    return uuid.v4();
}

/**
 * Helper function to have Homey read the full word instead of the abbreviation
 * @param text Abbreviation
 * @returns {string} Returns long word
 */
function parseAbbreviations(text) {
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
}

/**
 * Helper function to check if the variable is not undefined and null
 * @param string Variable to check
 * @returns {boolean} true when not undefined or null
 */
function value_exist(string) {
    //noinspection RedundantIfStatementJS
    if (typeof string != 'undefined' && string != null) return true;
    else return false;
}

/**
 * Helper function to test weather data
 * @param data Data to test
 * @returns {object} returns the weather object or a empty string the data was null or undefined
 */
function testWeatherData(data) {
    if (!value_exist(data)) {
        wuLog('Test weather data: Value was undefined or null, returning empty string', severity.debug);
        return "";
    }
    else return data;
}

/**
 * Helper function to test the Weather Underground response
 * @param err
 * @param result
 * @returns {boolean} True is everything is fine
 */
function testResponse(err, result){

    if (err) return true;

    var err_msg;
    try {
        // If error is in the response, something must have gone wrong
        err_msg = result.response.error.description;
        wuLog('test response error: ' + JSON.stringify(err_msg), severity.error);
        return true;
    } catch(err) {
        // If it catches the error it means that there is no result.response.error.description
        // so all is good
        if (fullLogging) wuLog('No error message found in weather request', severity.debug);
        return false;
    }
}

/**
 * Helper function to parse float from a string
 * @param data
 * @returns {*} Returns 0 if unable to parse, otherwise the parsed floating value
 */
function parseWeatherFloat(data) {
    var temp = parseFloat(data);
    if (isNaN(temp)) {
        if (fullLogging) wuLog('parseWeatherFloat', severity.debug);
        if (fullLogging) wuLog('Value was NaN, returning 0', severity.debug);
        return 0;
    }
    else return temp;
}

/**
 * Helper function to convert epoch time to a date variable
 * @param epoch Epoch time (in milli seconds)
 * @returns {Date} Returns the date
 */
function epochToString(epoch) {
    var date = new Date(0);
    date.setUTCSeconds(epoch);
    return date;
}

/**
 * Helper function to calculates the difference between two values
 * @param a Value 1
 * @param b Value 2
 * @returns {number} Returns the difference, 0 if something went wrong
 */
function diff(a,b) {
    try {
        return Math.abs(a-b);
    } catch(err) {
        wuLog('Error while calculating the difference between ' + JSON.stringify(a) + ' and ' + JSON.stringify(b), severity.debug);
        return 0;
    }
}

/**
 * Helper function to check if a value is a integer
 * @param value Value to check
 * @returns {boolean} Returns true if integer
 */
function isInt(value) {
    return !isNaN(value) &&
        parseInt(Number(value)) == value &&
        !isNaN(parseInt(value, 10));
}

module.exports = self;
module.exports.testWU = testWU;
module.exports.getlocation = self.getLocation;
