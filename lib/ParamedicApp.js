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

const Q = require('q');
const tmp = require('tmp');
const shell = require('shelljs');
const path = require('path');
const PluginsManager = require('./PluginsManager');
const { logger, exec, execPromise, utilities } = require('./utils');

class ParamedicApp {
    constructor (config, storedCWD, runner) {
        this.config = config;
        this.storedCWD = storedCWD;
        this.runner = runner;
        this.tempFolder = null;

        this.platformId = this.config.getPlatformId();
        this.isAndroid = this.platformId === utilities.ANDROID;
        this.isBrowser = this.platformId === utilities.BROWSER;
        this.isIos = this.platformId === utilities.IOS;

        logger.info('---------------------------------------------------------');
        logger.info('1. Create Cordova app with platform and plugin(s) to test');
        logger.info('- platform: ' + this.config.getPlatformId());
        logger.info('- plugin(s): ' + this.config.getPlugins().join(', '));
        logger.info('---------------------------------------------------------');
    }

    createTempProject () {
        this.tempFolder = tmp.dirSync();
        tmp.setGracefulCleanup();
        logger.info('cordova-paramedic: creating temp project at ' + this.tempFolder.name);
        exec(this.config.getCli() + ' create ' + this.tempFolder.name + utilities.PARAMEDIC_COMMON_CLI_ARGS);
        return this.tempFolder;
    }

    prepareProjectToRunTests () {
        return this.installPlatform()
            .then(() => this.installPlugins())
            .then(() => this.setUpStartPage())
            .then(() => this.checkPlatformRequirements())
            .then(() => this.checkDumpAndroidManifest())
            .then(() => this.checkDumpAndroidConfigXml());
    }

    installPlugins () {
        logger.info('cordova-paramedic: installing plugins');
        const pluginsManager = new PluginsManager(this.tempFolder.name, this.storedCWD, this.config);

        const ciFrameworkPlugins = ['github:apache/cordova-plugin-test-framework', path.join(__dirname, '..', 'paramedic-plugin')];

        if (this.isIos) {
            ciFrameworkPlugins.push(path.join(__dirname, '..', 'ios-geolocation-permissions-plugin'));
        }

        if (this.config.isCI()) {
            ciFrameworkPlugins.push(path.join(__dirname, '..', 'ci-plugin'));
        }

        // Install testing framework
        logger.info('cordova-paramedic: installing ci framework plugins: ' + ciFrameworkPlugins.join(', '));
        pluginsManager.installPlugins(ciFrameworkPlugins);
        logger.info('cordova-paramedic: installing plugins:' + this.config.getPlugins().join(', '));
        pluginsManager.installPlugins(this.config.getPlugins());
        logger.info('cordova-paramedic: installing tests for existing plugins');
        pluginsManager.installTestsForExistingPlugins();
    }

    setUpStartPage () {
        logger.normal('cordova-paramedic: setting the app start page to the test page');
        shell.sed('-i', 'src="index.html"', 'src="cdvtests/index.html"', 'config.xml');
    }

    installPlatform () {
        const platform = this.config.getPlatform();
        logger.info('cordova-paramedic: adding platform ' + platform + ' (with: ' + utilities.PARAMEDIC_COMMON_CLI_ARGS + utilities.PARAMEDIC_PLATFORM_ADD_ARGS + ')');

        return execPromise(this.config.getCli() + ' platform add ' + platform + utilities.PARAMEDIC_COMMON_CLI_ARGS + utilities.PARAMEDIC_PLATFORM_ADD_ARGS)
            .then(() => {
                logger.info('cordova-paramedic: successfully finished adding platform ' + platform);
            });
    }

    checkPlatformRequirements () {
        if (this.isBrowser) return Q();

        logger.normal('cordova-paramedic: checking the requirements for platform: ' + this.platformId);
        return execPromise(this.config.getCli() + ' requirements ' + this.platformId + utilities.PARAMEDIC_COMMON_CLI_ARGS)
            .then(() => {
                logger.info('cordova-paramedic: successfully finished checking the requirements for platform: ' + this.platformId);
            });
    }

    checkDumpAndroidManifest () {
        if (!this.isAndroid) return Q();

        logger.normal('cordova-paramedic: start AndroidManifest.xml Dump');
        return execPromise('cat ./platforms/android/app/src/main/AndroidManifest.xml')
            .then(() => {
                logger.normal('cordova-paramedic: end AndroidManifest.xml Dump');
            });
    }

    checkDumpAndroidConfigXml () {
        if (!this.isAndroid) return Q();

        logger.normal('cordova-paramedic: start config.xml Dump');
        return execPromise('cat ./platforms/android/app/src/main/res/xml/config.xml')
            .then(() => {
                logger.info('cordova-paramedic: end config.xml Dump');
            });
    }
}

module.exports = ParamedicApp;
