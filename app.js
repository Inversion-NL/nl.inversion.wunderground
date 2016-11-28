"use strict";

var Wunderground = require('wundergroundnode');
const Log = require('homey-log').Log;
var wunderground;

var defaultUpdateTime = 90;
var maxLocationGetTries = 3;
var units_metric;
var insightsLogs =     
    [
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
var useNotifications = false;

// Enable full logging for more info
var fullLogging = false;

// Variables for when value has changed
var oldTemp;
var oldHum;

function value_exist(string) {
    if (typeof string != 'undefined' && string != null) return true;
    else return false;
}

function test_weatherData(data) {
    if (!value_exist(data)) {
        if (fullLogging) wuLog('test_weatherData');
        if (fullLogging) wuLog('Value was undefined or null, returning empty string');
        return "";
    }
    else return data;
}

function parseWeatherFloat(data) {
    var temp = parseFloat(data);
    if (isNaN(temp)) {
        if (fullLogging) wuLog('parseWeatherFloat');
        if (fullLogging) wuLog('Value was NaN, returning 0');
        return 0;
    }
    else return temp;
}

function epochToString(epoch) {
    var date = new Date(0);
    date.setUTCSeconds(epoch);
    return date;
}

function diff(a,b) {
    return Math.abs(a-b);
}

function isInt(value) {
  return !isNaN(value) && 
         parseInt(Number(value)) == value && 
         !isNaN(parseInt(value, 10));
}

var self = {
    // this `init` function will be run when Homey is done loading
    init: function() {
        
        wuLog("Initializing Weather Underground");
        wuLog("");

        self.checkInsightsLogs();

        // Listen for triggers and conditions
        registerTriggerAndConditionListeners();

        // Listen for speech input
        Homey.manager('speech-input').on('speech', parseSpeech);

        // Listen for changes in settings
        wuLog("Registering settings listener");
        Homey.manager('settings').on('set', self.settingsChanged);
        
        // Listen for Homey app warnings and performance triggers
        registerWarningAndPerformanceListeners;
        
        // Check settings and start updating weather
        self.checkSettings();

        // Print current date and time
        wuLog("Current time: " + new Date());
    },
    
    scheduleWeather: function(update_frequency) {
        wuLog("");
        wuLog("Schedule weather");

        if (weatherInterval) {
            wuLog("Clearing current weatherInterval");
            clearInterval(weatherInterval);
        }

        if (update_frequency == null || update_frequency == 0 || isNaN(update_frequency)) {
            Homey.log("Update_frequency out of bounds, reset to default: ", update_frequency);
            update_frequency = defaultUpdateTime;
        }

        var updateTime = update_frequency * 60 * 1000;  // From minutes to milliseconds
        weatherInterval = setInterval(trigger_update.bind(this), updateTime);
        function trigger_update() {
            wuLog("Triggering update");
            self.updateWeather();
        }
    },

    scheduleForecast: function(update_frequency) {
        wuLog("");
        wuLog("Schedule forecast");

        if (forecastInterval) {
            wuLog("Clearing current forecastInterval");
            clearInterval(forecastInterval);
        }

        if (update_frequency == null || update_frequency == 0 || isNaN(update_frequency)) {
            wuLog("Update_frequency out of bounds, reset to default: ", update_frequency);
            update_frequency = defaultUpdateTime;
        }

        var updateTime = update_frequency * 60 * 1000;  // From minutes to milliseconds
        forecastInterval = setInterval(trigger_update.bind(this), updateTime);
        function trigger_update() {
            self.updateForecast();
        }
    },
    
    setUnits: function() {
        if (fullLogging) wuLog('');
        if (fullLogging) wuLog('setUnits');
        
        units_metric = Homey.manager('settings').get('units_metric');
        var units_imperial = Homey.manager('settings').get('units_imperial');
        var units_auto = Homey.manager('settings').get('units_auto');
        var homey_units = Homey.manager('i18n').getUnits();
        
        if (units_auto && value_exist(homey_units) && homey_units != "") {
            Homey.manager('settings').set('currentSettingUnits', 'auto');
            if (homey_units == 'metric') {
                if (fullLogging) wuLog('Autodetect metric units');
                units_metric = true;
            } else {
                if (fullLogging) wuLog('Autodetect imperial units');
                units_metric = false;
            }
        } else if (!value_exist(units_auto) && !value_exist(units_metric) && !value_exist(units_imperial)) {
            // Something is wrong here, none of the radio buttons are checked!
            wuLog('No unit value existed, resetting to auto');
            Homey.manager('settings').set('units_auto', 'true');
            
            // Let check the units again
            self.setUnits();
            return;
        }
        
        if (units_metric) {
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
        wuLog("");
        wuLog("Check settings");
        
        // Check units to use in app
        self.setUnits();
        
        // Check if user provided a key in settings
        var myKey = Homey.manager('settings').get('wundergroundKey');

        useNotifications = Homey.manager('settings').get('useNotifications');
        Homey.log('Use notifications: ', useNotifications);
        if (!value_exist(useNotifications)) useNotifications = true;

        var usePersonalKey = false;
        if (!value_exist(myKey) || myKey == "") {
            wuLog("Using Weather Underground Inversion key");
            var inversionKey = Homey.env.WUNDERGROUND_KEY;
            if (value_exist(inversionKey)) self.initWunderground(inversionKey);
            else triggerErrorFlow(__("app.messages.error_unable_getEnvironmentKey"));
        } else {
            wuLog("Personal key defined by user");
            usePersonalKey = true;
            self.initWunderground(myKey);
            wuLog("Using Weather Underground personal key");
        }
        
        // Get user settings for update frequenty
        update_frequency = Homey.manager('settings').get('updateFrequency');
        if (fullLogging) wuLog("Update every (user setting): " + update_frequency);

        if (!usePersonalKey) {
            // Using Inversion key, max update frequency is 60 minutes
            if (update_frequency < defaultUpdateTime || update_frequency > 1439 || !value_exist(update_frequency)) {
                if (fullLogging) wuLog("Update value out of bounds, resetting to default");
                update_frequency = defaultUpdateTime;                 // in minutes
                wuLog("Update value: " + update_frequency + " minutes");
            }
        } else {
            // Using user personal key
            if (update_frequency < 1 || update_frequency > 1439 || !value_exist(update_frequency)) {
                // Defaulting back to 60 minutes
                if (fullLogging) wuLog("Update value out of bounds: " + update_frequency + " minutes");
                update_frequency = defaultUpdateTime;                 // in minutes
                wuLog("Update value: " + update_frequency + " minutes");
            }
        }

        // Get user settings
        var country = Homey.manager('settings').get('country');
        var city = Homey.manager('settings').get('city');
        var autolocation = Homey.manager('settings').get('autolocation');

        if (!value_exist(autolocation) && !value_exist(city) && !value_exist(country)) {
            if (fullLogging) wuLog('One of the location information is invalid, falling back to auto location');
            autolocation = true;
            Homey.manager('settings').set('autolocation', true);
        }

        // Check user settings
        if (autolocation) {
            wuLog("Use Homey's location");
            if (value_exist(lat) && value_exist(lon) && lat != 0 && lon != 0 && lat != null && lon != null) {
                wuLog("Using lat lon for location");
                address = lat + ',' + lon;
                self.scheduleWeather(update_frequency);
                self.scheduleForecast(update_frequency);
            } else {
                wuLog("Lat lon data invalid");

                if (locationGetCounter <= maxLocationGetTries) {
                    wuLog("Fetching location, try " + locationGetCounter + " of " + maxLocationGetTries);
                    locationGetCounter++;
                    self.getLocation(function(err, location) {

                        if (fullLogging) wuLog("Location callback");
                        if (fullLogging) Homey.log("err", err);

                        if (!err && location != null) {
                            wuLog("Location found");
                            lat = location.latitude;
                            lon = location.longitude;
                            address = lat + ',' + lon;
                            self.scheduleWeather(update_frequency);
                            self.scheduleForecast(update_frequency);
                            // Found location, reset counter
                            locationGetCounter = 0;
                        } else {
                            wuLog("Location not found, trying again");
                            self.checkSettings();
                        }
                    });
                } else if (value_exist(country) && value_exist(city) && country != "" && city != "") {
                    wuLog("Max location detection attempts reached, using country and city for location");
                    address = country + '/' + city;
                    self.scheduleWeather(update_frequency);
                    self.scheduleForecast(update_frequency);
                } else { 
                    wuLog("Max location detection attempts reached and one or all of the country/city fields are empty. Stopped updating weather!");
                    triggerErrorFlow(__("app.messages.error_stop_updating"));
                }
            }
        } else if (value_exist(country) && value_exist(city) && country != "" && city != "") {
            address = "Netherlands/Amsterdam";
            wuLog("Using country and city for location");
            address = country + '/' + city;
            self.scheduleWeather(update_frequency);
            self.scheduleForecast(update_frequency);
        } else { 
            wuLog("One of the country/city fields is empty, setting to autolocation which will trigger checkSettings() again");
            Homey.manager('settings').set('autolocation', true);
            self.scheduleWeather(update_frequency);
            self.scheduleForecast(update_frequency);
        }
    },
    
    initWunderground: function(key) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("initWunderground");
        if (wunderground != null) {
            if (fullLogging) wuLog("wunderground != null");
            //wunderground = null;
        }

        var language = Homey.manager('i18n').getLanguage();
        if (!value_exist(language)) language = 'EN';
        Homey.log('Setting language to', language);
        wunderground = new Wunderground(key, language);
    },
    
    settingsChanged: function(settingname) {
        wuLog("");
        // Not interested in currentSettingUnits changes
        if (settingname != "currentSettingUnits" || settingname != "currentsettingunits") { 
            Homey.log("Setting has changed", settingname);
        }
        
        // Homey v 0.8.35 has a bug where all variables are lower case
        if (settingname == "currentSettingUnits" || settingname == "currentSettingUnits") {
            // Don't do anything when this setting has changed or it will cause a loop
        } else if (settingname == 'updateFrequency' || settingname == 'updateFrequency') {
            // If the frequenty is changed we have to cancel the current interval and schedule a new
            self.checkSettings();
            Homey.log("Scheduling weather update every:", update_frequency);
            self.scheduleWeather(update_frequency);
        } else if (settingname == 'units_auto' || settingname == 'units_imperial' || settingname == 'units_metric') {
            // Let's check if the units have changed
            var units_metric = Homey.manager('settings').get('units_metric');
            if (fullLogging) Homey.log('units_metric:', units_metric);
            var units_imperial = Homey.manager('settings').get('units_imperial');
            if (fullLogging) Homey.log('units_imperial:', units_imperial);
            var units_auto = Homey.manager('settings').get('units_auto');
            if (fullLogging) Homey.log('units_auto:', units_auto);
            var currentSettingUnits = Homey.manager('settings').get('currentSettingUnits');
            if (fullLogging) Homey.log('currentSettingUnits:', currentSettingUnits);
            
            if (units_metric && value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'metric') {
                    // Setting has changed, delete all Insights logs!
                    wuLog('Units setting has changed, going to delete all Insights logs!');
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'metric');
                }
            } else if (units_imperial && value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'imperial') {
                    // Setting has changed, delete all Insights logs!
                    wuLog('Units setting has changed, going to delete all Insights logs!');
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'imperial');
                }
            } else if (units_auto && value_exist(currentSettingUnits)) {
                if (currentSettingUnits != 'auto') {
                    // Setting has changed, delete all Insights logs!
                    wuLog('Units setting has changed, going to delete all Insights logs!');
                    //self.deleteAllInsightsLogs();
                    self.checkInsightsLogs();
                    Homey.manager('settings').set('currentSettingUnits', 'auto');
                }
            } else {
                // Something is wrong here, reset to auto units
                wuLog('No unit radio button was checked, setting to auto units');
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
        if (fullLogging) wuLog('');
        if (fullLogging) wuLog('unload');
        if (wunderground != null) {
            if (fullLogging) wuLog("wunderground != null, closing wunderground");
            wunderground = null;
        }
    },

    //get location
    getLocation: function(callback) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("getLocation");

        Homey.manager('geolocation').getLocation(function(err, location) {
            if (value_exist(location)) {
                if (!value_exist(location.latitude) || location.latitude == 0) {
                    if (fullLogging) Homey.log("Location", location);
                    if (fullLogging) wuLog("Location is undefined");
                    callback(true, null);
                } else {
                    if (fullLogging) Homey.log("location found:", location);
                    callback(false, location);
                }
            } else callback(true, null);
        });
    },

    // test the Wunderground response for errors
    testResponse: function(err, result) {
        
        if (err) return true;
        
        var err_msg;
        try {
            // If error is in the response, something must have gone wrong
            err_msg = result.response.error.description;
            Homey.log('Error:', err_msg);
            return true;
        } catch(err) {
            // If it catches the error it means that there is no result.respons.error.description
            // so all is good
            if (fullLogging) wuLog('No error message found in weather request');
            return false;
        }
    },

    // update the forecast
    updateForecast: function() {
        wuLog("");
        wuLog("Update forecast");
        Homey.log('Requesting for location', address);
        
        if (!value_exist(address)) {
            wuLog('No valid address data, not fetching forecast');
            return;
        }

        // Get forecast data
        wunderground.forecast().request(address, function(err, response) {
            wuLog("");
            wuLog("updateForecast response");

            var error = self.testResponse(err, response);
            
            if (response && !error) {
                forecastData = response.forecast.txt_forecast.forecastday;
            } else triggerErrorFlow("Error while receiving weather forecast " + JSON.stringify(err));
        });
    },

    // update the weather
    updateWeather: function() {
        wuLog("");
        wuLog("Update Weather");
        Homey.log('Requesting for location', address);
        if (!value_exist(address)) {
            wuLog('No valid address data, not updating weather');
            return;
        }

        // Get weather data
        wunderground.conditions().request(address, function(err, response) {
            
            var error = self.testResponse(err, response);
            
            if (response && !error && value_exist(response.current_observation)) {
                
                var hum = test_weatherData(response.current_observation.relative_humidity);
                var hum_float = 0;
                try {
                    // Cut % sign and convert to float
                    hum_float = parseWeatherFloat(hum.substr(0, (hum.length -1)));
                } catch(err) {
                    wuLog("Error while parsing relative_humidity to float, setting to 0");
                }
                
                // Use correct user units
                if (units_metric) {
                    if (fullLogging) wuLog('Using metric units');
                    var temp = parseWeatherFloat(test_weatherData(response.current_observation.temp_c));
                    var feelslike = parseWeatherFloat(test_weatherData(response.current_observation.feelslike_c));
                    var dewpoint = parseWeatherFloat(test_weatherData(response.current_observation.dewpoint_c));
                    var pressure = parseWeatherFloat(test_weatherData(response.current_observation.pressure_mb));
                    var wind = parseWeatherFloat(test_weatherData(response.current_observation.wind_kph));
                    var wind_gust = parseWeatherFloat(test_weatherData(response.current_observation.wind_gust_kph));
                    var visibility = parseWeatherFloat(test_weatherData(response.current_observation.visibility_km));
                    var precip_1hr = parseWeatherFloat(test_weatherData(response.current_observation.precip_1hr_metric));
                    var precip_today = parseWeatherFloat(test_weatherData(response.current_observation.precip_today_metric));
                } else {
                    if (fullLogging) wuLog('Using imperial units');
                    var temp = parseWeatherFloat(test_weatherData(response.current_observation.temp_f));
                    var feelslike = parseWeatherFloat(test_weatherData(response.current_observation.feelslike_f));
                    var dewpoint = parseWeatherFloat(test_weatherData(response.current_observation.dewpoint_f));
                    var pressure = parseWeatherFloat(test_weatherData(response.current_observation.pressure_in));
                    var wind = parseWeatherFloat(test_weatherData(response.current_observation.wind_mph));
                    var wind_gust = parseWeatherFloat(test_weatherData(response.current_observation.wind_gust_mph));
                    var visibility = parseWeatherFloat(test_weatherData(response.current_observation.visibility_mi));
                    var precip_1hr = parseWeatherFloat(test_weatherData(response.current_observation.precip_1hr_in));
                    var precip_today = parseWeatherFloat(test_weatherData(response.current_observation.precip_today_in));
                }
                
                // Reset values they are below zero
                var uv = parseWeatherFloat(test_weatherData(response.current_observation.UV));
                if (uv < 0) uv = 0;

                weatherData = {
                    city: test_weatherData(response.current_observation.display_location.city),
                    country: test_weatherData(response.current_observation.display_location.country),
                    weather_descr: test_weatherData(response.current_observation.weather),
                    relative_humidity: hum_float,
                    observation_epoch: test_weatherData(response.current_observation.observation_epoch),
                    wind_degrees: parseWeatherFloat((test_weatherData(response.current_observation.wind_degrees))),
                    wind_dir: test_weatherData(response.current_observation.wind_dir),
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
                
                Homey.log("Current time: " + new Date());
                Homey.log("Observation time: " + epochToString(weatherData.observation_epoch));
                if (fullLogging) Homey.log("Weather data:");
                if (fullLogging) Homey.log(weatherData);

                // Temperature triggers and conditions
                if (value_exist(weatherData.temp)) {

                    if (fullLogging) Homey.log("Temp:", weatherData.temp);
                    if (fullLogging) Homey.log("Oldtemp:", oldTemp);

                    // Determine if the temp has changed
                    if (!value_exist(oldTemp)){
                        if (fullLogging) wuLog("No oldTemp value exists, maybe it's the first start of app");
                        // First time update after reboot/install
                        oldTemp = weatherData.temp;
                    } else if (diff(oldTemp, weatherData.temp) >= 1) {
                        // Only trigger when difference is equal or more then 1 degree
                        if (fullLogging) wuLog("oldTemp: " + oldTemp + " temp: " + weatherData.temp);
                        oldTemp = weatherData.temp;
                        self.tempChanged(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                    }

                    // Start trigger
                    self.tempAboveBelow(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                } else {
                    // No temperature data available!
                    wuLog("Temperature is undefined!")
                }

                // Humidity triggers and conditions
                if (value_exist(weatherData.relative_humidity)) {
                    // Determine if the hum has changed
                    if (!value_exist(oldHum)){
                        // First time update after reboot/install
                        oldHum = weatherData.relative_humidity;
                    } else if (diff(oldHum, weatherData.relative_humidity) >= 1) {
                        // Only trigger when difference is equal or more then 1 percent
                        if (fullLogging) wuLog("oldHum: " + oldHum + " hum: " + weatherData.relative_humidity);
                        oldHum = weatherData.relative_humidity;
                        self.humChanged(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                    }

                    // Start trigger
                    self.humAboveBelow(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                } else {
                    // No humidity data available!
                    wuLog("Humidity is undefined!")
                }
                
                // UV triggers and conditions
                if (value_exist(weatherData.uv)) {
                    // Start trigger
                    self.uvAboveBelow(weatherData.uv);
                } else {
                    // No UV data available!
                    wuLog("UV is undefined!")
                }
                
                // Wind triggers and conditions
                if (value_exist(weatherData.wind)) {
                    // Start trigger
                    self.windAboveBelow(weatherData.wind);
                } else {
                    // No wind data available!
                    wuLog("Wind is undefined!")
                }
                            
                // Wind gust triggers and conditions
                if (value_exist(weatherData.wind_gust)) {
                    // Start trigger
                    self.windgustAboveBelow(weatherData.wind_gust);
                } else {
                    // No wind_gust data available!
                    wuLog("Wind_gust is undefined!")
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
                // Catch error
                Homey.log("Wunderground request error:", response);
                triggerErrorFlow("Wunderground request error: " + JSON.stringify(response));
            }
        }
      )
    },

    // Handler for temp status changes
    tempChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        if (fullLogging) Homey.log("Sending trigger temp_changed with tokens:", tokens);
        Homey.manager('flow').trigger('temp_changed', tokens);
    },

    // Handler for temp status changes
    humChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        if (fullLogging) wuLog("Sending trigger hum_changed with tokens: " + JSON.stringify(tokens));
        Homey.manager('flow').trigger('hum_changed', tokens);
    },

    // Handler for temp above and below triggers
    tempAboveBelow: function(temp, hum, weather_descr) {
        if (fullLogging) Homey.log('');
        if (fullLogging) Homey.log('tempAboveBelow');
        if (fullLogging) Homey.log('temp', temp);
        if (fullLogging) Homey.log('hum', hum);
        if (fullLogging) Homey.log('weather_descr', weather_descr);
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
        wuLog("Deleting log " + log);
        
        Homey.manager('insights').deleteLog(log, function callback(err, success){
            if (err) return Homey.error(err);
            else wuLog("Log " + log + " deleted");
        });  
    },
    
    deleteAllInsightsLogs: function() {
        wuLog("");
        wuLog("deleteAllInsightsLogs");
        
        Homey.manager('insights').getLogs(function callback(err, logs) {
            if (err) return Homey.error(err);
            else {
                for (var l in logs) {
                    self.deleteInsightsLog(logs[l]);
                }
            }   
        });       
    },
    
    checkInsightsLogs: function() {
        wuLog("");
        wuLog("checkInsightsLogs");
        
        // self.deleteInsightsLog("precip_today");
        
        Homey.manager('insights').getLogs(function callback(err, logs) {
            if (err) {
                // Error, let's create them all
                wuLog("Error in getting the Insights logs, create all Insights logs");
                for (var l in insightsLogs) {
                    self.createInsightsLogs(insightsLogs[l]);    
                }
                return Homey.error(err);
            }
            else {
                var currentInsightLogs = [];
                // Let's check if the logs on Homey should be there
                for (var l in logs) {
                    // Add current Homey log names to array
                    currentInsightLogs.push(logs[l].name);
                    
                    if (insightsLogs.indexOf(logs[l].name) < 0) {
                        wuLog("Log " + logs[l].name + " is old and will be deleted");
                        self.deleteInsightsLog(logs[l].name);
                    }
                }
                // Let's check all required logs are there on Homey
                for (var l in insightsLogs) {
                    if (currentInsightLogs.indexOf(insightsLogs[l]) < 0) {
                        wuLog("Log " + insightsLogs[l] + " is not on Homey");
                        self.createInsightsLogs(insightsLogs[l]);
                    }
                }
            }   
        }); 
    },

    createInsightsLogs: function(log) {
        wuLog("");
        wuLog("Create Insights log: " + log);
        if (fullLogging) Homey.log("Metric units", units_metric);
        
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
                function callback(err, success){
                    if (err) {
                        wuLog('createLog temp error');
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
                function callback(err, success){
                    if (err) {
                        wuLog('createLog hum error');
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
                    function callback(err, success){
                        if (err) {
                            wuLog('createLog feelslike error');
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
                    function callback(err, success){
                        if (err) {
                            wuLog('createLog pressure error');
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
                    function callback(err, success){
                        if (err) {
                            wuLog('createLog wind error');
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
                    function callback(err, success){
                        if (err) {
                            wuLog('createLog wind_gust error');
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
                    function callback(err, success){
                        if (err) {
                            wuLog('createLog wind_degrees error');
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
                    function callback(err, success){
                        if (err) {
                            wuLog('createLog dewpoint error');
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
                    function callback(err, success){
                        if (err) {
                            wuLog("createLog precip_today error");
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
                    function callback(err, success){
                        if (err) {
                            wuLog("createLog precip_1hr error");
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
                    function callback(err, success){
                        if (err) {
                            wuLog("createLog uv error");
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
                    function callback(err, success){
                        if (err) {
                            wuLog("createLog visibility error");
                            return Homey.error(err);
                        }
                    });
                break;
            
            default:
                // code block
                break;
        }
    },

    addInsightsEntry: function(logName, value) {
        Homey.manager('insights').createEntry(logName, value, new Date(), function(err, success){
            if (err) triggerErrorFlow("Error creating insights entry: " + JSON.stringify(err));
        })
    }
};

function registerTriggerAndConditionListeners() {
    wuLog("Registering trigger and condition listeners");

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
            if (fullLogging) wuLog("");
            if (fullLogging) wuLog("function temp above");
            if (fullLogging) wuLog("Current temp: " + weatherData.temp);
            if (fullLogging) wuLog("args.variable: " + args.variable);
            if (weatherData.temp > args.variable) {
                if (fullLogging) wuLog("temp " + weatherData.temp + " is above " + args.variable + ", triggering temp above trigger");
                callback(null, true);
            } else {
                if (fullLogging) wuLog("temp " + weatherData.temp + " is not above " + args.variable);
                callback(null, false);
            }
    }

    function tempBelow(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function temp below");
        if (fullLogging) wuLog("Current temp: " + weatherData.temp);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.temp < args.variable) {
            if (fullLogging) wuLog("temp is below!");
            callback(null, true);
        } else {
            if (fullLogging)  wuLog("temp is not below");
            callback(null, false);
        }
    }

    function humAbove(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function hum above");
        if (fullLogging) wuLog("Current hum: " + weatherData.relative_humidity);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.relative_humidity > args.variable) {
            if (fullLogging) wuLog("hum is above!");
            callback(null, true);
        } else {
            if (fullLogging) wuLog("hum is not above");
            callback(null, false);
        }
    }

    function humBelow(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function hum below");
        if (fullLogging) wuLog("Current hum: " + weatherData.relative_humidity);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.relative_humidity < args.variable) {
            if (fullLogging) wuLog("hum is below!");
            callback(null, true);
        } else {
            if (fullLogging) wuLog("hum is not below");
            callback(null, false);
        }
    }

    function uvAbove(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function uv above");
        if (fullLogging) wuLog("Current uv: " + weatherData.uv);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.uv > args.variable) {
            if (fullLogging) wuLog("uv is above!");
            callback(null, true);
        } else {
            if (fullLogging) wuLog("uv is not above");
            callback(null, false);
        }
    }

    function uvBelow(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function uv below");
        if (fullLogging) wuLog("Current uv: " + weatherData.uv);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.uv < args.variable) {
            if (fullLogging) wuLog("uv is below!");
            callback(null, true);
        } else {
            if (fullLogging) wuLog("uv is not below");
            callback(null, false);
        }
    }

    function windAbove(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function wind above");
        if (fullLogging) wuLog("Current wind speed: " + weatherData.wind);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.wind > args.variable) {
            if (fullLogging) wuLog("wind speed is above!");
            callback(null, true);
        } else {
            if (fullLogging) wuLog("wind speed is not above");
            callback(null, false);
        }
    }

    function windBelow(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function wind below");
        if (fullLogging) wuLog("Current wind: " + weatherData.wind);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.wind < args.variable) {
            if (fullLogging) wuLog("wind is below!");
            callback(null, true);
        } else {
            if (fullLogging) wuLog("wind is not below");
            callback(null, false);
        }
    }

    function windgustAbove(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function windgust above");
        if (fullLogging) wuLog("Current wind gust: " + weatherData.wind_gust);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.wind_gust > args.variable) {
            if (fullLogging) wuLog("wind speed is above!");
            callback(null, true);
        } else {
            if (fullLogging) wuLog("wind speed is not above");
            callback(null, false);
        }
    }

    function windgustBelow(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function windgust below");
        if (fullLogging) wuLog("Current wind gust: " + weatherData.wind_gust);
        if (fullLogging) wuLog("args.variable: " + args.variable);
        if (weatherData.wind_gust < args.variable) {
            if (fullLogging) wuLog("windgust is below!");
            callback(null, true);
        } else {
            if (fullLogging) wuLog("windgust is not below");
            callback(null, false);
        }
    }

    function readForecast_today(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function readForecast_today");
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(0);
            callback(null, true);
        } else {
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tonight(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function readForecast_tonight");
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(1);
            callback(null, true);
        } else {
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tomorrow(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function readForecast_tomorrow");
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(2);
            callback(null, true);
        } else {
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_tomorrowNight(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function readForecast_tomorrowNight");
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(3);
            callback(null, true);
        } else {
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast_dayAfterTomorrow(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function readForecast_tomorrowNight");
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(5);
            callback(null, true);
        } else {
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readRain_hour(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function readForecast_tomorrow");
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(2);
            callback(null, true);
        } else {
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readRain_today(callback, args) {
        if (fullLogging) wuLog("");
        if (fullLogging) wuLog("function readForecast_tomorrowNight");
        if (value_exist(forecastData) && forecastData.length > 0) {
            readForecast(3);
            callback(null, true);
        } else {
            Homey.manager('speech-output').say(__("app.speech.weatherDataNotAvailable"));
            callback(null, true);
        }
    }

    function readForecast(day) {
        var forecastText;
        if (isInt(day)) {
            if (units_metric)
                forecastText = forecastData[day].fcttext_metric;
            else
                forecastText = forecastData[day].fcttext;
            Homey.log('forecast text', forecastText);
            if (value_exist(forecastText)) Homey.manager('speech-output').say(forecastText);
            else Homey.manager('speech-output').say(__("app.speech.somethingWrong"));
        }
    }
}

function registerWarningAndPerformanceListeners() {
    try {
        wuLog("Registering app unload listener");
        Homey.on('unload', self.unload);
    } catch (err) {
        wuLog('Registration for one of the app warning and performance listeners failed!')
    }
}

function parseSpeech(speech, callback) {
    wuLog("");
    wuLog("parseSpeech");

    // On very first start units aren't always there yet
    if (!value_exist(units_metric)) {
        units_metric = Homey.manager('settings').get('units_metric');
        var units_imperial = Homey.manager('settings').get('units_imperial');
        var units_auto = Homey.manager('settings').get('units_auto');
        var homey_units = Homey.manager('i18n').getUnits();

        if (units_auto && value_exist(homey_units) && homey_units != "") {
            Homey.manager('settings').set('currentSettingUnits', 'auto');
            if (homey_units == 'metric') {
                if (fullLogging) wuLog('Autodetected metric units');
                units_metric = true;
            } else {
                if (fullLogging) wuLog('Autodetected imperial units');
                units_metric = false;
            }
        }
    }

    self.updateForecast();
    self.updateWeather();

    if (value_exist(forecastData) && forecastData.length > 0 && value_exist(weatherData) && Object.keys(weatherData).length > 0) {
        wuLog("Weather and forecast data available");

        /* Units available:
         var temp_unit = unitData.temp_unit;
         var distance_unit = unitData.distance_unit;
         var speed_unit = unitData.speed_unit;
         var pressure_unit = unitData.pressure_unit;
         var distance_small_unit = unitData.distance_small_unit;
         */

        speech.triggers.some(function (trigger) {

            switch (trigger.id) {
                case 'weather_tomorrow' :
                    wuLog("weather_tomorrow");
                    var forecastText;

                    if (units_metric)
                        forecastText = forecastData[2].fcttext_metric;
                    else
                        forecastText = forecastData[2].fcttext;

                    speech.say(forecastText);
                    callback(null, true);
                    return true;

                case 'weather_dayAfterTomorrow' :
                    wuLog("weather_dayAfterTomorrow");
                    var forecastText;

                    if (units_metric)
                        forecastText = forecastData[4].fcttext_metric;
                    else
                        forecastText = forecastData[4].fcttext;

                    speech.say(forecastText);
                    callback(null, true);
                    return true;

                case 'weather_today' :
                    wuLog("weather_today");
                    var forecastText;

                    if (units_metric)
                        forecastText = forecastData[0].fcttext_metric;
                    else
                        forecastText = forecastData[0].fcttext;

                    speech.say(forecastText);
                    callback(null, true);
                    return true;

                case 'rain_today' :
                    wuLog("rain_today");
                    var text = __("app.speech.rainToday") + " " + weatherData.precip_today + unitData.distance_small_unit;
                    speech.say(text);
                    text = "";
                    callback(null, true);
                    return true;

                case 'rain_hour' :
                    wuLog("rain_hour");
                    var text = __("app.speech.rainToday") + " " + weatherData.precip_1hr + unitData.distance_small_unit;
                    speech.say(text);
                    text = "";
                    callback(null, true);
                    return true;

                default:
                    // Guess it wasn't meant for this app, return that in the callback
                    callback(true, null);
            }
        });
    } else {
        if (fullLogging) wuLog("!! Weather and forecast not available");
        speech.say(__("app.speech.weatherDataNotAvailableYet"));
        callback(null, true);
    }
}

function testWU(callback, args) {
    wuLog("");
    wuLog("TestWU API call");

    var Wunderground = require('wundergroundnode');
    var wundergroundKey = args.body.wundergroundkey;
    var address = args.body.address;
    var language = Homey.manager('i18n').getLanguage();

    Homey.log('Testing for location:', address);

    if (!value_exist(wundergroundKey) || wundergroundKey == "" || wundergroundKey == null) {
        if (fullLogging) wuLog("Weather underground key is empty, using Inversion key");
        wundergroundKey = Homey.env.WUNDERGROUND_KEY;
    } else wuLog('Using user defined Weather Underground key');

    var wunderground = new Wunderground(wundergroundKey, language);

    if (address && value_exist(address)) {
        // Get weather data
        try {
            wunderground.conditions().request(address, function(err, response) {

                var error = false;
                var err_msg = '';

                try {
                    // If error is in the response, something must have gone wrong
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
                        var temp = response.current_observation.temp_c;
                        error = false;
                    } catch(err) {
                        // That's gone wrong, let's create our own error message
                        response = { response:
                        { error:
                        { description: 'Undefined error, please try city and country without spaces' } } }
                        error = true;
                    }
                }

                if (!err && !error) {
                    if (fullLogging) wuLog("Weather response received");

                    // Return specific data
                    var temp = response.current_observation.temp_c;
                    var city = response.current_observation.display_location.city;
                    var country = response.current_observation.display_location.country;
                    var data = {'temp' : temp, 'city' : city, 'country' : country};
                    callback(null, data);

                } else {
                    // Catch error
                    wuLog("Wunderground request error");
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

function triggerErrorFlow(errorMsg) {
    if (fullLogging) Homey.log('Error!', errorMsg);

    if (useNotifications) sendNotification(errorMsg);
    
    var tokens = {'error': errorMsg};
    Homey.manager('flow').trigger('error', tokens);
}

function sendNotification(text) {
    Homey.manager('notifications').createNotification({
        excerpt: text
    }, function (err, notification) {
        if (fullLogging) Homey.log('Sent notification error:', err);
        if (fullLogging) Homey.log('Sent notification:', notification);
    });
}

function wuLog(message) {
    // Log.captureMessage( message );
    Homey.log(message);
}


module.exports = self;
module.exports.testWU = testWU;
module.exports.getlocation = self.getLocation;