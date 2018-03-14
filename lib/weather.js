const util = require('./util.js');
const Homey = require('homey');

/**
 * Helper function to parse float from a string
 * @param data
 * @returns {*} Returns 0 if unable to parse, otherwise the parsed floating value
 */
var parseWeatherFloat = function (data){
    var temp = parseFloat(data);
    if (isNaN(temp)) return 0;
    else return temp;
};

/**
 * Helper function to parse int from a string
 * @param data
 * @returns {*} Returns 0 if unable to parse, otherwise the parsed integer value
 */
var parseWeatherInt = function (data){
    var temp = parseInt(data);
    if (isNaN(temp)) return 0;
    else return temp;
};

/**
 * Helper function to test weather data
 * @param data Data to test
 * @returns {object} returns the weather object or a empty string the data was null or undefined
 */
var testWeatherData = function (data) {
    if (!util.value_exist(data)) {
        return "";
    }
    else return data;
};

/**
 * Helper function to test the Weather Underground response
 * @param err
 * @param result
 * @returns {boolean} True is everything is fine
 */
exports.testResponse = function (err, result){

    if (err) return true;

    var err_msg;
    try {
        // If error is in the response, something must have gone wrong
        err_msg = result.response.error.description;
        return true;
    } catch(err) {
        // If it catches the error it means that there is no result.response.error.description
        // so all is good
        return false;
    }
}

/**
 * Helper function to convert humity value to a float
 * @param humstring
  * @returns {float}
 */
var humToFloat = function (humString) {
    var hum_float = 0;
    try {
        // Cut % sign and convert to float
        hum_float = parseWeatherFloat(humString.substr(0, (humString.length -1)));
    } catch(err) {}

    return hum_float;
}

var _getAlertDataFromResponse = function (response) {
    let alert_level = 0;
    let alert_description = "Unknown";

    if (util.value_exist(response.alerts)) {
        for (var i = 0; i < response.alerts.length; i++) {
            alert = response.alerts[i];
            var level = parseWeatherInt(testWeatherData(alert.level_meteoalarm));
            if (level > alert_level) alert_level = level;
        }
    }
    switch (alert_level) {
        case 0:
            alert_description = Homey.__("weather.alert_level_green");
            break;
        case 1, 2:
            alert_description = Homey.__("weather.alert_level_yellow");
            break;
        case 3:
            alert_description = Homey.__("weather.alert_level_orange");
            break;
        case 4:
            alert_description = Homey.__("weather.alert_level_red");
            break;
    }
    let alertData = {
        level: alert_level,        
        description: alert_description
    }
    return alertData;
}

/**
 * Helper function to get the weather data from a response
 * @param response
 * @param units
 * @returns {weatherData}
 */
var getWeatherDataFromResponse = function (response, units) {
    let temp, feelslike, dewpoint, pressure, wind, wind_gust, visibility, precip_1hr, precip_today;
    let weatherData = {};

    let alertData = _getAlertDataFromResponse(response);

    if (units == 'imperial') {
        temp = parseWeatherFloat(testWeatherData(response.current_observation.temp_f));
        feelslike = parseWeatherFloat(testWeatherData(response.current_observation.feelslike_f));
        dewpoint = parseWeatherFloat(testWeatherData(response.current_observation.dewpoint_f));
        pressure = parseWeatherFloat(testWeatherData(response.current_observation.pressure_in));
        wind = parseWeatherFloat(testWeatherData(response.current_observation.wind_mph));
        wind_gust = parseWeatherFloat(testWeatherData(response.current_observation.wind_gust_mph));
        visibility = parseWeatherFloat(testWeatherData(response.current_observation.visibility_mi));
        precip_1hr = parseWeatherFloat(testWeatherData(response.current_observation.precip_1hr_in));
        precip_today = parseWeatherFloat(testWeatherData(response.current_observation.precip_today_in));
    } else {
        temp = parseWeatherFloat(testWeatherData(response.current_observation.temp_c));
        feelslike = parseWeatherFloat(testWeatherData(response.current_observation.feelslike_c));
        dewpoint = parseWeatherFloat(testWeatherData(response.current_observation.dewpoint_c));
        pressure = parseWeatherFloat(testWeatherData(response.current_observation.pressure_mb));
        wind = parseWeatherFloat(testWeatherData(response.current_observation.wind_kph));
        wind_gust = parseWeatherFloat(testWeatherData(response.current_observation.wind_gust_kph));
        visibility = parseWeatherFloat(testWeatherData(response.current_observation.visibility_km));
        precip_1hr = parseWeatherFloat(testWeatherData(response.current_observation.precip_1hr_metric));
        precip_today = parseWeatherFloat(testWeatherData(response.current_observation.precip_today_metric));
    }

    // Reset values they are below zero
    let uv = parseWeatherFloat(testWeatherData(response.current_observation.UV));
    if (uv < 0) uv = 0;

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
    return weatherData;
}

/**
 * Helper function to get the weather data from a response
 * @param response
 * @param units
 * @returns {forecastData}
 */
var getForecastDataFromResponse = function (response, units) {
    let hour, date, temp, dewpoint, condition, wind_speed, wind_direction, uv, humidity, feelslike, snow, pop
    let forecastData = [];

    for (i = 0; i < response.hourly_forecast.length; i++) {
        let forecastHourResponse = response.hourly_forecast[i];
        let forecast = {};

        hour = parseWeatherInt(testWeatherData(forecastHourResponse.FCTTIME.hour))
        date = forecastHourResponse.FCTTIME.mday;
        condition = forecastHourResponse.condition;
        wind_direction = forecastHourResponse.wdir.dir;
        wind_degrees = forecastHourResponse.wdir.degrees;
        uv = parseWeatherFloat(testWeatherData(forecastHourResponse.uvi));
        humidity = parseWeatherFloat(testWeatherData(forecastHourResponse.humidity));
        pop = parseWeatherFloat(testWeatherData(forecastHourResponse.pop));
        if (units == 'imperial') {
            temp = parseWeatherFloat(testWeatherData(forecastHourResponse.temp.english));
            dewpoint = parseWeatherFloat(testWeatherData(forecastHourResponse.dewpoint.english));
            wind_speed = parseWeatherFloat(testWeatherData(forecastHourResponse.wspd.english));
            feelslike = parseWeatherFloat(testWeatherData(forecastHourResponse.feelslike.english));
            snow = parseWeatherFloat(testWeatherData(forecastHourResponse.snow.english));
        } else {
            temp = parseWeatherFloat(testWeatherData(forecastHourResponse.temp.metric));
            dewpoint = parseWeatherFloat(testWeatherData(forecastHourResponse.dewpoint.metric));
            wind_speed = parseWeatherFloat(testWeatherData(forecastHourResponse.wspd.metric));
            feelslike = parseWeatherFloat(testWeatherData(forecastHourResponse.feelslike.metric));
            snow = parseWeatherFloat(testWeatherData(forecastHourResponse.snow.metric));
        }
        forecast = {
            hour: hour,
            date: date,
            condition: condition,
            wind_direction: wind_direction,
            wind_degrees: wind_degrees,
            uv: uv,
            temp: temp,
            dewpoint: dewpoint,
            wind_speed: wind_speed,
            humidity: humidity,
            feelslike: feelslike,
            snow: snow,
            pop: pop
        }
        forecastData.push(forecast);
    }

    return forecastData;
}

exports.parseWeatherFloat = parseWeatherFloat;
exports.testWeatherData = testWeatherData;
exports.humToFloat = humToFloat;
exports.parseWeatherInt = parseWeatherInt;
exports.getWeatherDataFromResponse = getWeatherDataFromResponse;
exports.getForecastDataFromResponse = getForecastDataFromResponse;