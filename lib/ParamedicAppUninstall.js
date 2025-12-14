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

const { utilities, spawnAsync } = require('./utils');

class ParamedicAppUninstall {
    constructor (appPath, platform) {
        this.appPath = appPath;
        this.platform = platform;
    }

    /**
     * Uninstall application from emulator based on provided target and application identifier.
     *
     * @param {Object} target Object of emulator/target related information.
     * @param {String} appId The application/bundle identifier.
     * @returns {Promise<Boolean>}
     */
    async uninstallApp (target, appId) {
        if (!target || !target.target) {
            return false;
        }

        switch (this.platform) {
        case utilities.ANDROID:
            await this.uninstallAppAndroid(target, appId);
            return true;

        case utilities.IOS:
            await this.uninstallAppIOS(target, appId);
            return true;

        default:
            return false;
        }
    }

    /**
     * Uninstalls the application from the Android target by application ID
     *
     * @param {Object} target The device/emulator data which contains the device target.
     * @param {String} appId The application ID
     */
    uninstallAppAndroid (target, appId) {
        return spawnAsync(
            'adb',
            ['-s', target.target, 'uninstall', appId],
            { cwd: this.appPath, timeout: 60000 }
        );
    }

    /**
     * Uninstalls the application from the iOS target by Bundle ID
     *
     * @param {Object} target The device/emulator data which contains the device and UUID.
     * @param {String} bundleId The application's bundle ID
     */
    uninstallAppIOS (target, bundleId) {
        return spawnAsync(
            'xcrun',
            ['simctl', 'uninstall', target.simId, bundleId],
            { cwd: this.appPath, timeout: 60000 }
        );
    }
}

module.exports = ParamedicAppUninstall;
