"use strict";

var Wunderground = require('wundergroundnode');
var myKey = 'a7256235ef0a930e';
var locale = Homey.manager('i18n').getLanguage();
var wunderground = new Wunderground(myKey);

var difMinute;
var lat = null;
var lon = null;
var temp_c_global;
var hum_global;
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
        // Set default
        var update = 10;
	
        Homey.log("Initializing Weather Underground");
        Homey.log("");
        Homey.log("Locale: " + locale);

        self.createInsightsLog();

        // Get user settings
        update = Homey.manager('settings').get('update');
        Homey.log('Update every (user setting): ' + update);

        if (update < 10 || update > 1439 || !value_exist(update)) {
            update = 10;                 // in minutes
            Homey.log('Update value out of bounds, changed to: ' + update + ' minutes');
        }

        // Listen for triggers and conditions with a value
        Homey.manager('flow').on('trigger.temp_above', self.tempAbove);
        Homey.manager('flow').on('condition.temp_above', self.tempAbove);
        Homey.manager('flow').on('trigger.hum_below', self.humBelow);
        Homey.manager('flow').on('condition.hum_below', self.humBelow);

        // Get location
        self.getLocation(function (result) {
            // Update weather right now and every 10 minutes
            self.updateWeather(function(difMinute){});

            setInterval(trigger_update.bind(this), update * 60 * 1000); // in milliseconds
            function trigger_update() {
                self.updateWeather(function(difMinute){});
            };
        });
    },

    tempAbove: function(callback, args) {
        Homey.log("");
        Homey.log("function temp above");
        Homey.log("Current temp: " + temp_c_global);
        Homey.log("args.variable: " + args.variable);
        if (temp_c_global > args.variable) {
            Homey.log("temp is above!");
            callback(null, true);       // err, result
        } else {
            Homey.log("temp is not above");
            callback(null, false);   // err, result
        }
    },

    tempBelow: function(callback, args) {
        Homey.log("");
        Homey.log("function temp below");
        Homey.log("Current temp: " + temp_c_global);
        Homey.log("args.variable: " + args.variable);
        if (temp_c_global < args.variable) {
            Homey.log("temp is below!");
            callback(null, true);       // err, result
        } else {
            Homey.log("temp is not below");
            callback(null, false);   // err, result
        }
    },

    humAbove: function(callback, args) {
        Homey.log("");
        Homey.log("function hum above");
        Homey.log("Current hum: " + hum_global);
        Homey.log("args.variable: " + args.variable);
        if (hum_global > args.variable) {
            Homey.log("hum is above!");
            callback(null, true);       // err, result
        } else {
            Homey.log("hum is not above");
            callback(null, false);   // err, result
        }
    },

    humBelow: function(callback, args) {
        Homey.log("");
        Homey.log("function hum below");
        Homey.log("Current hum: " + hum_global);
        Homey.log("args.variable: " + args.variable);
        if (hum_global < args.variable) {
            Homey.log("hum is below!");
            callback(null, true);       // err, result
        } else {
            Homey.log("hum is not below");
            callback(null, false);   // err, result
        }
    },

    //get location
    getLocation: function(callback) {
        Homey.log("Get geolocation");

        Homey.manager('geolocation').on('location', function (location) {
            Homey.log(location);
            lat = location.latitude;
            lon = location.longitude;
        });

        Homey.manager('geolocation').getLocation(function(err, location) {
            if (typeof location.latitude == 'undefined' || location.latitude == 0) {
                locationCallback(new Error("location is undefined"));
                return;
            } else {
                Homey.log(location);
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

        if (lat == undefined) { //if no location, try to get it
            Homey.log("Latitude is undefined, fetching location")
            self.getLocation(function(lat, lon) {  //Get the location, could be that location is not available yet after reboot
            })
        };

        // Set default values
        var country = 'CA'
        var city = 'San_Francisco'
        var address = country + '/' + city;

        // Get user settings
        country = Homey.manager('settings').get('country');
        city = Homey.manager('settings').get('city');

        // Check user settings
        if (value_exist(country) && value_exist(city)) address = country + '/' + city;
        else Homey.log('One of the country/city fields is empty, setting defaults');
        Homey.log('Requesting for: ' + address);

        // Get weather data
        wunderground.conditions().request(address, function(err, response) {
                if (err) {
                    // Catch error
                    Homey.log("Wunderground request error: " + err);
                    return Homey.error(err);
                } else {
                    // Cut % sign
                    var hum = response.current_observation.relative_humidity;
                    var hum_float = parseFloat(hum.substr(0, (hum.length -1)));

                    var weatherData = {
                        city: response.current_observation.display_location.city,
                        weather_descr: response.current_observation.weather,
                        temp_c: parseFloat(response.current_observation.temp_c),
                        relative_humidity: hum_float,
                        observation_epoch: response.current_observation.observation_epoch,
                        pressure_mb: parseInt(response.current_observation.pressure_mb),
                        feelslike_c: parseFloat(response.current_observation.feelslike_c),
                        dewpoint_c: parseFloat(response.current_observation.dewpoint_c),
                        pressure_mb: parseFloat(response.current_observation.pressure_mb),
                        wind_kph: parseFloat(response.current_observation.wind_kph),
                        wind_degrees: parseFloat(response.current_observation.wind_degrees),
                        wind_dir: response.current_observation.wind_dir
                    };

                    Homey.log("Observation time: " + epochToString(weatherData.observation_epoch));

                    // Temperature triggers and conditions
                    if (value_exist(weatherData.temp_c)) {
                        Homey.log('Temp: ' + weatherData.temp_c);

                        // Assign global temp variable
                        temp_c_global = weatherData.temp_c;

                        // Determine if the temp has changed
                        if (!value_exist(oldTemp)){
                            Homey.log('No oldTemp value exists');
                            // First time update after reboot/install
                            oldTemp = weatherData.temp_c;
                        } else if (diff(oldTemp, weatherData.temp_c) >= 1) {
                            // Only trigger when difference is equal or more then 1 degree
                            Homey.log('oldTemp: ' + oldTemp + ' temp: ' + weatherData.temp_c);
                            oldTemp = weatherData.temp_c;
                            self.tempChanged(weatherData.temp_c, weatherData.relative_humidity, weatherData.weather_descr);
                        }

                        // Start trigger
                        self.tempAboveBelow(weatherData.temp_c, weatherData.relative_humidity, weatherData.weather_descr);
                    } else {
                        // No temperature data available!
                        Homey.log('Temperature is undefined!')
                    }

                    // Humidity triggers and conditions
                    if (value_exist(weatherData.relative_humidity)) {
                        // Determine if the hum has changed
                        if (!value_exist(oldHum)){
                            // First time update after reboot/install
                            oldHum = weatherData.relative_humidity;
                        } else if (diff(oldHum, weatherData.relative_humidity) >= 1) {
                            // Only trigger when difference is equal or more then 1 percent
                            Homey.log('oldHum: ' + oldHum + ' hum: ' + weatherData.relative_humidity);
                            oldHum = weatherData.relative_humidity;
                            self.humChanged(weatherData.temp_c, weatherData.relative_humidity, weatherData.weather_descr);
                        }

                        // Start trigger
                        self.humAboveBelow(weatherData.temp_c, weatherData.relative_humidity, weatherData.weather_descr);
                    } else {
                        // No temperature data available!
                        Homey.log('Humidity is undefined!')
                    }

                    // Add data to insights
                    self.addInsightsEntry('temp', weatherData.temp_c);
                    self.addInsightsEntry('hum', hum_float);
                    self.addInsightsEntry('feelslike_c', weatherData.feelslike_c);
                    self.addInsightsEntry('pressure_mb', weatherData.pressure_mb);
                    self.addInsightsEntry('wind_kph', weatherData.wind_kph);
                    self.addInsightsEntry('dewpoint_c', weatherData.dewpoint_c);
                }
            }
      )
    },

    // Handler for temp status changes
    tempChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        Homey.log('Sending trigger temp_changed with tokens: ' + JSON.stringify(tokens));
        Homey.manager('flow').trigger('temp_changed', tokens);
    },

    // Handler for temp status changes
    humChanged: function(temp, hum, weather_descr) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather_descr': weather_descr};
        Homey.log('Sending trigger hum_changed with tokens: ' + JSON.stringify(tokens));
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

    createInsightsLog: function() {

        Homey.manager('insights').createLog('temp', {
            label: {
                en: 'Temperature',
                nl: 'Temperature'
            },
            type: 'number',
            units: {
                en: 'C',
                nl: 'C'
            },
            decimals: 0
            },
        function callback(err, success){
            if(err) {
                Homey.log('createLog temp');
                return Homey.error(err);
            }
        });

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
            if(err) {
                Homey.log('createLog hum');
                return Homey.error(err);
            }
        });

        Homey.manager('insights').createLog('feelslike_c', {
            label: {
                en: 'Feels like',
                nl: 'Gevoelstemperatuur'
            },
            type: 'number',
            units: {
                en: 'C',
                nl: 'C'
            },
            decimals: 0
            },
        function callback(err, success){
            if(err) {
                Homey.log('createLog feelslike_c');
                return Homey.error(err);
            }
        });

        Homey.manager('insights').createLog('pressure_mb', {
            label: {
                en: 'Pressure',
                nl: 'Luchtdruk'
            },
            type: 'number',
            units: {
                en: 'mbar',
                nl: 'mbar'
            },
            decimals: 0
            },
        function callback(err, success){
            if(err) {
                Homey.log('createLog pressure_mb');
                return Homey.error(err);
            }
        });

        Homey.manager('insights').createLog('wind_kph', {
            label: {
                en: 'Wind speed',
                nl: 'Windsnelheid'
            },
            type: 'number',
            units: {
                en: 'kph',
                nl: 'kph'
            },
            decimals: 0
            },
        function callback(err, success){
            if(err) {
                Homey.log('createLog wind_kph');
                return Homey.error(err);
            }
        });

        Homey.manager('insights').createLog('dewpoint_c', {
            label: {
                en: 'Dew point',
                nl: 'Dauwpunt'
            },
            type: 'number',
            units: {
                en: 'C',
                nl: 'C'
            },
            decimals: 0
            },
        function callback(err, success){
            if(err) {
                Homey.log('createLog dewpoint_c');
                return Homey.error(err);
            }
        });

    },

    addInsightsEntry: function(logName, value) {
        Homey.manager('insights').createEntry(logName, value, new Date(), function(err, success){
            if (err) return Homey.error(err);
        })
    }
}

module.exports = self;