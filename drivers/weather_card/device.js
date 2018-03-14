'use strict';

const Homey = require('homey');

class WeatherCard extends Homey.Device {

    // this method is called when the Device is inited
    onInit() {
        this.log('device init');
        this.log('name:', this.getName());
        this.log('class:', this.getClass());
        this.log('settings:', this.getSettings());

        // register a capability listener
        this.registerCapabilityListener('measure_temperature', this.onCapabilitymeasure_temperature.bind(this))
        this.registerCapabilityListener('wu_visibility', this.onCapabilitywu_visibility.bind(this))
    }

    // this method is called when the Device is added
    onAdded() {
        this.log('device added');
    }

    // this method is called when the Device is deleted
    onDeleted() {
        this.log('device deleted');
    }

    // this method is called when the Device has requested a state change
    onCapabilitymeasure_temperature( value, opts, callback ) {

        this.log('value', value);
        this.log('opts', opts);

        // ... set value to real device

        // Then, emit a callback ( err, result )
        callback( null );

        // or, return a Promise
        return Promise.reject( new Error('Switching the device failed!') );
    }

    // this method is called when the Device has requested a state change
    onCapabilitywu_visibility( value, opts, callback ) {

        this.log('value', value);
        this.log('opts', opts);

        // ... set value to real device

        // Then, emit a callback ( err, result )
        callback( null );

        // or, return a Promise
        return Promise.reject( new Error('Switching the device failed!') );
    }

}

module.exports = WeatherCard;