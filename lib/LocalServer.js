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

const Q = require('q');
const io = require('socket.io');
const portChecker = require('tcp-port-used');
const { EventEmitter } = require('events');
const shell = require('shelljs');
const { spawn } = require('child_process');
const { logger, execPromise, utilities } = require('./utils');

// how many ms without a pong packet to consider the connection closed
const CONNECTION_HEARBEAT_PING_TIMEOUT = 60000;
// how many ms before sending a new ping packet
const CONNECTION_HEARBEAT_PING_INTERVAL = 25000;

class LocalServer extends EventEmitter {
    constructor (port) {
        super();
        this.port = port;
        this.server = { alive: false };
    }

    cleanUp () {
        logger.normal('local-server: killing local file transfer server if it\'s up...');
        if (this.server.alive) {
            this.server.alive = false;
            this.server.process.kill('SIGKILL');
        }
    }

    startFileTransferServer (tempPath) {
        process.on('uncaughtException', () => {
            if (this.exiting) return;
            this.exiting = true;
            this.cleanUp();
        });

        return Q().then(() => {
            shell.pushd(tempPath);
            logger.normal('local-server: cloning file transfer server');
            return execPromise('git clone https://github.com/apache/cordova-labs --branch cordova-filetransfer');
        }).then(() => {
            shell.pushd('cordova-labs');
            logger.normal('local-server: installing local file transfer server');
            return execPromise('npm i');
        }).then(() => {
            logger.normal('local-server: starting local file transfer server');
            this.server.process = spawn('node', ['server.js']);
            this.server.alive = true;

            logger.info('local-server: local file transfer server started');
            shell.popd();
            shell.popd();
            return this.server;
        });
    }

    createSocketListener () {
        const listener = io(this.port, {
            pingTimeout: CONNECTION_HEARBEAT_PING_TIMEOUT,
            pingInterval: CONNECTION_HEARBEAT_PING_INTERVAL,
            cors: '*'
        });

        listener.on('connection', (socket) => {
            logger.info('local-server: new socket connection');
            this.connection = socket;

            // server methods
            [
                'deviceLog',
                'disconnect',
                'deviceInfo',
                'jasmineStarted',
                'specStarted',
                'specDone',
                'suiteStarted',
                'suiteDone',
                'jasmineDone'
            ].forEach((route) => {
                socket.on(route, (data) => {
                    this.emit(route, data);
                });
            });
        });
    }

    /**
     * Returns the IP address the app should use to reach the Medic server.
     *
     * iOS simulators/devices and Android physical devices, with ADB reverse
     * port enabled can access the host machine using 127.0.0.1.
     *
     * Android emulators must use their special loopback address 10.0.2.2.
     *
     * @param {string} platform - Platform name (e.g., "android" or "ios").
     * @param {boolean} shouldReversePort - Whether ADB reverse port is enabled.
     * @returns {string} IP address the host
     */
    getServerIP (platform, shouldReversePort = false) {
        // Android emulator
        if (platform === utilities.ANDROID && !shouldReversePort) {
            return '10.0.2.2';
        }
        // iOS simulator/devices & Android device with reverse, or desktop
        return '127.0.0.1';
    }

    /**
     * Returns the full URL for the Medic server used to collect test results.
     *
     * @param {string} platform - Platform name (e.g., "android" or "ios").
     * @param {boolean} shouldReversePort - Whether ADB reverse port is enabled.
     * @returns {string} Fully qualified Medic server URL
     */
    getMedicAddress (platform, shouldReversePort = false) {
        return `http://${this.getServerIP(platform, shouldReversePort)}:${this.port}`;
    }

    isDeviceConnected () {
        return !!this.connection;
    }
}

function getRandomInt (min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

LocalServer.startServer = function (ports, noListener) {
    logger.warn('------------------------------------------------------------');
    logger.warn('2. Create and configure local server to receive test results');
    logger.warn('------------------------------------------------------------');

    logger.normal('local-server: scanning ports from ' + ports.start + ' to ' + ports.end);

    return LocalServer.getAvailablePort(ports.start, ports.end)
        .then((port) => {
            logger.normal('local-server: port ' + port + ' is available');
            logger.info('local-server: starting local medic server');

            const localServer = new LocalServer(port);

            if (!noListener) localServer.createSocketListener();

            return localServer;
        });
};

LocalServer.getAvailablePort = function (startPort, endPort) {
    const port = getRandomInt(startPort, endPort);
    return portChecker.check(port)
        .then((isInUse) => {
            if (!isInUse) return port;
            if (startPort < endPort) return LocalServer.getAvailablePort(startPort, endPort);
            throw new Error('Unable to find available port');
        });
};

module.exports = LocalServer;
