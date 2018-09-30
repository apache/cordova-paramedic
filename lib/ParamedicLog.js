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

/* jshint node: true */

'use strict';

var shelljs  = require('shelljs');
var fs       = require('fs');
var path     = require('path-extra');
var util     = require('./utils').utilities;
var logger   = require('./utils').logger;

function ParamedicLog(platform, appPath, outputDir, targetObj) {
    this.platform = platform;
    this.appPath = appPath;
    this.outputDir = outputDir;
    this.targetObj = targetObj;
}

ParamedicLog.prototype.logIOS = function (appPath) {
    if (!this.targetObj) {
        logger.warn('It looks like there is no target to get logs from.');
        return;
    }
    var simId = this.targetObj.simId;

    if (simId) {
        // Now we can print out the log file
        var logPath = path.join(path.homedir(), 'Library', 'Logs', 'CoreSimulator', simId, 'system.log');
        var logCommand = 'cat ' + logPath;
        this.generateLogs(logCommand);
    } else {
        logger.error('Failed to find ID of simulator');
    }
};

ParamedicLog.prototype.logWindows = function (appPath, logMins) {
    var logScriptPath = path.join(appPath, 'platforms', 'windows', 'cordova', 'log.bat');
    if (fs.existsSync(logScriptPath)) {
        var mins = util.DEFAULT_LOG_TIME;
        if (logMins) {
            mins = logMins + util.DEFAULT_LOG_TIME_ADDITIONAL;
        }
        var logCommand = logScriptPath + ' --dump --mins ' + mins;
        this.generateLogs(logCommand);
    }
};

ParamedicLog.prototype.logAndroid = function () {
    if (!this.targetObj) {
        logger.warn('It looks like there is no target to get logs from.');
        return;
    }

    var logCommand = 'adb -s ' + this.targetObj.target + ' logcat -d -v time';
    var numDevices = util.countAndroidDevices();
    if (numDevices != 1) {
        logger.error('there must be exactly one emulator/device attached');
        return;
    }
    this.generateLogs(logCommand);
};

ParamedicLog.prototype.generateLogs = function (logCommand) {
    var logFile = this.getLogFileName();
    logger.info('Running Command: ' + logCommand);

    var result = shelljs.exec(logCommand, {silent: true, async: false});
    if (result.code > 0) {
        logger.error('Failed to run command: ' + logCommand);
        logger.error('Failure code: ' + result.code);
        return;
    }

    try {
        fs.writeFileSync(logFile, result.output);
    } catch (ex) {
        logger.error('Cannot write the log results to the file. ' + ex);
    }
};

ParamedicLog.prototype.getLogFileName = function () {
    return path.join(this.outputDir, this.platform + '_logs.txt');
};

ParamedicLog.prototype.collectLogs = function (logMins) {
    shelljs.config.fatal  = false;
    shelljs.config.silent = false;

    switch (this.platform) {
        case util.ANDROID:
            this.logAndroid();
            break;
        case util.IOS:
            this.logIOS(this.appPath);
            break;
        case util.WINDOWS:
            this.logWindows(this.appPath, logMins);
            break;
        default:
            logger.info('Logging is unsupported for ' + this.platform + ', skipping...');
            break;
    }
};

module.exports = ParamedicLog;
