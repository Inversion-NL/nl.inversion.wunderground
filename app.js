"use strict";

var Wunderground = require('wundergroundnode');
var myKey = 'a7256235ef0a930e';
var locale = Homey.manager('i18n').getLanguage();
var wunderground = new Wunderground(myKey);

var difMinute;
var lat = null;
var lon = null;
var temp_c_int;
var oldTemp;

function value_exist(string) {
    if (typeof string != 'undefined') return true;
    else return false;
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
        Homey.manager('flow').on('trigger.temp_below', self.tempBelow);
        Homey.manager('flow').on('condition.temp_below', self.tempBelow);

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
        Homey.log("Current temp: " + temp_c_int)
        Homey.log("args.variable: " + args.variable);
        if (temp_c_int > args.variable) {
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
        Homey.log("Current temp: " + temp_c_int)
        Homey.log("args.variable: " + args.variable);
        if (temp_c_int < args.variable) {
            Homey.log("temp is below!");
            callback(null, true);       // err, result
        } else {
            Homey.log("temp is not below");
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
                    Homey.log("Request error:");
                    return Homey.error(err);
                } else {
                    //Homey.log(response);
                    var city = response.current_observation.display_location.city;
                    var weather_state = response.current_observation.weather;
                    var temp_c_str = response.current_observation.temp_c;
                    var relative_humidity = response.current_observation.relative_humidity;
                    var observation_epoch = response.current_observation.observation_epoch;
                    var wind_dir = response.current_observation.wind_dir;
                    var wind_degrees = response.current_observation.wind_degrees;
                    var wind_kph = response.current_observation.wind_kph;
                    var pressure_mb = response.current_observation.pressure_mb;
                    var dewpoint_c = response.current_observation.dewpoint_c;
                    var feelslike_c = response.current_observation.feelslike_c;

                    if (value_exist(city)) Homey.log("City: " + city);
                    if (value_exist(weather_state)) Homey.log("Weather desc: " + weather_state);
                    if (value_exist(wind_dir)) Homey.log("Wind direction: " + wind_dir);
                    if (value_exist(wind_degrees)) Homey.log("Wind degrees: " + wind_degrees);
                    if (value_exist(wind_kph)) Homey.log("Wind speed: " + wind_kph);
                    if (value_exist(dewpoint_c)) Homey.log("Dew point: " + dewpoint_c);
                    if (value_exist(pressure_mb)) {
                        Homey.log("Pressure: " + pressure_mb);
                        pressure_mb = parseInt(pressure_mb);
                    }
                    if (value_exist(feelslike_c)) {
                        Homey.log("Feels like: " + feelslike_c);
                        feelslike_c = parseInt(feelslike_c);
                    }
                    if (value_exist(relative_humidity)) {
                        // Cut % sign
                        relative_humidity = relative_humidity.substring(0, relative_humidity.length - 1);
                        var hum_int = parseInt(relative_humidity);
                        Homey.log("Humidity: " + hum_int);
                    }
                    if (value_exist(temp_c_str)) {
                        // Convert to int
                        temp_c_int = parseInt(temp_c_str);
                        Homey.log("Temp: " + temp_c_int);

                        // Determine if the temp has changed
                        if (!value_exist(oldTemp)){
                            // First time update
                            oldTemp = temp_c_int;
                        }
                        else if (oldTemp != temp_c_int) {
                            Homey.log('oldTemp: ' + oldTemp + ' temp: ' + temp_c_int);
                            oldTemp = temp_c_int;
                            self.tempChanged(temp_c_int, relative_humidity, weather_state);
                        }

                        // Start triggers
                        self.tempAboveBelow(temp_c_int, relative_humidity, weather_state);

                        // Add data to insights
                        self.addInsightsEntryTemp(temp_c_int);
                        self.addInsightsEntryHum(hum_int);
                        self.addInsightsEntryFeelsLike(feelslike_c);
                        self.addInsightsEntryPressure(pressure_mb);
                        self.addInsightsEntryWindSpeed(wind_kph);
                        self.addInsightsEntryDewPoint(dewpoint_c);

                    }
                    if (value_exist(observation_epoch)) {
                        var date = new Date(0);
                        date.setUTCSeconds(observation_epoch);
                        Homey.log("Observation time: " + date);
                    }
                }
            }
      )
    },

    // Handler for status changes
    tempChanged: function(temp, hum, weather) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather': weather};
        Homey.log('Sending trigger temp_changed with tokens: ' + JSON.stringify(tokens));
        Homey.manager('flow').trigger('temp_changed', tokens);
    },

    // Handler for temp triggers and conditions
    tempAboveBelow: function(temp, hum, weather) {
        var tokens = {'temp': temp,
                      'hum': hum,
                      'weather': weather};
        Homey.log('Sending trigger temp_above and temp_below with tokens: ' + JSON.stringify(tokens));
        Homey.manager('flow').trigger('temp_above', tokens);
        Homey.manager('flow').trigger('temp_below', tokens);
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

    addInsightsEntryTemp: function(temp) {
        Homey.manager('insights').createEntry('temp', temp, new Date(), function(err, success){
            if (err) return Homey.error(err);
        })
    },

    addInsightsEntryHum: function(hum) {
        Homey.manager('insights').createEntry('hum', hum, new Date(), function(err, success){
            if (err) return Homey.error(err);
        })
    },

    addInsightsEntryFeelsLike: function(feelslike_c) {
        Homey.manager('insights').createEntry('feelslike_c', feelslike_c, new Date(), function(err, success){
            if (err) return Homey.error(err);
        })
    },

    addInsightsEntryPressure: function(pressure_mb) {
        Homey.manager('insights').createEntry('pressure_mb', pressure_mb, new Date(), function(err, success){
            if (err) return Homey.error(err);
        })
    },

    addInsightsEntryWindSpeed: function(wind_kph) {
        Homey.manager('insights').createEntry('wind_kph', wind_kph, new Date(), function(err, success){
            if (err) return Homey.error(err);
        })
    },

    addInsightsEntryDewPoint: function(dewpoint_c) {
        Homey.manager('insights').createEntry('dewpoint_c', dewpoint_c, new Date(), function(err, success){
            if (err) return Homey.error(err);
        })
    }
}

module.exports = self;