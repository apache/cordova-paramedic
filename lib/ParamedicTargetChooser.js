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
const path = require('path');
const { logger, utilities } = require('./utils');
const ParamedicKill = require('./ParamedicKill');
const ANDROID_RETRY_TIMES = 3;
const ANDROID_TIME_OUT = 300000; // 5 Minutes

class ParamedicTargetChooser {
    constructor (appPath, config) {
        this.appPath = appPath;
        this.platform = config.getPlatformId();
        this.cli = config.getCli();
    }

    chooseTarget (emulator, target) {
        let targetObj = Q();

        switch (this.platform) {
        case utilities.ANDROID:
            targetObj = this.chooseTargetForAndroid(emulator, target);
            break;

        case utilities.IOS:
            targetObj = this.chooseTargetForIOS(emulator, target);
            break;

        default:
            break;
        }

        return targetObj;
    }

    chooseTargetForAndroid (emulator, target) {
        logger.info('cordova-paramedic: Choosing Target for Android');

        if (target) {
            logger.info('cordova-paramedic: Target defined as: ' + target);
            return Q({ target });
        }

        return this.startAnAndroidEmulator(target).then(emulatorId => ({ target: emulatorId }));
    }

    startAnAndroidEmulator (target) {
        logger.info('cordova-paramedic: Starting an Android emulator');

        const emuPathInNodeModules = path.join(this.appPath, 'node_modules', 'cordova-android', 'lib', 'emulator.js');
        const emuPathInPlatform = path.join(this.appPath, 'platforms', 'android', 'cordova', 'lib', 'emulator.js');

        const emuPath = utilities.doesFileExist(emuPathInNodeModules) ? emuPathInNodeModules : emuPathInPlatform;
        const emulator = require(emuPath);

        const tryStart = (numberTriesRemaining) => {
            return emulator.start(target, ANDROID_TIME_OUT)
                .then((emulatorId) => {
                    if (emulatorId) {
                        return emulatorId;
                    } else if (numberTriesRemaining > 0) {
                        const paramedicKill = new ParamedicKill(utilities.ANDROID);
                        paramedicKill.kill();
                        return tryStart(numberTriesRemaining - 1);
                    } else {
                        logger.error('cordova-paramedic: Could not start an Android emulator');
                        return null;
                    }
                });
        };

        // Check if the emulator has already been started
        return emulator.list_started()
            .then((started) => {
                if (started && started.length > 0) {
                    return started[0];
                } else {
                    return tryStart(ANDROID_RETRY_TIMES);
                }
            });
    }

    chooseTargetForIOS (emulator, target) {
        logger.info('cordova-paramedic: Choosing Target for iOS');

        const simulatorModelId = utilities.getSimulatorModelId(this.cli, target);
        const simulatorData = utilities.getSimulatorData(simulatorModelId);

        return Q({
            target: simulatorModelId,
            simId: simulatorData.simId
        });
    }
}

module.exports = ParamedicTargetChooser;
