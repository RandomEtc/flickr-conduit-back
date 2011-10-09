var socket = require('socket.io')
    , Conduit = require('./flickr-conduit').Conduit
    , crypto = require('crypto')
;

var conduit = new Conduit();
conduit.subscribeCallback = function(urlParts) {
    return urlParts.query.verify_token == 'nolans funtime';
}
var app = conduit.listen(process.env.PORT || 1338);

var io = socket.listen(app)
// see http://devcenter.heroku.com/articles/using-socket-io-with-node-js-on-heroku
// assuming io is the Socket.IO server object
io.configure(function () { 
  io.set("transports", ["xhr-polling"]); 
  io.set("polling duration", 10); 
});

io.sockets.on('connection', function(socket) {
    socket.on('subscribe', function(data) {
        for (var i in data.events) {
            conduit.heartbeat(data.events[i]);
            conduit.on(data.events[i], function(img) {
                socket.emit('publish', img);    
            });
        }
    });

    socket.on('heartbeat', function(callbackId) {
        conduit.heartbeat(callbackId);    
    });
});

