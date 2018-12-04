# cordova-paramedic

> Paramedic • _noun_ provides advanced levels of care at the point of illness or injury, including out of hospital treatment, and diagnostic services

[![Build Status](https://travis-ci.org/apache/cordova-paramedic.svg?branch=master)](https://travis-ci.org/apache/cordova-paramedic)
[![Build status](https://ci.appveyor.com/api/projects/status/iufmfjo0j0dd4c1w?svg=true)](https://ci.appveyor.com/project/ApacheSoftwareFoundation/cordova-paramedic)

Runs cordova medic/buildbot tests locally.

See this [workshop instructions for more explanation](https://kerrishotts.github.io/pgday/workshops/2017/campp/testing.html#cordova-paramedic).

## Supported Cordova Platforms

- Android
- iOS
- Windows (Windows 8.1, Windows 10 UWP phone,tablet,desktop)
- Browser
- OSX

# Installation

``` $npm install cordova-paramedic ```

# Usage

Paramedic parameters could be passed via command line arguments or via separate configuration file:

```
cordova-paramedic --platform PLATFORM --plugin PATH <other parameters>
cordova-paramedic --config ./sample-config/.paramedic.config.js
```

## Command Line Interface

#### `--platform` (required)

Specifies target cordova platform (could refer to local directory, npm or git)

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@4.0 --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@../cordova-ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@https://github.com/apache/cordova-ios.git#4.1.0 --plugin cordova-plugin-inappbrowser
```

#### `--plugin` (required)

Specifies test plugin, you may specify multiple --plugin flags and they will all be installed and tested together. You can refer to absolute path, npm registry or git repo.
If the plugin requires variables to install, you can specify them along with its name.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios --plugin 'azure-mobile-engagement-cordova --variable AZME_IOS_CONNECTION_STRING=Endpoint=0;AppId=0;SdkKey=0'
cordova-paramedic --platform ios --plugin https://github.com/apache/cordova-plugin-inappbrowser
// several plugins
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --plugin cordova-plugin-contacts
```
#### `--justbuild` (optional)

Just builds the project, without running the tests.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --justbuild
```

#### `--externalServerUrl` (optional)

Useful when testing on real device (`--device` parameter) so that tests results from device could be posted back to paramedic server.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --externalServerUrl http://10.0.8.254
```

#### `--useTunnel` (optional)

Use [tunneling](https://www.npmjs.com/package/localtunnel) instead of local address (default is false).
Useful when testing on real devices and don't want to specify external ip address (see `--externalServerUrl` above) of paramedic server.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --useTunnel
```

#### `--browserify` (optional)

Plugins are browserified into cordova.js.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --browserify
```

#### `--port` (optional)

Port to use for posting results from emulator back to paramedic server (default is from `8008`). You can also specify a range using `--startport` and `endport` and paramedic will select the first available.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --port 8010
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --startport 8000 endport 8020
```

#### `--verbose` (optional)

Verbose mode. Display more information output

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --verbose
```

#### `--cli` (optional)

A path to Cordova CLI. Useful when you're testing against locally installed Cordova version.

```
cordova-paramedic --platform android --plugin cordova-plugin-device --cli ./cordova-cli/bin/cordova
```

#### `--timeout` (optional)

Time in millisecs to wait for tests to pass|fail (defaults to 10 minutes).

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --timeout 30000
```

#### `--outputDir` (optional)

Directory location to store test results in junit format and the device logs

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --outputDir /Users/sampleuser/testresults
```

#### `--cleanUpAfterRun` (optional)

Flag to indicate the sample application folder must be deleted.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --cleanUpAfterRun
```

#### `--logMins` (optional)

Windows only parameter to indicate the duration for which the device logs to be fetched.

```
cordova-paramedic --platform windows --plugin cordova-plugin-inappbrowser --logMins 15
```

#### `--tccDb` (optional)

iOS only parameter. The path to the sample TCC DB file, with permissions, to be copied to the simulator.

```
cordova-paramedic --platform ios --plugin cordova-plugin-contacts --tccDbPath tcc.db
```

#### `--target` (optional)

Android only parameter. The device ID (from `adb devices`) of a device the tests should be run on.

```
cordova-paramedic --platform android --plugin cordova-plugin-contacts --target 02e7f7e9215da7f8
```

### Sauce-only arguments

#### `--shouldUseSauce` (optional)

Run tests on [Sauce Labs](https://saucelabs.com/). You'll need to specify Sauce Labs username and access key using either --sauceUser and --sauceKey arguments or `SAUCE_USERNAME` and `SAUCE_ACCESS_KEY` environment variables.

#### `--buildName` (optional)

Build name to show on Sauce Labs dashboard. If omitted, will use "Paramedic sauce test" and a timestamp.

#### `--sauceUser` (optional)

Sauce Labs username.

#### `--sauceKey` (optional)

Sauce Labs access key.

```
cordova-paramedic --platform ios --plugin cordova-plugin-contacts --shouldUseSauce --sauceUser ***** --sauceKey ***** --buildName "paramedic-test-01"
```

#### `--sauceDeviceName` (optional)

Name of the Sauce Labs emulator or browser. For example, "iPhone Simulator" or "firefox". Please refer to the [Sauce Labs platforms list](https://saucelabs.com/platforms) to see available device names.

#### `--saucePlatformVersion` (optional)

Platform version of the Sauce Labs emulator OS, or version of the browser (if testing `browser` platform). For example, "9.3" or "54.0". Please refer to the [Sauce Labs platforms list](https://saucelabs.com/platforms) to see available platform versions.

#### `--sauceAppiumVersion` (optional)

Appium version to use when running on Sauce Labs. For example, "1.5.3".

```
cordova-paramedic --platform ios --plugin cordova-plugin-contacts --shouldUseSauce --sauceUser ***** --sauceKey ***** --sauceDeviceName 'iPad Simulator" --saucePlatformVersion 9.1 --appiumVersion 1.5.2
```

## Configuration file

Configuration file is used when no parameters are passed to `cordova-paramedic` call or explicitly specified via `--config` parameter:
```
cordova-paramedic  <- paramedic will attempt to find .paramedic.config.js in working directory
cordova-paramedic --config ./sample-config/.paramedic.config.js
```
Example configuration file is showed below.
```
module.exports = {
    // "externalServerUrl": "http://10.0.8.254",
    "useTunnel": true,
    "plugins": [
        "https://github.com/apache/cordova-plugin-inappbrowser"
    ],
    "platform": "windows",
    "action": "run",
    "args": "--archs=x64 -- --appx=uap"
}
```
More configuration file examples could be found in `sample-config` folder.

## Windows quirks

For paramedic to work correctly on Windows you'll need to allow the loopback for "HelloCordova" app using [Windows Loopback Exemption Manager](https://loopback.codeplex.com/).

## API Interface

You can also use cordova-paramedic as a module directly :

```
  var paramedic = require('cordova-paramedic');
  paramedic.run(config);
```
