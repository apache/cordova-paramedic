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

const tmp = require('tmp');
const path = require('path');
const fs = require('node:fs');
const PluginsManager = require('./PluginsManager');
const { logger, spawnAsync, utilities } = require('./utils');

class ParamedicApp {
    constructor (config, storedCWD, runner) {
        this.config = config;
        this.storedCWD = storedCWD;
        this.runner = runner;
        this.tempFolder = null;

        this.platformId = this.config.getPlatformId();
        this.isAndroid = this.platformId === utilities.ANDROID;
        this.isIos = this.platformId === utilities.IOS;

        logger.info('---------------------------------------------------------');
        logger.info('1. Create Cordova app with platform and plugin(s) to test');
        logger.info('- platform: ' + this.platformId);
        logger.info('- plugin(s): ' + this.config.getPlugins().join(', '));
        logger.info('---------------------------------------------------------');
    }

    /**
     * Creates a Cordova project inside a newly created temporary directory.
     *
     * @returns {Promise<Object>} Object contains the directory path on the name property.
     */
    async createTempProject () {
        this.tempFolder = tmp.dirSync();
        tmp.setGracefulCleanup();
        logger.info('[paramedic] Creating temp project at ' + this.tempFolder.name);
        await spawnAsync(
            this.config.getCli(),
            ['create', this.tempFolder.name, ...utilities.PARAMEDIC_COMMON_ARGS]
        );
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

    /**
     * Installs testing related framework plugins and user defined plugin.
     *
     * (For All Platforms)
     *   - cordova-plugin-test-framework
     *   - paramedic-plugin
     * (For iOS Platform)
     *   - ios-geolocation-permissions-plugin (iOS)
     * (For CI)
     *   - ci-plugin
     * (User Defined Plugins)
     * (User Defined Plugin's Test)
     */
    async installPlugins () {
        const pluginsManager = new PluginsManager(this.tempFolder.name, this.storedCWD, this.config);
        const ciFrameworkPlugins = ['github:apache/cordova-plugin-test-framework', path.join(__dirname, '..', 'paramedic-plugin')];

        if (this.isIos) {
            ciFrameworkPlugins.push(path.join(__dirname, '..', 'ios-geolocation-permissions-plugin'));
        }
        if (this.config.isCI()) {
            ciFrameworkPlugins.push(path.join(__dirname, '..', 'ci-plugin'));
        }

        // Install testing framework
        logger.info(`[paramedic] Installing CI Plugins:\n\t - ${ciFrameworkPlugins.join('\n\t - ')}`);
        await pluginsManager.installPlugins(ciFrameworkPlugins);
        logger.info(`[paramedic] Installing Plugins:\n\t - ${this.config.getPlugins().join('\n\t - ')}`);
        await pluginsManager.installPlugins(this.config.getPlugins());
        logger.info('[paramedic] Installing tests for existing plugins.');
        await pluginsManager.installTestsForExistingPlugins();
    }

    /**
     * Edits the the testing application's content source to "cdvtests/index.html"
     */
    setUpStartPage () {
        logger.normal('[paramedic] Setting the app start page to the test page');
        const filePath = path.join(this.tempFolder.name, 'config.xml');
        let config = fs.readFileSync(filePath, utilities.DEFAULT_ENCODING);
        config = config.replace('src="index.html"', 'src="cdvtests/index.html"');
        fs.writeFileSync(filePath, config, utilities.DEFAULT_ENCODING);
    }

    /**
     * Installs the Cordova platform for testing
     *
     * @returns {Promise<Object|Error>}
     */
    installPlatform () {
        return spawnAsync(
            this.config.getCli(),
            ['platform', 'add', this.platformId, ...utilities.PARAMEDIC_COMMON_ARGS],
            { cwd: this.tempFolder.name }
        );
    }

    /**
     * Gets the platform reqirements
     *
     * @returns {Promise<Object|Error>}
     */
    async checkPlatformRequirements () {
        const requirements = await spawnAsync(
            this.config.getCli(),
            ['requirements', this.platformId, ...utilities.PARAMEDIC_COMMON_ARGS],
            { cwd: this.tempFolder.name }
        );
        logger.normal(requirements.stdout);
    }

    /**
     * Fetches and dumps out the AndroidManifest.xml content.
     *
     * @return If not running for Android platform, return out.
     */
    checkDumpAndroidManifest () {
        if (!this.isAndroid) {
            return;
        }

        logger.normal('[paramedic] AndroidManifest.xml Dump');
        const androidManifest = path.join(this.tempFolder.name, 'platforms/android/app/src/main/AndroidManifest.xml');
        const xml = fs.readFileSync(androidManifest, utilities.DEFAULT_ENCODING);
        logger.normal(xml);
    }

    /**
     * Fetches and dumps out the Android's compiled config.xml content.
     *
     * @return If not running for Android platform, return out.
     */
    checkDumpAndroidConfigXml () {
        if (!this.isAndroid) {
            return;
        }

        logger.normal('[paramedic] config.xml Dump');
        const config = path.join(this.tempFolder.name, 'platforms/android/app/src/main/res/xml/config.xml');
        const xml = fs.readFileSync(config, utilities.DEFAULT_ENCODING);
        logger.normal(xml);
    }
}

module.exports = ParamedicApp;
