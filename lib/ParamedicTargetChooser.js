var Q       = require('q');
var shelljs = require('shelljs');
var path    = require("path-extra");
var logger  = require('./utils').logger;
var util    = require('./utils').utilities;
var spawn   = require('child_process').spawn;
var ParamedicKill   = require('./ParamedicKill');

var ANDROID_RETRY_TIMES = 3;
var ANDROID_TIME_OUT    = 300000; //5 Minutes

function ParamedicTargetChooser(appPath, platform) {
    this.appPath  = appPath;
    this.platform = platform;
}

ParamedicTargetChooser.prototype.chooseTarget = function(emulator) {
    var targetObj = "";
    switch(this.platform) {
        case util.ANDROID:
            targetObj = this.chooseTargetForAndroid(emulator);
            break;
        case util.IOS:
            targetObj = this.chooseTargetForIOS(emulator);
            break;
        case util.WINDOWS:
            targetObj = this.chooseTargetForWindows(emulator);
            break;
        default:
            break;
    }
    return targetObj;
}

ParamedicTargetChooser.prototype.chooseTargetForAndroid = function(emulator) {
    logger.info("cordova-paramedic: Choosing Target for Android");
    var self = this;
    return this.startAnAndroidEmulator().then(function(emulatorId){
        var obj = {};
        obj.target = emulatorId;
        return obj;
    });
}

ParamedicTargetChooser.prototype.startAnAndroidEmulator = function() {
    logger.info("cordova-paramedic: Starting an Android emulator");

    var emuPath = path.join(this.appPath, "platforms", "android", "cordova", "lib", "emulator");
    var emulator = require(emuPath);

    var tryStart = function(numberTriesRemaining) {
        return emulator.start(null, ANDROID_TIME_OUT)
        .then(function(emulatorId) {
            if (emulatorId) {
                return emulatorId;
            } else if (numberTriesRemaining > 0) {
                var paramedicKill = new ParamedicKill(util.ANDROID);
                paramedicKill.kill();
                return tryStart(numberTriesRemaining - 1);
            } else {
                logger.error("cordova-paramedic: Could not start an android emulator");
                return null;
            }
        });
    };

    // Check if the emulator has already been started
    return emulator.list_started()
    .then(function(started) {
        if (started && started.length > 0) {
            return started[0];
        } else {
            return tryStart(ANDROID_RETRY_TIMES);
        }
    });
}

ParamedicTargetChooser.prototype.chooseTargetForWindows = function(emulator) {
    logger.info("cordova-paramedic: Choosing Target for Windows");
    var windowsCommand = "cordova run --list --emulator";

    logger.info("cordova-paramedic: Running command: " + windowsCommand);
    var devicesResult  = shelljs.exec(windowsCommand, {silent: true, async: false});
    if (devicesResult.code > 0) {
        logger.error("Failed to get the list of devices for windows");
        return Q({target: undefined});
    }

    var lines = devicesResult.output.split(/\n/);
    if(lines.length <= 1) {
        logger.error("No devices/emulators available for windows");
        return Q({target: undefined});
    }

    return Q({target: lines[1].split('. ')[0].trim()});
}

ParamedicTargetChooser.prototype.chooseTargetForIOS = function(emulator) {
    logger.info("cordova-paramedic: Choosing Target for iOS");
    var simulatorModelId  = util.getSimulatorModelId();
    var split             = simulatorModelId.split(", ");
    var device            = split[0].trim();

    var simId             = util.getSimulatorId(simulatorModelId);
    return Q({target: device, simId: simId});
}

module.exports = ParamedicTargetChooser;
