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

const { logger, utilities, spawnAsync } = require('./utils');

class ParamedicKill {
    constructor (platform) {
        this.platform = platform;
    }

    kill () {
        // get platform tasks
        const platformTasks = this.tasksOnPlatform(this.platform);

        if (platformTasks.length < 1) {
            console.warn('No known tasks to kill');
            return;
        }

        // kill them
        this.killTasks(platformTasks);

        if (this.platform === utilities.ANDROID) this.killAdbServer();
    }

    tasksOnPlatform (platformName) {
        let tasks = [];

        switch (platformName) {
        case utilities.IOS:
            tasks = ['Simulator', 'iOS Simulator'];
            break;

        case utilities.ANDROID:
            tasks = utilities.isWindows()
                ? ['emulator-arm.exe', 'qemu-system-i386.exe']
                : ['emulator64-x86', 'emulator64-arm', 'qemu-system-i386', 'qemu-system-x86_64'];
            break;

        case utilities.BROWSER:
            tasks = utilities.isWindows()
                ? ['chrome.exe']
                : ['chrome'];
            break;
        }

        return tasks;
    }

    /**
     * Attempts to kill the provided tasks by name.
     *
     * The kill command is determined by the isWindows flag.
     * If running on a Windows environment, 'taskkill' will be
     * used. If on a macOS or Linux, 'killall' is used.
     *
     * If process fails, only a warning will be displayed.
     *
     * @param {Array} taskNames List of tasks to kill.
     * @returns {Promise}
     */
    async killTasks (taskNames) {
        if (!taskNames || taskNames.length < 1) {
            return;
        }

        const cmd = utilities.isWindows()
            ? 'taskkill'
            : 'killall';

        let args = utilities.isWindows()
            ? ['/t', '/F']
            : ['-9'];

        const taskArgs = utilities.isWindows()
            ? taskNames.map(name => ['/IM', `"${name}"`])
            : taskNames.map(name => [`"${name}"`]);

        // Attach to the args the processes that will be killed
        for (const task of taskArgs) {
            args = [...args, ...task];
        }

        // Attempt to kill the processes
        const killTasksResult = await spawnAsync(cmd, args);
        if (killTasksResult.code !== 0) {
            console.warn('[paramedic] WARNING: Kill command returned ' + killTasksResult.code);
        }
    }

    /**
     * Attempts to kill the ADB Server.
     *
     * If process fails, only a warning will be displayed.
     */
    async killAdbServer () {
        logger.info('[paramedic] Killing the adb server');
        const killServerResult = await spawnAsync('adb', ['kill-server']);
        if (killServerResult.code !== 0) {
            logger.error('[paramedic] Failed to kill the adb server with the code: ' + killServerResult.code);
        }

        logger.info('[paramedic] Killed the adb server.');
    }
}

module.exports = ParamedicKill;
