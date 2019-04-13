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

var cp              = require('child_process');
var exec            = require('./utils').exec;
var execPromise     = require('./utils').execPromise;
var shell           = require('shelljs');
var Server          = require('./LocalServer');
var path            = require('path');
var Q               = require('q');
var fs              = require('fs');

var logger          = require('./utils').logger;
var util            = require('./utils').utilities;
var Reporters       = require('./Reporters');
var ParamedicKill   = require('./ParamedicKill');
var AppiumRunner    = require('./appium/AppiumRunner');
var ParamedicLogCollector   = require('./ParamedicLogCollector');
var ParamediciOSPermissions = require('./ParamediciOSPermissions');
var ParamedicTargetChooser  = require('./ParamedicTargetChooser');
var ParamedicAppUninstall   = require('./ParamedicAppUninstall');
var ParamedicApp   = require('./ParamedicApp');
var ParamedicSauceLabs      = require('./ParamedicSauceLabs');

//this will add custom promise chain methods to the driver prototype
require('./appium/helpers/wdHelper');

// Time to wait for initial device connection.
// If device has not connected within this interval the tests are stopped.
var INITIAL_CONNECTION_TIMEOUT = 540000; // 9mins

Q.longStackSupport = true;

function ParamedicRunner(config, _callback) {
    this.tempFolder = null;

    this.config = config;
    this.targetObj = undefined;

    exec.setVerboseLevel(config.isVerbose());

    this.paramedicSauceLabs = null;
}

ParamedicRunner.prototype.run = function () {
    var self = this;
    var isTestPassed = false;

    self.checkConfig();

    return Q().then(function () {
        // create project and prepare (install plugins, setup test startpage, install platform, check platform requirements)
        var paramedicApp = new ParamedicApp(self.config, self.storedCWD, self);
        self.tempFolder = paramedicApp.createTempProject();
        shell.pushd(self.tempFolder.name);
        return paramedicApp.prepareProjectToRunTests();
    })
    .then(function () {
        if (self.config.runMainTests()) {
            // start server
            var noListener = (self.config.getPlatformId() === util.BROWSER) && self.config.shouldUseSauce();
            return Server.startServer(self.config.getPorts(), self.config.getExternalServerUrl(), self.config.getUseTunnel(), noListener);
        }
    })
    .then(function (server) {
        if (self.config.runMainTests()) {
            // configure server usage
            self.server = server;

            self.injectReporters();
            self.subcribeForEvents();

            var logUrl = self.server.getConnectionUrl(self.config.getPlatformId());
            self.writeMedicJson(logUrl);

            logger.normal('Start running tests at ' + (new Date()).toLocaleTimeString());
        }
        // run tests
        return self.runTests();
    })
    .timeout(self.config.getTimeout(), 'Timed out after waiting for ' + self.config.getTimeout() + ' ms.')
    .catch(function (error) {
        logger.error(error);
        console.log(error.stack);
        throw new Error(error);
    })
    .fin(function (result) {
        isTestPassed = result;
        logger.normal('Completed tests at ' + (new Date()).toLocaleTimeString());
        // if we do --justbuild  or run on sauce,
        // we should NOT do actions below
        if (self.config.getAction() !== 'build' && !self.config.shouldUseSauce()) {
            // collect logs and uninstall app
            self.collectDeviceLogs();
            return self.uninstallApp()
                .fail(function () {
                    // do not fail if uninstall fails
                })
                .fin(function () {
                    self.killEmulatorProcess();
                });
        }
        return self.paramedicSauceLabs.displaySauceDetails(self.sauceBuildName);
    })
    .fin(function () {
        self.cleanUpProject();
    });
};

ParamedicRunner.prototype.checkConfig = function () {
    if (this.config.shouldUseSauce()) {
        this.paramedicSauceLabs = new ParamedicSauceLabs(this.config, this);
        this.paramedicSauceLabs.checkSauceRequirements();
    }
    if (!this.config.runMainTests() && !this.config.runAppiumTests()) {
        throw new Error('No tests to run: both --skipAppiumTests and --skipMainTests are used');
    }
    checkCli: {
        if (this.config.getCli() !== 'cordova' && this.config.getCli() !== 'phonegap') {
            if (path.isAbsolute(this.config.getCli())) {
                break checkCli;
            }
            var cliAbsolutePath = path.resolve(this.config.getCli());
            this.config.setCli(cliAbsolutePath);
        }
    }
    logger.info('cordova-paramedic: Will use the following cli: ' + this.config.getCli());
};

ParamedicRunner.prototype.setPermissions = function () {
    var applicationsToGrantPermission = [
        'kTCCServiceAddressBook'
    ];
    if(this.config.getPlatformId() === util.IOS) {
        logger.info('cordova-paramedic: Setting required permissions.');
        var tccDb = this.config.getTccDb();
        if(tccDb) {
            var appName                 = util.PARAMEDIC_DEFAULT_APP_NAME;
            var paramediciOSPermissions = new ParamediciOSPermissions(appName, tccDb, this.targetObj);
            paramediciOSPermissions.updatePermissions(applicationsToGrantPermission);
        }
    }
};

ParamedicRunner.prototype.injectReporters = function () {
    var self = this;
    var reporters = Reporters.getReporters(self.config.getOutputDir());

    ['jasmineStarted', 'specStarted', 'specDone',
    'suiteStarted', 'suiteDone', 'jasmineDone'].forEach(function(route) {
        reporters.forEach(function(reporter) {
            if (reporter[route] instanceof Function)
                self.server.on(route, reporter[route].bind(reporter));
        });
    });
};

ParamedicRunner.prototype.subcribeForEvents = function () {
    this.server.on('deviceLog', function (data) {
        logger.verbose('device|console.' + data.type + ': '  + data.msg[0]);
    });

    this.server.on('deviceInfo', function (data) {
        logger.normal('cordova-paramedic: Device info: ' + JSON.stringify(data));
    });
};

ParamedicRunner.prototype.writeMedicJson = function(logUrl) {
    logger.normal('cordova-paramedic: writing medic log url to project ' + logUrl);

    fs.writeFileSync(path.join('www','medic.json'), JSON.stringify({logurl:logUrl}));
};

ParamedicRunner.prototype.maybeRunFileTransferServer = function () {
    var self = this;
    return Q().then(function () {
        var plugins = self.config.getPlugins();
        for (var i = 0; i < plugins.length; i++) {
            if (plugins[i].indexOf('cordova-plugin-file-transfer') >= 0 && !self.config.getFileTransferServer() && !self.config.isCI()) {
                return self.server.startFileTransferServer(self.tempFolder.name);
            }
        }
    });
};

ParamedicRunner.prototype.runLocalTests = function () {
    var self = this;
    var runProcess = null;

    // checking for Android platform here because in this case we still need to start an emulator
    // will check again a bit lower
    if (!self.config.runMainTests() && self.config.getPlatformId() !== util.ANDROID) {
        logger.normal('Skipping main tests...');
        return Q(util.TEST_PASSED);
    }

    logger.info('cordova-paramedic: running tests locally');

    return Q().then(function () {
        return self.maybeRunFileTransferServer();
    })
    .then(function () {
        return self.getCommandForStartingTests();
    })
    .then(function(command) {
        self.setPermissions();
        logger.normal('cordova-paramedic: running command ' + command);

        if (self.config.getPlatformId() !== util.BROWSER) {
            return execPromise(command);
        }
        console.log('$ ' + command);
        runProcess = cp.exec(command, function () {
            // a precaution not to try to kill some other process
            runProcess = null;
        });
    })
    .then(function() {
        // skipping here and not at the beginning because we need to
        // start up the Android emulator for Appium tests to run on
        if (!self.config.runMainTests()) {
            logger.normal('Skipping main tests...');
            return util.TEST_PASSED;
        }

        // skip tests if it was just build
        if (self.shouldWaitForTestResult()) {
            return Q.promise(function(resolve, reject) {
                // reject if timed out
                self.waitForConnection().catch(reject);
                // resolve if got results
                self.waitForTests().then(resolve);
            });
        }

        return util.TEST_PASSED; // if we're not waiting for a test result, just report tests as passed
    })
    .fin(function (result) {
        if (runProcess) {
            return Q.Promise(function (resolve, reject) {
                util.killProcess(runProcess.pid, function () {
                    resolve(result);
                });
            });
        }
        return result;
    });
};

ParamedicRunner.prototype.runAppiumTests = function (useSauce) {
    var platform = this.config.getPlatformId();
    var self = this;
    logger.normal('Start running Appium tests...');

    if (self.config.getAction() === 'build') {
        logger.normal('Skipping Appium tests: action = build ...');
        return Q(util.TEST_PASSED);
    }
    if (!self.config.runAppiumTests()) {
        logger.normal('Skipping Appium tests: not configured to run ...');
        return Q(util.TEST_PASSED);
    }
    if (platform !== util.ANDROID && platform !== util.IOS) {
        logger.warn('Unsupported platform for Appium test run: ' + platform);
        // just skip Appium tests
        return Q(util.TEST_PASSED);
    }
    if (!useSauce && (!self.targetObj || !self.targetObj.target)) {
        throw new Error('Cannot determine local device name for Appium');
    }

    logger.normal('Running Appium tests ' + (useSauce ? 'on Sauce Labs' : 'locally'));

    var options = {
        platform: self.config.getPlatformId(),
        appPath: self.tempFolder.name,
        pluginRepos: self.config.getPlugins().map(function (plugin) {
            return path.join(self.tempFolder.name, 'plugins', path.basename(plugin));
        }),
        appiumDeviceName: self.targetObj && self.targetObj.target,
        appiumPlatformVersion: null,
        screenshotPath: path.join(process.cwd(), 'appium_screenshots'),
        output: self.config.getOutputDir(),
        verbose: self.config.isVerbose(),
        sauce: useSauce,
        browserify: self.config.isBrowserify,
        cli: self.config.getCli(),
    };
    if (useSauce) {
        options.sauceAppPath = 'sauce-storage:' + this.paramedicSauceLabs.getAppName();
        options.sauceUser = this.config.getSauceUser();
        options.sauceKey = this.config.getSauceKey();
        options.sauceCaps = this.paramedicSauceLabs.getSauceCaps();
        options.sauceCaps.name += '_Appium';
    }

    var appiumRunner = new AppiumRunner(options);
    if (appiumRunner.options.testPaths && appiumRunner.options.testPaths.length === 0) {
        logger.warn('Couldn\'t find Appium tests, skipping...');
        return Q(util.TEST_PASSED);
    }
    return Q()
    .then(function () {
        return appiumRunner.prepareApp();
    })
    .then(function () {
        if (useSauce) {
            return self.paramedicSauceLabs.packageApp()
            .then(self.paramedicSauceLabs.uploadApp.bind(self));
        }
    })
    .then(function () {
        return appiumRunner.runTests(useSauce);
    });
};

ParamedicRunner.prototype.runTests = function () {
    var isTestPassed = false;
    var self = this;
    // Sauce Labs
    if (this.config.shouldUseSauce()) {
        return this.paramedicSauceLabs.runSauceTests()
        .then(function (result) {
            isTestPassed = result;
            return self.runAppiumTests(true);
        })
        .then(function (isAppiumTestPassed) {
            return isTestPassed == util.TEST_PASSED && isAppiumTestPassed == util.TEST_PASSED;
        });
    // Not Sauce Labs
    } else {
        return this.runLocalTests()
        .then(function (result) {
            isTestPassed = result;
        })
        .then(self.runAppiumTests.bind(this))
        .then(function (isAppiumTestPassed) {
            return isTestPassed == util.TEST_PASSED && isAppiumTestPassed == util.TEST_PASSED;
        });
    }
};

ParamedicRunner.prototype.waitForTests = function () {
    var self = this;
    logger.info('cordova-paramedic: waiting for test results');
    return Q.promise(function(resolve, reject) {

        // time out if connection takes too long
        var ERR_MSG = 'waitForTests: Seems like device not connected to local server in ' + INITIAL_CONNECTION_TIMEOUT / 1000 + ' secs';
        setTimeout(function() {
            if (!self.server.isDeviceConnected()) {
                reject(new Error(ERR_MSG));
            }
        }, INITIAL_CONNECTION_TIMEOUT);

        self.server.on('jasmineDone', function (data) {
            logger.info('cordova-paramedic: tests have been completed');

            var isTestPassed = (data.specResults.specFailed === 0);

            resolve(isTestPassed);
        });

        self.server.on('disconnect', function () {
            reject(new Error('device is disconnected before passing the tests'));
        });
    });
};

ParamedicRunner.prototype.getCommandForStartingTests = function () {
    var self = this;
    var cmd  = self.config.getCli() + ' ' + this.config.getAction() + ' ' + this.config.getPlatformId() + util.PARAMEDIC_COMMON_CLI_ARGS;

    function addConfigArgs(cmd) {
        if (self.config.getArgs()) {
            cmd += ' ' + self.config.getArgs();
        }
        return cmd;
    }

    if (self.config.getPlatformId() === util.BROWSER) {
        return addConfigArgs(cmd);
    }

    var paramedicTargetChooser = new ParamedicTargetChooser(this.tempFolder.name, this.config);

    if (self.config.getAction() === 'build' || (self.config.getPlatformId() === util.WINDOWS && self.config.getArgs().indexOf('appx=8.1-phone') < 0)) {
        //The app is to be run as a store app or just build. So no need to choose a target.
        return Q(addConfigArgs(cmd));
    }

    // For now we always trying to run test app on emulator
    return Q().then(function () {
        var configTarget = self.config.getTarget();
        return paramedicTargetChooser.chooseTarget(/*useEmulator=*/true, /*preferredTarget=*/configTarget);
    })
    .then(function(targetObj){
        self.targetObj = targetObj;
        cmd += ' --target ' + self.targetObj.target;

        // CB-11472 In case of iOS provide additional '--emulator' flag, otherwise
        // 'cordova run ios --target' would hang waiting for device with name
        // as specified in 'target' in case if any device is physically connected
        if (self.config.getPlatformId() === util.IOS) {
            cmd += ' --emulator';
        }

        return addConfigArgs(cmd);
    });
};

ParamedicRunner.prototype.shouldWaitForTestResult = function () {
    var action = this.config.getAction();
    return (action.indexOf('run') === 0) || (action.indexOf('emulate') === 0);
};

ParamedicRunner.prototype.waitForConnection = function () {
    var self = this;

    var ERR_MSG = 'waitForConnection: Seems like device not connected to local server in ' + INITIAL_CONNECTION_TIMEOUT / 1000 + ' secs';

    return Q.promise(function(resolve, reject) {
        setTimeout(function () {
            if (!self.server.isDeviceConnected()) {
                reject(new Error(ERR_MSG));
            } else {
                resolve();
            }
        }, INITIAL_CONNECTION_TIMEOUT);
    });
};

ParamedicRunner.prototype.cleanUpProject = function () {
    this.server && this.server.cleanUp();
    if (this.config.shouldCleanUpAfterRun()) {
        logger.info('cordova-paramedic: Deleting the application: ' + this.tempFolder.name);
        shell.popd();
        shell.rm('-rf', this.tempFolder.name);
    }
};

ParamedicRunner.prototype.killEmulatorProcess = function () {
    if(this.config.shouldCleanUpAfterRun()){
        logger.info('cordova-paramedic: Killing the emulator process.');
        var paramedicKill = new ParamedicKill(this.config.getPlatformId());
        paramedicKill.kill();
    }
};

ParamedicRunner.prototype.collectDeviceLogs = function () {
    logger.info('Collecting logs for the devices.');
    var outputDir    = this.config.getOutputDir()? this.config.getOutputDir(): this.tempFolder.name;
    var logMins      = this.config.getLogMins()? this.config.getLogMins(): util.DEFAULT_LOG_TIME;
    var paramedicLogCollector = new ParamedicLogCollector(this.config.getPlatformId(), this.tempFolder.name, outputDir, this.targetObj);
    paramedicLogCollector.collectLogs(logMins);
};

ParamedicRunner.prototype.uninstallApp = function () {
    logger.info('Uninstalling the app.');
    var paramedicAppUninstall = new ParamedicAppUninstall(this.tempFolder.name, this.config.getPlatformId());
    return paramedicAppUninstall.uninstallApp(this.targetObj,util.PARAMEDIC_DEFAULT_APP_NAME);
};

var storedCWD = null;

exports.run = function(paramedicConfig) {

    storedCWD = storedCWD || process.cwd();

    var runner = new ParamedicRunner(paramedicConfig, null);
    runner.storedCWD = storedCWD;

    return runner.run();
};
