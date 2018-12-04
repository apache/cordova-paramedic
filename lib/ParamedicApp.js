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

var Q               = require('q');
var tmp             = require('tmp');
var shell           = require('shelljs');
var path            = require('path');
var exec            = require('./utils').exec;
var execPromise     = require('./utils').execPromise;
var util            = require('./utils').utilities;
var logger          = require('./utils').logger;
var PluginsManager  = require('./PluginsManager');
var appPatcher      = require('./appium/helpers/appPatcher');



function ParamedicApp(config, storedCWD, runner) {
    this.config = config;
    this.storedCWD = storedCWD;
    this.runner = runner;

    this.tempFolder = null;
}
module.exports = ParamedicApp;

ParamedicApp.prototype.createTempProject = function () {
    this.tempFolder = tmp.dirSync();
    tmp.setGracefulCleanup();
    logger.info('cordova-paramedic: creating temp project at ' + this.tempFolder.name);
    exec(this.config.getCli() + ' create ' + this.tempFolder.name + util.PARAMEDIC_COMMON_CLI_ARGS);
    return this.tempFolder;
};

ParamedicApp.prototype.prepareProjectToRunTests = function () {
    var self = this;

    this.installPlugins();
    this.setUpStartPage();
    return this.installPlatform()
    .then(function () {
        return self.checkPlatformRequirements();
    });
};

ParamedicApp.prototype.installPlugins = function () {
    logger.info('cordova-paramedic: installing plugins');
    var pluginsManager = new PluginsManager(this.tempFolder.name, this.storedCWD, this.config);
    pluginsManager.installPlugins(this.config.getPlugins());
    pluginsManager.installTestsForExistingPlugins();

    var additionalPlugins = ['cordova-plugin-test-framework', path.join(__dirname, '../paramedic-plugin')];
    if (this.config.shouldUseSauce() && !this.config.getUseTunnel()) {
        additionalPlugins.push(path.join(__dirname, '../event-cache-plugin'));
    }
    if (this.config.getPlatformId() === util.WINDOWS) {
        additionalPlugins.push(path.join(__dirname, '../debug-mode-plugin'));
    }
    if (this.config.getPlatformId() === util.IOS) {
        additionalPlugins.push(path.join(__dirname, '../ios-geolocation-permissions-plugin'));
    }
    if (this.config.isCI()) {
        additionalPlugins.push(path.join(__dirname, '../ci-plugin'));
    }

    pluginsManager.installPlugins(additionalPlugins);
};

ParamedicApp.prototype.setUpStartPage = function () {
    logger.normal('cordova-paramedic: setting app start page to test page');
    shell.sed('-i', 'src="index.html"', 'src="cdvtests/index.html"', 'config.xml');
};

ParamedicApp.prototype.installPlatform = function () {
    var self = this;
    var platform = this.config.getPlatform();
    var platformId = this.config.getPlatformId();
    logger.info('cordova-paramedic: adding platform ' + platform + " (with: " + util.PARAMEDIC_COMMON_CLI_ARGS + util.PARAMEDIC_PLATFORM_ADD_ARGS + ")");

    return execPromise(this.config.getCli() + ' platform add ' + platform + util.PARAMEDIC_COMMON_CLI_ARGS + util.PARAMEDIC_PLATFORM_ADD_ARGS)
    .then(function () {
        logger.info('cordova-paramedic: successfully finished adding platform ' + platform);
        if (platformId === util.ANDROID && self.config.isCI()) {
            logger.info('cordova-paramedic: monkey patching Android platform to disable gradle daemon...');
            var gradleBuilderFile = path.join(self.tempFolder.name, 'platforms/android/cordova/lib/builders/GradleBuilder.js');
            // remove the line where the gradle daemon is forced on
            if (appPatcher.monkeyPatch(gradleBuilderFile, /args\.push\('\-Dorg\.gradle\.daemon=true'\);/, '//args.push(\'-Dorg.gradle.daemon=true\');')) {
                logger.info('cordova-paramedic: success!');
            } else {
                logger.info('cordova-paramedic: couldn\'t apply the patch. It must be good news: does cordova-android not hard-code gradle daemon anymore?');
            }
        } else if (platformId === util.BROWSER && self.config.shouldUseSauce()) {
            logger.info('cordova-paramedic: I like patching stuff, so...');
            logger.info('cordova-paramedic: monkey patching browser platform to disable browser pop-up.');
            var cordovaRunFile = path.join(self.tempFolder.name, 'platforms/browser/cordova/run');
            // we need to supply some replacement string so this method can properly return a result
            if (appPatcher.monkeyPatch(cordovaRunFile, /return cordovaServe\.launchBrowser\(.*\)\;/, '// no pop-up please')) {
                logger.info('cordova-paramedic: success!');
                self.runner.browserPatched = true;
            } else {
                cordovaRunFile = path.join(self.tempFolder.name, 'platforms/browser/cordova/lib/run.js');
                if (appPatcher.monkeyPatch(cordovaRunFile, /return server\.launchBrowser\(\{'target'\: args\.target\, 'url'\: projectUrl\}\)\;/, '// no pop-up please')) {
                    logger.info('cordova-paramedic: success!');
                    self.runner.browserPatched = true;
                } else {
                    logger.info('cordova-paramedic: couldn\'t apply the patch. Not a big deal, though: things should work anyway.');
                    self.runner.browserPatched = false;
                }
            }
        }
    });
};

ParamedicApp.prototype.checkPlatformRequirements = function () {
    var platformId = this.config.getPlatformId();

    if (platformId === util.BROWSER) {
        return Q();
    }

    logger.normal('cordova-paramedic: checking requirements for platform ' + platformId);
    return execPromise(this.config.getCli() + ' requirements ' + platformId + util.PARAMEDIC_COMMON_CLI_ARGS)
    .then(function () {
        logger.info('cordova-paramedic: successfully finished checking requirements for platform ' + platformId);
    });
};