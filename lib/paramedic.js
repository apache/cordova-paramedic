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

const cp = require('child_process');
const shell = require('shelljs');
const Server = require('./LocalServer');
const path = require('path');
const fs = require('fs');
const { logger, exec, execPromise, utilities } = require('./utils');
const Reporters = require('./Reporters');
const ParamedicKill = require('./ParamedicKill');
const ParamedicLogCollector = require('./ParamedicLogCollector');
const ParamediciOSPermissions = require('./ParamediciOSPermissions');
const ParamedicTargetChooser = require('./ParamedicTargetChooser');
const ParamedicAppUninstall = require('./ParamedicAppUninstall');
const ParamedicApp = require('./ParamedicApp');

// Time to wait for initial device connection.
// If device has not connected within this interval the tests are stopped.
const INITIAL_CONNECTION_TIMEOUT = 540000; // 9mins

class ParamedicRunner {
    constructor (config) {
        this.tempFolder = null;
        this.config = config;
        this.targetObj = undefined;

        this.isBrowser = this.config.getPlatformId() === utilities.BROWSER;
        this.isIos = this.config.getPlatformId() === utilities.IOS;

        exec.setVerboseLevel(config.isVerbose());
    }

    run () {
        this.checkConfig();

        return Promise.resolve()
            .then(() => {
                // create project and prepare (install plugins, setup test startpage, install platform, check platform requirements)
                const paramedicApp = new ParamedicApp(this.config, this.storedCWD, this);
                this.tempFolder = paramedicApp.createTempProject();
                shell.pushd(this.tempFolder.name);
                return paramedicApp.prepareProjectToRunTests();
            })
            .then(() => {
                if (this.config.runMainTests()) {
                    // start server
                    const noListener = false;
                    return Server.startServer(this.config.getPorts(), noListener);
                }
            })
            .then((server) => {
                if (this.config.runMainTests()) {
                    // configure server usage
                    this.server = server;

                    this.injectReporters();
                    this.subcribeForEvents();

                    const logUrl = this.server.getMedicAddress(this.config.getPlatformId());
                    this.writeMedicJson(logUrl);

                    logger.normal('Start building app and running tests at ' + (new Date()).toLocaleTimeString());
                }
                // run tests
                return Promise.race([
                    this.runTests(),
                    new Promise((resolve, reject) =>
                        setTimeout(() => reject(
                            new Error(`[paramedic] Tests failed to complete in ${this.config.getTimeout()} ms.`)
                        ), this.config.getTimeout())
                    )
                ]);
            })
            .catch((error) => {
                logger.error(error);
                console.log(error.stack);
                throw error;
            })
            .then((result) => {
                logger.warn('---------------------------------------------------------');
                logger.warn('6. Collect data and clean up');
                logger.warn('---------------------------------------------------------');
                logger.normal('Completed tests at ' + (new Date()).toLocaleTimeString());

                // When --justbuild is not set, fetch logs from the device.
                if (this.config.getAction() !== 'build') {
                // collect logs and uninstall app
                    this.collectDeviceLogs();
                    return this.uninstallApp()
                        .catch(() => { /* do not fail if uninstall failed */ })
                        .finally(() => {
                            this.killEmulatorProcess();
                        })
                        .then(() => result);
                }

                // --justbuild does nothing.
                return result;
            })
            .finally(() => {
                this.cleanUpProject();
            });
    }

    checkConfig () {
        logger.warn('---------------------------------------------------------');
        logger.warn('0. Paramedic config');
        const config = this.config.getAll();
        for (const property in config) {
            if (Object.prototype.hasOwnProperty.call(config, property)) {
                if (typeof config[property] !== 'undefined' && config[property] !== null) {
                    logger.warn(`   - ${property}: ${config[property]}`);
                }
            }
        }
        logger.warn('---------------------------------------------------------');

        if (!this.config.runMainTests()) {
            throw new Error('No tests to run: --skipMainTests was used');
        }

        if (!['cordova', 'phonegap'].includes(this.config.getCli())) {
            if (!path.isAbsolute(this.config.getCli())) {
                const cliAbsolutePath = path.resolve(this.config.getCli());
                this.config.setCli(cliAbsolutePath);
            }
        }

        logger.info('cordova-paramedic: Will use the following cli: ' + this.config.getCli());
    }

    setPermissions () {
        const applicationsToGrantPermission = ['kTCCServiceAddressBook'];
        if (this.isIos) {
            logger.info('cordova-paramedic: Setting required permissions.');
            const tccDb = this.config.getTccDb();
            if (tccDb) {
                const appName = utilities.PARAMEDIC_DEFAULT_APP_NAME;
                const paramediciOSPermissions = new ParamediciOSPermissions(appName, tccDb, this.targetObj);
                paramediciOSPermissions.updatePermissions(applicationsToGrantPermission);
            }
        }
    }

    injectReporters () {
        const reporters = Reporters.getReporters(this.config.getOutputDir());

        [
            'jasmineStarted',
            'specStarted',
            'specDone',
            'suiteStarted',
            'suiteDone',
            'jasmineDone'
        ].forEach((route) => {
            reporters.forEach((reporter) => {
                if (reporter[route] instanceof Function) {
                    this.server.on(route, reporter[route].bind(reporter));
                }
            });
        });
    }

    subcribeForEvents () {
        this.server.on('deviceLog', (data) => {
            logger.verbose('device|console.' + data.type + ': ' + data.msg[0]);
        });

        this.server.on('deviceInfo', (data) => {
            logger.normal('cordova-paramedic: Device info: ' + JSON.stringify(data));
        });
    }

    writeMedicJson (logUrl) {
        logger.normal('cordova-paramedic: writing medic log url to project ' + logUrl);
        const medicFilePath = path.join(this.tempFolder.name, 'www', 'medic.json');
        const medicFileContent = JSON.stringify({ logurl: logUrl });
        fs.writeFileSync(medicFilePath, medicFileContent);
    }

    runLocalTests () {
        logger.warn('... locally');
        logger.warn('---------------------------------------------------------');

        let runProcess = null;

        // checking for Android platform here because in this case we still need to start an emulator
        // will check again a bit lower
        if (!this.config.runMainTests() && this.config.getPlatformId() !== utilities.ANDROID) {
            logger.normal('Skipping main tests...');
            return utilities.TEST_PASSED;
        }

        logger.info('cordova-paramedic: running tests locally');

        return Promise.resolve()
            .then(() => this.getCommandForStartingTests())
            .then((command) => {
                this.setPermissions();

                return Promise.all([
                    Promise.resolve().then(() => {
                        logger.normal('cordova-paramedic: running command ' + command);

                        if (this.config.getPlatformId() !== utilities.BROWSER) {
                            return execPromise(command);
                        }
                        console.log('$ ' + command);

                        // a precaution not to try to kill some other process
                        runProcess = cp.exec(command, () => {
                            runProcess = null;
                        });
                    }),
                    Promise.resolve().then(() => {
                        if (!this.config.runMainTests()) {
                            logger.normal('Skipping main tests...');
                            return utilities.TEST_PASSED;
                        }

                        // skip tests if it was just build
                        if (this.shouldWaitForTestResult()) {
                            return new Promise((resolve, reject) => {
                            // reject if timed out
                                this.waitForConnection().catch(reject);
                                // resolve if got results
                                this.waitForTests().then(resolve);
                            });
                        }

                        return utilities.TEST_PASSED; // if we're not waiting for a test result, just report tests as passed
                    })
                ]);
            })
            .then((results) => results[1])
            .then((result) => {
                if (runProcess) {
                    return new Promise((resolve) => {
                        utilities.killProcess(runProcess.pid, () => {
                            resolve(result);
                        });
                    });
                }

                return result;
            });
    }

    runTests () {
        logger.warn('---------------------------------------------------------');
        logger.warn('4. Run (Jasmine) tests...');
        return this.runLocalTests();
    }

    waitForTests () {
        logger.info('cordova-paramedic: waiting for test results');
        return new Promise((resolve, reject) => {
            // time out if connection takes too long
            const ERR_MSG = 'waitForTests: Seems like device not connected to local server in ' + INITIAL_CONNECTION_TIMEOUT / 1000 + ' secs';
            setTimeout(() => {
                if (!this.server.isDeviceConnected()) {
                    reject(new Error(ERR_MSG));
                }
            }, INITIAL_CONNECTION_TIMEOUT);

            this.server.on('jasmineDone', (data) => {
                logger.info('cordova-paramedic: tests have been completed');

                // Is Test Passed
                resolve((data.specResults.specFailed === 0));
            });

            this.server.on('disconnect', () => {
                reject(new Error('Device is disconnected before passing the tests'));
            });
        });
    }

    getCommandForStartingTests () {
        const cmd = [
            this.config.getCli(),
            this.config.getAction(),
            this.config.getPlatformId()
        ]
            .concat(utilities.PARAMEDIC_COMMON_ARGS)
            .concat([this.config.getArgs()]);

        if (this.isBrowser) {
            return cmd.join(' ');
        } else if (this.config.getAction() === 'build') {
            // The app is to be run as a store app or just build. So no need to choose a target.
            return Promise.resolve(cmd.join(' '));
        }

        // For now we always trying to run test app on emulator
        return new ParamedicTargetChooser(this.tempFolder.name, this.config).chooseTarget(
            true, // useEmulator
            this.config.getTarget() // preferredTarget
        ).then(targetObj => {
            this.targetObj = targetObj;

            return cmd
                .concat(['--target', `"${this.targetObj.target}"`])
                // CB-11472 In case of iOS provide additional '--emulator' flag, otherwise
                // 'cordova run ios --target' would hang waiting for device with name
                // as specified in 'target' in case if any device is physically connected
                .concat(this.isIos ? ['--emulator'] : [])
                .join(' ');
        });
    }

    shouldWaitForTestResult () {
        const action = this.config.getAction();
        return (action.indexOf('run') === 0) || (action.indexOf('emulate') === 0);
    }

    waitForConnection () {
        const ERR_MSG = 'waitForConnection: Seems like device not connected to local server in ' + INITIAL_CONNECTION_TIMEOUT / 1000 + ' secs';

        return new Promise((resolve, reject) => {
            setTimeout(() => {
                if (!this.server.isDeviceConnected()) {
                    reject(new Error(ERR_MSG));
                } else {
                    resolve();
                }
            }, INITIAL_CONNECTION_TIMEOUT);
        });
    }

    cleanUpProject () {
        if (this.config.shouldCleanUpAfterRun()) {
            logger.info('cordova-paramedic: Deleting the application: ' + this.tempFolder.name);
            shell.popd();
            shell.rm('-rf', this.tempFolder.name);
        }
    }

    killEmulatorProcess () {
        if (this.config.shouldCleanUpAfterRun()) {
            logger.info('cordova-paramedic: Killing the emulator process.');
            const paramedicKill = new ParamedicKill(this.config.getPlatformId());
            paramedicKill.kill();
        }
    }

    collectDeviceLogs () {
        logger.info('Collecting logs for the devices.');
        const outputDir = this.config.getOutputDir() ? this.config.getOutputDir() : this.tempFolder.name;
        const paramedicLogCollector = new ParamedicLogCollector(this.config.getPlatformId(), this.tempFolder.name, outputDir, this.targetObj);
        paramedicLogCollector.collectLogs();
    }

    uninstallApp () {
        logger.info('Uninstalling the app.');
        const paramedicAppUninstall = new ParamedicAppUninstall(this.tempFolder.name, this.config.getPlatformId());
        return paramedicAppUninstall.uninstallApp(this.targetObj, utilities.PARAMEDIC_DEFAULT_APP_NAME);
    }
}

let storedCWD = null;

exports.run = function (paramedicConfig) {
    storedCWD = storedCWD || process.cwd();

    const runner = new ParamedicRunner(paramedicConfig, null);
    runner.storedCWD = storedCWD;

    return runner.run();
};
