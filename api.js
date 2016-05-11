module.exports = [
    {
        description:	'Test wunderground connection',
        method: 		'POST',
        path:			'/get/weather/',
        fn: function(callback, args) {
            Homey.log("");
            Homey.log("API: Incoming POST on /test/wunderground/");
            
            Homey.app.testWU(callback, args);
        }
    },
    
    {
        description:	'Get Homey\'s location',
        method: 		'POST',
        path:			'/get/location/',
        fn: function(callback, args) {
            Homey.log("");
            Homey.log("API: Incoming POST on /get/location/");
            
            Homey.app.getlocation(callback, args);
        }
    }
]