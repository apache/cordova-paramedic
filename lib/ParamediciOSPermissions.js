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
const fs = require('fs');
const { logger, utilities, spawnAsync } = require('./utils');

const TCC_FOLDER_PERMISSION = 0o755;

class ParamediciOSPermissions {
    constructor (appName, tccDb, targetObj) {
        this.appName = appName;
        this.tccDb = tccDb;
        this.targetObj = targetObj;
    }

    /**
     * Add or update service list to grant permissions for testing.
     *
     * @param {Array} serviceList List of services that should grant permission
     */
    async updatePermissions (serviceList) {
        const simId = this.targetObj.simId;
        logger.info('Sim Id is: ' + simId);

        const simulatorsFolder = utilities.getSimulatorsFolder();
        const tccDirectory = path.join(simulatorsFolder, simId, 'data', 'Library', 'TCC');
        const destinationTCCFile = path.join(tccDirectory, 'TCC.db');

        if (!utilities.doesFileExist(destinationTCCFile)) {
            // No TCC.db file exists by default. So, Copy the new TCC.db file
            if (!utilities.doesFileExist(tccDirectory)) {
                fs.mkdir(tccDirectory, TCC_FOLDER_PERMISSION);
            }

            logger.info('Copying TCC Db file to ' + tccDirectory);
            fs.cpSync(this.tccDb, tccDirectory);
        }

        for (const service of serviceList) {
            const app = this.appName;
            // If the service has an entry already, the insert command will fail.
            // in this case we'll process with updating existing entry
            const insetProc = await spawnAsync(
                'sqlite3',
                [
                    destinationTCCFile,
                    `"INSERT INTO access (service, client, client_type, allowed, prompt_count, csreq) VALUES('${service}', '${app}', 0, 1, 1, NULL)"`
                ]
            );

            if (insetProc.code) {
                logger.warn(`[paramedic] Failed to insert permissions for ${app} into ${destinationTCCFile}. Will try to update existing permissions.`);

                const updateProc = await spawnAsync(
                    'sqlite3',
                    [
                        destinationTCCFile,
                        `"UPDATE access SET client_type=0, allowed=1, prompt_count=1, csreq=NULL WHERE service='${service}' AND client='${app}'"`
                    ]
                );

                if (updateProc.code) {
                    logger.warn(`[paramedic] Failed to update existing permissions for ${app} into ${destinationTCCFile}. Continuing anyway.`);
                }
            }
        }
    }
}

module.exports = ParamediciOSPermissions;
