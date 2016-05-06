var shelljs = require('shelljs');
var path    = require('path');
var fs      = require("fs");
var logger  = require('./utils').logger;
var util    = require('./utils').utilities;

function ParamedicAppUninstall(appPath, platform) {
    this.appPath  = appPath;
    this.platform = platform;
}

ParamedicAppUninstall.prototype.uninstallApp = function(targetObj, app) {
    if(!targetObj || !targetObj.target)
        return;

    switch(this.platform) {
        case util.ANDROID:
            this.uninstallAppAndroid(targetObj, app);
            break;
        case util.IOS:
            this.uninstallAppIOS(targetObj, app);
            break;
        case util.WINDOWS:
            this.uninstallAppWindows(targetObj, app);
            break;
        default:
            break;
    }
}

ParamedicAppUninstall.prototype.uninstallAppAndroid = function(targetObj, app) {
    var uninstallCommand = "adb -s " + targetObj.target + " uninstall " + app;
    this.executeUninstallCommand(uninstallCommand);
}

ParamedicAppUninstall.prototype.uninstallAppWindows = function(targetObj, app) {
    var platformPath = path.join(this.appPath, "platforms", "windows");
    var packageJSPath = path.join(platformPath, "cordova", "lib", "package.js");
    var programFilesPath = process.env["ProgramFiles(x86)"] || process.env["ProgramFiles"];
    var appDeployPath = path.join(programFilesPath, "Microsoft SDKs",
          "Windows Phone", "v8.1", "Tools", "AppDeploy", "AppDeployCmd.exe");
    appDeployPath = '"' + appDeployPath + '"';

    if (fs.existsSync(packageJSPath)) {
        var packageJS = require(packageJSPath);
        var appId = packageJS.getAppId(platformPath);
        var uninstallCommand = appDeployPath + " /uninstall " + appId + " /targetdevice:" + targetObj.target;
        this.executeUninstallCommand(uninstallCommand);
    }
    return;
}

ParamedicAppUninstall.prototype.uninstallAppIOS = function(targetObj, app) {
   var uninstallCommand = "xcrun simctl uninstall " + targetObj.simId + " uninstall " + app;
   this.executeUninstallCommand(uninstallCommand);
}

ParamedicAppUninstall.prototype.executeUninstallCommand = function(uninstallCommand) {
    logger.info("cordova-paramedic: Running command: " + uninstallCommand);
    var uninstallResult  = shelljs.exec(uninstallCommand, {silent: false, async: false});
    if (uninstallResult.code > 0) {
        logger.error("Failed to uninstall the app" );
        logger.error("Error code: " + uninstallResult.code);
    }
    return;
}

module.exports = ParamedicAppUninstall;
