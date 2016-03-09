cordova-paramedic
=================

[![Build Status](https://travis-ci.org/apache/cordova-paramedic.svg?branch=master)](https://travis-ci.org/apache/cordova-paramedic)

[![Build status](https://ci.appveyor.com/api/projects/status/iufmfjo0j0dd4c1w?svg=true)](https://ci.appveyor.com/project/ApacheSoftwareFoundation/cordova-paramedic)

Runs cordova medic/buildbot tests locally.

... provides advanced levels of care at the point of illness or injury, including out of hospital treatment, and diagnostic services

To install :
``` $npm install cordova-paramedic ```

Usage :

```
cordova-paramedic --platform PLATFORM --plugin PATH [--justbuild --timeout MSECS --port PORTNUM --browserify --verbose ]`PLATFORM` : the platform id, currently only supports 'ios'
`PATH` : the relative or absolute path to a plugin folder
	expected to have a 'tests' folder.
	You may specify multiple --plugin flags and they will all
	be installed and tested together.
`MSECS` : (optional) time in millisecs to wait for tests to pass|fail 
	(defaults to 10 minutes) 
`PORTNUM` : (optional) port to use for posting results from emulator back to paramedic server
--justbuild : (optional) just builds the project, without running the tests 
--browserify : (optional) plugins are browserified into cordova.js 
--verbose : (optional) verbose mode. Display more information output

```

You can also use cordova-paramedic as a module directly :

```
  var paramedic = require('cordova-paramedic');
  paramedic.run('ios', '../cordova-plugin-device', onCompleteCallback,justBuild,portNum,msTimeout, useBrowserify, beSilent, beVerbose);
```


