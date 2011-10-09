flickr-conduit: a PubSub subscriber endpoint for Flickr's real-time PuSH feed
===================

## Description

flickr-conduit is a subsriber endpoint for Flickr's implementation of the PubSubHubbub spec. It handles the the 'subscribe', 'unsubscribe', and the parsing of the XML that Flickr pushes out.

The server works in publish/subscribe model itself, with users registering events they're interested in and then flickr-conduit answering these subscription requests. This works identically to node's own EventEmitter class and in fact uses that under the covers.

This repository is Nolan's original stripped of the front-end example and modified to work on Heroku.

## Installation

```bash
git clone https://github.com/RandomEtc/flickr-conduit-back.git
cd flickr-conduit-back
heroku create --stack cedar
git push heroku master
```

Then take the URL reported by `heroku create` and use it as the backed in the config for https://github.com/RandomEtc/flickr-conduit-front
