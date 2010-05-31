var EventEmitter = require("events").EventEmitter,
	net = require("net"),
	sys = require("sys"),
	User = require("./user").User;

function Server() {
	EventEmitter.call(this);
	
	// TODO: do we need this? there's also a list on the users
	this.channels = [];
	var server = this;
	this.server = net.createServer(function(stream) {
		stream.setTimeout(2 * 60 * 1000); // 2 minute idle timeout
		stream.setEncoding("utf8");
		
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
	return new Server();
};
