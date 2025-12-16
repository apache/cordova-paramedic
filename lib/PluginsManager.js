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
const { logger, spawnAsync, utilities } = require('./utils');
const { PluginInfoProvider } = require('cordova-common');

class PluginsManager {
    constructor (appRoot, storedCWD, config) {
        this.appRoot = appRoot;
        this.storedCWD = storedCWD;
        this.config = config;
    }

    /**
     * Installs list of plugins to the temporary Cordova testing project.
     *
     * @param {Array} plugins
     */
    async installPlugins (plugins) {
        for (const plugin of plugins) {
            await this.installSinglePlugin(plugin);
        }
    }

    /**
     * Loops though the installed plugins and installs tests to the temporary Cordova
     * testing project, if the plugins have.
     */
    async installTestsForExistingPlugins () {
        const installedPlugins = new PluginInfoProvider().getAllWithinSearchPath(path.join(this.appRoot, 'plugins'));

        for (const plugin of installedPlugins) {
            // Install test if it exists
            if (fs.existsSync(path.join(plugin.dir, 'tests', 'plugin.xml'))) {
                await this.installSinglePlugin(path.join(plugin.dir, 'tests'));
            }
        }

        // this will list installed plugins and their versions
        await this.showPluginsVersions();
    }

    /**
     * Installs a single plugin to the temporary Cordova testing project.
     *
     * @param {String} plugin
     */
    async installSinglePlugin (plugin) {
        let pluginPath = plugin;
        let args = '';

        // separate plugin name from args
        const argsIndex = plugin.indexOf(' --');
        if (argsIndex > 0) {
            pluginPath = plugin.substring(0, argsIndex);
            args = plugin.substring(argsIndex);
        }

        if (fs.existsSync(path.resolve(this.storedCWD, pluginPath))) {
            plugin = path.resolve(this.storedCWD, pluginPath) + args;
        }

        const results = await spawnAsync(
            this.config.getCli(),
            ['plugin', 'add', plugin, ...utilities.PARAMEDIC_COMMON_ARGS],
            { cwd: this.appRoot }
        );

        if (results.code !== 0) {
            logger.error(`[paramedic] Failed to install plugin: ${plugin}`);
            throw new Error(`[paramedic] Failed to install plugin: ${plugin}`);
        }
    }

    /**
     * Fetches and displays list of all installed plugins.
     */
    async showPluginsVersions () {
        const results = await spawnAsync(
            this.config.getCli(),
            ['plugins', ...utilities.PARAMEDIC_COMMON_ARGS],
            { cwd: this.appRoot }
        );

        logger.normal(results.stdout);
    }
}

module.exports = PluginsManager;
