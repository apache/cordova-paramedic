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

const http = require('node:http');
const { EventEmitter } = require('node:events');

const WebSocket = require('ws');

const { logger, utilities } = require('./utils');

/**
 * How long (in milliseconds) a client is allowed to go without responding
 * to a "ping" before the server treats the connection as closed.
 */
const WS_HEARTBEAT_TIMEOUT = 60000;
/**
 * How often (in milliseconds) the server will sends a WebSocket "ping"
 * to verify if the client is still active.
 */
const WS_HEARTBEAT_INTERVAL = 25000;
// List of valid websocket events
const WS_VALID_EVENTS = [
    'deviceLog',
    'disconnect',
    'deviceInfo',
    'jasmineStarted',
    'specStarted',
    'specDone',
    'suiteStarted',
    'suiteDone',
    'jasmineDone'
];

class LocalServer extends EventEmitter {
    constructor (config, httpServerProc, httpServerPort) {
        super();

        this.config = config;
        this.httpServer = httpServerProc;
        this.port = httpServerPort;

        this.wss = null;
    }

    /**
     * Setup a WebSocket Server with the running HTTP server.
     */
    createWebSocketServer () {
        this.wss = new WebSocket.Server({ server: this.httpServer });

        /**
         * When a client connects, we begin listening for all supported events sent
         * from the device. These include lifecycle events such as:
         * - test has started (jasmineStarted) or finished (jasmineDone)
         * - spec has started (specStarted) or finished (specDone)
         * - suite has started (suiteStarted) or finished (suiteDone)
         * - device logs, device info, etc.
         *
         * We also maintain a simple heartbeat mechanism. Every time the client sends
         * a WebSocket "pong" or any message, we update the timestamp of the last
         * activity. If the client stops responding for too long, the server will
         * assume the device has gone away and will terminate the connection.
         *
         * This prevents Paramedic from hanging indefinitely when a device or WebView
         * unexpectedly disconnects.
         */
        this.wss.on('connection', (ws) => {
            ws.lastActivity = Date.now();
            logger.verbose(
                `[paramedic] local-server: new websocket connection (${toReadableDateTime(ws.lastActivity)})`
            );

            ws.on('pong', () => {
                ws.lastActivity = Date.now();
                logger.verbose(
                    `[paramedic] local-server: received pong (${toReadableDateTime(ws.lastActivity)})`
                );
            });

            ws.on('message', (raw) => {
                ws.lastActivity = Date.now();
                logger.verbose(
                    `[paramedic] local-server: received message (${toReadableDateTime(ws.lastActivity)})`
                );

                let msg;
                try {
                    msg = JSON.parse(raw.toString());
                } catch (err) {
                    logger.error(
                        '[paramedic] local-server: invalid JSON message with error: ' + err.message
                    );
                    return;
                }

                const { event, data } = msg;
                if (WS_VALID_EVENTS.includes(event)) {
                    this.emit(event, data);
                }
            });

            ws.on('close', () => {
                this.emit('disconnect');
            });
        });

        // The heartbeat ping
        const interval = setInterval(() => {
            for (const ws of this.wss.clients) {
                const idleTime = Date.now() - ws.lastActivity;

                if (idleTime > WS_HEARTBEAT_TIMEOUT) {
                    logger.warn('[paramedic] local-server: WebSocket has timed out and terminating.');
                    ws.terminate();
                    continue;
                }

                ws.ping();
            }
        }, WS_HEARTBEAT_INTERVAL);

        this.wss.stop = () => {
            clearInterval(interval);
            this.httpServer.close();
        };
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
     * @returns {string} Fully qualified Medic server URL
     */
    getMedicAddress (platform) {
        return `ws://${this.getServerIP(platform)}:${this.port}`;
    }

    /**
     * Check if a device is connected by checking the client size.
     *
     * @returns {Boolean}
     */
    isDeviceConnected () {
        return this.wss && this.wss.clients.size > 0;
    }

    /**
     * Attempts to start a server that the testing app uses to send back test results.
     *
     * @param {ParamedicConfig} config
     *   The paramedic configuration object containing relevant settings
     *   (e.g., port range to try, verbose logging flag, etc).
     * @returns {Promise<LocalServer>}
     */
    static async startServer (config) {
        logger.warn('------------------------------------------------------------');
        logger.warn('2. Create and configure local server to receive test results');
        logger.warn('------------------------------------------------------------');

        const { range: possiblePorts } = config.getPorts();

        // Holder for the running server instance and used port.
        let httpServerProc = null;
        let httpServerPort = null;

        logger.normal('[paramedic] Creating local server...');

        for (httpServerPort of possiblePorts) {
            if (config.isVerbose()) {
                logger.normal(`[paramedic] Attempting with port: ${httpServerPort}`);
            }

            try {
                // If successful, a new LocalServer instance will be created with the instance stored.
                httpServerProc = await attemptToCreateServer(httpServerPort);
                logger.normal(`[paramedic] Server is running on port: ${httpServerPort}`);
                // Break out since the server started successfully. Skip testing other ports.
                break;
            } catch (e) {
                if (config.isVerbose()) {
                    logger.warn(`[paramedic] Failed to use port: ${httpServerPort}\nError: ${e.message}`);
                }
                // Nothing more to do... Continue looping the possible ports.
            }
        }

        if (!httpServerProc) {
            throw new Error('[paramedic] Failed to create local server. Port(s) were available.');
        }

        // Now create a WebSocket server
        const localServer = new LocalServer(config, httpServerProc, httpServerPort);
        localServer.createWebSocketServer();

        return localServer;
    }
}

/**
 * Converts Unix Epoch time into human readable time
 *
 * @param {number} epochMs - Unix Epoch time in milliseconds
 * @returns {string}
 */
function toReadableDateTime (epochMs) {
    return new Date(epochMs).toLocaleString();
}

/**
 * Attempts to create a server and start listening on the specified port.
 *
 * Failure case:
 * - The Promise is rejected if the server fails to listen on the given port.
 *
 * Success case:
 * - The Promise is resolved with the server instance once it successfully
 *   begins listening on the given port.
 *
 * @param {Number} port
 * @returns Promise<Server|Error>
 */
function attemptToCreateServer (port) {
    return new Promise((resolve, reject) => {
        const server = http.createServer();
        // Only reject and pass error. No logging here.
        server.on('error', reject);
        // Success, found an free port to use.
        server.on('listening', () => resolve(server));
        // Attempt to listen on the port.
        server.listen(port, '0.0.0.0');
    });
}

module.exports = LocalServer;
