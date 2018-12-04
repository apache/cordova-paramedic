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
var path            = require('path');
var cp              = require('child_process');
var Q               = require('q');
var shell           = require('shelljs');
var randomstring    = require('randomstring');
var fs              = require('fs');
var wd              = require('wd');
var SauceLabs       = require('saucelabs');
var sauceConnectLauncher    = require('sauce-connect-launcher');

var exec            = require('./utils').exec;
var execPromise     = require('./utils').execPromise;
var logger          = require('./utils').logger;
var util            = require('./utils').utilities;
var appPatcher      = require('./appium/helpers/appPatcher');

function ParamedicSauceLabs(config, runner) {
    this.config = config;
    this.runner = runner;
}
module.exports = ParamedicSauceLabs;

ParamedicSauceLabs.prototype.checkSauceRequirements = function () {
    var platformId = this.config.getPlatformId();
    if (platformId !== util.ANDROID && platformId !== util.IOS && platformId !== util.BROWSER) {
        logger.warn('Saucelabs only supports Android and iOS (and browser), falling back to testing locally.');
        this.config.setShouldUseSauce(false);
    } else if (!this.config.getSauceKey()) {
        throw new Error('Saucelabs key not set. Please set it via environmental variable ' +
            util.SAUCE_KEY_ENV_VAR + ' or pass it with the --sauceKey parameter.');
    } else if (!this.config.getSauceUser()) {
        throw new Error('Saucelabs user not set. Please set it via environmental variable ' +
            util.SAUCE_USER_ENV_VAR + ' or pass it with the --sauceUser parameter.');
    } else if (!this.runner.shouldWaitForTestResult()) {
        // don't throw, just silently disable Sauce
        this.config.setShouldUseSauce(false);
    }
};

ParamedicSauceLabs.prototype.packageApp = function () {
    var self = this;
    switch (this.config.getPlatformId()) {
        case util.IOS: {
            return Q.Promise(function (resolve, reject) {
                var zipCommand = 'zip -r ' + self.getPackageName() + ' ' + self.getBinaryName();
                shell.pushd(self.getPackageFolder());
                shell.rm('-rf', self.getPackageName());
                console.log('Running command: ' + zipCommand + ' in dir: ' + shell.pwd());
                exec(zipCommand, function (code, stdout, stderr) {
                    shell.popd();
                    if (code) {
                        reject('zip command returned with error code ' + code);
                    } else {
                        resolve();
                    }
                });
            });
        }
        case util.ANDROID:
            break; // don't need to zip the app for Android
        case util.BROWSER:
            break; // don't need to bundle the app on Browser platform at all
        default:
            throw new Error('Don\'t know how to package the app for platform: ' + this.config.getPlatformId());
    }
    return Q.resolve();
};

ParamedicSauceLabs.prototype.uploadApp = function () {
    logger.normal('cordova-paramedic: uploading ' + this.getAppName() + ' to Sauce Storage');

    var sauceUser = this.config.getSauceUser();
    var key       = this.config.getSauceKey();

    var uploadURI     = encodeURI('https://saucelabs.com/rest/v1/storage/' + sauceUser + '/' + this.getAppName() + '?overwrite=true');
    var filePath      = this.getPackagedPath();
    var uploadCommand =
        'curl -u ' + sauceUser + ':' + key +
        ' -X POST -H "Content-Type: application/octet-stream" ' +
        uploadURI + ' --data-binary "@' + filePath + '"';

    return execPromise(uploadCommand);
};

ParamedicSauceLabs.prototype.getPackagedPath = function () {
    return path.join(this.getPackageFolder(), this.getPackageName());
};

ParamedicSauceLabs.prototype.getPackageFolder = function () {
    var packageDirs = this.getPackageFolders();
    var foundDir = null;
    packageDirs.forEach (function (dir) {
        if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            foundDir = dir;
            return;
        }
    });
    if (foundDir != null) {
        return foundDir;
    }
    throw new Error ('Couldn\'t locate a built app directory. Looked here: ' + packageDirs);
};

ParamedicSauceLabs.prototype.getPackageFolders = function () {
    var packageFolders;
    switch (this.config.getPlatformId()) {
        case util.ANDROID:
            packageFolders =  [ path.join(this.runner.tempFolder.name, 'platforms/android/app/build/outputs/apk/debug'),
                                path.join(this.runner.tempFolder.name, 'platforms/android/build/outputs/apk') ];
            break;
        case util.IOS:
            packageFolders = [ path.join(this.runner.tempFolder.name, 'platforms/ios/build/emulator') ];
            break;
        default:
            throw new Error('Don\t know where the package foler is for platform: ' + this.config.getPlatformId());
    }
    return packageFolders;
};

ParamedicSauceLabs.prototype.getPackageName = function () {
    var packageName;
    switch (this.config.getPlatformId()) {
        case util.IOS:
            packageName = 'HelloCordova.zip';
            break;
        case util.ANDROID:
            packageName = this.getBinaryName();
            break;
        default:
            throw new Error('Don\'t know what the package name is for platform: ' + this.config.getPlatformId());
    }
    return packageName;
};

ParamedicSauceLabs.prototype.getBinaryName = function () {
    var binaryName;
    switch (this.config.getPlatformId()) {
        case util.ANDROID:
            shell.pushd(this.getPackageFolder());
            var apks = shell.ls('*debug.apk');
            if (apks.length > 0) {
                binaryName = apks.reduce(function (previous, current) {
                    // if there is any apk for x86, take it
                    if (current.indexOf('x86') >= 0) {
                        return current;
                    }
                    // if not, just take the first one
                    return previous;
                });
            } else {
                throw new Error('Couldn\'t locate built apk');
            }
            shell.popd();
            break;
        case util.IOS:
            binaryName = 'HelloCordova.app';
            break;
        default:
            throw new Error('Don\'t know the binary name for platform: ' + this.config.getPlatformId());
    }
    return binaryName;
};

// Returns a name of the file at the SauceLabs storage
ParamedicSauceLabs.prototype.getAppName = function () {
    if (this.appName) {
        // exit if we did this before
        return this.appName;
    }
    var appName = randomstring.generate();
    switch (this.config.getPlatformId()) {
        case util.ANDROID:
            appName += '.apk';
            break;
        case util.IOS:
            appName += '.zip';
            break;
        default:
            throw new Error('Don\'t know the app name for platform: ' + this.config.getPlatformId());
    }
    this.appName = appName; // save for additional function calls
    return appName;
};

ParamedicSauceLabs.prototype.displaySauceDetails = function (buildName) {
    if (!this.config.shouldUseSauce()) {
        return Q();
    }
    if (!buildName) {
        buildName = this.config.getBuildName();
    }

    var self = this;
    var d = Q.defer();

    logger.normal('Getting saucelabs jobs details...\n');

    var sauce = new SauceLabs({
        username: self.config.getSauceUser(),
        password: self.config.getSauceKey()
    });

    sauce.getJobs(function (err, jobs) {
        var found = false;
        for (var job in jobs) {
            if (jobs.hasOwnProperty(job) && jobs[job].name && jobs[job].name.indexOf(buildName) === 0) {
                var jobUrl = 'https://saucelabs.com/beta/tests/' + jobs[job].id;
                logger.normal('============================================================================================');
                logger.normal('Job name: ' + jobs[job].name);
                logger.normal('Job ID: ' + jobs[job].id);
                logger.normal('Job URL: ' + jobUrl);
                logger.normal('Video: ' + jobs[job].video_url);
                logger.normal('Appium logs: ' + jobs[job].log_url);
                if (self.config.getPlatformId() === util.ANDROID) {
                    logger.normal('Logcat logs: ' + 'https://saucelabs.com/jobs/' + jobs[job].id + '/logcat.log');
                }
                logger.normal('============================================================================================');
                logger.normal('');
                found = true;
            }
        }

        if (!found) {
            logger.warn('Can not find saucelabs job. Logs and video will be unavailable.');
        }
        d.resolve();
    });
    return d.promise;
};

ParamedicSauceLabs.prototype.getSauceCaps = function () {
    this.runner.sauceBuildName = this.runner.sauceBuildName || this.config.getBuildName();
    var caps = {
        name: this.runner.sauceBuildName,
        idleTimeout: '100', // in seconds
        maxDuration: util.SAUCE_MAX_DURATION,
        tunnelIdentifier: this.config.getSauceTunnelId(),
    };

    switch(this.config.getPlatformId()) {
        case util.ANDROID:
            caps.platformName = 'Android';
            caps.appPackage = 'io.cordova.hellocordova';
            caps.appActivity = 'io.cordova.hellocordova.MainActivity';
            caps.app = 'sauce-storage:' + this.getAppName();
            caps.deviceType = 'phone';
            caps.deviceOrientation = 'portrait';
            caps.appiumVersion = this.config.getSauceAppiumVersion();
            caps.deviceName = this.config.getSauceDeviceName();
            caps.platformVersion = this.config.getSaucePlatformVersion();
            break;
        case util.IOS:
            caps.platformName = 'iOS';
            caps.autoAcceptAlerts = true;
            caps.waitForAppScript = 'true;';
            caps.app = 'sauce-storage:' + this.getAppName();
            caps.deviceType = 'phone';
            caps.deviceOrientation = 'portrait';
            caps.appiumVersion = this.config.getSauceAppiumVersion();
            caps.deviceName = this.config.getSauceDeviceName();
            caps.platformVersion = this.config.getSaucePlatformVersion();
            break;
        case util.BROWSER:
            caps.browserName = this.config.getSauceDeviceName() || 'chrome';
            caps.version = this.config.getSaucePlatformVersion() || '45.0';
            caps.platform = caps.browserName.indexOf('Edge') > 0 ? 'Windows 10' : 'macOS 10.13';
            // setting from env.var here and not in the config
            // because for any other platform we don't need to put the sauce connect up 
            // unless the tunnel id is explicitly passed (means that user wants it anyway)
            if (!caps.tunnelIdentifier && process.env[util.SAUCE_TUNNEL_ID_ENV_VAR]) {
                caps.tunnelIdentifier = process.env[util.SAUCE_TUNNEL_ID_ENV_VAR];
            } else if (!caps.tunnelIdentifier) {
                throw new Error('Testing browser platform on Sauce Labs requires Sauce Connect tunnel. Please specify tunnel identifier via --sauceTunnelId');
            }
            break;
        default:
            throw new Error('Don\'t know the Sauce caps for platform: ' + this.config.getPlatformId());
    }
    return caps;
};

ParamedicSauceLabs.prototype.connectWebdriver = function () {
    var user = this.config.getSauceUser();
    var key = this.config.getSauceKey();
    var caps = this.getSauceCaps();

    logger.normal('cordova-paramedic: connecting webdriver');
    var spamDots = setInterval(function () {
        process.stdout.write('.');
    }, 1000);

    wd.configureHttp({
        timeout: util.WD_TIMEOUT,
        retryDelay: util.WD_RETRY_DELAY,
        retries: util.WD_RETRIES
    });

    var driver = wd.promiseChainRemote(util.SAUCE_HOST, util.SAUCE_PORT, user, key);
    return driver
        .init(caps)
        .then(function () {
            clearInterval(spamDots);
            process.stdout.write('\n');
        }, function (error) {
            clearInterval(spamDots);
            process.stdout.write('\n');
            throw(error);
        });
};

ParamedicSauceLabs.prototype.connectSauceConnect = function () {
    var self = this;
    var isBrowser = self.config.getPlatformId() === util.BROWSER;

    // on platforms other than browser, only run sauce connect if user explicitly asks for it
    if (!isBrowser && !self.config.getSauceTunnelId()) {
        return Q();
    }
    // on browser, run sauce connect in any case
    if (isBrowser && !self.config.getSauceTunnelId()) {
        self.config.setSauceTunnelId(process.env[util.SAUCE_TUNNEL_ID_ENV_VAR] || self.config.getBuildName());
    }

    return Q.Promise(function (resolve, reject) {
        logger.info('cordova-paramedic: Starting Sauce Connect...');
        sauceConnectLauncher({
            username: self.config.getSauceUser(),
            accessKey: self.config.getSauceKey(),
            tunnelIdentifier: self.config.getSauceTunnelId(),
            connectRetries: util.SAUCE_CONNECT_CONNECTION_RETRIES,
            connectRetryTimeout: util.SAUCE_CONNECT_CONNECTION_TIMEOUT,
            downloadRetries: util.SAUCE_CONNECT_DOWNLOAD_RETRIES,
            downloadRetryTimeout: util.SAUCE_CONNECT_DOWNLOAD_TIMEOUT,
        }, function (err, sauceConnectProcess) {
            if (err) {
                reject(err);
            }
            self.sauceConnectProcess = sauceConnectProcess;
            logger.info('cordova-paramedic: Sauce Connect ready');
            resolve();
        });
    });
};

ParamedicSauceLabs.prototype.runSauceTests = function () {
    var self = this;
    var isTestPassed = false;
    var pollForResults;
    var driver;
    var runProcess = null;

    if (!self.config.runMainTests()) {
        logger.normal('Skipping main tests...');
        return Q(util.TEST_PASSED);
    }

    logger.info('cordova-paramedic: running tests with sauce');

    return Q().then(function () {
        // Build + "Upload" app
        if (self.config.getPlatformId() === util.BROWSER) {
            // for browser, we need to serve the app for Sauce Connect
            // we do it by just running "cordova run" and ignoring the chrome instance that pops up
            return Q()
                .then(function() {
                    appPatcher.addCspSource(self.runner.tempFolder.name, 'connect-src', 'http://*');
                    appPatcher.permitAccess(self.runner.tempFolder.name, '*');
                    return self.runner.getCommandForStartingTests();
                })
                .then(function (command) {
                    console.log('$ ' + command);
                    runProcess = cp.exec(command, function onExit() {
                        // a precaution not to try to kill some other process
                        runProcess = null;
                    });
                });
        } else {
            return self.runner.buildApp()
                .then(self.packageApp.bind(self))
                .then(self.uploadApp.bind(self));
        }
    })
    .then(function () {
        return self.connectSauceConnect();
    })
    .then(function () {
        driver = self.connectWebdriver();
        if (self.config.getPlatformId() === util.BROWSER) {
            return driver.get('http://localhost:8000/cdvtests/index.html');
        }
        return driver;
    })
    .then(function () {
        if (self.config.getUseTunnel() || self.config.getPlatformId() === util.BROWSER) {
            return driver;
        }
        return driver
        .getWebviewContext()
        .then(function (webview) {
            return driver.context(webview);
        });
    })
    .then(function () {
        var isWkWebview = false;
        var plugins = self.config.getPlugins();
        for (var plugin in plugins) {
            if (plugins[plugin].indexOf('wkwebview') >= 0) {
                isWkWebview = true;
            }
        }
        if (isWkWebview) {
            logger.normal('cordova-paramedic: navigating to a test page');
            return driver
                .sleep(1000)
                .elementByXPath('//*[text() = "Auto Tests"]')
                .click();
        }
        return driver;
    })
    .then(function () {
        logger.normal('cordova-paramedic: connecting to app');

        var platform = self.config.getPlatformId();
        var plugins = self.config.getPlugins();

        var skipBuster = false;
        // skip permission buster for splashscreen and inappbrowser plugins
        // it hangs the test run on Android 7 for some reason
        for (var i = 0; i < plugins.length; i++) {
            if (plugins[i].indexOf('cordova-plugin-splashscreen') >= 0 || plugins[i].indexOf('cordova-plugin-inappbrowser') >= 0) {
                skipBuster = true;
            }
        }
        // always skip buster for browser platform
        if (platform === util.BROWSER) {
            skipBuster = true;
        }

        if (!self.config.getUseTunnel()) {
            var polling = false;
            pollForResults = setInterval(function () {
                if (!polling) {
                    polling = true;
                    driver.pollForEvents(platform, skipBuster)
                    .then(function (events) {
                        for (var i = 0; i < events.length; i++) {
                            self.runner.server.emit(events[i].eventName, events[i].eventObject);
                        }
                        polling = false;
                    })
                    .fail(function (error) {
                        logger.warn('appium: ' + error);
                        polling = false;
                    });
                }
            }, 2500);
        }

        return self.runner.waitForTests();
    })
    .then(function (result) {
        logger.normal('cordova-paramedic: Tests finished');
        isTestPassed = result;
    }, function (error) {
        logger.normal('cordova-paramedic: Tests failed to complete; ending appium session. The error is:\n' + error.stack);
    })
    .fin(function () {
        if (pollForResults) {
            clearInterval(pollForResults);
        }
        if (driver && typeof driver.quit === 'function') {
            return driver.quit();
        }
    })
    .fin(function () {
        if (self.config.getPlatformId() === util.BROWSER && !self.runner.browserPatched) {
            // we need to kill chrome
            self.runner.killEmulatorProcess();
        }
        if (runProcess) {
            // as well as we need to kill the spawned node process serving our app
            return Q.Promise(function (resolve, reject) {
                util.killProcess(runProcess.pid, function () {
                    resolve();
                });
            });
        }
    })
    .fin(function () {
        if (self.sauceConnectProcess) {
            logger.info('cordova-paramedic: Closing Sauce Connect process...');
            return Q.Promise(function (resolve, reject) {
                self.sauceConnectProcess.close(function () {
                    logger.info('cordova-paramedic: Successfully closed Sauce Connect process');
                    resolve();
                });
            });
        }
    })
    .then(function () {
        return isTestPassed;
    });
};