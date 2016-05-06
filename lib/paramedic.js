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

var exec    = require('./utils').exec;
var shell   = require('shelljs');
var Server  = require('./LocalServer');
var tmp     = require('tmp');
var path    = require('path');
var Q       = require('q');
var fs      = require('fs');
var logger  = require('./utils').logger;
var util    = require('./utils').utilities;
var PluginsManager  = require('./PluginsManager');
var getReporters    = require('./Reporters');
var ParamedicKill   = require('./ParamedicKill');
var ParamedicLog    = require('./ParamedicLog');
var ParamediciOSPermissions = require('./ParamediciOSPermissions');
var ParamedicTargetChooser  = require('./ParamedicTargetChooser');
var ParamedicAppUninstall   = require('./ParamedicAppUninstall');

// Time to wait for initial device connection.
// If device has not connected within this interval the tests are stopped.
var INITIAL_CONNECTION_TIMEOUT = 300000; // 5mins

var applicationsToGrantPermission = [
    'kTCCServiceAddressBook'
];

function ParamedicRunner(config, _callback) {
    this.tempFolder = null;
    this.pluginsManager = null;

    this.config = config;
    this.targetObj = undefined;

    exec.setVerboseLevel(config.isVerbose());
}

ParamedicRunner.prototype.run = function() {
    var self = this;

    return Q().then(function() {
        self.createTempProject();
        shell.pushd(self.tempFolder.name);
        self.prepareProjectToRunTests();
        return Server.startServer(self.config.getPorts(), self.config.getExternalServerUrl(), self.config.getUseTunnel());
    })
    .then(function(server) {
        self.server = server;

        self.injectReporters();
        self.subcribeForEvents();

        var connectionUrl = server.getConnectionUrl(self.config.getPlatformId());
        self.writeMedicConnectionUrl(connectionUrl);

        return self.runTests();
    })
    .fin(function() {
        self.collectDeviceLogs();
        self.uninstallApp();
        self.killEmulatorProcess();
        self.cleanUpProject();
    });
};

ParamedicRunner.prototype.createTempProject = function() {
    this.tempFolder = tmp.dirSync();
    tmp.setGracefulCleanup();
    logger.info("cordova-paramedic: creating temp project at " + this.tempFolder.name);
    exec('cordova create ' + this.tempFolder.name);
};

ParamedicRunner.prototype.prepareProjectToRunTests = function() {
    this.installPlugins();
    this.setUpStartPage();
    this.installPlatform();
    this.checkPlatformRequirements();
};

ParamedicRunner.prototype.installPlugins = function() {
    logger.info("cordova-paramedic: installing plugins");
    this.pluginsManager = new PluginsManager(this.tempFolder.name, this.storedCWD);
    this.pluginsManager.installPlugins(this.config.getPlugins());
    this.pluginsManager.installTestsForExistingPlugins();
    this.pluginsManager.installSinglePlugin('cordova-plugin-test-framework');
    this.pluginsManager.installSinglePlugin('cordova-plugin-device');
    this.pluginsManager.installSinglePlugin(path.join(__dirname, '../paramedic-plugin'));
};

ParamedicRunner.prototype.setUpStartPage = function() {
    logger.normal("cordova-paramedic: setting app start page to test page");
    shell.sed('-i', 'src="index.html"', 'src="cdvtests/index.html"', 'config.xml');
};

ParamedicRunner.prototype.installPlatform = function() {
    logger.info("cordova-paramedic: adding platform : " + this.config.getPlatform());
    exec('cordova platform add ' + this.config.getPlatform());
};

ParamedicRunner.prototype.checkPlatformRequirements = function() {
    logger.normal("cordova-paramedic: checking requirements for platform " + this.config.getPlatformId());
    var result = exec('cordova requirements ' + this.config.getPlatformId());

    if (result.code !== 0)
        throw new Error('Platform requirements check has failed!');
};

ParamedicRunner.prototype.setPermissions = function() {
    if(this.config.getPlatformId() === 'ios'){
        logger.info("cordova-paramedic: Setting required permissions.");
        var tccDb        = this.config.getTccDb();
        if(tccDb) {
            var appName                 = util.PARAMEDIC_DEFAULT_APP_NAME;
            var paramediciOSPermissions = new ParamediciOSPermissions(appName, tccDb, this.targetObj);
            paramediciOSPermissions.updatePermissions(applicationsToGrantPermission);
        }
    }
};

ParamedicRunner.prototype.injectReporters = function() {
    var self = this;
    var reporters = getReporters(self.config.getOutputDir());

    ['jasmineStarted', 'specStarted', 'specDone',
    'suiteStarted', 'suiteDone', 'jasmineDone'].forEach(function(route) {
        reporters.forEach(function(reporter) {
            if (reporter[route] instanceof Function)
                self.server.on(route, reporter[route].bind(reporter));
        });
    });
};

ParamedicRunner.prototype.subcribeForEvents = function() {
    this.server.on('deviceLog', function(data) {
        logger.verbose('device|console.' + data.type + ': '  + data.msg[0]);
    });

    this.server.on('deviceInfo', function(data) {
        logger.normal('cordova-paramedic: Device info: ' + JSON.stringify(data));
    });
};

ParamedicRunner.prototype.writeMedicConnectionUrl = function(url) {
    logger.normal("cordova-paramedic: writing medic log url to project " + url);
    fs.writeFileSync(path.join("www","medic.json"), JSON.stringify({logurl:url}));
};

ParamedicRunner.prototype.runTests = function() {
    var self = this;

    return Q.promise(function(resolve, reject) {
        self.server.on('jasmineDone', function(data) {
            logger.info('cordova-paramedic: tests have been completed');

            var isTestPassed = (data.specResults.specFailed === 0);

            resolve(isTestPassed);
        });

        self.server.on('disconnect', function() {
            reject(new Error('device is disconnected before passing the tests'));
        });

        return self.getCommandForStartingTests()
        .then(function(command){
            self.setPermissions();
            logger.normal('cordova-paramedic: running command ' + command);
            exec(command, function(code, output) {
                if(code) {
                    // this trace is automatically available in verbose mode
                    // so we check for this flag to not trace twice
                    if (!self.config.verbose) {
                        logger.normal(output);
                    }
                    logger.normal('cordova-paramedic: unable to run tests; command log is available above');
                    return reject(new Error(command + " returned error code " + code));
                }

                // skip tests if it was just build
                if (!self.shouldWaitForTestResult()) {
                 return resolve(true);
                }

                // reject if device not connected in pending time
                self.waitForConnection().catch(reject);
            });
        });
    });
};

ParamedicRunner.prototype.getCommandForStartingTests = function() {
    var self = this;
    var cmd  = "cordova " + this.config.getAction() + " " + this.config.getPlatformId();
    var paramedicTargetChooser = new ParamedicTargetChooser(this.tempFolder.name, this.config.getPlatformId());

    if(self.config.getPlatformId() === "windows" && self.config.getArgs().indexOf('appx=8.1-phone') < 0) {
        //The app is to be run as a store app. So no need to choose a target.
        if (self.config.getArgs()) {
            cmd += " " + self.config.getArgs();
        }

        return Q(cmd);
    }

    return paramedicTargetChooser.chooseTarget(true)
    .then(function(targetObj){
        self.targetObj = targetObj;
        cmd += " --target " + self.targetObj.target;

        if (self.config.getArgs()) {
            cmd += " " + self.config.getArgs();
        }

        return cmd;
    });
};

ParamedicRunner.prototype.shouldWaitForTestResult = function() {
    var action = this.config.getAction();
    return action === 'run' || action  === 'emulate';
};

ParamedicRunner.prototype.waitForConnection = function() {
    var self = this;

    var ERR_MSG = 'Seems like device not connected to local server in ' + INITIAL_CONNECTION_TIMEOUT / 1000 + ' secs';

    return Q.promise(function(resolve, reject) {
        setTimeout(function() {
            if (!self.server.isDeviceConnected()) {
                reject(new Error(ERR_MSG));
            } else {
                resolve();
            }
        }, INITIAL_CONNECTION_TIMEOUT);
    });
};

ParamedicRunner.prototype.cleanUpProject = function() {
    if(this.config.shouldCleanUpAfterRun()) {
        logger.info("cordova-paramedic: Deleting the application: " + this.tempFolder.name);
        shell.popd();
        shell.rm('-rf', this.tempFolder.name);
    }
};

ParamedicRunner.prototype.killEmulatorProcess = function() {
    if(this.config.shouldCleanUpAfterRun()){
        logger.info("cordova-paramedic: Killing the emulator process.");
        var paramedicKill = new ParamedicKill(this.config.getPlatformId());
        paramedicKill.kill();
    }
};

ParamedicRunner.prototype.collectDeviceLogs = function() {
    logger.info("Collecting logs for the devices.");
    var outputDir    = this.config.getOutputDir()? this.config.getOutputDir(): this.tempFolder.name;
    var logMins      = this.config.getLogMins()? this.config.getLogMins(): util.DEFAULT_LOG_TIME;
    var paramedicLog = new ParamedicLog(this.config.getPlatformId(), this.tempFolder.name, outputDir, this.targetObj);
    paramedicLog.collectLogs(logMins);
};

ParamedicRunner.prototype.uninstallApp = function() {
    logger.info("Uninstalling the app.");
    var paramedicAppUninstall = new ParamedicAppUninstall(this.tempFolder.name, this.config.getPlatformId());
    paramedicAppUninstall.uninstallApp(this.targetObj,util.PARAMEDIC_DEFAULT_APP_NAME);
}

var storedCWD =  null;

exports.run = function(paramedicConfig) {

    storedCWD = storedCWD || process.cwd();

    var runner = new ParamedicRunner(paramedicConfig, null);
    runner.storedCWD = storedCWD;

    return runner.run()
    .timeout(paramedicConfig.getTimeout(), "This test seems to be blocked :: timeout exceeded. Exiting ...");
};
