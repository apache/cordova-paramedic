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

const BaseTargetChooser = require('./BaseTargetChooser');
const { logger } = require('../utils');

let instruments = null;

class IosTargetChooser extends BaseTargetChooser {
    __fetchEmulator (target) {
        return this.__fetchCordovaEmulator()
            .then(emulators => this.__filterEmulatorsWithTarget(emulators, target))
            .then(emulator => this.__fetchInstrument(emulator));
    }

    /**
     * Returns a single emulator, from the collection produced by `cordova` cli, filterd by the target pattern.
     *
     * The target pattern defaults to `^iPhone` if not proviided.
     *
     * @param {String} cmd `cordova`, for global, or the path to the installed cordova cli
     * @param {String} target device target pattern
     *
     * @return {Promise}
     */
    __filterEmulatorsWithTarget (emulators, target) {
        const filter = target || '^iPhone';
        const filteredEmulators = emulators.filter(i => i.match(new RegExp(filter)));

        if (!filteredEmulators.length) {
            return Promise.reject(
                new Error(`Unable to locate an emulator with the filter of: ${filter}`)
            );
        }

        return Promise.resolve(
            filteredEmulators
                .pop()
                .trim()
        );
    }

    /**
     * Returns device emulator data
     *
     * @param {String} emulator targeted emulator
     *
     * @return {Promise}
     */
    __fetchInstrument (emulator) {
        if (!instruments) {
            const cmd = 'instruments';
            const args = ['-s', 'devices'];
            const errorMsg = 'Failed to find simulator to deployed to.';

            instruments = this.__exec(cmd, args, errorMsg);

            // If the instruments are still false, reject.
            if (!instruments) return Promise.reject(new Error(errorMsg));
        }

        /**
         * The emulator comes from `cordova run --emulator --list`
         * The emulator e.g. displays as `iPhone-XR, 12.2`
         * We will split on `, ` and create an array with `['iPhone-XR', '12.2']`
         */
        const split = emulator.split(', ');

        // Strip out `-` from the device name e.g `iPhone-XR` => `iPhone XR`
        const device = split[0].replace(/-/g, ' ').trim();

        // Trim whitespaces from the version
        const version = split[1].trim();

        // This matches <device> (<version>) [<simulator-id>]
        const simIdRegex = /^([a-zA-Z\d ]+) \(([\d.]+)\) \[([a-zA-Z\d-]*)\].*$/;
        const simulatorIds = instruments
            .reduce((result, line) => {
                // replace ʀ in iPhone Xʀ to match ios-sim changes
                if (line.indexOf('ʀ') > -1) line = line.replace('ʀ', 'R');

                const simIdMatch = simIdRegex.exec(line);

                if (simIdMatch && simIdMatch.length === 4 && simIdMatch[1] === device && simIdMatch[2] === version) {
                    result.push(encodeURIComponent(simIdMatch[3]));
                }
                return result;
            }, []);

        if (simulatorIds.length > 1) {
            logger.warn('Multiple matching emulators found. Will use the first matching simulator');
        }

        const targetData = {
            target: emulator,
            device,
            version,
            simId: simulatorIds[0]
        };

        this.__saveTarget(emulator, targetData);

        return Promise.resolve(targetData);
    }
}

module.exports = IosTargetChooser;
