"use strict";

const Wunderground = require('wundergroundnode');
const Log = require('homey-log').Log;
var wunderground;
const util = require('./lib/util.js');
const weather = require('./lib/weather.js');

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
const severity = util.severity;

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

var self = {
    // this `init` function will be run when Homey is done loading
    init: function() {
        self.checkInsightsLogs();

        // Listen for triggers and conditions
        registerTriggerAndConditionListeners();

        // Listen for speech input
        Homey.manager('speech-input').on('speech', parseSpeech);

        // Listen for changes in settings
        util.wuLog("Registering settings listener", severity.debug);
        Homey.manager('settings').on('set', self.settingsChanged);

        // Listen for Homey app warnings and performance triggers
        registerWarningAndPerformanceListeners();

        // Check settings and start updating weather
        self.checkSettings();
    },

    scheduleWeather: function(update_frequency) {
        util.wuLog("", severity.debug);
        util.wuLog("Schedule weather", severity.debug);

        if (weatherInterval) {
            util.wuLog("Clearing current weatherInterval", severity.debug);
            clearInterval(weatherInterval);
        }

        if (update_frequency == null || update_frequency == 0 || isNaN(update_frequency)) {
            util.wuLog("Update_frequency out of bounds, reset to default: " + update_frequency, severity.debug);
            update_frequency = defaultUpdateTime;
        }

        var updateTime = update_frequency * 60 * 1000;  // From minutes to milliseconds
        weatherInterval = setInterval(trigger_update.bind(this), updateTime);
        function trigger_update() {
            self.updateWeather();
        }
    },

    scheduleForecast: function(update_frequency) {
        util.wuLog("", severity.debug);
        util.wuLog("Schedule forecast", severity.debug);

        if (forecastInterval) {
            util.wuLog("Clearing current forecastInterval", severity.debug);
            clearInterval(forecastInterval);
        }

        if (update_frequency == null || update_frequency == 0 || isNaN(update_frequency)) {
            util.wuLog("Update_frequency out of bounds, reset to default: " + update_frequency, severity.debug);
            update_frequency = defaultUpdateTime;
        }

        var updateTime = update_frequency * 60 * 1000;  // From minutes to milliseconds
        forecastInterval = setInterval(trigger_update.bind(this), updateTime);
        function trigger_update() {
            self.updateForecast();
        }
    },

    setUnits: function() {
        if (fullLogging) util.wuLog('', severity.debug);
        if (fullLogging) util.wuLog('setUnits', severity.debug);

        units_metric = Homey.manager('settings').get('units_metric');
        var units_imperial = Homey.manager('settings').get('units_imperial');
        var units_auto = Homey.manager('settings').get('units_auto');
        var homey_units = Homey.manager('i18n').getUnits();

        if (units_auto && util.value_exist(homey_units) && homey_units != "") {
            Homey.manager('settings').set('currentSettingUnits', 'auto');
            if (homey_units == 'metric') {
                if (fullLogging) util.wuLog('Autodetect metric units', severity.debug);
                units_metric = true;
            } else {
                if (fullLogging) util.wuLog('Autodetect imperial units', severity.debug);
                units_metric = false;
            }
        } else if (!util.value_exist(units_auto) && !util.value_exist(units_metric) && !util.value_exist(units_imperial)) {
            // Something is wrong here, none of the radio buttons are checked!
            util.wuLog('No unit value existed, resetting to auto', severity.debug);
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
        util.wuLog("", severity.debug);
        util.wuLog("Check settings", severity.debug);

        // Check units to use in app
        self.setUnits();

        // Check if user provided a key in settings
        const myKey = Homey.manager('settings').get('wundergroundKey');

        // Get user preference setting for notifications on errors
        useErrorNotifications = Homey.manager('settings').get('useErrorNotifications');
        if(!util.value_exist(useErrorNotifications)) useErrorNotifications = true;
        util.wuLog('Use error notifications: ' + useErrorNotifications, severity.debug);
        if (!util.value_exist(useErrorNotifications)) useErrorNotifications = true;

        // Check if there is a unique ID in settings, otherwise create one.
        // Used by Sentry logging without invading users privacy
        var uniqueUserId = Homey.manager('settings').get('uniqueUserId');
        if (!util.value_exist(uniqueUserId)) {
            uniqueUserId = util.generateUniqueId();
            Homey.manager('settings').set('uniqueUserId', uniqueUserId);
            util.wuLog('Generating new unique user ID', severity.debug);
        }
        util.wuLog('Unique user ID: ' + JSON.stringify(uniqueUserId), severity.debug);
        Log.setUser(uniqueUserId);

        var usePersonalKey = false;
        if (!util.value_exist(myKey) || myKey == "") {
            util.wuLog("Using Weather Underground Inversion key", severity.debug);
            var inversionKey = Homey.env.WUNDERGROUND_KEY;
            if (util.value_exist(inversionKey)) self.initWunderground(inversionKey);
            else {
                util.wuLog('Unable to get environment variable for WU key', severity.error);
                triggerError(__("app.messages.error_unable_getEnvironmentKey"));
            }
        } else {
            util.wuLog("Personal key defined by user", severity.debug);
            usePersonalKey = true;
            self.initWunderground(myKey);
            util.wuLog("Using Weather Underground personal key", severity.debug);
        }

        // Get user settings for update frequency
        update_frequency = Homey.manager('settings').get('updateFrequency');
        util.wuLog("Update every (user setting): " + update_frequency, severity.debug);

        if (!usePersonalKey) {
            // Using Inversion key, max update frequency is 60 minutes
            if (update_frequency < defaultUpdateTime || update_frequency > 1439 || !util.value_exist(update_frequency)) {
                if (fullLogging) util.wuLog("Update value out of bounds, resetting to default", severity.debug);
                update_frequency = defaultUpdateTime;                 // in minutes
                util.wuLog("Update value: " + update_frequency + " minutes", severity.debug);
            }
        } else {
            // Using user personal key
            if (update_frequency < 1 || update_frequency > 1439 || !util.value_exist(update_frequency)) {
                // Defaulting back to 60 minutes
                if (fullLogging) util.wuLog("Update value out of bounds: " + update_frequency + " minutes", severity.debug);
                update_frequency = defaultUpdateTime;                 // in minutes
                util.wuLog("Update value: " + update_frequency + " minutes", severity.debug);
            }
        }

        // Get user settings
        var country = Homey.manager('settings').get('country');
        var city = Homey.manager('settings').get('city');
        var autolocation = Homey.manager('settings').get('autolocation');

        if (!util.value_exist(autolocation) && !util.value_exist(city) && !util.value_exist(country)) {
            if (fullLogging) util.wuLog('One of the location information is invalid, falling back to auto location', severity.debug);
            autolocation = true;
            Homey.manager('settings').set('autolocation', true);
        }

        // Check user settings
        if (autolocation) {
            util.wuLog("Use Homey's location", severity.debug);
            if (util.value_exist(lat) && util.value_exist(lon) && lat != 0 && lon != 0 && lat != null && lon != null) {
                util.wuLog("Using lat lon for location", severity.debug);
                address = lat + ',' + lon;
                self.scheduleWeather(update_frequency);
                self.scheduleForecast(update_frequency);
            } else {
                util.wuLog("Lat lon data invalid", severity.debug);

                if (locationGetCounter <= maxLocationGetTries) {
                    util.wuLog("Fetching location, try " + locationGetCounter + " of " + maxLocationGetTries, severity.debug);
                    locationGetCounter++;
                    self.getLocation(function(err, location) {

                        if (!err && util.value_exist(location)) {
                            util.wuLog("Location found", severity.debug);
                            lat = location.latitude;
                            lon = location.longitude;
                            address = lat + ',' + lon;
                            self.scheduleWeather(update_frequency);
                            self.scheduleForecast(update_frequency);
                            // Found location, reset counter
                            locationGetCounter = 0;
                        } else {
                            if (fullLogging) util.wuLog("Location callback error " + JSON.stringify(err), severity.debug);
                            util.wuLog("Location not found, trying again", severity.debug);
                            self.checkSettings();
                        }
                    });
                } else if (util.value_exist(country) && util.value_exist(city) && country != "" && city != "") {
                    util.wuLog("Max location detection attempts reached, using country and city for location", severity.debug);
                    address = country + '/' + city;
                    self.scheduleWeather(update_frequency);
                    self.scheduleForecast(update_frequency);
                } else {
                    util.wuLog('Max location get attempts and no valid city and country, stopped updating weather', severity.error);
                    triggerError(__("app.messages.error_stop_updating"));
                }
            }
        } else if (util.value_exist(country) && util.value_exist(city) && country != "" && city != "") {
            address = "Netherlands/Amsterdam";
            util.wuLog("Using country and city for location", severity.debug);
            address = country + '/' + city;
            self.scheduleWeather(update_frequency);
            self.scheduleForecast(update_frequency);
        } else {
            util.wuLog("One of the country/city fields is empty, setting to autolocation which will trigger checkSettings() again", severity.debug);
            Homey.manager('settings').set('autolocation', true);
            self.scheduleWeather(update_frequency);
            self.scheduleForecast(update_frequency);
        }
    },

    initWunderground: function(key) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("initWunderground", severity.debug);
        if (wunderground != null) {
            if (fullLogging) util.wuLog("wunderground != null", severity.debug);
            //wunderground = null;
        }

        var language = Homey.manager('i18n').getLanguage();
        if (!util.value_exist(language)) language = 'EN';
        util.wuLog('Setting language to ' + JSON.stringify(language), severity.debug);
        wunderground = new Wunderground(key, language);
    },

    settingsChanged: function(settingName) {
        util.wuLog("", severity.debug);
        // Not interested in currentSettingUnits changes
        //noinspection SpellCheckingInspection
        if (settingName != "currentSettingUnits" || settingName != "currentsettingunits") {
            util.wuLog("Setting has changed " + JSON.stringify(settingName), severity.debug);
        }

        // Homey v 0.8.35 has a bug where all variables are lower case
        if (settingName == "currentSettingUnits" || settingName == "currentSettingUnits") {
            // Don't do anything when this setting has changed or it will cause a loop
        } else if (settingName == 'updateFrequency' || settingName == 'updateFrequency') {
            // If the frequency is changed we have to cancel the current interval and schedule a new
            self.checkSettings();
            util.wuLog("Scheduling weather update every:" + update_frequency, severity.debug);
            self.scheduleWeather(update_frequency);
        } else if (settingName == 'units_auto' || settingName == 'units_imperial' || settingName == 'units_metric') {
            // Let's check if the units have changed
            var units_metric = Homey.manager('settings').get('units_metric');
            if (fullLogging) util.wuLog('units_metric:' + units_metric, severity.debug);
            var units_imperial = Homey.manager('settings').get('units_imperial');
            if (fullLogging) util.wuLog('units_imperial:' + units_imperial, severity.debug);
            var units_auto = Homey.manager('settings').get('units_auto');
            if (fullLogging) util.wuLog('units_auto:' + units_auto, severity.debug);
            var currentSettingUnits = Homey.manager('settings').get('currentSettingUnits');
            if (fullLogging) util.wuLog('currentSettingUnits:' + currentSettingUnits, severity.debug);

            if (units_metric && util.value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'metric') {
                    // Setting has changed, delete all Insights logs!
                    util.wuLog('Units setting has changed, going to delete all Insights logs!', severity.debug);
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'metric');
                }
            } else if (units_imperial && util.value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'imperial') {
                    // Setting has changed, delete all Insights logs!
                    util.wuLog('Units setting has changed, going to delete all Insights logs!', severity.debug);
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'imperial');
                }
            } else if (units_auto && util.value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'auto') {
                    // Setting has changed, delete all Insights logs!
                    util.wuLog('Units setting has changed, going to delete all Insights logs!', severity.debug);
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'auto');
                }
            } else {
                // Something is wrong here, reset to auto units
                util.wuLog('No unit radio button was checked, setting to auto units', severity.debug);
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
        if (fullLogging) util.wuLog('', severity.debug);
        if (fullLogging) util.wuLog('unload', severity.debug);
        if (wunderground != null) {
            if (fullLogging) util.wuLog("wunderground != null, closing wunderground", severity.debug);
            wunderground = null;
        }
    },

    //get location
    getLocation: function(callback) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("getLocation", severity.debug);

        Homey.manager('geolocation').getLocation(function(err, location) {
            if (util.value_exist(location)) {
                if (!util.value_exist(location.latitude) || location.latitude == 0) {
                    if (fullLogging) util.wuLog("Location " + JSON.stringify(location), severity.debug);
                    if (fullLogging) util.wuLog("Location is undefined", severity.debug);
                    callback(true, null);
                } else {
                    if (fullLogging) util.wuLog("location found: " + JSON.stringify(location), severity.debug);
                    callback(false, location);
                }
            } else callback(true, null);
        });
    },

    // update the forecast
    updateForecast: function() {
        util.wuLog("", severity.debug);
        util.wuLog("Update forecast", severity.debug);
        util.wuLog('Requesting for location ' + JSON.stringify(address), severity.debug);

        if (!util.value_exist(address)) {
            util.wuLog('No valid address data, not fetching forecast', severity.debug);
            return;
        }

        // Get forecast data
        wunderground.forecast().request(address, function(err, response) {
            var error = testResponse(err, response);

            if (response && !error && response.forecast && response.forecast.txt_forecast) {
                forecastData = response.forecast.txt_forecast.forecastday;
            } else {
                var message;
                if (error == true) message = 'Error while receiving weather forecast: ' + JSON.stringify(response);
                else message = 'Error while receiving weather forecast: ' + JSON.stringify(err) + JSON.stringify(response);
                util.wuLog(message, severity.error);
                triggerError(message);
            }
        });
    },

    // update the weather
    updateWeather: function() {
        util.wuLog("", severity.debug);
        util.wuLog("Update Weather", severity.debug);
        util.wuLog('Requesting for location ' + JSON.stringify(address), severity.debug);

        if (!util.value_exist(address)) {
            util.wuLog('No valid address data, not updating weather for address ' + JSON.stringify(address), severity.error);
            return;
        }

        // Get weather data
        wunderground.conditions().request(address, function(err, response) {

            var error = testResponse(err, response);

            if (response && !error && util.value_exist(response.current_observation)) {

                var hum = weather.testWeatherData(response.current_observation.relative_humidity);
                var hum_float = 0;
                try {
                    // Cut % sign and convert to float
                    hum_float = weather.parseWeatherFloat(hum.substr(0, (hum.length -1)));
                } catch(err) {
                    util.wuLog("Error while parsing relative_humidity to float, setting to 0", severity.error);
                }

                var temp, feelslike, dewpoint, pressure, wind, wind_gust, visibility, precip_1hr, precip_today;

                // Use correct user units
                if (units_metric) {
                    if (fullLogging) util.wuLog('Using metric units', severity.debug);
                    temp = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.temp_c));
                    feelslike = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.feelslike_c));
                    dewpoint = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.dewpoint_c));
                    pressure = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.pressure_mb));
                    wind = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.wind_kph));
                    wind_gust = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.wind_gust_kph));
                    visibility = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.visibility_km));
                    precip_1hr = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.precip_1hr_metric));
                    precip_today = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.precip_today_metric));
                } else {
                    if (fullLogging) util.wuLog('Using imperial units', severity.debug);
                    temp = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.temp_f));
                    feelslike = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.feelslike_f));
                    dewpoint = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.dewpoint_f));
                    pressure = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.pressure_in));
                    wind = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.wind_mph));
                    wind_gust = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.wind_gust_mph));
                    visibility = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.visibility_mi));
                    precip_1hr = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.precip_1hr_in));
                    precip_today = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.precip_today_in));
                }

                // Reset values they are below zero
                var uv = weather.parseWeatherFloat(weather.testWeatherData(response.current_observation.UV));
                if (uv < 0) uv = 0;

                weatherData = {
                    city: weather.testWeatherData(response.current_observation.display_location.city),
                    country: weather.testWeatherData(response.current_observation.display_location.country),
                    weather_descr: weather.testWeatherData(response.current_observation.weather),
                    relative_humidity: hum_float,
                    observation_epoch: weather.testWeatherData(response.current_observation.observation_epoch),
                    wind_degrees: weather.parseWeatherFloat((weather.testWeatherData(response.current_observation.wind_degrees))),
                    wind_dir: weather.testWeatherData(response.current_observation.wind_dir),
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

                util.updateGlobalTokens(weatherData);

                util.wuLog("Current time: " + new Date(), severity.debug);
                util.wuLog("Observation time: " + util.epochToString(weatherData.observation_epoch), severity.debug);
                if (fullLogging) util.wuLog("Weather data: " + JSON.stringify(weatherData), severity.debug);

                // Temperature triggers and conditions
                if (util.value_exist(weatherData.temp)) {

                    if (fullLogging) util.wuLog("Temp: " + JSON.stringify(weatherData.temp), severity.debug);
                    if (fullLogging) util.wuLog("Old temp: " + JSON.stringify(oldTemp), severity.debug);

                    // Determine if the temp has changed
                    if (!util.value_exist(oldTemp)){
                        if (fullLogging) util.wuLog("No oldTemp value exists, maybe it's the first start of app", severity.debug);
                        // First time update after reboot/install
                        oldTemp = weatherData.temp;
                    } else if (util.diff(oldTemp, weatherData.temp) >= 1) {
                        // Only trigger when difference is equal or more then 1 degree
                        if (fullLogging) util.wuLog("oldTemp: " + oldTemp + " temp: " + weatherData.temp, severity.debug);
                        oldTemp = weatherData.temp;
                        self.tempChanged(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                    }

                    // Start trigger
                    self.tempAboveBelow(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                } else {
                    // No temperature data available!
                    util.wuLog("Temperature is undefined!", severity.debug)
                }

                // Humidity triggers and conditions
                if (util.value_exist(weatherData.relative_humidity)) {
                    // Determine if the hum has changed
                    if (!util.value_exist(oldHum)){
                        // First time update after reboot/install
                        oldHum = weatherData.relative_humidity;
                    } else if (util.diff(oldHum, weatherData.relative_humidity) >= 1) {
                        // Only trigger when difference is equal or more then 1 percent
                        if (fullLogging) util.wuLog("oldHum: " + oldHum + " hum: " + weatherData.relative_humidity, severity.debug);
                        oldHum = weatherData.relative_humidity;
                        self.humChanged(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                    }

                    // Start trigger
                    self.humAboveBelow(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                } else {
                    // No humidity data available!
                    util.wuLog("Humidity is undefined!", severity.debug)
                }

                // UV triggers and conditions
                if (util.value_exist(weatherData.uv)) {
                    // Start trigger
                    self.uvAboveBelow(weatherData.uv);
                } else {
                    // No UV data available!
                    util.wuLog("UV is undefined!", severity.debug)
                }

                // Wind triggers and conditions
                if (util.value_exist(weatherData.wind)) {
                    // Start trigger
                    self.windAboveBelow(weatherData.wind);
                } else {
                    // No wind data available!
                    util.wuLog("Wind is undefined!", severity.debug)
                }

                // Wind gust triggers and conditions
                if (util.value_exist(weatherData.wind_gust)) {
                    // Start trigger
                    self.windgustAboveBelow(weatherData.wind_gust);
                } else {
                    // No wind_gust data available!
                    util.wuLog("Wind_gust is undefined!", severity.debug)
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
                var message;
                if (error == true) message = 'Error while receiving weather forecast: ' + JSON.stringify(response);
                else message = 'Error while receiving weather forecast: ' + JSON.stringify(err) + JSON.stringify(response);
                util.wuLog(message, severity.error);
                triggerError(message);
            }
        }
      )
    },

    // Handler for temp status changes
    tempChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        if (fullLogging) util.wuLog("Sending trigger temp_changed with tokens: " + JSON.stringify(tokens), severity.debug);
        Homey.manager('flow').trigger('temp_changed', tokens);
    },

    // Handler for temp status changes
    humChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        if (fullLogging) util.wuLog("Sending trigger hum_changed with tokens: " + JSON.stringify(tokens), severity.debug);
        Homey.manager('flow').trigger('hum_changed', tokens);
    },

    // Handler for temp above and below triggers
    tempAboveBelow: function(temp, hum, weather_descr) {
        if (fullLogging) util.wuLog('', severity.debug);
        if (fullLogging) util.wuLog('tempAboveBelow', severity.debug);
        if (fullLogging) util.wuLog('temp ' + JSON.stringify(temp), severity.debug);
        if (fullLogging) util.wuLog('hum ' + JSON.stringify(hum), severity.debug);
        if (fullLogging) util.wuLog('weather_descr ' + JSON.stringify(weather_descr), severity.debug);
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
        util.wuLog("Deleting log " + log, severity.debug);

        Homey.manager('insights').deleteLog(log, function callback(err){
            if (err) {
                triggerError(__("app.messages.error_deletingInsightsLog") + JSON.stringify(err));
                util.wuLog('Error while deleting Insights log: ' + JSON.stringify(err), severity.error);
                return Homey.error(err);
            }
            else util.wuLog("Log " + log + " deleted", severity.debug);
        });
    },

    deleteAllInsightsLogs: function() {
        util.wuLog("", severity.debug);
        util.wuLog("deleteAllInsightsLogs", severity.debug);

        Homey.manager('insights').getLogs(function callback(err, logs) {
            if (err) {
                triggerError(__("app.messages.error_deletingInsightsLog") + JSON.stringify(err));
                util.wuLog('Error while deleting all Insights log: ' + JSON.stringify(err), severity.error);
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
        util.wuLog("", severity.debug);
        util.wuLog("checkInsightsLogs", severity.debug);

        // self.deleteInsightsLog("precip_today");

        Homey.manager('insights').getLogs(function callback(err, logs) {
            if (err) {
                // Error, let's create them all
                util.wuLog("Error getting the Insights logs, (re)create all Insights logs", severity.error);
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
                        util.wuLog("Log " + logs[l].name + " is old and will be deleted", severity.debug);
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
                        util.wuLog("Log " + insightsLogs[l] + " is not on Homey", severity.debug);
                        //noinspection JSUnfilteredForInLoop
                        self.createInsightsLogs(insightsLogs[l]);
                    }
                }
            }
        });
    },

    createInsightsLogs: function(log) {
        util.wuLog("", severity.debug);
        util.wuLog("Create Insights log: " + log, severity.debug);
        if (fullLogging) util.wuLog("Metric units" + units_metric, severity.debug);

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
                        util.wuLog('createLog temp error', severity.error);
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
                        util.wuLog('createLog hum error', severity.error);
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
                            util.wuLog('createLog feelslike error', severity.error);
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
                            util.wuLog('createLog pressure error', severity.error);
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
                            util.wuLog('createLog wind error', severity.error);
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
                            util.wuLog('createLog wind_gust error', severity.error);
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
                            util.wuLog('createLog wind_degrees error', severity.error);
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
                            util.wuLog('createLog dewpoint error', severity.error);
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
                            util.wuLog("createLog precip_today error", severity.error);
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
                            util.wuLog("createLog precip_1hr error", severity.error);
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
                            util.wuLog("createLog uv error", severity.error);
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
                            util.wuLog("createLog visibility error", severity.error);
                            return Homey.error(err);
                        }
                    });
                break;

            default:
                util.wuLog("Create Insights log default switch-case was hit which means one log wasn't created!", severity.error);
                break;
        }
    },

    addInsightsEntry: function(logName, value) {
        Homey.manager('insights').createEntry(logName, value, new Date(), function(err){
            if (err) util.wuLog('Error creating Insights entry: ' + JSON.stringify(err), severity.debug);
        })
    }
};

function registerTriggerAndConditionListeners() {
    util.wuLog("Registering trigger and condition listeners", severity.debug);

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
            if (weatherData.temp > args.variable) {
                util.wuLog('Current temp of ' + weatherData.temp + ' is higher then trigger value of ' + args.variable, severity.debug);
                callback(null, true);
            }
            else callback(null, false);
    }

    function tempBelow(callback, args) {
        if (weatherData.temp < args.variable) {
            util.wuLog('Current temp of ' + weatherData.temp + ' is lower then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function humAbove(callback, args) {
        if (weatherData.relative_humidity > args.variable) {
            util.wuLog('Current humidity of ' + weatherData.relative_humidity + ' is higher then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function humBelow(callback, args) {
        if (weatherData.relative_humidity < args.variable) {
            util.wuLog('Current humidity of ' + weatherData.relative_humidity + ' is lower then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function uvAbove(callback, args) {
        if (weatherData.uv > args.variable) {
            util.wuLog('Current UV of ' + weatherData.relative_humidity + ' is higher then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function uvBelow(callback, args) {
        if (weatherData.uv < args.variable) {
            util.wuLog('Current UV of ' + weatherData.relative_humidity + ' is lower then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function windAbove(callback, args) {
        if (weatherData.wind > args.variable) {
            util.wuLog('Current wind of ' + weatherData.relative_humidity + ' is higher then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function windBelow(callback, args) {
        if (weatherData.wind < args.variable) {
            util.wuLog('Current wind of ' + weatherData.relative_humidity + ' is lower then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function windgustAbove(callback, args) {
        if (weatherData.wind_gust > args.variable) {
            util.wuLog('Current wind gust of ' + weatherData.relative_humidity + ' is higher then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function windgustBelow(callback, args) {
        if (weatherData.wind_gust < args.variable) {
            util.wuLog('Current wind gust of ' + weatherData.relative_humidity + ' is lower then trigger value of ' + args.variable, severity.debug);
            callback(null, true);
        }
        else callback(null, false);
    }

    function readForecast_today(callback, args) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("function readForecast_today", severity.debug);
        if (util.value_exist(forecastData) && forecastData.length > 0) {
            readForecast(0);
            callback(null, true);
        } else {
            util.wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tonight(callback, args) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("function readForecast_tonight", severity.debug);
        if (util.value_exist(forecastData) && forecastData.length > 0) {
            readForecast(1);
            callback(null, true);
        } else {
            util.wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tomorrow(callback, args) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("function readForecast_tomorrow", severity.debug);
        if (util.value_exist(forecastData) && forecastData.length > 0) {
            readForecast(2);
            callback(null, true);
        } else {
            util.wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tomorrowNight(callback, args) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("function readForecast_tomorrowNight", severity.debug);
        if (util.value_exist(forecastData) && forecastData.length > 0) {
            readForecast(3);
            callback(null, true);
        } else {
            util.wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_dayAfterTomorrow(callback, args) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("function readForecast_tomorrowNight", severity.debug);
        if (util.value_exist(forecastData) && forecastData.length > 0) {
            readForecast(5);
            callback(null, true);
        } else {
            util.wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readRain_hour(callback, args) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("function readForecast_tomorrow", severity.debug);
        if (util.value_exist(forecastData) && forecastData.length > 0) {
            readForecast(2);
            callback(null, true);
        } else {
            util.wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readRain_today(callback, args) {
        if (fullLogging) util.wuLog("", severity.debug);
        if (fullLogging) util.wuLog("function readForecast_tomorrowNight", severity.debug);
        if (util.value_exist(forecastData) && forecastData.length > 0) {
            readForecast(3);
            callback(null, true);
        } else {
            util.wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
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
        if (util.isInt(day)) {
            if (units_metric)
                forecastText = forecastData[day].fcttext_metric;
            else
                forecastText = forecastData[day].fcttext;

            util.wuLog('forecast text ' + JSON.stringify(forecastText), severity.debug);

            if (util.value_exist(forecastText)) Homey.manager('speech-output').say(parseAbbreviations(forecastText));
            else {
                util.wuLog('Read forecast but forecast data is empty: ' + JSON.stringify(forecastData), severity.error);
                Homey.manager('speech-output').say(__("app.speech.somethingWrong"));
            }
        } else util.wuLog("Read forecast day is not a integer", severity.error);
    }
}

/**
 * Helper function to register the unload of the app
 */
function registerWarningAndPerformanceListeners() {
    try {
        util.wuLog("Registering app unload listener", severity.debug);
        Homey.on('unload', self.unload);
    } catch (err) {
        util.wuLog('Registration for one of the app warning and performance listeners failed!', severity.error);
    }
}

function parseSpeech(speech, callback) {
    util.wuLog("", severity.debug);
    util.wuLog("parseSpeech", severity.debug);

    // On very first start units aren't always there yet
    if (!util.value_exist(units_metric)) {
        units_metric = Homey.manager('settings').get('units_metric');
        var units_imperial = Homey.manager('settings').get('units_imperial');
        var units_auto = Homey.manager('settings').get('units_auto');
        var homey_units = Homey.manager('i18n').getUnits();

        if (units_auto && util.value_exist(homey_units) && homey_units != "") {
            Homey.manager('settings').set('currentSettingUnits', 'auto');
            if (homey_units == 'metric') {
                if (fullLogging) util.wuLog('Autodetect metric units', severity.debug);
                units_metric = true;
            } else {
                if (fullLogging) util.wuLog('Autodetect imperial units', severity.debug);
                units_metric = false;
            }
        }
    }

    self.updateForecast();
    self.updateWeather();

    if (util.value_exist(forecastData) && forecastData.length > 0 && util.value_exist(weatherData) && Object.keys(weatherData).length > 0) {
        util.wuLog("Weather and forecast data available", severity.debug);

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
                    util.wuLog("weather_tomorrow", severity.debug);

                    if (units_metric)
                        text = forecastData[2].fcttext_metric;
                    else
                        text = forecastData[2].fcttext;

                    speech.say(util.parseAbbreviations(text));
                    callback(null, true);
                    return true;

                case 'weather_dayAfterTomorrow' :
                    util.wuLog("weather_dayAfterTomorrow", severity.debug);

                    if (units_metric)
                        text = forecastData[4].fcttext_metric;
                    else
                        text = forecastData[4].fcttext;

                    speech.say(util.parseAbbreviations(text));
                    callback(null, true);
                    return true;

                case 'weather_today' :
                    util.wuLog("weather_today", severity.debug);

                    if (units_metric)
                        text = forecastData[0].fcttext_metric;
                    else
                        text = forecastData[0].fcttext;

                    speech.say(util.parseAbbreviations(text));
                    callback(null, true);
                    return true;

                case 'rain_today' :
                    util.wuLog("rain_today", severity.debug);
                    text = __("app.speech.rainToday") + " " + weatherData.precip_today + unitData.distance_small_unit;
                    speech.say(util.parseAbbreviations(text));
                    text = "";
                    callback(null, true);
                    return true;

                case 'rain_hour' :
                    util.wuLog("rain_hour", severity.debug);
                    text = __("app.speech.rainToday") + " " + weatherData.precip_1hr + unitData.distance_small_unit;
                    speech.say(util.parseAbbreviations(text));
                    text = "";
                    callback(null, true);
                    return true;

                default:
                    // Guess it wasn't meant for this app, return that in the callback
                    callback(true, null);
            }
        });
    } else {
        if (fullLogging) util.wuLog("!! Weather and forecast not available", severity.debug);
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
    util.wuLog("", severity.debug);
    util.wuLog("TestWU API call", severity.debug);

    var Wunderground = require('wundergroundnode');
    var wundergroundKey = args.body.wundergroundkey;
    var address = args.body.address;
    var language = Homey.manager('i18n').getLanguage();

    util.wuLog('Testing for location: ' + JSON.stringify(address), severity.debug);

    if (!util.value_exist(wundergroundKey) || wundergroundKey == "" || wundergroundKey == null) {
        if (fullLogging) util.wuLog("Weather underground key is empty, using Inversion key", severity.debug);
        wundergroundKey = Homey.env.WUNDERGROUND_KEY;
    } else util.wuLog('Using user defined Weather Underground key', severity.debug);

    var wunderground = new Wunderground(wundergroundKey, language);

    if (address && util.value_exist(address)) {
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
                    if (fullLogging) util.wuLog("Weather response received", severity.debug);

                    // Return specific data
                    //noinspection JSDuplicatedDeclaration
                    var temp = response.current_observation.temp_c;
                    var city = response.current_observation.display_location.city;
                    var country = response.current_observation.display_location.country;
                    var data = {'temp' : temp, 'city' : city, 'country' : country};
                    callback(null, data);

                } else {
                    // Catch error
                    util.wuLog("Wunderground request error", severity.error);
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
        if (err && fullLogging) util.wuLog('Sent notification error: ' + JSON.stringify(err), severity.debug);
        if (fullLogging) util.wuLog('Sent notification: ' + JSON.stringify(notification), severity.debug);
    });
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
        util.wuLog('test response error: ' + JSON.stringify(err_msg), severity.error);
        return true;
    } catch(err) {
        // If it catches the error it means that there is no result.response.error.description
        // so all is good
        if (fullLogging) util.wuLog('No error message found in weather request', severity.debug);
        return false;
    }
}

module.exports = self;
module.exports.testWU = testWU;
module.exports.getlocation = self.getLocation;
