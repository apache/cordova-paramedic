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

const DEFAULT_START_PORT = 7008;
const DEFAULT_END_PORT = 7208;
const DEFAULT_TIMEOUT = 60 * 60 * 1000; // 60 minutes in msec - this will become a param
const DEFAULT_CLI = 'cordova'; // use globally installed cordova by default

class ParamedicConfig {
    constructor (json) {
        this._config = json;
    }

    getOutputDir () {
        return this._config.outputDir;
    }

    setOutputDir (outputDir) {
        this._config.outputDir = outputDir;
    }

    shouldCleanUpAfterRun () {
        return this._config.cleanUpAfterRun;
    }

    getPlatform () {
        return this._config.platform;
    }

    setPlatform (platform) {
        this._config.platform = platform;
    }

    getAction () {
        return this._config.action;
    }

    setAction (action) {
        this._config.action = action;
    }

    getArgs () {
        if (this._config.args) {
            return this._config.args;
        } else {
            return '';
        }
    }

    setArgs (args) {
        this._config.args = args;
    }

    getPlatformId () {
        return this._config.platform.split('@')[0];
    }

    getPlugins () {
        return this._config.plugins;
    }

    setPlugins (plugins) {
        this._config.plugins = Array.isArray(plugins) ? plugins : [plugins];
    }

    isVerbose () {
        return this._config.verbose;
    }

    isJustBuild () {
        return this._config.justbuild;
    }

    runMainTests () {
        return !this._config.skipMainTests;
    }

    setSkipMainTests (skipMainTests) {
        this._config.skipMainTests = skipMainTests;
    }

    getPorts () {
        return {
            start: this._config.startPort || DEFAULT_START_PORT,
            end: this._config.endPort || DEFAULT_END_PORT
        };
    }

    getTimeout () {
        return DEFAULT_TIMEOUT;
    }

    setTccDb (tccDb) {
        this._config.tccDb = tccDb;
    }

    getTccDb () {
        return this._config.tccDb;
    }

    isCI () {
        return this._config.ci;
    }

    setCI (isCI) {
        this._config.ci = isCI;
    }

    getTarget () {
        return this._config.target;
    }

    setTarget (target) {
        this._config.target = target;
    }

    getFileTransferServer () {
        return this._config.fileTransferServer;
    }

    setFileTransferServer (server) {
        this._config.fileTransferServer = server;
    }

    getCli () {
        if (this._config.cli) {
            return this._config.cli;
        }
        return DEFAULT_CLI;
    }

    setCli (cli) {
        this._config.cli = cli;
    }

    getAll () {
        return this._config;
    }
}

ParamedicConfig.parseFromArguments = function (argv) {
    return new ParamedicConfig({
        platform: argv.platform,
        action: argv.justbuild || argv.justBuild ? 'build' : 'run',
        args: '',
        plugins: Array.isArray(argv.plugin) ? argv.plugin : [argv.plugin],
        verbose: !!argv.verbose,
        startPort: argv.startport || argv.port,
        endPort: argv.endport || argv.port,
        outputDir: argv.outputDir ? argv.outputDir : null,
        tccDb: argv.tccDbPath ? argv.tccDb : null,
        cleanUpAfterRun: !!argv.cleanUpAfterRun,
        skipMainTests: argv.skipMainTests,
        ci: argv.ci,
        target: argv.target,
        fileTransferServer: argv.fileTransferServer,
        cli: argv.cli
    });
};

ParamedicConfig.parseFromFile = function (paramedicConfigPath) {
    return new ParamedicConfig(require(paramedicConfigPath));
};

module.exports = ParamedicConfig;
