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

// these are the methods that respond to get/set calls from Homey
// for example when a user pressed a button
module.exports.capabilities = {
    measure_temperature: {

        // this function is called by Homey when it wants to GET the dim state, e.g. when the user loads the smartphone interface
        // `device_data` is the object as saved during pairing
        // `callback` should return the current value in the format callback( err, value )
        get: function( device_data, callback ){

            Homey.log('Get temperature');
            Homey.api('POST', '/get/weather/', {
            }, function(err, result) {
                if (!err) {
                    Homey.log('No error, weather data:', result);
                } else {
                    Homey.log('Error!', err);
                }

            });

            // get the bulb with a locally defined function
            var device = getDeviceByData( device_data );
            if( device instanceof Error ) return callback( device );

            return callback( null, device.LastUsage );
        }
    },
    measure_humidity: {
        get: function( device_data, callback ){
        var device = getDeviceByData( device_data );
        if( device instanceof Error ) return callback( device );

        return callback( null, device.totalKWH );
        }
    },
    measure_pressure: {
        get: function( device_data, callback ){
        var device = getDeviceByData( device_data );
        if( device instanceof Error ) return callback( device );

        return callback( null, device.totalKWH );
        }
    },
    measure_wind_strength: {
        get: function( device_data, callback ){
         var device = getDeviceByData( device_data );
         if( device instanceof Error ) return callback( device );

         return callback( null, device.totalKWH );
        }
    },
    measure_gust_strength: {
         get: function( device_data, callback ){
          var device = getDeviceByData( device_data );
          if( device instanceof Error ) return callback( device );

          return callback( null, device.totalKWH );
         }
    },
    measure_wind_angle: {
      get: function( device_data, callback ){
       var device = getDeviceByData( device_data );
       if( device instanceof Error ) return callback( device );

       return callback( null, device.totalKWH );
      }
    },
    measure_rain: {
        get: function( device_data, callback ){
        var device = getDeviceByData( device_data );
        if( device instanceof Error ) return callback( device );

        return callback( null, device.totalKWH );
        }
    },
    measure_ultraviolet: {
        get: function( device_data, callback ){
        var device = getDeviceByData( device_data );
        if( device instanceof Error ) return callback( device );

        return callback( null, device.totalKWH );
        }
    },
    wu_visibility: {
     get: function( device_data, callback ){
     var device = getDeviceByData( device_data );
     if( device instanceof Error ) return callback( device );

     return callback( null, device.totalKWH );
     }
    },
    wu_description: {
     get: function( device_data, callback ){
     var device = getDeviceByData( device_data );
     if( device instanceof Error ) return callback( device );

     return callback( null, device.totalKWH );
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