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

/* jshint node: true */

'use strict';

var fs               = require('fs');
var path             = require('path');
var util             = require('../utils').utilities;
var logger           = require('../utils').logger;
var wd               = require('wd');
var wdHelper         = require('./helpers/wdHelper');
var screenshotHelper = require('./helpers/screenshotHelper');
var appPatcher       = require('./helpers/appPatcher.js');
var child_process    = require('child_process');
var expectTelnet     = require('expect-telnet');
var shell            = require('shelljs');
var Jasmine          = require('jasmine');
var unorm            = require('unorm');
var Q                = require('q');
var Reporters        = require('../Reporters');
var execPromise      = require('../utils').execPromise;
var Reporters        = require('../Reporters');
var portChecker      = require('tcp-port-used');

var SMALL_BUFFER_SIZE = 1024 * 1024;
var BIG_BUFFER_SIZE = 50 * 1024 * 1024;
var APPIUM_SERVER_PATH = getAppiumServerPath();

function AppiumRunner(options) {
    this.options = options;
    this.prepareOptions();
    this.createScreenshotDir();
    this.findTests();
    this.setGlobals();
}

function getAppiumServerPath() {
    return path.resolve(__dirname, '../../node_modules/appium/build/lib/main.js');
}

function getFullAppPath(appPath) {
    var fullPath = appPath;
    if (!path.isAbsolute(appPath)) {
        fullPath = path.join(__dirname, '../..', appPath);
    }
    return fullPath;
}

function getPackagePath(options) {
    if (options.sauce) {
        return options.sauceAppPath;
    }

    var fullAppPath = getFullAppPath(options.appPath);

    switch (options.platform) {
    case 'android':
        var packagePath = null;
        var maybePackagePaths = [ path.join(fullAppPath, '/platforms/android/app/build/outputs/apk/android-debug.apk'),
                                  path.join(fullAppPath, '/platforms/android/build/outputs/apk/debug/app-debug.apk') ];
        maybePackagePaths.forEach(function (p) {
            if (fs.existsSync(p)) {
                packagePath = p;
                return;
            }
        });
        if (packagePath != null) {
            return packagePath;
        }
        throw new Error('Could not find apk');
    case 'ios':
        var searchDir = options.device ?
            path.join(fullAppPath, '/platforms/ios/build/device/') :
            path.join(fullAppPath, '/platforms/ios/build/emulator/');
        var fileMask = options.device ? '*.ipa' : '*.app';
        var files = shell.ls(searchDir + fileMask);
        logger.normal('paramedic-appium: Looking for app package in ' + searchDir);
        if (files && files.length > 0) {
            logger.normal('paramedic-appium: Found app package: ' + files[0]);
            return files[0];
        }
        throw new Error('Could not find the app package');
    }
}

function getPluginDirs(appPath) {
    return shell.ls(path.join(appPath, '/plugins/cordova-plugin-*'));
}

function runCommand(command, appPath) {
    if (appPath) {
        shell.pushd(appPath);
    }
    shell.exec(command);
    if (appPath) {
        shell.popd();
    }
}

function isFailFastError(error) {
    if (error && error.message) {
        return error.message.indexOf('Could not find a connected') > -1 ||
            error.message.indexOf('Bad app') > -1;
    }
    return false;
}

function killProcess(procObj, callback) {
    if (procObj && procObj.alive) {
        procObj.alive = false;
        util.killProcess(procObj.pid, callback);
    } else {
        callback();
    }
}

function installAppiumServer() {
    var installPath = path.join(__dirname, '../..');
    logger.normal('paramedic-appium: Installing Appium server to ' + installPath);
    shell.pushd(installPath);
    return execPromise('npm install appium').then(function () {
        shell.popd();
    });
}

AppiumRunner.prototype.createScreenshotDir = function () {
    util.mkdirSync(this.options.screenshotPath);
};

AppiumRunner.prototype.prepareOptions = function () {
    if (!this.options.hasOwnProperty('device')) {
        this.options.device = false;
    }
    if (this.options.platform === 'ios' && this.options.appiumDeviceName) {
        this.options.appiumDeviceName = this.options.appiumDeviceName.replace(/-/g, ' ');
    }
};

AppiumRunner.prototype.cleanUp = function (callback) {
    var self = this;

    killProcess(self.appium, function () {
        killProcess(self.iosProxy, function () {
            callback();
        });
    });
};

AppiumRunner.prototype.startTests = function () {
    var jasmine = new Jasmine();
    var self = this;
    var d = Q.defer();

    function exitGracefully(e) {
        if (self.exiting) {
            return;
        }
        if (!!e) {
            logger.normal('paramedic-appium: ' + e);
        }
        logger.normal('paramedic-appium: Uncaught exception! Killing Appium server and exiting in 2 seconds...');
        self.exiting = true;
        self.cleanUp(function () {
            setTimeout(function () {
                d.reject(e.stack);
            }, 2000);
        });
    }

    process.on('uncaughtException', function(err) {
        exitGracefully(err);
    });

    logger.normal('paramedic-appium: Running tests from:');
    self.options.testPaths.forEach(function (testPath) {
        logger.normal('paramedic-appium: ' + testPath);
    });

    jasmine.loadConfig({
        spec_dir: '',
        spec_files: self.options.testPaths
    });

    // don't use default reporter, it exits the process before
    // we would get the chance to kill appium server
    //jasmine.configureDefaultReporter({ showColors: false });

    var outputDir = self.options.output || process.cwd();
    var reporters = Reporters.getReporters(outputDir);
    var paramedicReporter = new Reporters.ParamedicReporter(function (passed) {
        self.passed = passed;
        self.cleanUp(d.resolve);
    });

    reporters.forEach(function (reporter) {
        jasmine.addReporter(reporter);
    });
    jasmine.addReporter(paramedicReporter);

    try {
        // Launch the tests!
        jasmine.execute();
    } catch (e) {
        exitGracefully(e);
    }

    return d.promise;
};

AppiumRunner.prototype.startIosProxy = function () {
    var self = this;
    var iosProxyCommand;
    self.iosProxy = {
        alive: false,
        process: null
    };

    if (this.options.platform === 'ios' && this.options.device && this.options.udid) {
        iosProxyCommand = 'ios_webkit_debug_proxy -c ' + this.options.udid + ':27753';
        logger.normal('paramedic-appium: Running:');
        logger.normal('paramedic-appium: ' + iosProxyCommand);
        self.iosProxy.alive = true;
        self.iosProxy.process = child_process.exec(iosProxyCommand, { maxBuffer: BIG_BUFFER_SIZE }, function () {
            self.iosProxy.alive = false;
            logger.normal('paramedic-appium: iOS proxy process exited.');
        });
    }
};

AppiumRunner.prototype.startAppiumServer = function () {
    var d = Q.defer();
    var self = this;
    var appiumServerCommand;
    var additionalArgs = '';
    self.appium = {
        alive: false,
        process: null
    };

    // compose a command to run the Appium server
    switch (self.options.platform) {
    case 'android':
        break;
    case 'ios':
        if (self.options.udid) {
            additionalArgs += ' --udid ' + self.options.udid;
        }
        break;
    default:
        throw new Error('Unsupported platform: ' + self.options.platform);
    }
    if (self.options.logFile) {
        additionalArgs += ' --log ' + self.options.logFile;
    }

    appiumServerCommand = 'node ' + APPIUM_SERVER_PATH + additionalArgs;

    // run the Appium server
    logger.normal('paramedic-appium: Running:');
    logger.normal('paramedic-appium: ' + appiumServerCommand);
    self.appium.alive = true;
    self.appium.process = child_process.exec(appiumServerCommand, { maxBuffer: BIG_BUFFER_SIZE }, function (error) {
        logger.normal('paramedic-appium: Appium process exited.');
        if (self.appium.alive && error) {
            logger.normal('paramedic-appium: Error running appium server: ' + error);
            if (isFailFastError(error)) {
                self.cleanUp(d.reject);
            } else {
                logger.normal('paramedic-appium: Another instance already running? Will try to run tests on it.');
                d.resolve();
            }
        }
        self.appium.alive = false;
    });

    // Wait for the Appium server to start up
    self.appium.process.stdout.on('data', function (data) {
        if (data.indexOf('Appium REST http interface listener started') > -1) {
            d.resolve();
        }
    });

    return d.promise;
};

AppiumRunner.prototype.findTests = function () {
    var self = this;

    if (!self.options.pluginRepos) {
        self.options.pluginRepos = getPluginDirs(self.options.appPath);
    }

    // looking for the tests
    self.options.testPaths = [];
    var searchPaths = [];
    self.options.pluginRepos.forEach(function (pluginRepo) {
        searchPaths.push(path.join(pluginRepo, 'appium-tests', self.options.platform));
        searchPaths.push(path.join(pluginRepo, 'appium-tests', 'common'));
    });
    searchPaths.forEach(function (searchPath) {
        if (fs.existsSync(searchPath)) {
            logger.normal('paramedic-appium: Found tests in: ' + searchPath);
            if (path.isAbsolute(searchPath)) {
                searchPath = path.relative(process.cwd(), searchPath);
            }
            self.options.testPaths.push(path.join(searchPath, '*.spec.js'));
        }
    });
};

AppiumRunner.prototype.setGlobals = function () {
    // setting up the global variables so the tests could use them
    global.WD = wd;
    global.WD_HELPER = wdHelper;
    global.SCREENSHOT_HELPER = screenshotHelper;
    global.ET = expectTelnet;
    global.SHELL = shell;
    global.DEVICE = this.options.device;
    global.DEVICE_NAME = this.options.appiumDeviceName;
    global.PLATFORM = this.options.platform;
    global.PLATFORM_VERSION = this.options.appiumPlatformVersion;
    global.SCREENSHOT_PATH = this.options.screenshotPath;
    global.UNORM = unorm;
    global.UDID = this.options.udid;
    global.VERBOSE = this.options.verbose;
    global.USE_SAUCE = this.options.sauce;
    global.SAUCE_USER = this.options.sauceUser;
    global.SAUCE_KEY = this.options.sauceKey;
    global.SAUCE_CAPS = this.options.sauceCaps;
    global.VERBOSE = this.options.verbose;
    global.SAUCE_SERVER_HOST = util.SAUCE_HOST;
    global.SAUCE_SERVER_PORT = util.SAUCE_PORT;
};

AppiumRunner.prototype.prepareApp = function () {
    var self = this;
    var d = Q.defer();
    var fullAppPath = getFullAppPath(self.options.appPath);
    var deviceString = self.options.device ? ' --device' : '';
    var browserifyString = self.options.browserify ? ' --browserify' : '';
    var buildCommand = self.options.cli + ' build ' + self.options.platform + deviceString + browserifyString + util.PARAMEDIC_COMMON_CLI_ARGS;

    // remove medic.json and (re)build
    shell.rm(path.join(fullAppPath, 'www', 'medic.json'));
    fs.stat(fullAppPath, function (error, stats) {
        // check if the app exists
        if (error || !stats.isDirectory()) {
            d.reject('The app directory doesn\'t exist: ' + fullAppPath);
        }

        // set properties/CSP rules
        if (self.options.platform === 'ios') {
            appPatcher.setPreference(fullAppPath, 'CameraUsesGeolocation', 'true');
        } else if (self.options.platform === 'android') {
            appPatcher.setPreference(fullAppPath, 'loadUrlTimeoutValue', 60000);
        }
        appPatcher.addCspSource(fullAppPath, 'connect-src', 'http://*');
        appPatcher.permitAccess(fullAppPath, '*');
        // add cordova-save-image-gallery plugin from npm to enable
        // Appium tests for camera plugin to save test image to the gallery
        runCommand(self.options.cli + ' plugin add cordova-save-image-gallery' + util.PARAMEDIC_COMMON_CLI_ARGS, fullAppPath);

        // rebuild the app
        logger.normal('paramedic-appium: Building the app...');
        child_process.exec(buildCommand, { cwd: fullAppPath, maxBuffer: SMALL_BUFFER_SIZE }, function (error, stdout, stderr) {
            if (error || stdout.indexOf('BUILD FAILED') >= 0 || stderr.indexOf('BUILD FAILED') >= 0) {
                d.reject('Couldn\'t build the app: ' + error);
            } else {
                global.PACKAGE_PATH = getPackagePath(self.options);
                d.resolve();
            }
        });
    });
    return d.promise;
};

AppiumRunner.prototype.runTests = function (useSauce) {
    var self = this;

    return Q().then(function () {
        if (!useSauce) {
            self.startIosProxy();
            // check if Appium is already running
            return portChecker.check(4723).then(function (isInUse) {
                if (!isInUse) {
                    return installAppiumServer()
                        .then(self.startAppiumServer.bind(self));
                }
                logger.info('paramedic-appium: Appium port is taken, looks like it is already running. Jumping straight to running tests.');
            });
        }
    })
    .then(self.startTests.bind(self))
    .then(function () { return self.passed; });
};

module.exports = AppiumRunner;
