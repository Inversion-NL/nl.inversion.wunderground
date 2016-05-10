module.exports = [
    {
        description:	'Test wunderground connection',
        method: 		'POST',
        path:			'/test/connection/',
        fn: function(callback, args) {
            Homey.log("");
            Homey.log("API: Incoming POST on /test/wunderground/");
            
            Homey.app.testWU(callback, args);
        }
    }
]