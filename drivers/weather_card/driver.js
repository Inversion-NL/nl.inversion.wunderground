"use strict";
const util = require('../../lib/util.js');

const severity = util.severity;
var devices = [];
var intervalId = {};

// the `init` method is called when your driver is loaded for the first time
module.exports.init = function( devices_data, callback ) {
    util.wuLog('Device init:' + JSON.stringify(devices_data), severity.debug);
    devices_data.forEach(initDevice);
    callback(true, null);
}

// the `added` method is called is when pairing is done and a device has been added
module.exports.added = function( device_data, callback ) {
    initDevice( device_data );

    util.wuLog('New device added:' + JSON.stringify(device_data), severity.debug);
    callback( null, true );
}

// the `delete` method is called when a device has been deleted by a user
module.exports.deleted = function( device_data, callback ) {
    delete devices[ device_data.id ];

    util.wuLog('Deleting device' + JSON.stringify(device_data), severity.debug);
    callback( null, true );
}

/*
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
*/

// these are the methods that respond to get/set calls from Homey
// for example when a user pressed a button
module.exports.capabilities = {
    measure_temperature: {

        // this function is called by Homey when it wants to GET the dim state, e.g. when the user loads the smartphone interface
        // `device_data` is the object as saved during pairing
        // `callback` should return the current value in the format callback( err, value )
        get: function( device_data, callback ){

            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.temp );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
        }
    },
    measure_humidity: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.relative_humidity );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
        }
    },
    measure_pressure: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.pressure );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
        }
    },
    measure_wind_strength: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.wind );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
        }
    },
    measure_gust_strength: {
         get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.wind_gust );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
         }
    },
    measure_wind_angle: {
      get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.wind_degrees );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
      }
    },
    measure_rain: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.precip_today );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
        }
    },
    measure_ultraviolet: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.uv );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
        }
    },
    wu_visibility: {
     get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.visibility );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
     }
    },
    wu_description: {
     get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.weather_descr );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
     }
    },
    wu_alert_description: {
     get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.alert_description );
            else util.wuLog('Weather data is null', severity.debug); return callback ('weather data is null');
     }
    }
}

module.exports.updateMobileCardData = function(weatherData) {
    devices.forEach(function(device_data) {
        util.wuLog('Device' + JSON.stringify(device_data), severity.debug);
        module.exports.realtime(device_data.data, 'measure_temperature', weatherData.temp);
        module.exports.realtime(device_data.data, 'measure_humidity', weatherData.relative_humidity);
        module.exports.realtime(device_data.data, 'measure_pressure', weatherData.pressure);
        module.exports.realtime(device_data.data, 'measure_wind_strength', weatherData.wind);
        module.exports.realtime(device_data.data, 'measure_gust_strength', weatherData.wind_gust);
        module.exports.realtime(device_data.data, 'measure_wind_angle', weatherData.wind_degrees);
        module.exports.realtime(device_data.data, 'measure_rain', weatherData.precip_today);
        module.exports.realtime(device_data.data, 'measure_ultraviolet', weatherData.uv);
        module.exports.realtime(device_data.data, 'wu_visibility', weatherData.visibility);
        module.exports.realtime(device_data.data, 'wu_description', weatherData.weather_descr);
        module.exports.realtime(device_data.data, 'wu_alert_description', weatherData.alert_description);
    });
}

// a helper method to get a device from the devices list by it's device_data object
function getDeviceByData( device_data ) {
    var device = devices[ device_data.id ];
    if( typeof device === 'undefined' ) {
        return new Error("invalid_device");
    } else {
        return device;
    }
}

// a helper method to add a device to the devices list
function initDevice( device_data, newSettingsObj, callback) {
    devices[device_data.id] = {};
    devices[device_data.id].data = device_data;
}