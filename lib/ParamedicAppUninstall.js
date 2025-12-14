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

const { exec } = require('node:child_process');

const { logger, utilities } = require('./utils');

class ParamedicAppUninstall {
    constructor (appPath, platform) {
        this.appPath = appPath;
        this.platform = platform;
    }

    async uninstallApp (targetObj, app) {
        if (!targetObj || !targetObj.target) {
            return false;
        }

        switch (this.platform) {
        case utilities.ANDROID:
            await this.uninstallAppAndroid(targetObj, app);
            return true;

        case utilities.IOS:
            await this.uninstallAppIOS(targetObj, app);
            return true;

        default:
            return false;
        }
    }

    uninstallAppAndroid (targetObj, app) {
        const uninstallCommand = 'adb -s ' + targetObj.target + ' uninstall ' + app;
        return this.executeUninstallCommand(uninstallCommand);
    }

    /**
     * Uninstalls the Application form target by Bundle Identifier
     *
     * @param {Object} target The device/emulator data which contains the device and UUID.
     * @param {String} appBundleIdentifier The Application Bundle Identifier
     */
    uninstallAppIOS (target, appBundleIdentifier) {
        return this.executeUninstallCommand(`xcrun simctl uninstall ${target.simId} ${appBundleIdentifier}`);
    }

    // TODO: Remove this for a centralized spawnAsync utility
    async executeUninstallCommand (uninstallCommand) {
        logger.info('[paramedic] Running command: ' + uninstallCommand);

        const execPromise = new Promise((resolve, reject) => {
            exec(uninstallCommand, (error, stdout, stderr) => {
                if (!error) {
                    resolve();
                } else {
                    logger.error('[paramedic] Failed to uninstall the app');
                    logger.error('[paramedic] Error code: ' + error.code);
                    logger.error('[paramedic] stderr: ' + stderr);
                    reject(error);
                }
            });
        });

        const timeoutPromise = new Promise((resolve, reject) => {
            setTimeout(() => reject(new Error('timeout')), 60000);
        });

        try {
            await Promise.race([execPromise, timeoutPromise]);
        } catch (err) {
            if (err.message === 'timeout') {
                logger.warn('[paramedic] App uninstall timed out!');
            } else {
                logger.warn('[paramedic] App uninstall error: ' + err.message);
            }
        }
    }
}

module.exports = ParamedicAppUninstall;
