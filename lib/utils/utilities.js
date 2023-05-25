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

const fs = require('fs');
const os = require('os');
const util = require('util');
const path = require('path');
const logger = require('cordova-common').CordovaLogger.get();
const kill = require('tree-kill');
const exec = require('./execWrapper').exec;
const execa = require('execa');

const HEADING_LINE_PATTERN = /List of devices/m;
const DEVICE_ROW_PATTERN = /(emulator|device|host)/m;
const KILL_SIGNAL = 'SIGINT';

let simulatorCollection = null;
const simulatorDataCollection = {};

function isWindows () {
    return /^win/.test(os.platform());
}

function countAndroidDevices () {
    const listCommand = 'adb devices';

    logger.info('running:');
    logger.info('    ' + listCommand);

    let numDevices = 0;
    const result = exec(listCommand);
    result.stdout.split('\n').forEach(function (line) {
        if (!HEADING_LINE_PATTERN.test(line) && DEVICE_ROW_PATTERN.test(line)) {
            numDevices += 1;
        }
    });

    return numDevices;
}

function secToMin (seconds) {
    return Math.ceil(seconds / 60);
}

function getSimulatorsFolder () {
    return path.join(os.homedir(), 'Library', 'Developer', 'CoreSimulator', 'Devices');
}

function getSimulatorModelId (cli, target) {
    target = new RegExp(target || '^iPhone');

    const args = [
        'run',
        'ios',
        '--list',
        '--emulator'
    ].concat(module.exports.PARAMEDIC_COMMON_ARGS);

    // Fetches all known simulators/emulators.
    logger.info('running:');
    logger.info(`    ${cli} ${args.join(' ')}`);

    const result = execa.sync(cli, args);

    if (result.exitCode > 0) {
        logger.error('Failed to find simulator we deployed to');
        return;
    }

    logger.info(`Avaliable Emulators:\n${result.stdout}`);
    logger.info(`Filtering for Targeted Emulator: ${target}`);

    // Return the individual target that is filtered from the known simulators/emulators based on provided target name. (default: ^iPhone)
    const allSimulators = result.stdout
        .split('\n');
    const matchingSimulators = allSimulators.filter(i => i.match(target));
    if (!matchingSimulators.length) {
        logger.warn('Unable to find requested simulator, falling back to the first available!');
        return allSimulators.filter(i => i.match(/^iPhone/))[0].trim();
    }
    return matchingSimulators
        .pop()
        .trim();
}

function getSimulatorCollection () {
    if (simulatorCollection) return simulatorCollection;

    // Next, figure out the ID of the simulator we found
    const cmd = '(xcrun xctrace list devices || instruments -s devices) 2>&1 | grep ^iPhone';
    logger.info('running:');
    logger.info('    ' + cmd);

    const cmdResult = exec(cmd);

    if (cmdResult.code > 0) {
        logger.error('Failed to get the list of simulators');
        return false;
    }

    simulatorCollection = cmdResult.stdout.split('\n');
    return simulatorCollection;
}

function filterForSimulatorIds (simulatorData, simulatorCollection) {
    return simulatorCollection
        .reduce((result, line) => {
            // replace ʀ in iPhone Xʀ to match ios-sim changes
            if (line.indexOf('ʀ') > -1) {
                line = line.replace('ʀ', 'R');
            }
            // remove ' Simulator' if it exists (Xcode 13 xcrun output)
            if (line.indexOf(' Simulator') > -1) {
                line = line.replace(' Simulator', '');
            }

            const simIdRegex = /^([a-zA-Z\d ]+) \(([\d.]+)\) [[(]([a-zA-Z\d-]*)[\])].*$/;
            const simIdMatch = simIdRegex.exec(line);

            if (simIdMatch && simIdMatch.length === 4 && simIdMatch[1] === simulatorData.device && simIdMatch[2] === simulatorData.version) {
                result.push(encodeURIComponent(simIdMatch[3]));
            }
            return result;
        }, []);
}

function getSimulatorData (findSimResult) {
    if (simulatorDataCollection[findSimResult]) return simulatorDataCollection[findSimResult];

    // Format of the output is "iPhone-6s-Plus, 9.1"
    // Extract the device name and the version number
    const split = findSimResult.split(', ');

    // The target simulator data
    const simulatorData = {
        device: split[0].replace(/-/g, ' ').trim(),
        version: split[1].trim()
    };

    // Fetch the environment's installed simulator collection data
    const simulators = getSimulatorCollection();

    // Try to find the simulator ids from the simulator collection
    const simulatorIds = filterForSimulatorIds(simulatorData, simulators);

    // Warn if no data was found.
    if (simulatorIds.length === 0) {
        logger.error('No simulator found.');
    } else if (simulatorIds.length > 1) {
        logger.warn('Multiple matching simulators found. Will use the first matching simulator');
    }

    // Add the Simulator ID to the Simulator Data object
    simulatorData.simId = simulatorIds[0];

    // Update the Simulator Data Collection
    simulatorDataCollection[findSimResult] = simulatorData;

    // Return the newly created Simulator Data object
    return simulatorDataCollection[findSimResult];
}

function doesFileExist (filePath) {
    let fileExists = false;

    try {
        fs.statSync(filePath);
        fileExists = true;
    } catch (e) {
        fileExists = false;
    }

    return fileExists;
}

function mkdirSync (path) {
    try {
        fs.mkdirSync(path);
    } catch (e) {
        if (e.code !== 'EEXIST') throw e;
    }
}

function getSqlite3InsertionCommand (destinationTCCFile, service, appName) {
    return util.format('sqlite3 %s "insert into access' +
        '(service, client, client_type, allowed, prompt_count, csreq) values(\'%s\', \'%s\', ' +
        '0,1,1,NULL)"', destinationTCCFile, service, appName);
}

function contains (collection, item) {
    return collection.indexOf(item) !== (-1);
}

function killProcess (pid, callback) {
    kill(pid, KILL_SIGNAL, function () {
        setTimeout(callback, 1000);
    });
}

function getConfigPath (config) {
    if (!config) return false;

    // if it's absolute or relative to cwd, just return it
    let configPath = path.resolve(config);
    logger.normal('cordova-paramedic: looking for a config here: ' + configPath);
    if (fs.existsSync(configPath)) {
        return configPath;
    }

    // if not, search for it in the 'conf' dir
    if (config.indexOf('.config.json') === -1 ||
        config.indexOf('.config.json') !== config.length - 12) {
        config += '.config.json';
    }
    configPath = path.join(__dirname, '..', '..', 'conf', config);
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
    PARAMEDIC_COMMON_ARGS: ['--no-telemetry', '--no-update-notifier'],
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

    TEST_PASSED: true,
    TEST_FAILED: false,

    secToMin: secToMin,
    isWindows: isWindows,
    countAndroidDevices: countAndroidDevices,
    getSimulatorsFolder: getSimulatorsFolder,
    doesFileExist: doesFileExist,
    getSqlite3InsertionCommand: getSqlite3InsertionCommand,
    getSimulatorModelId: getSimulatorModelId,
    getSimulatorData: getSimulatorData,
    contains: contains,
    mkdirSync: mkdirSync,
    killProcess: killProcess,
    getConfigPath: getConfigPath
};
