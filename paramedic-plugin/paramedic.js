/* global window, cordova, device, jasmine, XMLHttpRequest */
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

var PARAMEDIC_SERVER_DEFAULT_URL = 'http://127.0.0.1:8008';

function Paramedic() {

}

Paramedic.prototype.initialize = function() {
    var me = this;
    var connectionUri = me.loadParamedicServerUrl();

    const socket = new WebSocket(connectionUri);
    /**
     * While the testing application is running, events may be generated
     * before the socket connection is fully open. In this case, the events
     * are stored in the eventQueue and will be sent once the connection
     * has opened.
     */
    socket.cdvEventQueue = [];

    socket.cdvSendEvent = function (eventName, payload) {
        const message = JSON.stringify({ event: eventName, data: payload });

        /**
         * Sends the event immediately if the socket is open; otherwise,
         * queues the event to be sent later when the connection opens.
         */
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(message);
        } else {
            socket.cdvEventQueue.push(message);
        }
    };

    /**
     * Sends all queued events once the socket connection is open.
     */
    socket.addEventListener('open', () => {
        for (const msg of socket.cdvEventQueue) {
            socket.send(msg);
        }
        socket.cdvEventQueue = [];
    });

    this.socket = socket;

    this.overrideConsole();
    this.injectJasmineReporter();

    // indicate our presence
    window.PARAMEDIC = true;
};


Paramedic.prototype.overrideConsole = function () {
    var origConsole = window.console;
    var me = this;

    function createCustomLogger(type) {
        return function () {
            origConsole[type].apply(origConsole, arguments);

            me.socket.cdvSendEvent('deviceLog', { type: type, msg: Array.prototype.slice.apply(arguments) });
        };
    }
    window.console = {
        log: createCustomLogger('log'),
        warn: createCustomLogger('warn'),
        error: createCustomLogger('error'),
    };
    console.log('Paramedic console has been installed.');
};

Paramedic.prototype.injectJasmineReporter = function () {
    var JasmineParamedicProxy = require('cordova-plugin-paramedic.JasmineParamedicProxy');
    var jasmineProxy = new JasmineParamedicProxy(this.socket);
    var testsModule = cordova.require("cordova-plugin-test-framework.cdvtests");
    var defineAutoTestsOriginal = testsModule.defineAutoTests;

    testsModule.defineAutoTests = function () {
        defineAutoTestsOriginal();
        jasmine.getEnv().addReporter(jasmineProxy);
    };
};

Paramedic.prototype.loadParamedicServerUrl = function () {
    try {
        // attempt to synchronously load medic config
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "../medic.json", false);
        xhr.send(null);
        var cfg = JSON.parse(xhr.responseText);

        return cfg.logurl || PARAMEDIC_SERVER_DEFAULT_URL;

    } catch (ex) {
        console.log('Unable to load paramedic server url: ' + ex);
    }

    return PARAMEDIC_SERVER_DEFAULT_URL;
};


Paramedic.prototype.loadParamedicServerUrl = function () {
    return getMedicConfig().logurl;
};

Paramedic.prototype.loadParamedicFileServerUrl = function () {
    return getMedicConfig().fileserverurl;
};

cordova.paramedic = new Paramedic();
cordova.paramedic.initialize();

function getMedicConfig () {
    var cfg = {
        logurl: PARAMEDIC_SERVER_DEFAULT_URL
    };

    try {
        // attempt to synchronously load medic config
        var xhr = new XMLHttpRequest();
        xhr.open("GET", "../medic.json", false);
        xhr.send(null);
        var parsedCfg = JSON.parse(xhr.responseText);
        if (parsedCfg.logurl) {
            cfg.logurl = parsedCfg.logurl;
        }
    } catch (ex) {
        console.log('Unable to load paramedic server url: ' + ex);
    }

    return cfg;
}

module.exports = Paramedic;
