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

class WindowsTargetChooser extends BaseTargetChooser {
    __fetchEmulator (target) {
        return this.__fetchCordovaEmulator()
            .then(emulators => this.__filterEmulatorsWithTarget(emulators, target));
    }

    __filterEmulatorsWithTarget (emulators, target) {
        console.log(emulators);
        if (emulators.length <= 1) {
            logger.error(`No devices/emulators available for ${this.platform}`);
            return Promise.resolve({ target: undefined });
        }

        let targets = emulators.filter(line => /^\d+\.\s+/.test(line));

        console.log(targets);

        if (target) {
            for (let t in targets) {
                if (targets.hasOwnProperty(t) && t.indexOf(target) >= 0) {
                    targets = [ t ];
                    break;
                }
            }
        }

        console.log(targets[0].split('. ')[0].trim());

        const targetData = { target: targets[0].split('. ')[0].trim() };

        this.__saveTarget(target, targetData);

        return Promise.resolve(targetData);
    }
}

module.exports = WindowsTargetChooser;
