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

var path = require('path');
var fs = require('fs');
var logger = require('./utils').logger;
var exec = require('./utils').exec;
var util = require('./utils').utilities;
var PluginInfoProvider = require('cordova-common').PluginInfoProvider;
var Server = require('./LocalServer');

function PluginsManager(appRoot, storedCWD, config) {
    this.appRoot = appRoot;
    this.storedCWD = storedCWD;
    this.config = config;
}

PluginsManager.prototype.installPlugins = function (plugins) {
    for(var n = 0; n < plugins.length; n++) {
        var plugin = plugins[n];
        this.installSinglePlugin(plugin);
    }
};

PluginsManager.prototype.installTestsForExistingPlugins = function () {
    var installedPlugins = new PluginInfoProvider().getAllWithinSearchPath(path.join(this.appRoot, 'plugins'));
    var me = this;
    installedPlugins.forEach(function(plugin) {
        // there is test plugin available
        if (fs.existsSync(path.join(plugin.dir, 'tests', 'plugin.xml'))) {
            var additionalArgs = "";

            // special handling for cordova-plugin-file-transfer
            if (plugin.id.indexOf('cordova-plugin-file-transfer') >= 0) {
                if (me.config.getFileTransferServer()) {
                    // user specified a file transfer server address, so using it
                    additionalArgs += ' --variable FILETRANSFER_SERVER_ADDRESS=' + me.config.getFileTransferServer();
                } else {
                    // no server address specified, starting a local server
                    var server = new Server(0, me.config.getExternalServerUrl());
                    var fileServerUrl = server.getConnectionAddress(me.config.getPlatformId()) + ':5000';
                    additionalArgs += ' --variable FILETRANSFER_SERVER_ADDRESS=' + fileServerUrl;
                }
            }
            me.installSinglePlugin(path.join(plugin.dir, 'tests') + additionalArgs);
        }
    });
    // this will list installed plugins and their versions
    this.showPluginsVersions();
};

PluginsManager.prototype.installSinglePlugin = function (plugin) {
    var pluginPath = plugin;
    var args = '';
    // separate plugin name from args
    var argsIndex = plugin.indexOf(' --');
    if (argsIndex > 0) {
        pluginPath = plugin.substring(0, argsIndex);
        args = plugin.substring(argsIndex);
    }
    if (fs.existsSync(path.resolve(this.storedCWD, pluginPath))) {
        plugin = path.resolve(this.storedCWD, pluginPath) + args;
    }

    plugin += util.PARAMEDIC_COMMON_CLI_ARGS + util.PARAMEDIC_PLUGIN_ADD_ARGS;
    logger.normal('cordova-paramedic: installing plugin ' + plugin);

    var plugAddCmd = exec(this.config.getCli() + ' plugin add ' + plugin);
    if (plugAddCmd.code !== 0) {
        logger.error('Failed to install plugin : ' + plugin);
        throw new Error('Failed to install plugin : ' + plugin);
    }
};

PluginsManager.prototype.showPluginsVersions = function () {
    logger.normal('cordova-paramedic: versions of installed plugins: ');
    exec(this.config.getCli() + ' plugins' + util.PARAMEDIC_COMMON_CLI_ARGS);
};

module.exports = PluginsManager;
