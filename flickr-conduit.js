/*
Copyright (c) 2011 Nolan Caudill

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

*/

/*
    Conduit simply receives events on a particular callback and then republishes these events through an emitter. That's it.

    This stuff is already opinionated in things that don't matter too much. It's trivial to modify any consumers of this code to 
    fix the decisions I've made.

    The first version of this software let you verify your own verify_tokens for both 'unsubscribe' and 'subscribe' separtely.
    I went ahead and decided to do this verification via HMAC with the callback URL and a secret you pass into Conduit.

    Then I had an fairly inflexible way to map figure out "event names" from the incoming callback. This violated a separation-of-concerns
    by making the callback URL map *directly* to what the event was, as it was just a base64-encoded, dash-separated represenation of the 
    subscription info. This fit my app fine, but probably wasn't clear for everyone else. Also, when Neil added parameterized topics (e.g., geo,
    tags, etc), this proved my naive implemenation as hard-to-adapt.

    I've changed this by every callback URL be just a ID with no intrinsic importance and force the application that initiates subscriptions,
    to figure out what this means. Conduit doesn't need to know what this is -- it's just a conduit that just knows that the callback URL has a 
    query parameter called 'sub' that it will publish a parsed Flickr push event to its emitter.

    Also, an oversight in the first version was Conduit automatically refreshing subscriptions even if the person hadn't logged in some time.
    If I haven't received a heartbeat for a user in 10 minutes and I get a subscription request for them, I don't refresh the subscription and
    unset the subscription in Redis.

*/

var EventEmitter = require('events').EventEmitter
    , urlParser = require('url').parse
    , xml2js = require('xml2js')
    , http = require('http')
    , redis = require('redis')
    , redisClient = redis.createClient()
;

var Conduit = function() {

    // Create new emitter
    var emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    this.emitter = emitter;

    this.userLastSeenThreshold = 600; // 10 minutes
}

exports.Conduit = Conduit;

// Recevies parsed URL object and returns true or false
Conduit.prototype.unsubscribeCallback = function(urlParts) {
    return true;
}

// Recevies parsed URL object and returns true or false
Conduit.prototype.subscribeCallback = function(urlParts) {
    return true;
}

// Assumes that there's a URL query parameter called 'sub' that
// maps to the subscription name in redis. Override this if you like.
Conduit.prototype.getCallbackId = function(urlParts) {
    return urlParts.query.sub;
}

Conduit.prototype.heartbeat = function(callbackId) {
    console.log("setting " + callbackId + " via heartbeat");
    redisClient.set(callbackId, Date.now());    
}

var parseFlickrPost = function(content, callback) {
    var xml = new xml2js.Parser();
    var imgObjs = [];
    xml.on('end', function(data) {
        // We possibly get multiple entries per POST
        var entries = Array.isArray(data.entry) ? data.entry : [data.entry];

        var imgData = null;
        var photoUrl= null;
        for (var i in entries) {
            try {
                imgData = entries[i]['media:content']['@'];

                // Dumb, but there's a bug in the xml2js that messes up on the <link> tab. (Or I'm missing something.)
                var id = entries[i]['id'].split(':')[2].split('/')[2];
                photoUrl = entries[i].author.uri.replace("http://www.flickr.com/people/", 'http://www.flickr.com/photos/');
                photoUrl += id + '/';

                imgObjs.push({
                    url: imgData.url,
                    width: imgData.width,
                    height: imgData.height,
                    link: photoUrl,
                    raw: entries[i],
                });
            } catch (e) {
                // Noop
            }
        }
        callback(imgObjs);
    });

    xml.parseString(content);
}


var pushHandler = function(req, res) {
    var me = this;

    var urlParts = urlParser(req.url, true);

    var content = '';
    var callbackId = me.getCallbackId(urlParts);

    req.on('data', function(data) {
        content += data;
    });

    req.on('end', function() {
        var mode = urlParts.query.mode;
        if (mode == 'unsubscribe') {
            if (me.unsubscribeCallback(urlParts)) {
                res.write(urlParts.query.challenge);
                res.end();
            }
        } else if (mode == 'subscribe') {
            if (me.subscribeCallback(urlParts)) {

                // We could be getting two types of subscription requests:
                // 1) User-initiated
                //      At this point, we should have created a callback ID and its 'last-seen' time should
                //      be well under our threshold
                // 2) Lease renewal
                //      If the last-seen time for this callback ID is under our threshold, renew it.
                console.log("getting a subscription request for " + callbackId);

                redisClient.get(callbackId, function(err, lastSeen) {
                    if (err) {
                        return;
                    }

                    // This means we haven't seen this subscription before.
                    if (!lastSeen) {
                        res.write(urlParts.query.challenge);
                    }
                    // This means we have and it's still alive (thanks to the heartbeat)
                    else if (lastSeen && (lastSeen + me.userLastSeenThreshold > Date.now())) {
                        res.write(urlParts.query.challenge);
                    } else {
                        // Don't create subscription and clear out old one.
                        console.log("removing subscription request for " + callbackId);
                        redisClient.del(callbackId, redis.print);
                    }
                    res.end();
                });
            } else {
                res.end();
            }
        } else {
            // Parse what we've gotten
            parseFlickrPost(content, function(imgObjs) {
                for (var i in imgObjs) {
                    me.emitter.emit(callbackId, imgObjs[i]);
                }
            });
            res.end();
        } 
    });
}

Conduit.prototype.on = function(ev, listener) {
    return this.emitter.on(ev, listener);
}

Conduit.prototype.listen = function(port) {
    var me = this;
    var callback = function () {
        return pushHandler.apply(me, arguments);
    };

    http.createServer(callback).listen(port);
}
