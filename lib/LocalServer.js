/**
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

var Q = require('q');
var io = require('socket.io');
var logger = require('./utils').logger;
var exec = require('./utils').execPromise;
var util = require('util');
var portChecker = require('tcp-port-used');
var EventEmitter = require('events').EventEmitter;
var localtunnel = require('localtunnel');
var shell = require('shelljs');
var spawn = require('child_process').spawn;


// how many ms without a pong packet to consider the connection closed
var CONNECTION_HEARBEAT_PING_TIMEOUT = 60000;
// how many ms before sending a new ping packet
var CONNECTION_HEARBEAT_PING_INTERVAL = 25000;

function LocalServer(port, externalServerUrl) {
    this.port = port;
    this.externalServerUrl = externalServerUrl;
    this.server = { alive: false };
}

util.inherits(LocalServer, EventEmitter);

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

LocalServer.startServer = function (ports, externalServerUrl, useTunnel, noListener) {
    logger.normal("local-server: scanning ports from " + ports.start + " to " + ports.end);

    return LocalServer.getAvailablePort(ports.start, ports.end)
        .then(function (port) {
            logger.normal("local-server: port " + port + " is available");
            logger.info("local-server: starting local medic server");

            var localServer = new LocalServer(port, externalServerUrl);
            if (!noListener) {
                localServer.createSocketListener();
            }

            if (useTunnel) {
                return localServer.createTunnel();
            }

            return localServer;
        });
};

LocalServer.prototype.cleanUp = function () {
    logger.normal('local-server: killing local file transfer server if it\'s up...');
    if (this.server.alive) {
        this.server.alive = false;
        this.server.process.kill('SIGKILL');
    }
};

LocalServer.prototype.startFileTransferServer = function (tempPath) {
    var self = this;

    function exitGracefully(e) {
        // clean up only once
        if (self.exiting) {
            return;
        }
        self.exiting = true;
        self.cleanUp();
    }

    process.on('uncaughtException', function(err) {
        exitGracefully(err);
    });

    return Q().then(function () {
        shell.pushd(tempPath);
        logger.normal('local-server: cloning file transfer server');
        return exec('git clone https://github.com/apache/cordova-labs --branch cordova-filetransfer');
    }).then(function () {
        shell.pushd('cordova-labs');
        logger.normal('local-server: installing local file transfer server');
        return exec('npm i');
    }).then(function () {
        logger.normal('local-server: starting local file transfer server');
        self.server.process = spawn('node', [ 'server.js' ]);
        self.server.alive = true;

        logger.info('local-server: local file transfer server started');
        shell.popd();
        shell.popd();
        return self.server;
    });
};

LocalServer.getAvailablePort = function (startPort, endPort) {
    var port = getRandomInt(startPort, endPort);
    return portChecker.check(port).then(function (isInUse) {
        if (!isInUse) {
            return port;
        }
        if (startPort < endPort) {
            return LocalServer.getAvailablePort(startPort, endPort);
        }
        throw new Error('Unable to find available port');
    });
};

LocalServer.prototype.createTunnel = function () {
    logger.info('cordova-paramedic: attempt to create local tunnel');
    var self = this;

    return Q.Promise(function(resolve, reject) {

        var tunnel = localtunnel(self.port, function (err, tunnel) {
            if (err) {
                reject('Unable to create local tunnel: ' + err);
                return;
            }

            self.tunneledUrl = tunnel.url;
            logger.info('cordova-paramedic: using tunneled url ' + self.tunneledUrl);

            resolve(self);
        });

        // this trace is useful to debug test run timeout issue
        tunnel.on('close', function () {
             logger.normal('local-server: local tunnel has been closed');
        });
    });
};

LocalServer.prototype.createSocketListener = function () {
    var listener = io.listen(this.port, {
        pingTimeout: CONNECTION_HEARBEAT_PING_TIMEOUT,
        pingInterval: CONNECTION_HEARBEAT_PING_INTERVAL
    });

    var self  = this;

    listener.on('connection', function(socket) {
        logger.info('local-server: new socket connection');
        self.connection = socket;

        // server methods
        ['deviceLog', 'disconnect', 'deviceInfo',
        'jasmineStarted', 'specStarted', 'specDone',
        'suiteStarted', 'suiteDone', 'jasmineDone'].forEach(function(route) {
            socket.on(route, function(data) {
                self.emit(route, data);
            });
        });
    });
};

// Connection address could be platform specific so we pass platform as param here
LocalServer.prototype.getConnectionAddress = function (platformId) {
    if (this.externalServerUrl) {
        return this.externalServerUrl;
    }

    // build connection uri for localhost based on platform
    var connectionUrl;

    switch(platformId) {
        case "android" :
            connectionUrl = "http://10.0.2.2";
            break;
        case "ios"     :
        case "browser" :
        case "windows" :
        /* falls through */
        default:
            connectionUrl = "http://127.0.0.1";
    }

    return connectionUrl;
};

// Connection url could be platform specific so we pass platform as param here
LocalServer.prototype.getConnectionUrl = function (platformId) {
    // --useTunnel option
    if (this.tunneledUrl) {
        return this.tunneledUrl;
    }

    return this.getConnectionAddress(platformId) + ":" + this.port;
};

LocalServer.prototype.isDeviceConnected = function () {
    return !!this.connection;
};

module.exports = LocalServer;
