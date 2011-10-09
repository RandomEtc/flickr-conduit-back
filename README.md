## Description

flickr-conduit is a subsriber endpoint for Flickr's implementation of the PubSubHubbub spec. It handles the the 'subscribe', 'unsubscribe', and the parsing of the XML that Flickr pushes out.

This repository is Nolan's original stripped of the front-end example and modified to work on Heroku. The main change is to return the http server from Conduit.listen so that it can be shared by socket.io because Heroku doesn't support WebSockets yet.

## Installation

```bash
git clone https://github.com/RandomEtc/flickr-conduit-back.git
cd flickr-conduit-back
heroku create --stack cedar
git push heroku master
```

This app won't do anything by itself.  Then take the URL reported by `heroku create` and use it as the backed in the config for https://github.com/RandomEtc/flickr-conduit-front

## Caveats

In production you'll want to change the secret token passed around by this app, currently "nolan's funtime", in both the front and back-end. If you want to scale this app up to multiple processes you'll need a centralized message queue used by each process to make sure that the process that receives a POST from Flickr can distribute the data to any front-end clients who are currently listening.

Consider this code a proof of concept and if you have additions/suggestions please send them to Nolan's original project at https://github.com/mncaudill/flickr-conduit
