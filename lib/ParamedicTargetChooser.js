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

var Q             = require('q');
var shelljs       = require('shelljs');
var path          = require('path-extra');
var logger        = require('./utils').logger;
var util          = require('./utils').utilities;
var ParamedicKill = require('./ParamedicKill');

var ANDROID_RETRY_TIMES = 3;
var ANDROID_TIME_OUT    = 300000; //5 Minutes

function ParamedicTargetChooser(appPath, config) {
    this.appPath = appPath;
    this.platform = config.getPlatformId();
    this.cli = config.getCli();
}

ParamedicTargetChooser.prototype.chooseTarget = function (emulator, target) {
    var targetObj = '';
    switch(this.platform) {
        case util.ANDROID:
            targetObj = this.chooseTargetForAndroid(emulator, target);
            break;
        case util.IOS:
            targetObj = this.chooseTargetForIOS(emulator, target);
            break;
        case util.WINDOWS:
            targetObj = this.chooseTargetForWindows(emulator, target);
            break;
        default:
            break;
    }
    return targetObj;
};

ParamedicTargetChooser.prototype.chooseTargetForAndroid = function (emulator, target) {
    logger.info('cordova-paramedic: Choosing Target for Android');

    if (target) {
        logger.info('cordova-paramedic: Target defined as: ' + target);
        var obj = {};
        obj.target = target;
        return obj;
    } 
    
    return this.startAnAndroidEmulator(target).then(function(emulatorId) {
        var obj = {};
        obj.target = emulatorId;
        return obj;
    });
};

ParamedicTargetChooser.prototype.startAnAndroidEmulator = function (target) {
    logger.info('cordova-paramedic: Starting an Android emulator');

    var emuPath = path.join(this.appPath, 'platforms', 'android', 'cordova', 'lib', 'emulator');
    var emulator = require(emuPath);

    var tryStart = function(numberTriesRemaining) {
        return emulator.start(target, ANDROID_TIME_OUT)
        .then(function(emulatorId) {
            if (emulatorId) {
                return emulatorId;
            } else if (numberTriesRemaining > 0) {
                var paramedicKill = new ParamedicKill(util.ANDROID);
                paramedicKill.kill();
                return tryStart(numberTriesRemaining - 1);
            } else {
                logger.error('cordova-paramedic: Could not start an android emulator');
                return null;
            }
        });
    };

    // Check if the emulator has already been started
    return emulator.list_started()
    .then(function(started) {
        if (started && started.length > 0) {
            return started[0];
        } else {
            return tryStart(ANDROID_RETRY_TIMES);
        }
    });
};

ParamedicTargetChooser.prototype.chooseTargetForWindows = function (emulator, target) {
    logger.info('cordova-paramedic: Choosing Target for Windows');
    var windowsCommand = this.cli + ' run --list --emulator' + util.PARAMEDIC_COMMON_CLI_ARGS;

    logger.info('cordova-paramedic: Running command: ' + windowsCommand);
    var devicesResult = shelljs.exec(windowsCommand, {silent: true, async: false});
    if (devicesResult.code > 0) {
        logger.error('Failed to get the list of devices for windows');
        return Q({target: undefined});
    }

    var lines = devicesResult.output.split(/\n/);
    if(lines.length <= 1) {
        logger.error('No devices/emulators available for windows');
        return Q({target: undefined});
    }

    var targets = lines.filter(function (line) {
        return /^\d+\.\s+/.test(line);
    });

    if (target) {
        for (var t in targets) {
            if (targets.hasOwnProperty(t) && t.indexOf(target) >= 0) {
                targets = [ t ];
                break;
            }
        }
    }

    return Q({target: targets[0].split('. ')[0].trim()});
};

ParamedicTargetChooser.prototype.chooseTargetForIOS = function (emulator, target) {
    logger.info('cordova-paramedic: Choosing Target for iOS');
    var simulatorModelId = util.getSimulatorModelId(this.cli, target);
    var split            = simulatorModelId.split(', ');
    var device           = split[0].trim();
    var simId            = util.getSimulatorId(simulatorModelId);

    return Q({target: device, simId: simId});
};

module.exports = ParamedicTargetChooser;
