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

const { spawn } = require('node:child_process');
const { setTimeout: timelimit } = require('node:timers/promises');

const logger = require('cordova-common').CordovaLogger.get();

/**
 * Wraps the spawn process inside a promise to make it asynchronous.
 *
 * In a successful case, during the on close event, an object will be
 * returned as long as the code equals 0.
 * The object will contain the process's "stdout", "stderr", & "code".
 *
 * If the code is anything but zero, a error object is returned as
 * a rejection. The "stdout", "stderr", & "code" will be appeneded.
 *
 * An error is also returned in cases where the process is errored
 * but not closed.
 *
 * The "options" argument is used for configuring the spawn process.
 * It also takes in the "verbose" and "timeout" settings. These
 * settings will be extracted from options before passed to the spawn
 * process.
 *
 * "verbose" - Determins the level of logging.
 * "timeout" - Determins if the spawn should timeout after Xms.
 *   Value should be set in milliseconds.
 *
 * @param {String} cmd command process (e.g. cordova, adb, xcrun, etc...)
 * @param {Array} args command arguments
 * @param {Object} options Spawn process object, verbose, and timeout settings
 * @returns {Promise<Object|Error>}
 */
async function spawnAsync (cmd, args = [], options = {}) {
    // Seperate non-spawn and spawn options.
    const { verbose = false, timeout = false, ...spawnOptions } = options;

    // Tracking start and stop time to attach with the last log message how long
    // a given process took in milliseconds.
    const timeStart = new Date();

    if (verbose) {
        logger.info(`[paramedic] Running command: ${cmd} ${args.join(' ')}`);
    }

    // Stores the spawn process that can be killed by the timeout limit if set and reached.
    let proc = null;
    // Contians a collection of promises that will be pushed to the races.
    const promises = [];

    promises.push(
        // The main promise that wraps the spawn.
        new Promise((resolve, reject) => {
            proc = spawn(cmd, args, { stdio: 'pipe', ...spawnOptions });

            let stdout = '';
            let stderr = '';

            if (proc.stdout) {
                proc.stdout.on('data', (data) => {
                    stdout += data.toString();
                });
            }

            if (proc.stderr) {
                proc.stderr.on('data', (data) => {
                    stderr += data.toString();
                });
            }

            proc.on('error', (err) => {
                reject(err);
            });

            proc.on('close', (code) => {
                // This is the time difference in milliseconds of how long the process took.
                const timeDiff = new Date() - timeStart;

                if (code === 0) {
                    if (verbose) {
                        logger.info(`[paramedic] Finished running command: "${cmd} ${args.join(' ')}" in ${timeDiff}ms.`);
                    }
                    // Collect the output & code to return back.
                    resolve({ stdout, stderr, code });
                } else {
                    // If the code was not 0, we will reject the promise.
                    // As a rejection takes in an "Error" object, we will append the stdout, stderr, and code
                    // so it will be availble as well. This is an extension and not normal pattern.
                    const error = new Error(
                        `[paramedic] Command failed: "${cmd} ${args.join(' ')}" in ${timeDiff}ms.\nExit Code: ${code} & Message: \n${stderr}`
                    );
                    error.stdout = stdout;
                    error.stderr = stderr;
                    error.code = code;
                    reject(error);
                }
            });
        })
    );

    // When timout is set correctly, we will push to the promises array a timeout promise.
    // If this timeout finishes before the spawn process finishes, we will kill spawn process,
    // null it out, and return a rejection that the command timed out.
    if (typeof timeout === 'number' && timeout > 0) {
        promises.push(
            timelimit(timeout).then(() => {
                proc?.kill();
                proc = null;
                Promise.reject(new Error(`[paramedic] Command timed out after ${timeout}ms`));
            })
        );
    }

    // Off to the races
    return Promise.race([...promises]);
}

module.exports = { spawnAsync };
