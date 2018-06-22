#!/usr/bin/env node

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

var shelljs = require('shelljs');
var fs      = require('fs');
var os      = require('os');
var util    = require('util');
var path    = require('path-extra');
var logger  = require('cordova-common').CordovaLogger.get();
var kill    = require('tree-kill');

var HEADING_LINE_PATTERN = /List of devices/m;
var DEVICE_ROW_PATTERN   = /(emulator|device|host)/m;
var DEVICE_ONLY_ROW_PATTERN   = /(^(?!.*(emulator)).*device.*$)/m;

var KILL_SIGNAL = 'SIGINT';

function isWindows() {
    return /^win/.test(os.platform());
}

function countAndroidDevices() {
    var listCommand = 'adb devices';

    logger.info('running:');
    logger.info('    ' + listCommand);

    var numDevices = 0;
    var result = shelljs.exec(listCommand, {silent: false, async: false});
    result.output.split('\n').forEach(function (line) {
        if (!HEADING_LINE_PATTERN.test(line) && DEVICE_ROW_PATTERN.test(line)) {
            numDevices += 1;
        }
    });
    return numDevices;
}

function getAndroidPhysicalDevice() {
    var listCommand = 'adb devices';

    logger.info('running:');
    logger.info('    ' + listCommand);

    var numDevices = 0;
    var result = shelljs.exec(listCommand, {silent: false, async: false});
    var deviceId = null;
    result.output.split('\n').forEach(function (line) {
        if (!HEADING_LINE_PATTERN.test(line) && DEVICE_ONLY_ROW_PATTERN.test(line)) {
            deviceId = line.split('\t')[0];
            logger.info("Identified deviceId as: " + deviceId);
        }
    });
    return deviceId;
}

function secToMin(seconds) {
    return Math.ceil(seconds / 60);
}

function getSimulatorsFolder() {
    var simulatorsFolderPath = path.join(path.homedir(), 'Library', 'Developer', 'CoreSimulator', 'Devices');
    return simulatorsFolderPath;
}

function getSimulatorModelId(cli, target) {
    var findSimCommand;
    if (target) {
        findSimCommand = cli + ' run --list --emulator' + module.exports.PARAMEDIC_COMMON_CLI_ARGS + ' | grep ' + target + ' | tail -n1';
    } else {
        findSimCommand = cli + ' run --list --emulator' + module.exports.PARAMEDIC_COMMON_CLI_ARGS + ' | grep ^iPhone | tail -n1';
    }

    logger.info('running:');
    logger.info('    ' + findSimCommand);

    var findSimResult = shelljs.exec(findSimCommand, {silent: true, async: false});

    if (findSimResult.code > 0) {
        logger.error('Failed to find simulator we deployed to');
        return;
    }

    return findSimResult.output;
}

function getSimulatorId(findSimResult) {
    var split = findSimResult.split(', ');

    // Format of the output is "iPhone-6s-Plus, 9.1"
    // Extract the device name and the version number
    var device = split[0].replace(/-/g, ' ').trim();
    var version = split[1].trim();

    // Next, figure out the ID of the simulator we found
    var instrCommand = 'instruments -s devices | grep ^iPhone';
    logger.info('running:');
    logger.info('    ' + instrCommand);

    var instrResult = shelljs.exec(instrCommand, {silent: true, async: false});

    if (instrResult.code > 0) {
        logger.error('Failed to get the list of simulators');
        return;
    }

    // This matches <device> (<version>) [<simulator-id>]
    var simIdRegex = /^([a-zA-Z\d ]+) \(([\d.]+)\) \[([a-zA-Z\d\-]*)\].*$/;
    var simulatorIds = instrResult.output.split(/\n/)
    .reduce(function (result, line) {
        var simIdMatch = simIdRegex.exec(line);
        if (simIdMatch && simIdMatch.length === 4 && simIdMatch[1] === device && simIdMatch[2] === version) {
            result.push(encodeURIComponent(simIdMatch[3]));
        }
        return result;
    }, []);

    if (simulatorIds.length > 1) {
        logger.warn('Multiple matching emulators found. Will use the first matching simulator');
    }

    return simulatorIds[0];
}

function doesFileExist(filePath) {
    var fileExists = false;
    try {
        fs.statSync(filePath);
        fileExists = true;
    } catch (e) {
        fileExists = false;
    }
    return fileExists;
}

function mkdirSync(path) {
  try {
    fs.mkdirSync(path);
  } catch(e) {
    if ( e.code != 'EEXIST' ) throw e;
  }
}

function getSqlite3InsertionCommand(destinationTCCFile, service, appName) {
    return util.format('sqlite3 %s "insert into access' +
                       '(service, client, client_type, allowed, prompt_count, csreq) values(\'%s\', \'%s\', ' +
                       '0,1,1,NULL)"', destinationTCCFile, service, appName);
}

function contains(collection, item) {
    return collection.indexOf(item) !== (-1);
}

function killProcess(pid, callback) {
    kill(pid, KILL_SIGNAL, function () {
        setTimeout(callback, 1000);
    });
}

function getConfigPath(config) {
    if (!config) {
        return false;
    }

    // if it's absolute or relative to cwd, just return it
    var configPath = path.resolve(config);
    logger.normal('cordova-paramedic: looking for a config here: ' + configPath);
    if (fs.existsSync(configPath)) {
        return configPath;
    }

    // if not, search for it in the 'conf' dir
    if (config.indexOf('.config.json') === -1 ||
        config.indexOf('.config.json') !== config.length - 12) {
        config += '.config.json';
    }
    configPath = path.join(__dirname, '../../conf', config);
    logger.normal('cordova-paramedic: looking for a config here: ' + configPath);
    if (fs.existsSync(configPath)) {
        return configPath;
    }

    throw new Error('Can\'t find the specified config.');
}

module.exports = {
    ANDROID: 'android',
    IOS: 'ios',
    WINDOWS: 'windows',
    BROWSER: 'browser',
    PARAMEDIC_DEFAULT_APP_NAME: 'io.cordova.hellocordova',
    PARAMEDIC_COMMON_CLI_ARGS: ' --no-telemetry --no-update-notifier',
    PARAMEDIC_PLUGIN_ADD_ARGS: '',
    PARAMEDIC_PLATFORM_ADD_ARGS: '',
    SAUCE_USER_ENV_VAR: 'SAUCE_USERNAME',
    SAUCE_KEY_ENV_VAR: 'SAUCE_ACCESS_KEY',
    SAUCE_TUNNEL_ID_ENV_VAR: 'TRAVIS_JOB_NUMBER',
    // retry to establish a tunnel multiple times.
    SAUCE_CONNECT_CONNECTION_RETRIES: 5,
    // time to wait between connection retries in ms.
    SAUCE_CONNECT_CONNECTION_TIMEOUT: 50000,
    // retry to download the sauce connect archive multiple times.
    SAUCE_CONNECT_DOWNLOAD_RETRIES: 5,
    // time to wait between download retries in ms.
    SAUCE_CONNECT_DOWNLOAD_TIMEOUT: 1000,
    SAUCE_HOST: 'ondemand.saucelabs.com',
    SAUCE_PORT: 80,
    SAUCE_MAX_DURATION: 5400, // in seconds
    DEFAULT_ENCODING: 'utf-8',
    WD_TIMEOUT: 30 * 60 * 1000,
    WD_RETRY_DELAY: 15000,
    WD_RETRIES: 15,

    DEFAULT_LOG_TIME: 15,
    DEFAULT_LOG_TIME_ADDITIONAL: 2,

    TEST_PASSED: 1,
    TEST_FAILED: 0,

    secToMin: secToMin,
    isWindows:  isWindows,
    countAndroidDevices: countAndroidDevices,
    getAndroidPhysicalDevice: getAndroidPhysicalDevice,
    getSimulatorsFolder: getSimulatorsFolder,
    doesFileExist: doesFileExist,
    getSqlite3InsertionCommand: getSqlite3InsertionCommand,
    getSimulatorModelId: getSimulatorModelId,
    getSimulatorId: getSimulatorId,
    contains: contains,
    mkdirSync: mkdirSync,
    killProcess: killProcess,
    getConfigPath: getConfigPath
};
