module.exports = [
    {
        description:	'Test wunderground connection',
        method: 		'POST',
        path:			'/test/connection/',
        fn: function(callback, args) {
            Homey.log("");
            Homey.log("API: Incoming POST on /test/wunderground/");
            
            var Wunderground = require('wundergroundnode');
            var wundergroundKey = args.body.wundergroundKey;
            var wunderground = new Wunderground(wundergroundKey);
            var address = "Netherlands/Amsterdam";

            if (wundergroundKey == "" || wundergroundKey == null) {
                Homey.log("API: Weather underground key is empty, using Inversion key");
                wundergroundKey = Homey.env.WUNDERGROUND_KEY;     
            }
            
            // Get weather data
            wunderground.conditions().request(address, function(err, response) {

                if (err) {
                    // Catch error
                    callback (response, false);
                    return Homey.log("API: Wunderground request error: " + response);
                } else {
                    Homey.log("API: Weather response received");
                    
                    // Return weather request
                    var temp = response.current_observation.temp_c;
                    var city = response.current_observation.display_location.city;
                    var country = response.current_observation.display_location.country;
                    
                    var data = {'temp' : temp, 'city' : city, 'country' : country};
                    Homey.log(data);
                    
                    callback (data, true);
                }
            });
        }
    }
]