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

var path    = require('path');
var fs      = require('fs');
var logger  = require('./utils').logger;
var util    = require('./utils').utilities;
var Q       = require('q');
var exec    = require('./utils').exec;

function ParamedicAppUninstall(appPath, platform) {
    this.appPath = appPath;
    this.platform = platform;
}

ParamedicAppUninstall.prototype.uninstallApp = function (targetObj, app) {
    if (!targetObj || !targetObj.target)
        return Q();

    switch (this.platform) {
        case util.ANDROID:
            return this.uninstallAppAndroid(targetObj, app);
        case util.IOS:
            return this.uninstallAppIOS(targetObj, app);
        case util.WINDOWS:
            return this.uninstallAppWindows(targetObj, app);
        default:
            return Q();
    }
};

ParamedicAppUninstall.prototype.uninstallAppAndroid = function (targetObj, app) {
    var uninstallCommand = 'adb -s ' + targetObj.target + ' uninstall ' + app;
    return this.executeUninstallCommand(uninstallCommand);
};

ParamedicAppUninstall.prototype.uninstallAppWindows = function (targetObj, app) {
    var platformPath = path.join(this.appPath, 'platforms', 'windows');
    var packageJSPath = path.join(platformPath, 'cordova', 'lib', 'package.js');
    var programFilesPath = process.env['ProgramFiles(x86)'] || process.env.ProgramFiles;
    var appDeployPath = path.join(programFilesPath, 'Microsoft SDKs',
          'Windows Phone', 'v8.1', 'Tools', 'AppDeploy', 'AppDeployCmd.exe');
    appDeployPath = '"' + appDeployPath + '"';

    if (fs.existsSync(packageJSPath)) {
        var packageJS = require(packageJSPath);
        var appId = packageJS.getAppId(platformPath);
        var uninstallCommand = appDeployPath + ' /uninstall ' + appId + ' /targetdevice:' + targetObj.target;
        return this.executeUninstallCommand(uninstallCommand);
    }
    return Q();
};

ParamedicAppUninstall.prototype.uninstallAppIOS = function (targetObj, app) {
   var uninstallCommand = 'xcrun simctl uninstall ' + targetObj.simId + ' uninstall ' + app;
   return this.executeUninstallCommand(uninstallCommand);
};

ParamedicAppUninstall.prototype.executeUninstallCommand = function (uninstallCommand) {
    return Q.Promise(function (resolve, reject, notify) {
        logger.info('cordova-paramedic: Running command: ' + uninstallCommand);
        exec(uninstallCommand, function (code, stdout, stderr) {
            if (code === 0) {
                resolve();
            } else {
                logger.error('Failed to uninstall the app');
                logger.error('Error code: ' + code);
                reject();
            }
        }, {silent: false, async: true});
    }).timeout(60000)
    .fail(function () {
        logger.warn('cordova-paramedic: App uninstall timed out!');
    });
};

module.exports = ParamedicAppUninstall;
