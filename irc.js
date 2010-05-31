#!/usr/bin/env node

var sys = require("sys");
var irc = require("./lib/server");

var ircServer = irc.createServer();
ircServer.listen(6667);

ircServer.addListener("channel", function(channel) {
	
});
