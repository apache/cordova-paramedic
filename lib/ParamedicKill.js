#!/usr/bin/env node

"use strict";

var shelljs = require("shelljs");
var util    = require("./utils").utilities;
var logger  = require('./utils').logger;

function ParamedicKill(platform) {
    this.platform = platform;
}

ParamedicKill.prototype.kill = function() {
    // shell config
    shelljs.config.fatal  = false;
    shelljs.config.silent = false;

    // get platform tasks
    var platformTasks = this.tasksOnPlatform(this.platform);

    if (platformTasks.length < 1) {
        console.warn("no known tasks to kill");
        return;
    }

    // kill them
    this.killTasks(platformTasks);

    if (this.platform === util.ANDROID) {
        this.killAdbServer();
    }

}

ParamedicKill.prototype.tasksOnPlatform = function (platformName) {
    var tasks = [];
    switch (platformName) {
    case util.WINDOWS:
        // tasks = ["WWAHost.exe", "Xde.exe"];
        tasks = ["WWAHost.exe"];
        break;
    case util.IOS:
        tasks = ["Simulator", "iOS Simulator"];
        break;
    case util.ANDROID:
        if (util.isWindows()) {
            tasks = ["emulator-arm.exe"];
        } else {
            tasks = ["emulator64-x86", "emulator64-arm"];
        }
        break;
    }
    return tasks;
}

ParamedicKill.prototype.killTasks = function (taskNames) {
    if (!taskNames || taskNames.length < 1) {
        return;
    }

    var command = this.getKillCommand(taskNames);

    logger.info("running the following command:");
    logger.info("    " + command);

    var killTasksResult = shelljs.exec(command, {silent: false, async: false });
    if (killTasksResult.code !== 0) {
        console.warn("WARNING: kill command returned " + killTasksResult.code);
    }
}

ParamedicKill.prototype.getKillCommand = function (taskNames) {
    var cli;
    var args;

    if (util.isWindows()) {
        cli  = "taskkill /F";
        args = taskNames.map(function (name) { return "/IM \"" + name + "\""; });
    } else {
        cli  = "killall -9";
        args = taskNames.map(function (name) { return "\"" + name + "\""; });
    }

    return cli + " " + args.join(" ");
}

ParamedicKill.prototype.killAdbServer = function () {
    logger.info("Killing adb server");
    var killServerCommand = "adb kill-server";

    logger.info("Running the following command:");
    logger.info("    " + killServerCommand);

    var killServerResult = shelljs.exec(killServerCommand, {silent: false, async: false});
    if (killServerResult.code !== 0) {
        logger.error("Failed killing adb server with code: " + killServerResult.code);
    }
    logger.info("Finished killing adb server");
}

module.exports = ParamedicKill;
