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

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { logger, spawnAsync, utilities } = require('./utils');

class ParamedicLogCollector {
    constructor (platform, appPath, outputDir, targetObj) {
        this.platform = platform;
        this.appPath = appPath;
        this.outputDir = outputDir;
        this.targetObj = targetObj;
    }

    /**
     * If the simulator id and the simulator's system.log exists, it will be copied
     * over to the provided output path.
     */
    #logIOS () {
        if (!this.targetObj.simId) {
            logger.info('[paramedic] Missing Simulator ID from target to locate logs.');
            return;
        }

        const homedir = os.homedir();
        const systemLogs = path.join(homedir, 'Library', 'Logs', 'CoreSimulator', this.targetObj.simId, 'system.log');

        if (fs.existsSync(systemLogs)) {
            const outputFilePath = this.#getLogFileName();
            fs.cpSync(systemLogs, outputFilePath);
        } else {
            logger.info('[paramedic] No logs found for the requested Simulator ID.');
        }
    }

    /**
     * Captures the logs from adb logcat and stores it to the provided output path
     *
     * @returns {Promise}
     */
    async #logAndroid () {
        const content = await spawnAsync(
            'adb',
            ['-s', this.targetObj.target, 'logcat', '-d', '-v', 'time']
        );

        const logFileOutput = this.#getLogFileName();

        try {
            fs.writeFileSync(logFileOutput, content.stdout);
            logger.info(`[paramedic] Log files written to: ${logFileOutput}`);
        } catch (err) {
            logger.error(`[paramedic] Faild to write logs with error: ${err.message}`);
        }
    }

    /**
     * Returns file path where the log content will be written/copied to.
     *
     * @returns {String}
     */
    #getLogFileName () {
        return path.join(this.outputDir, this.platform + '_logs.txt');
    }

    /**
     * Collects the logs logs and writes out to output location.
     *
     * @returns {Promise}
     */
    async collectLogs () {
        if (!this.targetObj) {
            logger.warn('[paramedic] There is no target to fetch logs from.');
            return;
        }

        switch (this.platform) {
        case utilities.ANDROID:
            await this.#logAndroid();
            break;

        case utilities.IOS:
            this.#logIOS();
            break;

        default:
            logger.info('Logging is unsupported for ' + this.platform + ', skipping...');
            break;
        }
    }
}

module.exports = ParamedicLogCollector;
