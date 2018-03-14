const Homey = require('homey');

var tokens = [];

exports.getHomeyLocation = function () {
    
    let latitude = Homey.ManagerGeolocation.getLatitude()
    let longitude = Homey.ManagerGeolocation.getLongitude();
    let mode = Homey.ManagerGeolocation.getMode();

    let location = {
        lat : latitude,
        long : longitude,
        mode : mode
    }
    return location;
}

exports.getHomeyLanguage = function () {
    return Homey.ManagerI18n.getLanguage();
}

exports.setUnits = function() {

    var units_metric = Homey.manager('settings').get('units_metric');
    var units_imperial = Homey.manager('settings').get('units_imperial');
    var units_auto = Homey.manager('settings').get('units_auto');
    var homey_units = Homey.manager('i18n').getUnits();

    if (units_auto && util.value_exist(homey_units) && homey_units != "") {
        Homey.manager('settings').set('currentSettingUnits', 'auto');
        if (homey_units == 'metric') {
            if (fullLogging) util.wuLog('Autodetect metric units', severity.debug);
            units_metric = true;
        } else {
            if (fullLogging) util.wuLog('Autodetect imperial units', severity.debug);
            units_metric = false;
        }
    } else if (!util.value_exist(units_auto) && !util.value_exist(units_metric) && !util.value_exist(units_imperial)) {
        // Something is wrong here, none of the radio buttons are checked!
        util.wuLog('No unit value existed, resetting to auto', severity.debug);
        Homey.manager('settings').set('units_auto', 'true');

        // Let check the units again
        self.setUnits();
        return;
    }

    if (units_metric) {
        //noinspection SpellCheckingInspection
        unitData = {
            temp_unit : "&degC",
            distance_unit : 'km',
            speed_unit : 'kmh',
            pressure_unit : 'mbar',
            distance_small_unit : 'mm'
        }
    } else {
        unitData = {
            temp_unit : "&degF",
            distance_unit : 'mi',
            speed_unit : 'mph',
            pressure_unit : 'inch',
            distance_small_unit : 'in'
        }
    }
}

exports.updateGlobalWeatherTokens = function (weatherData) {
    if (tokens && tokens.length < 1) _registerGlobalWeatherTokens(weatherData);
    else _updateGlobalWeatherTokens(weatherData);
};

exports.updateGlobalForecastTokens = function (forecastData) {
    if (tokens && tokens.length < 1) _registerGlobalForecastTokens(forecastData);
    else _updateGlobalForecastTokens(forecastData);
};

function _registerGlobalWeatherTokens(weatherData) {
    console.log('Register global weather tokens');

    let weather_descr = new Homey.FlowToken( "weather_descr", {
        type: 'string',
        title: Homey.__("weather.weather_descr")
    });
    weather_descr.register()
        .then(() => {
            return weather_descr.setValue(weatherData.weather_descr);
        })
        .catch( err => {
            console.log("weather_descr error", err);
        });
    tokens.push(weather_descr);

    let alert_description = new Homey.FlowToken( "alert_description", {
        type: 'string',
        title: Homey.__("weather.alert_description")
    });
    alert_description.register()
        .then(() => {
            return alert_description.setValue(weatherData.alert_description);
        })
        .catch( err => {
            console.log("alert_description error", err);
        });
    tokens.push(alert_description);

    let relative_humidity = new Homey.FlowToken( "relative_humidity", {
        type: 'number',
        title: Homey.__("weather.relative_humidity")
    });
    relative_humidity.register()
        .then(() => {
            return relative_humidity.setValue(weatherData.relative_humidity);
        })
        .catch( err => {
            console.log("relative_humidity error", err);
        });
    tokens.push(relative_humidity);

    let wind_dir = new Homey.FlowToken( "wind_dir", {
        type: 'string',
        title: Homey.__("weather.wind_dir")
    });
    wind_dir.register()
        .then(() => {
            return wind_dir.setValue(weatherData.wind_dir);
        })
        .catch( err => {
            console.log("wind_dir error", err);
        });
    tokens.push(wind_dir);

    let uv = new Homey.FlowToken( "uv", {
        type: 'number',
        title: Homey.__("weather.uv")
    });
    uv.register()
        .then(() => {
            return uv.setValue(weatherData.uv);
        })
        .catch( err => {
            console.log("uv error", err);
        });
    tokens.push(uv);

    let temp = new Homey.FlowToken( "temp", {
        type: 'number',
        title: Homey.__("weather.temp")
    });
    temp.register()
        .then(() => {
            return temp.setValue(weatherData.temp);
        })
        .catch( err => {
            console.log("temp error", err);
        });
    tokens.push(temp);

    let dewpoint = new Homey.FlowToken( "dewpoint", {
        type: 'number',
        title: Homey.__("weather.dewpoint")
    });
    dewpoint.register()
        .then(() => {
            return dewpoint.setValue(weatherData.dewpoint);
        })
        .catch( err => {
            console.log("dewpoint error", err);
        });
    tokens.push(dewpoint);

    let wind = new Homey.FlowToken( "wind", {
        type: 'number',
        title: Homey.__("weather.wind")
    });
    wind.register()
        .then(() => {
            return wind.setValue(weatherData.wind);
        })
        .catch( err => {
            console.log("wind error", err);
        });
    tokens.push(wind);

    let visibility = new Homey.FlowToken( "visibility", {
        type: 'number',
        title: Homey.__("weather.visibility")
    });
    visibility.register()
        .then(() => {
            return visibility.setValue(weatherData.visibility);
        })
        .catch( err => {
            console.log("visibility error", err);
        });
    tokens.push(visibility);

    let precip_1hr = new Homey.FlowToken( "precip_1hr", {
        type: 'number',
        title: Homey.__("weather.precip_1hr")
    });
    precip_1hr.register()
        .then(() => {
            return precip_1hr.setValue(weatherData.precip_1hr);
        })
        .catch( err => {
            console.log("precip_1hr error", err);
        });
    tokens.push(precip_1hr);

    let precip_today = new Homey.FlowToken( "precip_today", {
        type: 'number',
        title: Homey.__("weather.precip_today")
    });
    precip_today.register()
        .then(() => {
            return precip_today.setValue(weatherData.precip_today);
        })
        .catch( err => {
            console.log("precip_today error", err);
        });
    tokens.push(precip_today);
}

function _updateGlobalWeatherTokens(weatherData) {
    console.log('Update global weather tokens');

    for (i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        token.setValue(weatherData[token.id], function(err) {
            if (err) return console.log('update token error: ', err);
        });
    }
}