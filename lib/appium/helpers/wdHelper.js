/* jshint node: true */
/* global navigator, document, window */
/*
 *
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
 *
*/

'use strict';

var APPIUM_SERVER_HOST = 'localhost';
var APPIUM_SERVER_PORT = 4723;
var WEBVIEW_WAIT_TIMEOUT = 5000;
var IMPLICIT_WAIT_TIMEOUT = 10000;
var ASYNC_SCRIPT_TIMEOUT = 60000;

var fs = require('fs');
var path = require('path');
var wd = global.WD || require('wd');
var util = require('../../utils').utilities;

module.exports.getDriver = function (platform) {
    var normalizedPlatform;
    var driverConfig = {};
    var serverConfig = {};
    var driver;
    switch (platform.toLowerCase()) {
        case 'android':
            normalizedPlatform = 'Android';
            break;
        case 'ios':
            normalizedPlatform = 'iOS';
            break;
        default:
            throw 'Unknown platform: ' + platform;
    }

    global.WD.configureHttp({
        timeout: util.WD_TIMEOUT,
        retryDelay: util.WD_RETRY_DELAY,
        retries: util.WD_RETRIES
    });

    if (global.USE_SAUCE) {
        serverConfig = {
            host: global.SAUCE_SERVER_HOST,
            port: global.SAUCE_SERVER_PORT
        };

        driverConfig = global.SAUCE_CAPS;

        driver = global.WD.promiseChainRemote(serverConfig.host, serverConfig.port, global.SAUCE_USER, global.SAUCE_KEY);
    } else {
        serverConfig = {
            host: APPIUM_SERVER_HOST,
            port: APPIUM_SERVER_PORT
        };

        driverConfig = {
            browserName: '',
            platformName: normalizedPlatform,
            platformVersion: global.PLATFORM_VERSION || '',
            deviceName: global.DEVICE_NAME || '',
            app: global.PACKAGE_PATH,
            autoAcceptAlerts: true,
        };

        if (global.UDID) {
            driverConfig.udid = global.UDID;
        }

        driver = global.WD.promiseChainRemote(serverConfig);
    }

    module.exports.configureLogging(driver);
    var spamDots = setInterval(function () {
        process.stdout.write('.');
    }, 1000);

    return driver
        .init(driverConfig)
        .setImplicitWaitTimeout(IMPLICIT_WAIT_TIMEOUT)
        .then(function () {
            clearInterval(spamDots);
            process.stdout.write('\n');
        }, function (error) {
            clearInterval(spamDots);
            process.stdout.write('\n');
            throw(error);
        });
};

module.exports.getWD = function () {
    return wd;
};

module.exports.getWebviewContext = function (driver, retries) {
    if (typeof retries === 'undefined') {
        retries = 2;
    }
    return driver
        .sleep(WEBVIEW_WAIT_TIMEOUT)
        .contexts()
        .then(function (contexts) {
            // take the last webview context
            for (var i = 0; i < contexts.length; i++) {
                if (contexts[i].indexOf('WEBVIEW') >= 0) {
                    return contexts[i];
                }
            }
            // no webview context, the app is still loading
            return driver
                .sleep(1000)
                .then(function () {
                    if (retries > 0) {
                        console.log('No webview context. Retries remaining: ' + retries);
                        return module.exports.getWebviewContext(driver, retries - 1);
                    }
                    throw 'Couldn\'t get webview context.';
                });
        });
};

module.exports.waitForDeviceReady = function (driver) {
    return driver
        .setAsyncScriptTimeout(ASYNC_SCRIPT_TIMEOUT)
        .executeAsync(function (cb) {
            document.addEventListener('deviceready', function() {
                cb();
            }, false);
        }, []);
};

module.exports.injectLibraries = function (driver) {
    var q = fs.readFileSync(path.join(__dirname, '/lib/q.min.js'), 'utf8');
    return driver
        .execute(q)
        .execute(function () {
            navigator._appiumPromises = {};
        }, []);
};

module.exports.configureLogging = function (driver) {
    if (!global.VERBOSE) {
        return;
    }
    driver.on('status', function (info) {
        console.log(info);
    });
    driver.on('command', function (meth, path, data) {
        console.log(' > ' + meth, path, data || '');
    });
    driver.on('http', function (meth, path, data) {
        console.log(' > ' + meth, path, data || '');
    });
};

module.exports.tapElementByXPath = function (xpath, driver) {
    return driver
        .waitForElementByXPath(xpath, 30000)
        .getLocation()
        .then(function (loc) {
            if (loc.x <= 0) {
                loc.x = 1;
            }
            if (loc.y <= 0) {
                loc.y = 1;
            }
            loc.x = Math.floor(loc.x + 1);
            loc.y = Math.floor(loc.y + 1);

            var wd = module.exports.getWD();
            var tapElement = new wd.TouchAction();
            tapElement.tap(loc);
            return driver.performTouchAction(tapElement);
        });
};

module.exports.pollForEvents = function (driver, platform, skipBuster, windowOffset, retries) {
    var isAndroid = platform === util.ANDROID;
    var isBrowser = platform === util.BROWSER;
    var isIOS = platform === util.IOS;
    if (retries === undefined || retries === null) {
        retries = 2;
    }
    if (!windowOffset) {
        windowOffset = 0;
    }
    // polling for new events
    return driver
    .sleep(0)
    .then(function () {
        if (skipBuster) {
            return driver;
        }
        return driver.bustAlert(platform);
    })
    .then(function() {
        if (isIOS || isBrowser) {
            return driver;
        }
        // for some reason inappbrowser tests tend to leave an active window on android
        // so for the polling to work correctly we need to
        // switch back to the window where the cache is located
        return driver
        .windowHandles()
        .then(function (windowHandles) {
            if (windowOffset >= windowHandles.length) {
                throw new Error('Cannot find a window with the event cache.');
            }
            return driver.window(windowHandles[windowOffset]);
        });
    })
    .execute(function () {
        if (typeof window._jasmineParamedicProxyCache === 'undefined') {
            // wrong window
            return null;
        }
        // get the results and clean up the cache
        var result = window._jasmineParamedicProxyCache;
        window._jasmineParamedicProxyCache = [];
        return result;
    }, [])
    .then(function (result) {
        // found
        if (Object.prototype.toString.call(result) === '[object Array]') {
            return result;
        }

        // not found
        if (isBrowser && retries > 0) {
            // the odds are that we're hitting "bad gateway" error on Sauce, refreshing the page should fix it
            return driver
                .get('http://localhost:8000/cdvtests/index.html')
                .then(function () {
                    return module.exports.pollForEvents(driver, platform, skipBuster, windowOffset, retries - 1);
                });
        }
        if (!isAndroid) {
            throw new Error('Cannot get the event cache: it doesn\'t exist in the app. Got this instead: ' + result);
        }
        // no luck finding the event cache in this window, let's try next
        return module.exports.pollForEvents(driver, platform, skipBuster, windowOffset + 1);
    });
};

module.exports.bustAlert = function (driver, platform) {
    var previousContext;
    return driver
    .currentContext()
    .then(function (context) {
        if (context !== 'NATIVE_APP') {
            previousContext = context;
        }
        return driver;
    })
    .context('NATIVE_APP')
    .then(function () {
        // iOS
        if (platform === 'ios') {
            return driver.acceptAlert()
                .then(function alertDismissed() { }, function noAlert() { });
        }

        // Android
        return driver
            .elementByXPath('//android.widget.Button[translate(@text, "alow", "ALOW")="ALLOW"]')
            .click()
            .fail(function noAlert() { });
    })
    .then(function () {
        if (previousContext) {
            return driver
            .context(previousContext);
        } else {
            return driver;
        }
    });
};

module.exports.addFillerImage = function (driver) {
    var bitmap = fs.readFileSync(path.join(__dirname, '../cordova_logo_thumb.jpg'));
    var base64str = new Buffer(bitmap).toString('base64');

    return driver.executeAsync(function (b64str, cb) {
        try {
            window.imageSaver.saveBase64Image( {
                data: b64str
            }, function (fpath) {
                cb(fpath);
            }, function (err) {
                cb('ERROR: ' + err);
            });
        } catch(err) {
            cb('ERROR: ' + err.message);
        }
    }, [base64str]);
};

module.exports.deleteFillerImage = function (driver, testImagePath) {
    if (!testImagePath) {
        return driver;
    }
    return driver.executeAsync(function (testImagePath, cb) {
        if (window.imageSaver) {
            window.imageSaver.removeImage({
                data: testImagePath
            }, function () {
                cb();
            }, function (err) {
                cb('ERROR: ' + err);
            });
        } else {
            cb();
        }
    }, [testImagePath]);
};

wd.addPromiseChainMethod('getWebviewContext', function (retries) {
    return module.exports.getWebviewContext(this, retries);
});

wd.addPromiseChainMethod('waitForDeviceReady', function () {
    return module.exports.waitForDeviceReady(this);
});

wd.addPromiseChainMethod('injectLibraries', function () {
    return module.exports.injectLibraries(this);
});

wd.addPromiseChainMethod('tapElementByXPath', function (xpath) {
    return module.exports.tapElementByXPath(xpath, this);
});

wd.addPromiseChainMethod('pollForEvents', function (platform, skipBuster) {
    return module.exports.pollForEvents(this, platform, skipBuster);
});

wd.addPromiseChainMethod('addFillerImage', function () {
    return module.exports.addFillerImage(this);
});

wd.addPromiseChainMethod('deleteFillerImage', function (testImagePath) {
    return module.exports.deleteFillerImage(this, testImagePath);
});

wd.addPromiseChainMethod('bustAlert', function (platform) {
    return module.exports.bustAlert(this, platform);
});
