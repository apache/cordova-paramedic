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

const path = require('path');
const BaseTargetChooser = require('./BaseTargetChooser');
const { logger, utilities } = require('../utils');
const ParamedicKill = require('../ParamedicKill');

const ANDROID_RETRY_TIMES = 3;
const ANDROID_TIME_OUT = 300000; // 5 minutes

class AndroidTargetChooser extends BaseTargetChooser {
    __fetchEmulator (target) {
        logger.info(`cordova-paramedic: Starting an ${this.platform} emulator`);

        const emuPath = path.join(this.appPath, 'platforms', this.platform, 'cordova', 'lib', 'emulator');
        const emulator = require(emuPath);

        const tryStart = numberTriesRemaining => {
            logger.info(`cordova-paramedic: Attempting to start the ${this.platform} emulator: ${(ANDROID_RETRY_TIMES - numberTriesRemaining) + 1} attempt.`);

            return emulator.start(target, ANDROID_TIME_OUT)
                .then(emulatorId => {
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
            .then(started => started && started.length > 0 ? started[0] : tryStart(ANDROID_RETRY_TIMES))
            .then(emulatorId => {
                const targetData = { target: emulatorId };
                this.__saveTarget(target, targetData);
                return Promise.resolve(targetData);
            });
    }
}

module.exports = AndroidTargetChooser;
