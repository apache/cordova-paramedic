#!/usr/bin/env node

/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

var parseArgs = require('minimist');
var paramedic = require('./lib/paramedic');
var ParamedicConfig = require('./lib/ParamedicConfig');
var util = require('./lib/utils').utilities;

var USAGE = 'Error missing args. \n' +
    '\n' +
    'cordova-paramedic --platform PLATFORM --plugin PATH [--justbuild --timeout MSECS --startport PORTNUM --endport PORTNUM --version ...]\n' +
    '\n' +
    'Required parameters (unless --config was used):\n' +
    "--platform PLATFORM : the platform id. Currently supports 'ios', 'browser', 'windows', 'android'.\n" +
                    '\tPath to platform can be specified as link to git repo like:\n' +
                    '\twindows@https://github.com/apache/cordova-windows.git\n' +
                    '\tor path to local copied git repo like:\n' +
                    '\twindows@../cordova-windows/\n' +
    '--plugin PATH : the relative or absolute path to a plugin folder\n' +
                    "\texpected to have a 'tests' folder.\n" +
                    '\tYou may specify multiple --plugin flags and they will all\n' +
                    '\tbe installed and tested together.\n' +
    '\n' +
    'Alphabetical list of optional parameters:\n' +
    '--action: TODO\n' +
    '--args: add command line args to the "cordova build" and "cordov run" commands \n' +
    '--buildName : Build name to show in Saucelabs dashboard\n' +
    '--ci :  Skip tests that require user interaction\n' +
    '--cleanUpAfterRun : cleans up the application after the run\n' +
    '--cli : A path to Cordova CLI\n' +
    '--config : read configuration from paramedic configuration file\n' +
    '--externalServerUrl :  TODO\n' +
    '--fileTransferServer : (cordova-plugin-file-transfer only) A server address tests should connect to\n' +
    '--justbuild : just builds the project, without running the tests \n' +
    '--logMins : Windows only - specifies number of minutes to get logs\n' +
    '--outputDir : path to save Junit results file & Device logs\n' +
    '--port : TODO\n' +
    '--sauceAppiumVersion : Appium version to use when running on Saucelabs. For example, "1.5.3"\n' +
    '--sauceDeviceName : Name of the SauceLabs emulator/browser. For example, "iPhone Simulator" or "firefox"\n' +
    '--sauceKey : Saucelabs access key\n' +
    '--saucePlatformVersion : Version of the emulator OS or version of the browser. For example, "9.3" or "54.0"\n' +
    '--sauceTunnelId : Tunnel identifier to use. Only usable if you have Sauce Connect up\n' +
    '--sauceUser : Saucelabs username\n' +
    '--shouldUseSauce : run tests on Sauce Labs\n' +
    '--skipAppiumTests : Do not run Appium tests\n' +
    '--skipMainTests : Do not run main (cordova-test-framework) tests\n' +
    '--startport/--endport `PORTNUM` : ports to find available and use for posting results from emulator back to paramedic server (default is from 8008 to 8009)\n' +
    '--target : target to deploy to\n' +
    '--tccDb : iOS only - specifies the path for the TCC.db file to be copied.\n' +
    '--timeout `MSECS` : time in millisecs to wait for tests to pass|fail \n' +
                '\t(defaults to 10 minutes) \n' +
    '--useTunnel: use tunneling instead of local address. default is false\n' +
    '--verbose : verbose mode. Display more information output\n' +
    '--version : prints cordova-paramedic version and exits\n' +
    '';

var argv = parseArgs(process.argv.slice(2), {
    'string': ['plugin']
});
var pathToParamedicConfig = util.getConfigPath(argv.config);

if (argv.version) {
    console.log(require('./package.json')['version']);
    process.exit(0);
} else if (pathToParamedicConfig || // --config
    (argv.platform && argv.plugin)) { // or --platform and --plugin

    var paramedicConfig = pathToParamedicConfig ?
        ParamedicConfig.parseFromFile(pathToParamedicConfig) :
        ParamedicConfig.parseFromArguments(argv);

    // What and how to build and test

    if (argv.platform) {
        paramedicConfig.setPlatform(argv.platform);
    }

    if (argv.plugin) {
        paramedicConfig.setPlugins(argv.plugin);
    }

    if (argv.cli) {
        paramedicConfig.setCli(argv.cli);
    }

    if (argv.justBuild || argv.justbuild) {
        paramedicConfig.setAction('build');
    }

    if (argv.action) {
        paramedicConfig.setAction(argv.action);
    }

    if (argv.skipMainTests) {
        paramedicConfig.setSkipMainTests(argv.skipMainTests);
    }

    if (argv.skipAppiumTests) {
        paramedicConfig.setSkipAppiumTests(argv.skipAppiumTests);
    }

    if (argv.args) {
        paramedicConfig.setArgs(argv.args);
    }

    // Emulator/Device to use for tests

    if (argv.target) {
        paramedicConfig.setTarget(argv.target);
    }

    // Test Result Server

    if (argv.useTunnel) {
        if (argv.useTunnel === 'false') {
            argv.useTunnel = false;
        }
        paramedicConfig.setUseTunnel(argv.useTunnel);
    }

    // TODO externalServerUrl

    // TODO port

    // Test configuration

    // TODO timeout

    if (argv.outputDir) {
        paramedicConfig.setOutputDir(argv.outputDir);
    }

    // cleanUpAfterRun?

    if (argv.logMins) {
        paramedicConfig.setLogMins(argv.logMins);
    }

    if (argv.tccDb) {
        paramedicConfig.setTccDb(argv.tccDb);
    }

    // Sauce Labs

    if (argv.shouldUseSauce) {
        if (argv.shouldUseSauce === 'false') {
            argv.shouldUseSauce = false;
        }
        paramedicConfig.setShouldUseSauce(argv.shouldUseSauce);
    }

    if (argv.sauceUser) {
        paramedicConfig.setSauceUser(argv.sauceUser);
    }

    if (argv.sauceKey) {
        paramedicConfig.setSauceKey(argv.sauceKey);
    }

    if (argv.buildName) {
        paramedicConfig.setBuildName(argv.buildName);
    }

    if (argv.sauceDeviceName) {
        paramedicConfig.setSauceDeviceName(argv.sauceDeviceName);
    }

    if (argv.saucePlatformVersion) {
        paramedicConfig.setSaucePlatformVersion(argv.saucePlatformVersion);
    }

    if (argv.sauceAppiumVersion) {
        paramedicConfig.setSauceAppiumVersion(argv.sauceAppiumVersion);
    }

    if (argv.sauceTunnelId) {
        paramedicConfig.setSauceTunnelId(argv.sauceTunnelId);
    }

    // Others

    if (argv.ci) {
        paramedicConfig.setCI(argv.ci);
    }

    if (argv.fileTransferServer) {
        paramedicConfig.setFileTransferServer(argv.fileTransferServer);
    }

    // run!

    paramedic.run(paramedicConfig)
        .catch(function (error) {
            if (error && error.stack) {
                console.error(error.stack);
            } else if (error) {
                console.error(error);
            }
            process.exit(1);
        })
        .done(function (isTestPassed) {
            var exitCode = isTestPassed ? 0 : 1;

            console.log('Finished with exit code ' + exitCode);
            process.exit(exitCode);
        });

} else {
    console.log(USAGE);
    process.exit(1);
}
