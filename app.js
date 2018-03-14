'use strict';

const Homey = require('homey');
const wundergroundnode = require('wundergroundnode');

const WuLog = require("/lib/wuLog.js");
const util = require("/lib/util.js");
const weather = require("/lib/weather.js");
const homeyUtil = require("/lib/homeyUtil.js");

var wuLog;

const POLL_INTERVAL = 1000 * 60 * 1; // 1 min
//const wundergroundKey = Homey.env.WUNDERGROUND_KEY;
const wundergroundKey = '5644ef1be96ee9d3'

var wunderground;
var address = '0,0';
var location = {};
var language = 'EN'

var weatherData = {};
var forecastData = {};

// Variables for when value has changed
var oldTemp;
var oldHum;
var oldAlert;

class Wunderground extends Homey.App {
	
	onInit() {
		this.log('Wunderground is running...');
		wuLog = new WuLog(this);

		if (this.getSettings()) {
			this.scheduleWeather();
			this.scheduleForecast();
		} else this.log('Something went wrong getting the app settings.');

	}

	scheduleForecast() {
		this.getForecast();
		this._forecastInterval = setInterval(this.getForecast.bind(this), POLL_INTERVAL);
	}

	scheduleWeather() {
		this.getWeather();
		this._weatherInterval = setInterval(this.getWeather.bind(this), POLL_INTERVAL);
	}

	getSettings() {

		location = homeyUtil.getHomeyLocation();
		if (!util.value_exist(location)) return false;	// return false when location empty

		const language = homeyUtil.getHomeyLanguage();
		address = location.lat + ',' + location.long;
		wunderground = new wundergroundnode(wundergroundKey, language);

		return true;
	}

	getForecast() {
		wuLog.log('Get forecast data');
		wunderground.hourlyForecast().request(address+'11', function(err, response) {

			if (weather.testResponse(err, response)) {
				// Something went wrong
				wuLog.log('Error receiving forecast: ' + JSON.stringify(response));
				return;
			}
			forecastData = weather.getForecastDataFromResponse(response, 'metric');

        });
	}

	getWeather() {
		wuLog.log('Get weather data');
		wunderground.conditions().alerts().request(address, function(err, response) {
			if (weather.testResponse(err, response)) {
				// Something went wrong
				wuLog.log('Error receiving weather conditions: ' + JSON.stringify(response));
				return;
			};
			
			weatherData = weather.getWeatherDataFromResponse(response, 'metric');
			//wuLog.log(JSON.stringify(weatherData));
			homeyUtil.updateGlobalWeatherTokens(weatherData);

			// Update data on mobile device cards
			//Homey.manager('drivers').getDriver('weather_card').updateMobileCardData(weatherData);

			// Temperature triggers and conditions
			if (util.value_exist(weatherData.temp)) {
				
			}
		});
	}
	
}

module.exports = Wunderground;