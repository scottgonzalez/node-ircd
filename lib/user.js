var sys = require("sys");
	CHANNEL = require("./channel");


var users = {}, channels = {};
serverName = "irc.nodejs.org";
topic = "node.js ircd https://gist.github.com/a3d0bbbff196af633995";



debugLevel = 1;

function debug (m) {
  if (debugLevel > 0) sys.puts(m);
}

function debugObj (m) {
  if (debugLevel > 0) sys.puts(sys.inspect(m));
}

function simpleString (s) {
  if (s) return s.replace(/[^\w]/, "_", "g");
}


function User(stream, server) {
	this.stream = stream;
	this.server = server;
	this.channels = [];
	this.registered = false;
	this.nick = null;
	this.names = {
		user: "x",
		host: "x",
		server: "x",
		real: "x"
	};
}
exports.User = User;

User.prototype.sendMessage = function(msg, from) {
	// TODO: do we have readyState?
	if (this.stream.readyState !== "open" && this.stream.readyState !== "writeOnly") {
		return false;
	}
	
	var prefix;
	if (from) {
		prefix = from.prefix();
	} else {
		prefix = serverName;
	}
	
	// TODO check if the stream is writable!
	var packet = ":" + prefix + " " + msg + "\r\n";
	
	if (this.nick) {
		debug("send to " + this.nick + ": " + sys.inspect(packet));
	} else {
		debug("send " + ": " + sys.inspect(packet));
	}
	
	// TODO: do we need an encoding?
	this.stream.write(packet, "utf8");
};

User.prototype.prefix = function() {
	// <prefix> ::=
	//     <servername> | <nick> [ '!' <user> ] [ '@' <host> ]
	return this.nick + "!" + this.names.user + "@" + this.stream.remoteAddress;
};

User.prototype.join = function(channelName) {
	var channelName = CHANNEL.normalizeChannelName(channelName);
	
	for (var i = 0; i < this.channels.length; i++) {
		// check if the user is already in this channel.
		if (channelName == this.channels[i].name) return;
	}
	
	var channel = lookupChannel(channelName, this.server);
	
	if (channel.join(this)) {
		this.channels.push(channel);
	}
};


function maybeRegister(user) {
	if (user.nick && user.names && !user.registered) {
		user.sendMessage("001 " + user.nick + " :Welcome to " + serverName);
		user.registered = true;
	}
}

// sends a message to all users in all channels that the user belongs to
User.prototype.broadcast = function (msg) {
	for (var i = 0; i < this.channels.length; i++) {
		this.channels[i].broadcast(msg, this);
	}
};

User.prototype.changeNick = function (newNick) {
	debug("Got NICK: " + sys.inspect(newNick));
	
	if (newNick.length > 30 || /^[a-zA-Z]([a-zA-Z0-9_\-\[\]\\`^{}]+)$/.exec(newNick) == null) {
		// ERR_ERRONEUSNICKNAME
		this.sendMessage("432 * " + newNick + " :Erroneus nickname");
		return;
	}
	
	if (users[newNick]) {
		if (users[newNick] == this) return;
		// ERR_NICKNAMEINUSE
		this.sendMessage("433 * " + newNick + " :Nick in use");
		return;
	}
	
	if (this.nick) {
		var packet = "NICK :" + newNick;
		this.sendMessage(packet, this);
		this.broadcast(packet, this);
		
		users[this.nick] = undefined;
		users[newNick] = this;
		this.nick = newNick;
		
	} else {
		users[newNick] = this;
		this.nick = newNick;
	}
	
};

User.prototype.privmsg = function (target, msg) {
	if (target.charAt(0) == "#") {
		var channelName = CHANNEL.normalizeChannelName(target);
		for (var i = 0; i < this.channels.length; i++) {
			// make sure the user is in that channel.
			if (channelName == this.channels[i].name) {
				this.channels[i].privmsg(msg, this);
				return;
			}
		}
	} else if (users[target]) {
		var user = users[target];
		user.sendMessage("PRIVMSG " + user.nick + " :" + msg, this);
	}
};

User.prototype.part = function (channelName) {
	channelName = CHANNEL.normalizeChannelName(channelName);
	
	for (var i = 0; i < this.channels.length; i++) {
		if (this.channels[i].name == channelName) {
			this.channels.splice(i, 1);
			break;
		}
	}
	
	if (channels[channelName]) {
		channels[channelName].part(this);
	}
};

User.prototype.quit = function (msg) {
	users[this.nick] = undefined;
	while (this.channels.length > 0) {
		this.channels.pop().quit(this, msg);
	}
	this.stream.end();
};

User.prototype.parse = function (message) {
	var match = /^(\w+)\s+(.*)$/.exec(message);
	if (!match) {
		debug("cannot parse: " + sys.inspect(message));
		return;
	}
	var command = match[1].toUpperCase();
	var rest = match[2];
	
	switch (command) {
		case "NICK":
			var newNick = rest;
			
			this.changeNick(newNick);
			maybeRegister(this);
		break;
		
		case "USER":
			match = /^([^\s]+)\s+([^\s]+)\s+([^\s]+)(\s+:(.*))?$/.exec(rest);
			if (!match) return;
			this.names = {
				user: simpleString(match[1]),
				host: simpleString(match[2]),
				server: simpleString(match[3]),
				real: simpleString(match[5])
			};
			debug("Got USER: ");
			debugObj(this.names);
			maybeRegister(this);
		break;
		
		case "JOIN":
			var args = rest.split(/\s/);
			var chans = args[0].split(",");
			for (var i = 0; i < chans.length; i++) {
				this.join(chans[i]);
			}
		break;
		
		case "PART":
			var args = rest.split(/\s/);
			var chans = args[0].split(",");
			for (var i = 0; i < chans.length; i++) {
				this.part(chans[i]);
			}
		break;
		
		case "NAMES":
			var args = rest.split(/\s/);
			var channelNames = args[0].split(",");
			for (var i = 0; i < channelNames.length; i++) {
				var channelName = CHANNEL.normalizeChannelName(channelNames[i]);
				if (channels[channelName]) {
					channels[channelName].sendNames(this);
				}
			}
		break;
		
		case "WHO":
			var args = rest.split(/\s/);
			var channelName = CHANNEL.normalizeChannelName(args[0]);
			if (channels[channelName]) {
				channels[channelName].sendWho(this);
			}
		break;
		
		case "PRIVMSG":
			var matches = /^([^\s]+)\s+:(.*)$/.exec(rest);
			if (!match) return; // ignore
			var target = matches[1];
			var message = matches[2];
			this.privmsg(target, message);
		break;
		
		case "PING":
			var servers = rest.split(/\s/);
			this.sendMessage("PONG " + serverName);
		break;
		
		case "QUIT":
			var matches = /^:(.*)$/.exec(rest);
			this.quit(matches ? matches[1] : "");
		break;
		
		case "MODE":
		case "PONG":
			// ignore
		break;
		
		default:
			debug("Unhandled message: " + sys.inspect(message));
			this.sendMessage("421 " + command + " :Unknown command");
		break;
	}
};



//If a channel object for this channel doesn't exist yet, create it.
function lookupChannel (name, server) {
	if (channels[name]) return channels[name];
	channels[name] = new CHANNEL.Channel(name, server);
	return channels[name];
}
