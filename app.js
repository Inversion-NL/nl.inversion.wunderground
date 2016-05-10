"use strict";

var Wunderground = require('wundergroundnode');
var locale = Homey.manager('i18n').getLanguage();
var wunderground;

var defaultUpdateTime = 60;
var maxLocationGetTries = 3;
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

var units_imperial = false;
var units_metric = true;
var interval;
var update_frequenty = defaultUpdateTime;
var locationGetCounter = 1;
var difMinute;
var lat = null;
var lon = null;
var address;
var weatherData = {};

// Variables for when value has changed
var oldTemp;
var oldHum;

function value_exist(string) {
    if (typeof string != 'undefined') return true;
    else return false;
}

function epochToString(epoch) {
    var date = new Date(0);
    date.setUTCSeconds(epoch);
    return date;
}

function diff(a,b) {
    return Math.abs(a-b);
}

var self = {
    // this `init` function will be run when Homey is done loading
    init: function() {
        
        Homey.log("Initializing Weather Underground");
        Homey.log("");
        Homey.log("Locale: " + locale);

        self.checkInsightsLogs();
        self.checkSettings();

        // Listen for triggers and conditions
        Homey.manager('flow').on('trigger.temp_above', self.tempAbove);
        Homey.manager('flow').on('condition.temp_above', self.tempAbove);
        Homey.manager('flow').on('trigger.temp_below', self.tempBelow);
        Homey.manager('flow').on('condition.temp_below', self.tempBelow);
        
        Homey.manager('flow').on('trigger.hum_above', self.humAbove);
        Homey.manager('flow').on('condition.hum_above', self.humAbove);
        Homey.manager('flow').on('trigger.hum_below', self.humBelow);
        Homey.manager('flow').on('condition.hum_below', self.humBelow);

        Homey.manager('flow').on('trigger.uv_above', self.uvAbove);
        Homey.manager('flow').on('condition.uv_above', self.uvAbove);
        Homey.manager('flow').on('trigger.uv_below', self.uvBelow);
        Homey.manager('flow').on('condition.uv_below', self.uvBelow);
        
        Homey.manager('flow').on('trigger.wind_above', self.windAbove);
        Homey.manager('flow').on('condition.wind_above', self.windAbove);
        Homey.manager('flow').on('trigger.wind_below', self.windBelow);
        Homey.manager('flow').on('condition.wind_below', self.windBelow);
        
        Homey.manager('flow').on('trigger.windgust_above', self.windgustAbove);
        Homey.manager('flow').on('condition.windgust_above', self.windgustAbove);
        Homey.manager('flow').on('trigger.windgust_below', self.windgustBelow);
        Homey.manager('flow').on('condition.windgust_below', self.windgustBelow);
        
        // Listen for changes in settings
        Homey.manager('settings').on('set', self.settingsChanged);

        // Get location
        self.getLocation(function (result) {
            // Update weather right now and schedule every user defined minutes
            self.updateWeather(function(difMinute){});
            self.scheduleWeather(update_frequenty);
        });
    },
    
    scheduleWeather: function(update_frequenty) {
      Homey.log("");
      Homey.log("Schedule weather every " + update_frequenty + " minutes");
      interval = setInterval(trigger_update.bind(this), update_frequenty * 60 * 1000); // To minutes
          function trigger_update() {
              self.updateWeather(function(difMinute){});
          }; 
    },
    
    checkSettings: function() {
        Homey.log("");
        Homey.log("Check settings");
        
        // Check if user provided a key in settings
        var myKey = Homey.manager('settings').get('wundergroundKey');
        units_imperial = Homey.manager('settings').get('units_imperial');
        units_metric = Homey.manager('settings').get('units_metric');
        Homey.log("units_imperial: " + units_imperial);
        Homey.log("units_metric: " + units_metric);
        
        if (!value_exist(units_imperial)) units_imperial = false;
        if (!value_exist(units_metric)) units_metric = true;

        var usePersonalKey = false;
        if (!value_exist(myKey) || myKey == "") {
            Homey.log("No personal key defined by user");
            var inversionKey = Homey.env.WUNDERGROUND_KEY;
            self.initWunderground(inversionKey);
            Homey.log("Using Weather Underground Inversion key");
        } else {
            Homey.log("Personal key defined by user");
            usePersonalKey = true;
            self.initWunderground(myKey);
            Homey.log("Using Weather Underground personal key");
        }
        
        // Get user settings for update frequenty
        update_frequenty = Homey.manager('settings').get('updateFrequenty');
        Homey.log("Update every (user setting): " + update_frequenty);

        if (!usePersonalKey) {
            // Using Inversion key, max update frequenty is 60 minutes
            if (update_frequenty < defaultUpdateTime || update_frequenty > 1439 || !value_exist(update_frequenty)) {
                Homey.log("Update value out of bounds: " + update_frequenty + " minutes");
                update_frequenty = defaultUpdateTime;                 // in minutes
                Homey.log("Update value: " + update_frequenty + " minutes");
            }
        } else {
            // Using user personal key
            if (update_frequenty < 1 || update_frequenty > 1439 || !value_exist(update_frequenty)) {
                // Defaulting back to 60 minutes
                Homey.log("Update value out of bounds: " + update_frequenty + " minutes");
                update_frequenty = defaultUpdateTime;                 // in minutes
                Homey.log("Update value: " + update_frequenty + " minutes");
            }
        }
        
        // Set default values
        var country = 'Netherlands'
        var city = 'Amsterdam'
        address = country + '/' + city;
        var autolocation = true;

        // Get user settings
        country = Homey.manager('settings').get('country');
        city = Homey.manager('settings').get('city');
        autolocation = Homey.manager('settings').get('autolocation');

        // Check user settings
        if (autolocation) {
            Homey.log("Use Homey's location");
            if (value_exist(lat) && value_exist(lon) && lat != 0 && lon != 0 && lat != null && lon != null) {
                Homey.log("Using lat lon for location");
                Homey.log("lat: " + lat + " lon: " + lon);
                address = lat + ',' + lon;
            } else {
                Homey.log("Lat lon data invalid"); 
                if (locationGetCounter <= maxLocationGetTries) {
                    Homey.log("Fetching location, try " + locationGetCounter + " of " + maxLocationGetTries)
                    locationGetCounter++;
                    self.getLocation(function(lat, lon) {
                        Homey.log("Location found, start checking settings"); 
                        self.checkSettings();
                        return;
                    });
                    return;
                } else if (value_exist(country) && value_exist(city) && country != "" && city != "") {
                    Homey.log("Using country and city for location");
                    address = country + '/' + city;
                } else { 
                    Homey.log("One of the country/city fields is empty, using defaults");
                    address = "Netherlands/Amsterdam";
                }
                Homey.log("Resetting locationGetCounter"); 
                locationGetCounter = 0;
            }
        } else if (value_exist(country) && value_exist(city) && country != "" && city != "") {
            Homey.log("Using country and city for location");
            address = country + '/' + city;
        } else { 
            Homey.log("One of the country/city fields is empty, using defaults");
            address = "Netherlands/Amsterdam";
        }
    },
    
    initWunderground: function(key) {
        Homey.log("");
        Homey.log("initWunderground");
        if (wunderground != null) {
            Homey.log("wunderground != null");
            //wunderground = null;
        }
        wunderground = new Wunderground(key);
    },
    
    settingsChanged: function(settingname) {
        Homey.log("");
        Homey.log("Setting has changed: " + settingname);

        // If key has changed
        if (settingname == 'updateFrequenty') {
            // If the frequenty is change we have to cancel the current interval and schedule a new
            self.checkSettings();
            Homey.log("Clearing current interval: " + interval);
            clearInterval(interval);
            Homey.log("Scheduling weather update every: " + update_frequenty);
            self.scheduleWeather(update_frequenty);
            Homey.log("Fetching weather right now");
            self.updateWeather();
        } else {
            self.checkSettings();
        }
    },

    tempAbove: function(callback, args) {
        Homey.log("");
        Homey.log("function temp above");
        Homey.log("Current temp: " + weatherData.temp);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.temp > args.variable) {
            Homey.log("temp " + weatherData.temp + " is above " + args.variable + ", triggering temp above trigger");
            callback("temp " + weatherData.temp + " is above " + args.variable, true);
        } else {
            Homey.log("temp " + weatherData.temp + " is not above " + args.variable);
            callback("temp is not above", false);
        }
    },

    tempBelow: function(callback, args) {
        Homey.log("");
        Homey.log("function temp below");
        Homey.log("Current temp: " + weatherData.temp);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.temp < args.variable) {
            Homey.log("temp is below!");
            callback(null, true);
        } else {
            Homey.log("temp is not below");
            callback(null, false);
        }
    },

    humAbove: function(callback, args) {
        Homey.log("");
        Homey.log("function hum above");
        Homey.log("Current hum: " + weatherData.relative_humidity);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.relative_humidity > args.variable) {
            Homey.log("hum is above!");
            callback(null, true);
        } else {
            Homey.log("hum is not above");
            callback(null, false);
        }
    },

    humBelow: function(callback, args) {
        Homey.log("");
        Homey.log("function hum below");
        Homey.log("Current hum: " + weatherData.relative_humidity);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.relative_humidity < args.variable) {
            Homey.log("hum is below!");
            callback(null, true);
        } else {
            Homey.log("hum is not below");
            callback(null, false);
        }
    },
    
    uvAbove: function(callback, args) {
        Homey.log("");
        Homey.log("function uv above");
        Homey.log("Current uv: " + weatherData.uv);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.uv > args.variable) {
            Homey.log("uv is above!");
            callback(null, true);
        } else {
            Homey.log("uv is not above");
            callback(null, false);
        }
    },
    
    uvBelow: function(callback, args) {
        Homey.log("");
        Homey.log("function uv below");
        Homey.log("Current uv: " + weatherData.uv);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.uv < args.variable) {
            Homey.log("uv is below!");
            callback(null, true);
        } else {
            Homey.log("uv is not below");
            callback(null, false);
        }
    },
    
    windAbove: function(callback, args) {
        Homey.log("");
        Homey.log("function wind above");
        Homey.log("Current wind speed: " + weatherData.wind);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.wind > args.variable) {
            Homey.log("wind speed is above!");
            callback(null, true);
        } else {
            Homey.log("wind speed is not above");
            callback(null, false);
        }
    },
    
    windBelow: function(callback, args) {
        Homey.log("");
        Homey.log("function wind below");
        Homey.log("Current wind: " + weatherData.wind);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.wind < args.variable) {
            Homey.log("wind is below!");
            callback(null, true);
        } else {
            Homey.log("wind is not below");
            callback(null, false);
        }
    },
    
    windgustAbove: function(callback, args) {
        Homey.log("");
        Homey.log("function windgust above");
        Homey.log("Current wind gust: " + weatherData.wind_gust);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.wind_gust > args.variable) {
            Homey.log("wind speed is above!");
            callback(null, true);
        } else {
            Homey.log("wind speed is not above");
            callback(null, false);
        }
    },
    
    windgustBelow: function(callback, args) {
        Homey.log("");
        Homey.log("function windgust below");
        Homey.log("Current wind gust: " + weatherData.wind_gust);
        Homey.log("args.variable: " + args.variable);
        if (weatherData.wind_gust < args.variable) {
            Homey.log("windgust is below!");
            callback(null, true);
        } else {
            Homey.log("windgust is not below");
            callback(null, false);
        }
    },

    //get location
    getLocation: function(callback) {
        Homey.log("");
        Homey.manager('geolocation').on('location', function (location) {
            Homey.log("Homey location changed");
            Homey.log(location);
            lat = location.latitude;
            lon = location.longitude;
        });

        Homey.manager('geolocation').getLocation(function(err, location) {
            if (typeof location.latitude == 'undefined' || location.latitude == 0) {
                callback(new Error("location is undefined"));
                return;
            } else {
                lat = location.latitude;
                lon = location.longitude;
                callback(lat, lon);
            }
        });
    },

    // update the weather
    updateWeather: function() {
        Homey.log("");
        Homey.log("Update Weather");
        Homey.log('Requesting for location: ' + address);

        // Get weather data
        wunderground.conditions().request(address, function(err, response) {
                if (err) {
                    // Catch error
                    Homey.log("Wunderground request error: " + response);
                    return Homey.error(response);
                } else {
                    // Cut % sign
                    var hum = response.current_observation.relative_humidity;
                    var hum_float = parseFloat(hum.substr(0, (hum.length -1)));
                    
                    // Use correct user units
                    if (units_metric) {
                        var temp = parseFloat(response.current_observation.temp_c);
                        var feelslike = parseFloat(response.current_observation.feelslike_c);
                        var dewpoint = parseFloat(response.current_observation.dewpoint_c);
                        var pressure = parseFloat(response.current_observation.pressure_mb);
                        var wind = parseFloat(response.current_observation.wind_kph);
                        var wind_gust = parseFloat(response.current_observation.wind_gust_kph);
                        var visibility = parseFloat(response.current_observation.visibility_km);
                        var precip_1hr = parseFloat(response.current_observation.precip_1hr_metric);
                        var precip_today = parseFloat(response.current_observation.precip_today_metric);
                    } else {
                        var temp = parseFloat(response.current_observation.temp_f);
                        var feelslike = parseFloat(response.current_observation.feelslike_f);
                        var dewpoint = parseFloat(response.current_observation.dewpoint_f);
                        var pressure = parseFloat(response.current_observation.pressure_in);
                        var wind = parseFloat(response.current_observation.wind_mph);
                        var wind_gust = parseFloat(response.current_observation.wind_gust_mph);
                        var visibility = parseFloat(response.current_observation.visibility_mi);
                        var precip_1hr = parseFloat(response.current_observation.precip_1hr_in);
                        var precip_today = parseFloat(response.current_observation.precip_today_in);
                    }
                    
                    // Reset values they where not a number or below zero
                    if (precip_1hr == "NaN") precip_1hr = 0;
                    if (precip_today == "NaN") precip_today = 0;
                    var uv = parseFloat(response.current_observation.UV);
                    if (uv < 0) uv = 0;

                    weatherData = {
                        city: response.current_observation.display_location.city,
                        country: response.current_observation.display_location.country,
                        weather_descr: response.current_observation.weather,
                        relative_humidity: hum_float,
                        observation_epoch: response.current_observation.observation_epoch,
                        wind_degrees: parseFloat(response.current_observation.wind_degrees),
                        wind_dir: response.current_observation.wind_dir,
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
                    Homey.log("Weather data:");
                    Homey.log(weatherData);

                    // Temperature triggers and conditions
                    if (value_exist(weatherData.temp)) {

                        // Determine if the temp has changed
                        if (!value_exist(oldTemp)){
                            Homey.log("No oldTemp value exists, maybe it's the first start of app");
                            // First time update after reboot/install
                            oldTemp = weatherData.temp;
                        } else if (diff(oldTemp, weatherData.temp) >= 1) {
                            // Only trigger when difference is equal or more then 1 degree
                            Homey.log("oldTemp: " + oldTemp + " temp: " + weatherData.temp);
                            oldTemp = weatherData.temp;
                            self.tempChanged(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                        }

                        // Start trigger
                        self.tempAboveBelow(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                    } else {
                        // No temperature data available!
                        Homey.log("Temperature is undefined!")
                    }

                    // Humidity triggers and conditions
                    if (value_exist(weatherData.relative_humidity)) {
                        // Determine if the hum has changed
                        if (!value_exist(oldHum)){
                            // First time update after reboot/install
                            oldHum = weatherData.relative_humidity;
                        } else if (diff(oldHum, weatherData.relative_humidity) >= 1) {
                            // Only trigger when difference is equal or more then 1 percent
                            Homey.log("oldHum: " + oldHum + " hum: " + weatherData.relative_humidity);
                            oldHum = weatherData.relative_humidity;
                            self.humChanged(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                        }

                        // Start trigger
                        self.humAboveBelow(weatherData.temp, weatherData.relative_humidity, weatherData.weather_descr);
                    } else {
                        // No temperature data available!
                        Homey.log("Humidity is undefined!")
                    }
                    
                    // UV triggers and conditions
                    if (value_exist(weatherData.uv)) {
                        // Start trigger
                        self.uvAboveBelow(weatherData.uv);
                    } else {
                        // No temperature data available!
                        Homey.log("UV is undefined!")
                    }
                    
                    // Wind triggers and conditions
                    if (value_exist(weatherData.wind)) {
                        // Start trigger
                        self.windAboveBelow(weatherData.wind);
                    } else {
                        // No temperature data available!
                        Homey.log("Wind is undefined!")
                    }
                             
                    // Wind gust triggers and conditions
                    if (value_exist(weatherData.wind_gust)) {
                        // Start trigger
                        self.windgustAboveBelow(weatherData.wind_gust);
                    } else {
                        // No temperature data available!
                        Homey.log("Wind_gust is undefined!")
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
                }
            }
      )
    },

    // Handler for temp status changes
    tempChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        Homey.log("Sending trigger temp_changed with tokens: " + JSON.stringify(tokens));
        Homey.manager('flow').trigger('temp_changed', tokens);
    },

    // Handler for temp status changes
    humChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        Homey.log("Sending trigger hum_changed with tokens: " + JSON.stringify(tokens));
        Homey.manager('flow').trigger('hum_changed', tokens);
    },

    // Handler for temp triggers and conditions
    tempAboveBelow: function(temp, hum, weather_descr) {
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
        Homey.log("Deleting log " + log);
        
        Homey.manager('insights').deleteLog(log, function callback(err , success){
            if (err) return Homey.error(err);
            else Homey.log("Log " + log + " deleted");
        });  
    },
    
    deleteAllInsightsLogs: function() {
        Homey.log("");
        Homey.log("deleteAllInsightsLogs");
        
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
        Homey.log("");
        Homey.log("checkInsightsLogs");
        
        // self.deleteInsightsLog("precip_today");
        
        Homey.manager('insights').getLogs(function callback(err, logs) {
            if (err) {
                // Error, let's create them all
                Homey.log("Error in getting the Insights logs, create all Insights logs");
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
                        Homey.log("Log " + logs[l].name + " is old and will be deleted");
                        self.deleteInsightsLog(logs[l].name);
                    }
                }
                // Let's check all required logs are there on Homey
                for (var l in insightsLogs) {
                    if (currentInsightLogs.indexOf(insightsLogs[l]) < 0) {
                        Homey.log("Log " + insightsLogs[l] + " is not on Homey");
                        self.createInsightsLogs(insightsLogs[l]);
                    }
                }
            }   
        }); 
    },

    createInsightsLogs: function(log) {
        Homey.log("");
        Homey.log("createInsightsLogs");
        Homey.log("Create Insights log: " + log);
        
        switch(log) {
            case 'temp':
                Homey.manager('insights').createLog('temp', {
                label: {
                    en: 'Temperature',
                    nl: 'Temperature'
                },
                type: 'number',
                units: {
                    en: '&degF',
                    nl: '&degC'
                },
                decimals: 2
                },
                function callback(err, success){
                    if (err) {
                        Homey.log('createLog temp error');
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
                        Homey.log('createLog hum error');
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
                        en: '&degF',
                        nl: '&degC'
                    },
                    decimals: 2
                    },
                    function callback(err, success){
                        if (err) {
                            Homey.log('createLog feelslike error');
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
                        en: 'inch',
                        nl: 'mbar'
                    },
                    decimals: 2
                    },
                    function callback(err, success){
                        if (err) {
                            Homey.log('createLog pressure error');
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
                        en: 'mph',
                        nl: 'kph'
                    },
                    decimals: 2
                    },
                    function callback(err, success){
                        if (err) {
                            Homey.log('createLog wind error');
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
                        en: 'mph',
                        nl: 'kph'
                    },
                    decimals: 2
                    },
                    function callback(err, success){
                        if (err) {
                            Homey.log('createLog wind_gust error');
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
                            Homey.log('createLog wind_degrees error');
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
                        en: '&degF',
                        nl: '&degC'
                    },
                    decimals: 0
                    },
                    function callback(err, success){
                        if (err) {
                            Homey.log('createLog dewpoint error');
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
                        en: 'inch',
                        nl: 'mm'
                    },
                    decimals: 2
                    },
                    function callback(err, success){
                        if (err) {
                            Homey.log("createLog precip_today error");
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
                        en: 'inch',
                        nl: 'mm'
                    },
                    decimals: 2
                    },
                    function callback(err, success){
                        if (err) {
                            Homey.log("createLog precip_1hr error");
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
                            Homey.log("createLog uv error");
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
                        en: 'mi',
                        nl: 'km'
                    },
                    decimals: 2
                    },
                    function callback(err, success){
                        if (err) {
                            Homey.log("createLog visibility error");
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
            if (err) return Homey.error(err);
        })
    }
}

function testWU(callback, args) {
    
    Homey.log("");
    Homey.log("TestWU");
    Homey.log("args:", args);
    
    var Wunderground = require('wundergroundnode');
    var wundergroundKey = args.body.wundergroundKey;
    var wunderground = new Wunderground(wundergroundKey);
    var address = "Netherlands/Amsterdam";

    if (wundergroundKey == "" || wundergroundKey == null) {
        Homey.log("Weather underground key is empty, using Inversion key");
        wundergroundKey = Homey.env.WUNDERGROUND_KEY;     
    }
    
    // Get weather data
    wunderground.conditions().request(address, function(err, response) {

        if (err) {
            // Catch error
            callback (response, false);
            return Homey.log("Wunderground request error: " + response);
        } else {
            Homey.log("Weather response received");
            
            // Return weather request
            var temp = response.current_observation.temp_c;
            var city = response.current_observation.display_location.city;
            var country = response.current_observation.display_location.country;
            
            var data = {'temp' : temp, 'city' : city, 'country' : country};
            Homey.log(data);
            
            callback (data, true);
        }
    });
    
}

module.exports = self;
module.exports.testWU = testWU;