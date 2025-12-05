<!--
#
# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
#
-->

# Cordova Paramedic (Test Automation)

[![Android Testsuite](https://github.com/apache/cordova-paramedic/actions/workflows/android.yml/badge.svg)](https://github.com/apache/cordova-paramedic/actions/workflows/android.yml)
[![iOS Testsuite](https://github.com/apache/cordova-paramedic/actions/workflows/ios.yml/badge.svg)](https://github.com/apache/cordova-paramedic/actions/workflows/ios.yml)
[![Chrome Testsuite](https://github.com/apache/cordova-paramedic/actions/workflows/chrome.yml/badge.svg)](https://github.com/apache/cordova-paramedic/actions/workflows/chrome.yml)

> Paramedic • _noun_ provides advanced levels of care at the point of illness or injury, including out of hospital treatment, and diagnostic services

`cordova-paramedic` is a tool to automate execution of Cordova plugins tests (via [`cordova-plugin-test-framework`](https://github.com/apache/cordova-plugin-test-framework)).

You can use Paramedic to build and run a Cordova app with plugin tests, run these tests on local emulators, and report the results. It can be used on a local or Continuous Integration environment.

Cordova Paramedic is currently used to automatically run all plugin tests on CI.

(See this [workshop instructions for some additional explanation](https://kerrishotts.github.io/pgday/workshops/2017/campp/testing.html#cordova-paramedic).)

## Table of Contents

- [Cordova Paramedic (Test Automation)](#cordova-paramedic-test-automation)
  - [Table of Contents](#table-of-contents)
  - [Supported Cordova Platforms](#supported-cordova-platforms)
  - [What does it do?](#what-does-it-do)
  - [Installation](#installation)
  - [Usage](#usage)
    - [Common usages](#common-usages)
  - [Command Line Interface](#command-line-interface)
    - [What to build and test](#what-to-build-and-test)
      - [`--platform` (required)](#--platform-required)
      - [`--plugin` (required)](#--plugin-required)
      - [`--verbose` (optional)](#--verbose-optional)
      - [`--cli` (optional)](#--cli-optional)
      - [`--justbuild` (optional)](#--justbuild-optional)
    - [Emulator/Device to use for tests](#emulatordevice-to-use-for-tests)
      - [`--target` (optional)](#--target-optional)
    - [Test Result Server](#test-result-server)
      - [`--port` (optional)](#--port-optional)
    - [Test configuration](#test-configuration)
      - [`--timeout` (optional)](#--timeout-optional)
      - [`--outputDir` (optional)](#--outputdir-optional)
      - [`--cleanUpAfterRun` (optional)](#--cleanupafterrun-optional)
      - [`--tccDb` (optional)](#--tccdb-optional)
      - [`--args` (optional)](#--args-optional)
  - [Configuration file](#configuration-file)
  - [API Interface](#api-interface)

<!--<small><i><a href='http://ecotrust-canada.github.io/markdown-toc/'>Table of contents generated with markdown-toc</a></i></small>-->

## Supported Cordova Platforms

- Android
- Browser
- iOS

## What does it do?

A full Paramedic run will:

1. <details>
    <summary>Create and prepare the app</summary>

    1. Create a temporary Cordova project with `cordova create`
    1. Install various plugins with `cordova plugin add %local_path%` (e.g. `cordova plugin add ../cordova-plugin-inappbrowser`):
        - the plugin to be tested (e.g. `../cordova-plugin-inappbrowser`)
        - the tests of this plugin (e.g. `../cordova-plugin-inappbrowser/tests`)
        - `cordova-plugin-test-framework` (from npm)
        - local `paramedic-plugin`
    1. Update the app start page to the test page at `cdvtests/index.html` (provided by `cordova-plugin-test-framework` and the plugin tests)
    1. Add the platform to be tested with `cordova platform add ...`
    1. Confirm the requirements for that platform are met with `cordova requirements ...`
    1. Start a local socket server for communication between the app running on a device/emulator and paramedic
    1. Make the server address known to the app
    </details>
1. Run the tests <!-- 2-99 -->
    - <details>
      <summary>Either run the main tests locally...  <!-- 5-316 --></summary>

        1. Skip main tests if option set (platform != android) <!-- 5-322 -->
        1. Start a file transfer server if required
        1. Get the test command for the platform
        1. Manipulate permissions on iOS
        1. Run the app (open in browser, start emulator, run on device or emulator) and start the tests by doing so
        1. Skip main tests if option set <!-- 6-350 -->
        1. Skip tests if action = run|emulate (= build) <!-- 6-356 -->
        1. Wait for device to connect to server before timeout <!-- 6-359 -->
        1. Wait for the tests results <!-- 6-361-->
            1. Time out if "connection takes to long" TODO (failure) <!-- 8-479-->
            1. Receive and handle "tests are done" (success) and "device disconnected" (failure) events <!-- 8-485-->
        1. (browser) Close the running browser <!-- 6-368 -->
        </details>
2. <details>
    <summary>Clean up</summary>
    <!-- 2-107 -->
     1. Handle timeouts of test execution above
     2. Collect Device Logs
     3. Uninstall App
     4. Kill Emulator Process
     5. Clean up Project <!-- 2-121 -->
    </details>

## Installation

**Using npmjs registry version:**

```shell
npm install -g cordova-paramedic
```

**Using GitHub version:**

```shell
npm install -g github:apache/cordova-paramedic
```

or

```shell
git clone https://github.com/apache/cordova-paramedic
```

If cloning from GitHub, you will need to run `npm link` inside the checkout repository.

Alternativly, replace all occurences of `cordova-paramedic` with the command:

* `cordova-paramedic/main.js` for Linux or macOS
* `node cordova-paramedic/main.js` for Windows

## Usage

Paramedic parameters can be passed via command line arguments or separate configuration file:

**By Command Line Arguments:**

```shell
cordova-paramedic --platform PLATFORM --plugin PATH <other parameters>
```

**By Configuration File:**

```shell
cordova-paramedic --config ./sample-config/.paramedic.config.js
```

### Common usages

Some common use cases of Paramedic:

**Run without any parameters to get a list of supported parameters:**

```shell
cordova-paramedic
```

**Test your current plugin on an Android emulator:**

```shell
cordova-paramedic --platform android --plugin ./
```

**Test your current plugin on a specific Android device (ID via `adb devices -l`):**

```shell
cordova-paramedic --platform android --plugin ./ --target 02e7f7e9215da7f8
```

## Command Line Interface

### What to build and test

#### `--platform` (required)

Specifies target Cordova platform (could refer to local directory, npm or git)

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@4.0 --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@../cordova-ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@https://github.com/apache/cordova-ios.git#4.1.0 --plugin cordova-plugin-inappbrowser
```

#### `--plugin` (required)

Specifies test plugin, you may specify multiple `--plugin` flags and they will all be installed and tested together. You can refer to absolute path, npm registry or git repo.
If the plugin requires variables to install, you can specify them along with its name.

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios --plugin 'azure-mobile-engagement-cordova --variable AZME_IOS_CONNECTION_STRING=Endpoint=0;AppId=0;SdkKey=0'
cordova-paramedic --platform ios --plugin https://github.com/apache/cordova-plugin-inappbrowser
// several plugins
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --plugin cordova-plugin-contacts
```

#### `--verbose` (optional)

Verbose mode. Display more information output

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --verbose
```

#### `--cli` (optional)

A path to Cordova CLI. Useful when you're testing against locally installed Cordova version.

```shell
cordova-paramedic --platform android --plugin cordova-plugin-device --cli ./cordova-cli/bin/cordova
```

#### `--justbuild` (optional)

Just builds the project, without running the tests.

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --justbuild
```

### Emulator/Device to use for tests

#### `--target` (optional)

For Android: The device ID (from `adb devices -l`) of a device the tests should be run on.  

```shell
cordova-paramedic --platform android --plugin cordova-plugin-contacts --target 02e7f7e9215da7f8
```

For iOS: A string that is used to pick the device (from the `cordova run --list --emulator` output) the tests should be run on.

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-contacts --target "iPhone-8"
```

### Test Result Server

#### `--port` (optional)

Port to use for posting results from emulator back to paramedic server (default is from `8008`). You can also specify a range using `--startport` and `endport` and paramedic will select the first available.

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --port 8010
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --startport 8000 endport 8020
```

### Test configuration

#### `--timeout` (optional)

Time in millisecs to wait for tests to pass|fail (defaults to 10 minutes).

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --timeout 30000
```

#### `--outputDir` (optional)

Directory location to store test results in junit format and the device logs

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --outputDir /Users/sampleuser/testresults
```

#### `--cleanUpAfterRun` (optional)

Flag to indicate the sample application folder must be deleted.

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --cleanUpAfterRun
```

#### `--tccDb` (optional)

iOS only parameter. The path to the sample TCC DB file, with permissions, to be copied to the simulator.

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-contacts --tccDbPath tcc.db
```

#### `--args` (optional)

Add additional parameters to the `cordova build` and `cordova run` commands.

```shell
cordova-paramedic --platform ios --plugin cordova-plugin-contacts --args=--buildFlag='-UseModernBuildSystem=0'
```

## Configuration file

Configuration file is used when no parameters are passed to `cordova-paramedic` call or explicitly specified via `--config` parameter:

```shell
cordova-paramedic           <- paramedic will attempt to find .paramedic.config.js in working directory
cordova-paramedic --config ./sample-config/.paramedic.config.js
```

Example configuration file is showed below.

```js
module.exports = {
    "plugins": [
        "https://github.com/apache/cordova-plugin-inappbrowser"
    ],
    "platform": "android",
    "action": "run",
    "args": ""
}
```

More configuration file examples could be found in `sample-config` folder.

## API Interface

You can also use `cordova-paramedic` as a module directly:

```javascript
var paramedic = require('cordova-paramedic');
paramedic.run(config);
```
