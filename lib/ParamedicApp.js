/*
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
        this.isBrowser = this.platformId === utilities.BROWSER;

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
            .then(() => this.ensureCdvTestsExists())
            .then(() => this.setUpStartPage())
            .then(() => this.updateBrowserTestPageCSP())
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
     * For browser platform, explicitly copies cordova-plugin-test-framework assets to
     * www/cdvtests/ because the Cordova <asset> element may not execute reliably on
     * the browser platform in CI environments.
     */
    ensureCdvTestsExists () {
        if (!this.isBrowser) {
            return;
        }

        const tfPluginAssetsDir = path.join(this.tempFolder.name, 'plugins', 'cordova-plugin-test-framework', 'www', 'assets');
        const cdvTestsDir = path.join(this.tempFolder.name, 'www', 'cdvtests');

        if (!fs.existsSync(tfPluginAssetsDir)) {
            logger.warn('[paramedic] cordova-plugin-test-framework assets not found at: ' + tfPluginAssetsDir);
            return;
        }

        if (fs.existsSync(path.join(cdvTestsDir, 'index.html'))) {
            logger.info('[paramedic] www/cdvtests/index.html already exists, skipping copy.');
            return;
        }

        logger.info('[paramedic] Copying cordova-plugin-test-framework assets to www/cdvtests/');
        fs.cpSync(tfPluginAssetsDir, cdvTestsDir, { recursive: true });
        logger.info('[paramedic] Done copying to www/cdvtests/');
    }

    /**
     * Ensures browser test page CSP allows localhost HTTP/WS endpoints used by Paramedic.
     */
    updateBrowserTestPageCSP () {
        if (!this.isBrowser) {
            return;
        }

        const testPagePath = path.join(this.tempFolder.name, 'www', 'cdvtests', 'index.html');
        const addrs = [
            'http://localhost:*',
            'http://127.0.0.1:*',
            'ws://localhost:*',
            'ws://127.0.0.1:*'
        ];

        let html;
        try {
            html = fs.readFileSync(testPagePath, utilities.DEFAULT_ENCODING);
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                return;
            }
            throw err;
        }

        const cspMetaRegex = /<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i;
        const cspContentRegex = /content=["']([^"']*)["']/i;

        if (cspMetaRegex.test(html)) {
            html = html.replace(cspMetaRegex, (metaTag) => {
                const contentMatch = metaTag.match(cspContentRegex);
                if (!contentMatch) {
                    return metaTag;
                }

                let cspContent = contentMatch[1];
                const connectSrcRegex = /connect-src\s+([^;]+)/i;

                if (connectSrcRegex.test(cspContent)) {
                    cspContent = cspContent.replace(connectSrcRegex, (full, sources) => {
                        const sourceSet = new Set(sources.trim().split(/\s+/).filter(Boolean));
                        addrs.forEach((addr) => sourceSet.add(addr));
                        return `connect-src ${Array.from(sourceSet).join(' ')}`;
                    });
                } else {
                    cspContent = `${cspContent.trim().replace(/;?$/, ';')} connect-src 'self' ${addrs.join(' ')};`;
                }

                return metaTag.replace(cspContentRegex, `content="${cspContent}"`);
            });
        } else {
            const cspTag = `<meta http-equiv="Content-Security-Policy" content="default-src 'self' data: gap: https://ssl.gstatic.com 'unsafe-eval'; style-src 'self' 'unsafe-inline'; media-src *; connect-src 'self' ${addrs.join(' ')};">`;
            if (/<head[^>]*>/i.test(html)) {
                html = html.replace(/<head[^>]*>/i, (headTag) => `${headTag}\n    ${cspTag}`);
            }
        }

        try {
            fs.writeFileSync(testPagePath, html, utilities.DEFAULT_ENCODING);
        } catch (err) {
            if (err && err.code === 'ENOENT') {
                return;
            }
            throw err;
        }
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
