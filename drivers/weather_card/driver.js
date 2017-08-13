"use strict";
var request = require('request');
// a list of devices, with their 'id' as key
// it is generally advisable to keep a list of
// paired and active devices in your driver's memory.
var devices = {};
var intervalId = {};

// the `init` method is called when your driver is loaded for the first time
module.exports.init = function( devices_data, callback ) {
  devices_data.forEach(initDevice);
  callback(true, null);
}

// the `added` method is called is when pairing is done and a device has been added
module.exports.added = function( device_data, callback ) {
    initDevice( device_data );

    Homey.log('New device added:', device_data);
    callback( null, true );
}

// the `delete` method is called when a device has been deleted by a user
module.exports.deleted = function( device_data, callback ) {
    delete devices[ device_data.id ];

    Homey.log('Deleting device', device_data);
    callback( null, true );
}

// the `pair` method is called when a user start pairing
module.exports.pair = function( socket ) {
    Homey.log('Pair');
    socket.on('pair', function( device, callback ){
        Homey.log('Pair2');
        callback(null, 'success');
    })
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
            else Homey.log('Weather data is null'); return callback ('weather data is null');
        }
    },
    measure_humidity: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.relative_humidity );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
        }
    },
    measure_pressure: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.pressure );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
        }
    },
    measure_wind_strength: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.wind );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
        }
    },
    measure_gust_strength: {
         get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.wind_gust );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
         }
    },
    measure_wind_angle: {
      get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.wind_degrees );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
      }
    },
    measure_rain: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.precip_today );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
        }
    },
    measure_ultraviolet: {
        get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.uv );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
        }
    },
    wu_visibility: {
     get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.visibility );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
     }
    },
    wu_description: {
     get: function( device_data, callback ){
            var weatherData = Homey.app.getWeatherData();
            if (weatherData != null) return callback( null, weatherData.weather_descr );
            else Homey.log('Weather data is null'); return callback ('weather data is null');
     }
    }
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
    console.log('Added device to devices list:', device_data);
}