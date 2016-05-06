cordova-paramedic
=================

[![Build Status](https://travis-ci.org/purplecabbage/cordova-paramedic.svg?branch=master)](https://travis-ci.org/purplecabbage/cordova-paramedic)

Runs cordova medic/buildbot tests locally.

... provides advanced levels of care at the point of illness or injury, including out of hospital treatment, and diagnostic services

# To install :
``` $npm install cordova-paramedic ```

## Supported Cordova Platforms

- Android
- iOS
- Windows Phone 8
- Windows (Windows 8.1, Windows Phone 8.1, Windows 10 Tablet/PC)
- Browser

# Usage

Paramedic parameters could be passed via command line arguments or via separate configuration file:

```
cordova-paramedic --platform PLATFORM --plugin PATH <other parameters>
cordova-paramedic --config ./sample-config/.paramedic.config.js
```

## Command Line Interface

####`--platform` (required)

Specifies target cordova platform (could refer to local directory, npm or git)

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@4.0 --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@../cordova-ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios@https://github.com/apache/cordova-ios.git#4.1.0 --plugin cordova-plugin-inappbrowser
```

####`--plugin` (required)

Specifies test plugin, you may specify multiple --plugin flags and they will all be installed and tested together. Similat to `platform` parameter you can refer to local (or absolute) path, npm registry or git repo.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser
cordova-paramedic --platform ios --plugin ../cordova-plugin-inappbrowser
cordova-paramedic --platform ios --plugin https://github.com/apache/cordova-plugin-inappbrowser
// several plugins
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --plugin cordova-plugin-contacts
```
####--justbuild (optional)

Just builds the project, without running the tests.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --justbuild
```

####--externalServerUrl (optional)

Useful when testing on real device (`--device` parameter) so that tests results from device could be posted back to paramedic server.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --externalServerUrl http://10.0.8.254
```

####--useTunnel (optional)

Use [tunneling](https://www.npmjs.com/package/localtunnel) instead of local address (default is false).
Useful when testing on real devices and don't want to specify external ip address (see `--externalServerUrl` above) of paramedic server.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --useTunnel
```

####--browserify (optional)

Plugins are browserified into cordova.js.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --browserify
```

####--port (optional)

Port to use for posting results from emulator back to paramedic server (default is from `8008`). You can also specify a range using `--startport` and `endport` and paramedic will select the first available.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --port 8010
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --startport 8000 endport 8020
```

####--verbose (optional)

Verbose mode. Display more information output

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --verbose
```

####--timeout (optional)

Time in millisecs to wait for tests to pass|fail (defaults to 10 minutes).

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --timeout 30000
```

####--outputDir (optional)

Directory location to store test results in junit format and the device logs

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --outputDir /Users/sampleuser/testresults
```

####--cleanUpAfterRun (optional)

Flag to indicate the sample application folder must be deleted.

```
cordova-paramedic --platform ios --plugin cordova-plugin-inappbrowser --cleanUpAfterRun
```

####--logMins (optional)

Windows only parameter to indicate the duration for which the device logs to be fetched.

```
cordova-paramedic --platform windows --plugin cordova-plugin-inappbrowser --logMins 15
```

####--tccDb (optional)

iOS only parameter. The path to the sample TCC DB file, with permissions, to be copied to the simulator.

```
cordova-paramedic --platform ios --plugin cordova-plugin-contacts --tccDbPath tcc.db
```

## Paramedic configuration file

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

## API Interface

You can also use cordova-paramedic as a module directly :

```
  var paramedic = require('cordova-paramedic');
  paramedic.run(config);
```

