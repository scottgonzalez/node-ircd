var sys = require("sys");


serverName = "irc.nodejs.org";
topic = "node.js ircd https://gist.github.com/a3d0bbbff196af633995";



debugLevel = 1;

function debug (m) {
  if (debugLevel > 0) sys.puts(m);
}

function debugObj (m) {
  if (debugLevel > 0) sys.puts(sys.inspect(m));
}



function Channel(name, server) {
	this.name = name;
	this.server = server;
	this.topic = null;
	this.users = [];
	
	this.server.emit("channel", this);
}
exports.Channel = Channel;


// broadcast to everyone except the person who sent the message
Channel.prototype.broadcastEveryoneElse = function(msg, from) {
	for (var j = 0; j < this.users.length; j++) {
		var user = this.users[j];
		if (user == from) continue;
		user.sendMessage(msg, from);
	}
};

Channel.prototype.broadcast = function(msg, from) {
	this.broadcastEveryoneElse(msg, from);
	from.sendMessage(msg, from);
};

Channel.prototype.quit = function(user, msg) {
	for (var i = 0; i < this.users.length; i++) {
		if (this.users[i] == user) {
			this.users.splice(i, 1);
		}
	}
	this.broadcast("QUIT :" + (msg || "quit"), user);
};

Channel.prototype.privmsg = function(msg, user) {
	this.broadcastEveryoneElse("PRIVMSG " + this.name + " :" + msg, user);
};

Channel.prototype.sendTopic = function(user) {
	// RPL_TOPIC
	user.sendMessage("332 " + user.nick + " " + this.name + " :" + topic);
};

Channel.prototype.sendNames = function(user) {
	var startOfNAMREPLY = "353 " + user.nick + " @ " + this.name + " :";
	
	// this is to ensure the packet is not too long
	var packet = new String(startOfNAMREPLY);
	for (var i = 0; i < this.users.length; i++) {
		packet += (this.users[i].nick + " ");
		if (packet.length > 500) {
			user.sendMessage(packet);
			packet = new String(startOfNAMREPLY);
		}
	}
	user.sendMessage(packet);
	
	// RPL_NAMREPLY
	user.sendMessage("366 " + user.nick + " " + this.name + " :End of /NAMES list");
};

Channel.prototype.sendWho = function(user) {
	for (var i = 0; i < this.users.length; i++) {
		var u = this.users[i];
		user.sendMessage([
			"352",
			user.nick,
			this.name,
			u.names.user,
			u.stream.remoteAddress,
			serverName,
			u.nick,
			"@",
			":0",
			u.names.real
		].join(" "));
	}
	
	// ENDOFWHO
	user.sendMessage("315 " + user.nick + " " + this.name + " :End of /WHO list");
};

Channel.prototype.join = function(user) {
	debug("JOIN. user list: " + this.inspectUsers());
	
	// TODO check to make sure user isn't already in channel.
	for (var i = 0; i < this.users.length; i++) {
		if (this.users[i] == user) return false;
	}
	
	// Add user to array
	this.users.push(user);
	
	// Send everyone a message that this user joined.
	this.broadcast("JOIN :" + this.name, user);
	
	
	this.sendNames(user);
	
	this.sendTopic(user);
	
	debug("AFTER JOIN. user list: " + this.inspectUsers());
	
	return true;
};

Channel.prototype.inspectUsers = function() {
	return sys.inspect(this.users.map(function (user) { return user.nick; }));
};

Channel.prototype.part = function(user) {
	var packet = "PART " + this.name + " :";
	
	debug("PART. user list: " + this.inspectUsers());
	
	for (var i = 0; i < this.users.length; i++) {
		if (this.users[i] == user) {
			this.users.splice(i, 1);
			user.sendMessage(packet, user);
			break;
		}
	}
	
	debug("After PART. user list: " + this.inspectUsers());
	
	this.broadcast(packet, user);
};

exports.normalizeChannelName = function(channelName) {
	if (channelName) {
		// TODO: use \W instead of [^\w]
		return channelName.replace(/[^\w]/, "_", "g")
			.toLowerCase()
			// TODO: WTF is this for?
			.replace(/^_+/, "#");
	}
};
