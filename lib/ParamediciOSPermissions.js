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

/* jshint node: true */

var path    = require('path');
var fs      = require('fs');
var shelljs = require('shelljs');
var logger  = require('./utils').logger;
var util    = require('./utils').utilities;
var nodeutil    = require('util');

var TCC_FOLDER_PERMISSION = 0755;

function ParamediciOSPermissions(appName, tccDb, targetObj) {
    this.appName   = appName;
    this.tccDb     = tccDb;
    this.targetObj = targetObj;
}

ParamediciOSPermissions.prototype.updatePermissions = function (serviceList){
    var simulatorsFolder   = util.getSimulatorsFolder();
    var simId              = this.targetObj.simId;
    logger.info('Sim Id is: ' + simId);
    var destinationTCCFile = path.join(simulatorsFolder, simId, '/data/Library/TCC/TCC.db');

    if (!util.doesFileExist(destinationTCCFile)) {
        // No TCC.db file exists by default. So, Copy the new TCC.db file
        var destinationTCCFolder = path.join(simulatorsFolder, simId, '/data/Library/TCC');
        if(!util.doesFileExist(destinationTCCFolder)) {
            fs.mkdir(destinationTCCFolder, TCC_FOLDER_PERMISSION);
        }
        logger.info('Copying TCC Db file to ' + destinationTCCFolder);
        shelljs.cp(this.tccDb, destinationTCCFolder);
    }

    for (var i = 0; i < serviceList.length; i++) {
        var command = util.getSqlite3InsertionCommand(destinationTCCFile, serviceList[i], this.appName);
        logger.info('Running Command: ' + command);
        // If the service has an entry already, the insert command will fail.
        // in this case we'll process with updating existing entry
        console.log('$ ' + command);
        var proc = shelljs.exec(command, {silent: true, async: false});
        if (proc.code) {
            logger.warn('Failed to insert permissions for ' + this.appName + ' into ' + destinationTCCFile +
                ' Will try to update existing permissions.');

            // (service, client, client_type, allowed, prompt_count, csreq)
            command = nodeutil.format('sqlite3 %s "update access ' +
                'set client_type=0, allowed=1, prompt_count=1, csreq=NULL ' +
                'where service=\'%s\' and client=\'%s\'"', destinationTCCFile, serviceList[i], this.appName);
            logger.info('Running Command: ' + command);
            // Now we really don't care about the result as there is nothing we can do with this
            console.log('$ ' + command);
            var patchProc = shelljs.exec(command, {silent: true, async: false});
            if (patchProc.code) {
                logger.warn('Failed to update existing permissions for ' + this.appName + ' into ' + destinationTCCFile +
                ' Continuing anyway.');
            }
        }
    }
};

module.exports = ParamediciOSPermissions;
