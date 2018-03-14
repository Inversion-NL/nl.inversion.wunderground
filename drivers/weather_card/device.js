'use strict';

const Homey = require('homey');

var weatherData = {};

class WeatherCard extends Homey.Device {

    // this method is called when the Device is inited
    onInit() {
        this.log('device init');
        this.log('name:', this.getName());
        this.log('class:', this.getClass());
        this.log('settings:', this.getSettings());

        this.intervalId = setInterval(this.updateWeatherData.bind(this), 1000 * 60 * 1); // 1 min
        this.updateWeatherData();
    }

    // this method is called when the Device is added
    onAdded() {
        this.log('device added');
    }

    // this method is called when the Device is deleted
    onDeleted() {
        this.log('device deleted');
    }

    updateWeatherData() {

        /*
        weatherData = {
            city: testWeatherData(response.current_observation.display_location.city),
            country: testWeatherData(response.current_observation.display_location.country),
            weather_descr: testWeatherData(response.current_observation.weather),
            relative_humidity: humToFloat(testWeatherData(response.current_observation.relative_humidity)),
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
            precip_today: precip_today,
            alert_level: alertData.level,
            alert_description: alertData.description
        };
        */

        weatherData = Homey.app.getWeatherData();
        if (weatherData != null) {
            this.log('Updating device capabilities')
            this.setCapabilityValue('measure_temperature', weatherData.temp);
            this.setCapabilityValue('measure_humidity', weatherData.relative_humidity);
            this.setCapabilityValue('measure_pressure', weatherData.pressure);
            this.setCapabilityValue('measure_wind_strength', weatherData.wind);
            this.setCapabilityValue('measure_gust_strength', weatherData.wind_gust);
            this.setCapabilityValue('measure_wind_angle', weatherData.wind_degrees);
            this.setCapabilityValue('measure_rain', weatherData.precip_today);
            this.setCapabilityValue('measure_ultraviolet', weatherData.uv);
            this.setCapabilityValue('wu_visibility', weatherData.visibility);
            this.setCapabilityValue('wu_description', weatherData.weather_descr);
            this.setCapabilityValue('wu_alert_description', weatherData.alert_description);
        } else this.log('weatherData ==  null, not updating device capabilities')
    }
}

module.exports = WeatherCard;