exports.createAddressSpeech = function (place, city, name) {
    var result = '';
    if (name) result += __('speech.theLocationOf') + name + __('speech.is');

    if (place && city) {
        return result + place + __('speech.placeCityConjunction') + city
    } else if (city) {
        return result + city
    } else if (place) {
        return result + place
    }
    return result + __('speech.positionUnknown')
};

exports.debugLog = function (message, data) {
    var settings = Homey.manager('settings').get('teslaAccount');
    var debugLog = Homey.manager('settings').get('teslaLog') || [];
    if (settings && !settings.debug) return;
    var logLine = {datetime: new Date(), message: message};
    if (data) logLine.data = data;

    // Push new event, remove items over 100 and save new array
    debugLog.push(logLine);
    if (debugLog.length > 100) debugLog.splice(0, 1);
    Homey.log(this.epochToTimeFormatter(), message, data || '');
    Homey.manager('settings').set('teslaLog', debugLog);
    Homey.manager('api').realtime('teslaLog', logLine);
};

exports.epochToTimeFormatter = function (epoch) {
    if (epoch == null) epoch = new Date().getTime();
    return (new Date(epoch)).toTimeString().replace(/.*(\d{2}:\d{2}:\d{2}).*/, '$1')
};