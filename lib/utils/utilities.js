#!/usr/bin/env node

var shelljs = require('shelljs');
var verbose = undefined;
var fs      = require('fs');
var os      = require("os");
var util    = require('util');
var path    = require("path-extra");
var logger  = require('cordova-common').CordovaLogger.get();

var HEADING_LINE_PATTERN = /List of devices/m;
var DEVICE_ROW_PATTERN   = /(emulator|device|host)/m;

function isWindows () {
    return /^win/.test(os.platform());
}

function countAndroidDevices() {
    var listCommand = "adb devices";

    logger.info("running:");
    logger.info("    " + listCommand);

    var numDevices = 0;
    var result = shelljs.exec(listCommand, {silent: false, async: false});
    result.output.split('\n').forEach(function (line) {
        if (!HEADING_LINE_PATTERN.test(line) && DEVICE_ROW_PATTERN.test(line)) {
            numDevices += 1;
        }
    });
    return numDevices;
}

function secToMin (seconds) {
    return Math.ceil(seconds / 60);
}

function getSimulatorsFolder() {
    var simulatorsFolderPath = path.join(path.homedir(), "Library", "Developer", "CoreSimulator", "Devices");
    return simulatorsFolderPath;
}

function getSimId() {
    var findSimCommand = "cordova run --list --emulator | grep ^iPhone | tail -n1";

    logger.info("running:");
    logger.info("    " + findSimCommand);

    var findSimResult = shelljs.exec(findSimCommand, {silent: true, async: false});

    if (findSimResult.code > 0) {
        logger.error("Failed to find simulator we deployed to");
        return;
    }

    var split = findSimResult.output.split(", ");

    // Format of the output is "iPhone-6s-Plus, 9.1"
    // Extract the device name and the version number
    var device = split[0].replace(/-/g, " ").trim();
    var version = split[1].trim();

    // Next, figure out the ID of the simulator we found
    var instrCommand = "instruments -s devices | grep ^iPhone";
    logger.info("running:");
    logger.info("    " + instrCommand);

    var instrResult = shelljs.exec(instrCommand, {silent: true, async: false});

    if (instrResult.code > 0) {
        logger.error("Failed to get the list of simulators");
        return;
    }

    // This matches <device> (<version>) [<simulator-id>]
    var simIdRegex = /^([a-zA-Z\d ]+) \(([\d.]+)\) \[([a-zA-Z\d\-]*)\].*$/;

    var simId = null;
    var lines = instrResult.output.split(/\n/);
    lines.forEach(function(line) {
        var simIdMatch = simIdRegex.exec(line);
        if (simIdMatch && simIdMatch.length === 4 && simIdMatch[1] === device && simIdMatch[2] === version) {
            simId = encodeURIComponent(simIdMatch[3]);
        }
    });

    return simId;
}

function doesFileExist(filePath) {
    var fileExists = false;
    try {
        stats = fs.statSync(filePath);
        fileExists = true;
    } catch (e) {
        fileExists = false;
    }
    return fileExists;
}

function getSqlite3InsertionCommand(destinationTCCFile, service, appName) {
    return util.format( 'sqlite3 %s "insert into access'
                      + '(service, client, client_type, allowed, prompt_count, csreq) values(\'%s\', \'%s\', '
                      + '0,1,1,NULL)"', destinationTCCFile, service, appName);
}

module.exports = {
    ANDROID:    "android",
    IOS:        "ios",
    WINDOWS:    "windows",
    PARAMEDIC_DEFAULT_APP_NAME: "io.cordova.hellocordova",

    DEFAULT_LOG_TIME: 15,
    DEFAULT_LOG_TIME_ADDITIONAL: 2,

    secToMin: secToMin,
    isWindows:  isWindows,
    countAndroidDevices: countAndroidDevices,
    getSimulatorsFolder: getSimulatorsFolder,
    getSimId: getSimId,
    doesFileExist: doesFileExist,
    getSqlite3InsertionCommand: getSqlite3InsertionCommand
};
