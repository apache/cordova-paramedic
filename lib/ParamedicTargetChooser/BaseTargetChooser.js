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

const execa = require('execa');
const { logger, utilities } = require('../utils');

/**
 * Stores filtered targets
 */
let targets = {};
let emulators = null;

class BaseTargetChooser {
    constructor (cli, platform, appPath) {
        this.cli = cli;
        this.platform = platform;
        this.appPath = appPath;
    }

    /**
     * Returns a promise with the device emulator data
     * {
     *  target: '',
     *  device: '',
     *  version: '',
     *  simId: ''
     * }
     *
     * @param {String} target the target patten which will be fileted by
     *
     * @return {Promise}
     */
    fetchTarget (target) {
        logger.info(`cordova-paramedic: Searching for a(n) ${this.platform} target: ${target}`);

        if (targets[target]) {
            logger.info(`cordova-paramedic: Previous search with target detected.`);
            return Promise.resolve(targets[target]);
        }

        targets[target] = this.__fetchEmulator(target);

        return targets[target];
    }

    __saveTarget (target, data) {
        targets[target] = data;
    }

    __fetchCordovaEmulator () {
        if (!emulators) {
            const args = ['run', '--list', '--emulator'].concat(utilities.PARAMEDIC_COMMON_ARGS);
            const errorMsg = 'Failed to find a collection of emualtor to select from';

            emulators = this.__exec(this.cli, args, errorMsg);

            // If the emulators are still false, reject.
            if (!emulators) return Promise.reject(new Error(errorMsg));
        }

        return Promise.resolve(emulators);
    }

    __exec (cmd, args, errorMsg) {
        logger.info(`[Executing Command]\n $${cmd} ${args.join(' ')}`);
        const result = execa.sync(cmd, args);

        if (result.exitCode > 0) {
            logger.error(errorMsg);
            return false;
        }

        logger.info(result.stdout);

        return result.stdout.split('\n');
    }
}

module.exports = BaseTargetChooser;
