var EventEmitter = require("events").EventEmitter,
	net = require("net"),
	sys = require("sys"),
	User = require("./user").User;


serverName = "irc.nodejs.org";
topic = "node.js ircd https://gist.github.com/a3d0bbbff196af633995";



debugLevel = 1;

function debug (m) {
  if (debugLevel > 0) sys.puts(m);
}

function debugObj (m) {
  if (debugLevel > 0) sys.puts(sys.inspect(m));
}



var servers = [];

function Server() {
	EventEmitter.call(this);
	
	// TODO: do we need this? there's also a list on the users
	this.channels = [];
	var server = this;
	this.server = net.createServer(function(stream) {
		stream.setTimeout(2 * 60 * 1000); // 2 minute idle timeout
		stream.setEncoding("utf8");
		debug("Connection " + stream.remoteAddress);
		
		var user = new User(stream, server);
		var buffer = "";
		
		stream.addListener("data", function(data) {
			buffer += data;
			var i;
			while (i = buffer.indexOf("\r\n")) {
				if (i < 0) break;
				var message = buffer.slice(0, i);
				if (message.length > 512) {
					user.quit("flooding");
				} else {
					buffer = buffer.slice(i+2);
					user.parse(message);
				}
			}
		});
		
		stream.addListener("end", function() {
			user.quit("connection reset by peer");
		});
		
		stream.addListener("timeout", function() {
			user.quit("idle timeout");
		});
	});
}
sys.inherits(Server, EventEmitter);

Server.prototype.listen = function(port, host) {
	this.server.listen(port, host);
};

exports.createServer = function() {
	var server = new Server();
	servers.push(server);
	
	return server;
};



process.addListener("uncaughtException", function(e) {
	sys.puts("uncaught exception: " + e.stack);
});
